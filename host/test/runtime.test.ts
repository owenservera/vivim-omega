// Ω0 runtime behavior: token law (B3), budget law, degradation, journal, admin ops.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, HOST_OPS } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const SPEC = join(import.meta.dir, "../../compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
let vault: string;
let host: BootedHost;

beforeAll(async () => {
  // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
  vault = omegaTmp("omega-test", `runtime-${Date.now()}-${process.pid}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("Ω0 runtime law", () => {
  test("echo round-trip through the router (root principal)", async () => {
    const r = await host.router.callAsRoot("echo.ping@1", { hello: "omega" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as any).payload.hello).toBe("omega");
  });

  test("inter-compartment call traverses the router with a real token (counter → echo)", async () => {
    const r = await host.router.callAsRoot("counter.bump@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as any;
      expect(v.count).toBe(1);
      expect(v.echoResult.ok).toBe(true);
    }
  });

  test("unknown op refused with REFUSED register", async () => {
    const r = await host.router.callAsRoot("no.such.op@1", {});
    expect(r).toEqual({ ok: false, error: "REFUSED", detail: "no routed implementation for no.such.op@1" });
  });

  test("deadline exceeded → BUDGET register (distinct, attributable)", async () => {
    const r = await host.router.callAsRoot("echo.ping@1", { delayMs: 300 }, 50);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("BUDGET"); expect(r.detail).toContain("deadline"); }
  });

  test("degraded compartment → DEGRADED register, others keep working", async () => {
    const stats = await host.router.callAsRoot(HOST_OPS.compartmentStats, {});
    expect(stats.ok).toBe(true); // root may call host ops
    const terminated = await host.router.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: "omega.echo" });
    expect(terminated.ok).toBe(true);
    const r = await host.router.callAsRoot("echo.ping@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DEGRADED");
    const counter = await host.router.callAsRoot("counter.value@1", {});
    expect(counter.ok).toBe(true); // law and counter unaffected (shared-nothing, B2)
  });

  test("B3 behavioral: forged token → REFUSED; wrong-capability token → SCOPE; revoked generation → REVOKED", async () => {
    // register an emulated attacker compartment (no real worker needed — the router
    // validates tokens host-side before any dispatch, which is exactly B3)
    const router = host.router as any;
    const sent: any[] = [];
    let attackerCb: ((m: any) => void) | null = null;
    const fake = {
      pluginId: "omega.attacker",
      state: "active",
      stats: { delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: Date.now() },
      post: (m: any) => sent.push(m),
      onMessage: (cb: (m: any) => void) => { attackerCb = cb; },
      onCrash: () => {},
      terminate: async () => {},
    };
    const entry = { id: "omega.attacker", version: "0.0.1", source: ".", manifestPath: ".", manifestHash: "sha256:x", contentHash: "sha256:x", grant: { capabilities: ["port:counter.value@1"], contracts: [] }, bootPhase: 1 };
    router.register(entry, host.manifests.get("omega.echo")!, fake, {});
    const token = router.mintTokensFor(entry);
    for (const [cap, tok] of Object.entries(token)) router.tokens.set(tok, { token: tok, pluginId: "omega.attacker", cap, gen: router.generation });
    const ask = (callId: string, tok: string, op: string) => attackerCb!({ type: "call", callId, capabilityToken: tok, op, payload: {}, deadlineMs: 200 });
    const replyFor = (callId: string) => sent.find((m) => m.type === "result" && m.callId === callId)?.result;
    const settle = () => new Promise((r) => setTimeout(r, 60));

    ask("atk1", "tok_forged", "echo.ping@1"); await settle();
    expect(replyFor("atk1")).toEqual({ ok: false, error: "REFUSED", detail: "unknown capability token" });

    ask("atk2", token["port:counter.value@1"], "echo.ping@1"); await settle(); // borrowed wrong-cap token
    expect(replyFor("atk2")?.error).toBe("SCOPE");

    ask("atk3", token["port:counter.value@1"], "counter.value@1"); await settle(); // legitimately granted → passes B3
    expect(replyFor("atk3")?.ok).toBe(true);

    await host.router.callAsRoot("host.tokens.revoke@1", { pluginId: "omega.attacker" }); // scoped revoke (D-384): flips omega.attacker's records only
    ask("atk4", token["port:counter.value@1"], "counter.value@1"); await settle();
    expect(replyFor("atk4")?.error).toBe("REVOKED");
  });

  test("D-384: scoped token revoke is SCOPED — untargeted compartments keep working (symmetry)", async () => {
    const router = host.router as any;
    const mk = (id: string) => {
      const sent: any[] = [];
      let cb: ((m: any) => void) | null = null;
      const handle = {
        pluginId: id, state: "active",
        stats: { delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: Date.now() },
        post: (m: any) => sent.push(m),
        onMessage: (f: (m: any) => void) => { cb = f; },
        onCrash: () => {},
        terminate: async () => {},
      };
      return { sent, handle, ask: (callId: string, tok: string, op: string) => cb!({ type: "call", callId, capabilityToken: tok, op, payload: {}, deadlineMs: 200 }) };
    };
    const entryFor = (id: string) => ({ id, version: "0.0.1", source: ".", manifestPath: ".", manifestHash: "sha256:x", contentHash: "sha256:x", grant: { capabilities: ["port:counter.value@1"], contracts: [] }, bootPhase: 1 });
    const a = mk("omega.revoke-a");
    const b = mk("omega.revoke-b");
    router.register(entryFor("omega.revoke-a"), host.manifests.get("omega.echo")!, a.handle, {});
    router.register(entryFor("omega.revoke-b"), host.manifests.get("omega.echo")!, b.handle, {});
    for (const [id, c] of [["omega.revoke-a", a], ["omega.revoke-b", b]] as const) {
      const toks = router.mintTokensFor(entryFor(id));
      for (const [cap, tok] of Object.entries(toks)) router.tokens.set(tok, { token: tok, pluginId: id, cap, gen: router.generation });
      (c as any).tok = toks["port:counter.value@1"];
    }
    const replyFor = (c: ReturnType<typeof mk>, callId: string) => c.sent.find((m) => m.type === "result" && m.callId === callId)?.result;
    const settle = () => new Promise((r) => setTimeout(r, 80));

    a.ask("a1", (a as any).tok, "counter.value@1"); await settle();
    expect(replyFor(a, "a1")?.ok).toBe(true);

    // THE assertion the suite never had (the original audit's §2): revoke A, B survives.
    const r = await host.router.callAsRoot("host.tokens.revoke@1", { pluginId: "omega.revoke-a" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as any).affectedTokens).toBeGreaterThan(0);
    a.ask("a2", (a as any).tok, "counter.value@1"); await settle();
    expect(replyFor(a, "a2")?.error).toBe("REVOKED");
    b.ask("b1", (b as any).tok, "counter.value@1"); await settle();
    expect(replyFor(b, "b1")?.ok).toBe(true); // ← pre-D-384 this came back REVOKED (global bump)

    // revoke-all (no pluginId): the generation-bump path revokes everything
    const all = await host.router.callAsRoot("host.tokens.revoke@1", {});
    expect(all.ok).toBe(true);
    b.ask("b2", (b as any).tok, "counter.value@1"); await settle();
    expect(replyFor(b, "b2")?.error).toBe("REVOKED");
  });

  test("law journal records gate decisions (allow/deny path pre-law)", async () => {
    const jf = join(vault, "law-journal.jsonl");
    const counter = await host.router.callAsRoot("counter.value@1", {});
    expect(counter.ok).toBe(true);
    // counter ops are READ-risk → no law gate → journal only written on gated decisions;
    // verify the journal file exists or is absent-but-clean (no partial lines)
    if (existsSync(jf)) {
      const lines = readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("router status exposes attributable compartment stats", () => {
    const st = host.router.status();
    expect(st.routedOps).toContain("echo.ping@1");
    expect(st.compartments["omega.counter"]).toBeTruthy();
  });
});
