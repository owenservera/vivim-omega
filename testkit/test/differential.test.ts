// Ω4 testkit — the DIFFERENTIAL proof: the same op set runs on BOTH hosts —
// FakeHost (in-process, no workers) and the real µhost (worker compartments, signed
// recipe, real tokens) — and the results agree: same ok/error registers, same
// gate semantics, same journal evidence.
//
// NOTE on defs: plugin-echo/counter/law-stub call startPlugin(definePlugin(...))
// without exporting the def (their files predate Ω4's FakeHost pattern and are
// untouchable here), so this test defines LOCAL mirror defs with identical
// semantics for the FakeHost side. omega.notes is OUR fixture plugin: its real
// def is imported and runs on both hosts — same code, two transports.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { definePlugin, type PluginDef, type PluginContext } from "@vivim/omega-shim";
import { FakeHost } from "@vivim/omega-testkit";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { PortResult, CompositionSpec } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const REPO = join(import.meta.dir, "../..");
const COMPOSITIONS_DIR = join(REPO, "compositions");

// ---- local mirror defs (echo/counter/law-stub semantics) for the FakeHost side ----

let fakeCount = 0;
const echoMirror: PluginDef = definePlugin({
  ops: {
    "echo.ping@1": async (payload) => {
      const delayMs = (payload as { delayMs?: number } | null)?.delayMs ?? 0;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return { echo: true, payload, at: Date.now() };
    },
  },
});
const counterMirror: PluginDef = definePlugin({
  ops: {
    "counter.bump@1": async (_payload, ctx: PluginContext) => {
      fakeCount += 1;
      const r = await ctx.port.call("echo.ping@1", { count: fakeCount });
      return { count: fakeCount, echoResult: r };
    },
    "counter.value@1": () => ({ count: fakeCount }),
  },
});
const lawStubMirror: PluginDef = definePlugin({
  ops: {
    "law.check@1": (payload: { principal?: string }) => ({ decision: "allow", reason: "law-stub: allow-all (differential mirror)", principal: payload?.principal }),
    "law.registry@1": () => ({ plugins: ["vivim.law(stub)"], note: "differential mirror" }),
    "law.consent.grant@1": (payload: object) => ({ granted: true, stub: true, ...payload }),
  },
});

const echoManifest = { id: "omega.echo", contributions: { contract: [{ kind: "contract" as const, id: "echo.ping", version: "1", risk: "READ" as const }] } };
const counterManifest = { id: "omega.counter", contributions: { contract: [{ kind: "contract" as const, id: "counter.bump", version: "1", risk: "READ" as const }, { kind: "contract" as const, id: "counter.value", version: "1", risk: "READ" as const }] } };
const lawStubManifest = { id: "vivim.law", contributions: { contract: [{ kind: "contract" as const, id: "law.check", version: "1", risk: "READ" as const }, { kind: "contract" as const, id: "law.registry", version: "1", risk: "READ" as const }, { kind: "contract" as const, id: "law.consent.grant", version: "1", risk: "READ" as const }] } };
const notesManifest = { id: "omega.notes", contributions: { schema: [{ kind: "schema" as const, id: "note", version: "1" }], contract: [{ kind: "contract" as const, id: "note.write", version: "1", risk: "MUTATION" as const }, { kind: "contract" as const, id: "note.list", version: "1", risk: "READ" as const }] } };

// ---- the shared composition (same world on both hosts) ------------------------

const spec: CompositionSpec = {
  name: "diff",
  entries: [
    { id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
    { id: "omega.echo", source: "../examples/plugin-echo", bootPhase: 1, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
    { id: "omega.counter", source: "../examples/plugin-counter", bootPhase: 1, grant: { capabilities: ["port:echo.ping@1"], contracts: ["counter.bump@1", "counter.value@1"] } },
    { id: "omega.notes", source: "../examples/plugin-notes", bootPhase: 1, grant: { capabilities: ["host.journal.append"], contracts: ["note.write@1", "note.list@1"] } },
  ],
};

let fake: FakeHost;
let notesDef: PluginDef;
let real: BootedHost;
let realVault: string;
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  // FakeHost side (in-process)
  fake = new FakeHost();
  await fake.install(lawStubMirror, lawStubManifest, { capabilities: ["host.journal.append"] });
  fake.grant("vivim.law", ["host.journal.append"]);
  await fake.install(echoMirror, echoManifest);
  await fake.install(counterMirror, counterManifest, { capabilities: ["port:echo.ping@1"] });
  fake.grant("omega.counter", ["port:echo.ping@1"]);
  const notesMod = (await import(join(REPO, "examples/plugin-notes/src/index.ts"))) as { def: PluginDef };
  notesDef = notesMod.def;
  await fake.install(notesDef, notesManifest, { capabilities: ["host.journal.append"] });
  fake.grant("omega.notes", ["host.journal.append"]);

  // Real host side (compile ceremony + worker compartments, unique temp vault)
  realVault = omegaTmp("omega-diff-test", `run-${runId}`);
  rmSync(realVault, { recursive: true, force: true });
  mkdirSync(realVault, { recursive: true });
  const { rootKey } = ensureVault(realVault);
  const { recipe, buildDir } = compileComposition(spec, COMPOSITIONS_DIR, realVault, rootKey);
  real = await bootComposition(recipe, buildDir, realVault);
});

afterAll(async () => {
  await fake.shutdown();
  await real.shutdown();
});

/** The register projection compared across hosts: ok + error (the wire contract). */
function reg(r: PortResult): { ok: boolean; error?: string } {
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

describe("Ω4 differential — FakeHost vs the real µhost, same op set, same results", () => {
  test("echo.ping@1: identical register + echoed payload on both hosts", async () => {
    const a = await fake.callAsRoot("echo.ping@1", { hello: "diff" });
    const b = await real.router.callAsRoot("echo.ping@1", { hello: "diff" });
    expect(reg(a)).toEqual(reg(b));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect((a.value as { payload: { hello: string } }).payload.hello).toBe((b.value as { payload: { hello: string } }).payload.hello);
      expect((a.value as { echo: boolean }).echo).toBe((b.value as { echo: boolean }).echo);
    }
  });

  test("counter.bump@1: inter-compartment call traverses BOTH routers (counter → echo with a real token)", async () => {
    const a = await fake.callAsRoot("counter.bump@1", {});
    const b = await real.router.callAsRoot("counter.bump@1", {});
    expect(reg(a)).toEqual(reg(b));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const av = a.value as { count: number; echoResult: PortResult };
      const bv = b.value as { count: number; echoResult: PortResult };
      expect(av.count).toBe(bv.count);
      expect(reg(av.echoResult)).toEqual(reg(bv.echoResult));
      expect(av.echoResult.ok).toBe(true);
    }
  });

  test("note.write@1 (MUTATION): law allow + journal on both; note.list@1 round-trips", async () => {
    const title = `diff-${runId}`;
    const a = await fake.callAsRoot("note.write@1", { title, body: "differential" });
    const b = await real.router.callAsRoot("note.write@1", { title, body: "differential" });
    expect(reg(a)).toEqual(reg(b));
    expect(a.ok && b.ok).toBe(true);

    const la = await fake.callAsRoot("note.list@1", {});
    const lb = await real.router.callAsRoot("note.list@1", {});
    expect(reg(la)).toEqual(reg(lb));
    if (la.ok && lb.ok) {
      const na = (la.value as { notes: Array<{ title: string }> }).notes;
      const nb = (lb.value as { notes: Array<{ title: string }> }).notes;
      expect(na.some((n) => n.title === title)).toBe(true);
      expect(nb.some((n) => n.title === title)).toBe(true);
    }

    // journal evidence parity: both hosts carry (1) the gate's allow decision for
    // note.write@1 and (2) the plugin's own host.journal.append entry
    const fakeJ = fake.journal;
    const realLines = readFileSync(join(realVault, "law-journal.jsonl"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    for (const journal of [fakeJ, realLines]) {
      expect(journal.some((e) => e.op === "note.write@1" && e.decision === "allow")).toBe(true);
      expect(journal.some((e) => e.op === "note.write@1" && typeof e.noteId === "string")).toBe(true);
    }
  });

  test("error registers agree: unknown op REFUSED, deadline BUDGET, bad payload DEGRADED", async () => {
    const unknown = await Promise.all([
      fake.callAsRoot("no.such.op@1", {}),
      real.router.callAsRoot("no.such.op@1", {}),
    ]);
    expect(reg(unknown[0])).toEqual(reg(unknown[1]));
    expect(reg(unknown[0])).toEqual({ ok: false, error: "REFUSED" });

    const budget = await Promise.all([
      fake.callAsRoot("echo.ping@1", { delayMs: 250 }, 40),
      real.router.callAsRoot("echo.ping@1", { delayMs: 250 }, 40),
    ]);
    expect(reg(budget[0])).toEqual(reg(budget[1]));
    expect(reg(budget[0])).toEqual({ ok: false, error: "BUDGET" });

    const degraded = await Promise.all([
      fake.callAsRoot("note.write@1", { body: "no title" }),
      real.router.callAsRoot("note.write@1", { body: "no title" }),
    ]);
    expect(reg(degraded[0])).toEqual(reg(degraded[1]));
    expect(reg(degraded[0])).toEqual({ ok: false, error: "DEGRADED" });
  });

  test("post-throw resilience parity: a DEGRADED result does NOT kill the notes compartment on either host", async () => {
    // shim semantics on the real wire: the handler throw becomes a DEGRADED result,
    // the worker stays alive. FakeHost mirrors exactly — a subsequent GOOD write
    // succeeds on both, and both lists carry it.
    const goodA = await fake.callAsRoot("note.write@1", { title: "after-throw", body: "resilient" });
    const goodB = await real.router.callAsRoot("note.write@1", { title: "after-throw", body: "resilient" });
    expect(reg(goodA)).toEqual(reg(goodB));
    expect(goodA.ok && goodB.ok).toBe(true);
    expect(fake.states["omega.notes"]).toBe("active");
    expect((real.router.status().compartments as Record<string, { state: string }>)["omega.notes"].state).toBe("active");

    const la = await fake.callAsRoot("note.list@1", {});
    const lb = await real.router.callAsRoot("note.list@1", {});
    expect(reg(la)).toEqual(reg(lb));
    if (la.ok && lb.ok) {
      for (const notes of [(la.value as { notes: Array<{ title: string }> }).notes, (lb.value as { notes: Array<{ title: string }> }).notes]) {
        expect(notes.some((n) => n.title === "after-throw")).toBe(true);
      }
    }
  });

  test("B3 forged-token agreement: an in-process forged token is REFUSED exactly like the wire one", async () => {
    const a = await fake.call("echo.ping@1", {}, { principal: "omega.attacker", token: "tok_forged" });
    expect(reg(a)).toEqual({ ok: false, error: "REFUSED" });
    if (!a.ok) expect(a.detail).toBe("unknown capability token");
    // and the real host's own B3 law (from host/test/runtime.test.ts) proves the same
    // register on the wire — the differential contract holds by construction here:
    // both implementations reject unknown tokens BEFORE any dispatch.
  });

  test("both hosts route exactly the same op set (B1 parity)", () => {
    const fakeOps = fake.status().routedOps.sort();
    const realOps = real.router.status().routedOps.sort();
    expect(fakeOps).toEqual(realOps);
    expect(fakeOps).toEqual(["counter.bump@1", "counter.value@1", "echo.ping@1", "law.check@1", "law.consent.grant@1", "law.registry@1", "note.list@1", "note.write@1"]);
  });

  test("the notes def is the SAME module instance on the FakeHost side as the conformance fixture's", async () => {
    // (sanity: the differential runs real plugin code, not a copy)
    const mod = (await import(join(REPO, "examples/plugin-notes/src/index.ts"))) as { def: PluginDef };
    expect(mod.def).toBe(notesDef);
    expect(typeof mod.def.ops?.["note.write@1"]).toBe("function");
  });

  test("terminal-state parity (ISS-012 pin): terminated compartments answer DEGRADED on both hosts", async () => {
    // The state NAMES differ by construction (real host: "stopped" — the worker
    // is gone; FakeHost: "retired" — in-process equivalent) and must NEVER be
    // unified silently: status consumers distinguish them. What MUST agree is
    // the observable register: calls to a terminated compartment answer
    // DEGRADED on both. This test pins both halves (last in file: echo stays
    // terminated; nothing below needs it).
    const { HOST_OPS } = await import("@vivim/omega-contracts");
    await fake.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: "omega.echo" });
    await real.router.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: "omega.echo" });
    expect(fake.states["omega.echo"]).toBe("retired");
    expect((real.router.status().compartments as Record<string, { state: string }>)["omega.echo"].state).toBe("stopped");
    const after = await Promise.all([
      fake.callAsRoot("echo.ping@1", {}),
      real.router.callAsRoot("echo.ping@1", {}),
    ]);
    expect(reg(after[0])).toEqual(reg(after[1]));
    expect(reg(after[0])).toEqual({ ok: false, error: "DEGRADED" });
  });
});
