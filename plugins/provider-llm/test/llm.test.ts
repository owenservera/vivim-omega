// GATE-Ω6 evidence (provider-llm) — unit: simulator determinism, role validation,
// maxTokens; live-tier fail-closed guards. Integration: compositions/llm.json
// (REAL vivim.law phase 0 + provider.llm phase 1) booted through the µhost —
// chat.complete@1 from root is ok, deterministic, sim:true, and READ-risk
// (ungated, no consent, no journal gate entries).
//
// (Host is imported by relative path: plugins never take a host dependency —
// only tests borrow the compile/boot ceremony. Same pattern as plugin-notes.)
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { def } from "../src/index.ts";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { compileComposition, ensureVault, bootComposition, contentHashDir } from "../../../host/src/index.ts";
import type { BootedHost } from "../../../host/src/index.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

// ---- unit harness: call the def directly with a fake ctx --------------------------

function fakeCtx(over: Partial<PluginContext> = {}): PluginContext {
  return {
    manifest: { id: "provider.llm", version: "0.1.0" } as unknown as PluginContext["manifest"],
    capabilities: [],
    config: {},
    port: {
      // honest FakeHost-ish port: ungranted ops fail closed exactly like the shim
      call: async (op: string): Promise<PortResult> => ({ ok: false, error: "REFUSED", detail: `no capability token for ${op}` }),
    },
    log: () => {},
    ...over,
  };
}

// D-358: the shim ALWAYS supplies meta.emit (the host relay's sink-or-drop
// is the drop side here — the unit harness observes no chunks, exactly like
// a single-shot caller).
const META = { causationId: "c_test", deadlineMs: 5000, from: "root", emit: () => {} } as const;

async function complete(payload: unknown, ctx: PluginContext = fakeCtx()): Promise<unknown> {
  return await def.ops!["chat.complete@1"]!(payload, ctx, META);
}

const chat = (messages: Array<{ role: string; content: string }>, extra: Record<string, unknown> = {}) => ({ messages, ...extra });

describe("provider-llm unit — simulator determinism + validation", () => {
  test("same request → byte-identical completion (determinism law)", async () => {
    const a = await complete(chat([{ role: "user", content: "hello deterministic world" }]));
    const b = await complete(chat([{ role: "user", content: "hello deterministic world" }]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("different prompt → different completion (and different seed)", async () => {
    const a = await complete(chat([{ role: "user", content: "tell me about spacetime" }])) as { seed: string };
    const b = await complete(chat([{ role: "user", content: "tell me about the sea" }])) as { seed: string };
    expect(a.seed).not.toBe(b.seed);
  });

  test("temperature is part of the seed: same prompt, different temperature → different seed", async () => {
    const a = await complete(chat([{ role: "user", content: "same prompt" }], { temperature: 0.2 })) as { seed: string };
    const b = await complete(chat([{ role: "user", content: "same prompt" }], { temperature: 1.5 })) as { seed: string };
    expect(a.seed).not.toBe(b.seed);
    // …but each (prompt, temperature) pair stays deterministic:
    const a2 = await complete(chat([{ role: "user", content: "same prompt" }], { temperature: 0.2 })) as { seed: string };
    expect(a2.seed).toBe(a.seed);
  });

  test("honest output shape: sim:true, model, 8-hex seed, assistant role, usage accounting", async () => {
    const r = (await complete(chat([
      { role: "system", content: "you are a helpful simulator" },
      { role: "user", content: "count for me please" },
    ]))) as Record<string, unknown>;
    expect(r["sim"]).toBe(true);
    expect(r["model"]).toBe("vivim-sim-llm-1");
    expect(r["seed"]).toMatch(/^[0-9a-f]{8}$/);
    const completion = r["completion"] as { role: string; content: string };
    expect(completion.role).toBe("assistant");
    expect(completion.content).toContain("[sim]");
    expect(completion.content).toContain("mirroring your last user message");
    const usage = r["usage"] as { promptTokens: number; completionTokens: number };
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
  });

  test("role validation: junk role throws with the index + the bad value", async () => {
    expect(complete(chat([{ role: "user", content: "hi" }, { role: "wizard", content: "abracadabra" }]))).rejects.toThrow("messages[1].role must be one of system|user|assistant");
  });

  test("role validation: non-string content throws", async () => {
    expect(complete(chat([{ role: "user", content: 42 as unknown as string }]))).rejects.toThrow("messages[0].content must be a string");
  });

  test("payload validation: non-object, missing messages, empty array all throw", async () => {
    expect(complete("just a string")).rejects.toThrow("payload must be an object");
    expect(complete({})).rejects.toThrow("messages must be a non-empty array");
    expect(complete({ messages: [] })).rejects.toThrow("messages must be a non-empty array");
  });

  test("parameter validation: junk temperature / maxTokens throw readable errors", async () => {
    expect(complete(chat([{ role: "user", content: "x" }], { temperature: "high" }))).rejects.toThrow("temperature must be a number in [0, 2]");
    expect(complete(chat([{ role: "user", content: "x" }], { temperature: 3 }))).rejects.toThrow("temperature must be a number in [0, 2]");
    expect(complete(chat([{ role: "user", content: "x" }], { maxTokens: 0 }))).rejects.toThrow("maxTokens must be a positive integer");
    expect(complete(chat([{ role: "user", content: "x" }], { maxTokens: 2.5 }))).rejects.toThrow("maxTokens must be a positive integer");
  });

  test("maxTokens honored: truncation to exactly the budget + finishReason length", async () => {
    const r = (await complete(chat([{ role: "user", content: "a sufficiently long prompt" }], { maxTokens: 5 }))) as {
      completion: { content: string }; usage: { completionTokens: number }; finishReason: string;
    };
    expect(r.usage.completionTokens).toBe(5);
    expect(r.finishReason).toBe("length");
    expect(r.completion.content.trim().split(/\s+/)).toHaveLength(5);
  });

  test("generous maxTokens → finishReason stop", async () => {
    const r = (await complete(chat([{ role: "user", content: "hi" }]))) as { finishReason: string; usage: { completionTokens: number } };
    expect(r.finishReason).toBe("stop");
    expect(r.usage.completionTokens).toBeLessThanOrEqual(128); // DEFAULT_MAX_TOKENS
  });

  test("live tier fail-closed: config.live set but credential.use NOT granted → refuses", async () => {
    const ctx = fakeCtx({ config: { live: { baseUrl: "https://api.example.com/v1", model: "test-model", credentialId: "cred_test" } } });
    await expect(complete(chat([{ role: "user", content: "hi" }]), ctx)).rejects.toThrow("did NOT grant the credential.use capability");
  });

  test("live tier fail-closed: even with credential.use granted, the credentials spine op is unrouted → honest port refusal", async () => {
    const ctx = fakeCtx({
      capabilities: ["credential.use"],
      config: { live: { baseUrl: "https://api.example.com/v1", model: "test-model", credentialId: "cred_test" } },
    });
    await expect(complete(chat([{ role: "user", content: "hi" }]), ctx)).rejects.toThrow("credential 'cred_test' unavailable — REFUSED");
  });

  test("live config validation: junk baseUrl / missing model throw readable errors", async () => {
    const badUrl = fakeCtx({ capabilities: ["credential.use"], config: { live: { baseUrl: "not-a-url", model: "m", credentialId: "c" } } });
    await expect(complete(chat([{ role: "user", content: "x" }]), badUrl)).rejects.toThrow("baseUrl must be an http(s) URL");
    const noModel = fakeCtx({ capabilities: ["credential.use"], config: { live: { baseUrl: "https://x.example/v1", credentialId: "c" } } });
    await expect(complete(chat([{ role: "user", content: "x" }]), noModel)).rejects.toThrow("model must be a non-empty string");
  });
});

// ---- integration: the REAL composition (vivim.law + provider.llm) ------------------

const SPEC = join(import.meta.dir, "../../../compositions/llm.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
let vault: string;
let host: BootedHost;

beforeAll(async () => {
  vault = omegaTmp("omega-llm-test", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("GATE-Ω6 — provider.llm in the real composition (vivim.law + provider.llm)", () => {
  test("the compile ceremony signed the manifest + stamped its content hash", () => {
    const m = host.manifests.get("provider.llm")!;
    expect(m).toBeTruthy();
    expect(m.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentHashDir(join(import.meta.dir, ".."))).toBe(m.contentHash);
    expect(m.publisher.keyId).toBe(ensureVault(vault).rootKey.keyId);
    expect(m.publisher.signature.length).toBeGreaterThan(0);
  });

  test("chat.complete@1 from root → ok, sim:true, deterministic, assistant role", async () => {
    const payload = { messages: [{ role: "system", content: "be terse" }, { role: "user", content: "hello from the router" }] };
    const r = await host.router.callAsRoot("chat.complete@1", payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { sim: boolean; model: string; completion: { role: string; content: string }; seed: string };
      expect(v.sim).toBe(true);
      expect(v.model).toBe("vivim-sim-llm-1");
      expect(v.completion.role).toBe("assistant");
      expect(v.seed).toMatch(/^[0-9a-f]{8}$/);
      expect(v.completion.content).toContain("hello from the router"); // role-mirroring visible through the router
    }
  });

  test("determinism THROUGH THE ROUTER: two identical calls → identical value JSON", async () => {
    const payload = { messages: [{ role: "user", content: "deterministic through the router" }] };
    const a = await host.router.callAsRoot("chat.complete@1", payload);
    const b = await host.router.callAsRoot("chat.complete@1", payload);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("different prompt through the router → different completion", async () => {
    const a = await host.router.callAsRoot("chat.complete@1", { messages: [{ role: "user", content: "prompt one" }] });
    const b = await host.router.callAsRoot("chat.complete@1", { messages: [{ role: "user", content: "prompt two" }] });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("maxTokens honored through the router", async () => {
    const r = await host.router.callAsRoot("chat.complete@1", { messages: [{ role: "user", content: "long prompt" }], maxTokens: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { usage: { completionTokens: number }; finishReason: string };
      expect(v.usage.completionTokens).toBe(5);
      expect(v.finishReason).toBe("length");
    }
  });

  test("junk role → DEGRADED register with the validator's detail", async () => {
    const r = await host.router.callAsRoot("chat.complete@1", { messages: [{ role: "wizard", content: "abracadabra" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("DEGRADED");
      expect(r.detail).toContain("messages[0].role must be one of system|user|assistant");
    }
  });

  test("chat.complete@1 is READ-risk: ungated — no consent, no law-gate journal entries", async () => {
    const r = await host.router.callAsRoot("chat.complete@1", { messages: [{ role: "user", content: "no gate needed" }] });
    expect(r.ok).toBe(true); // a require-consent refusal would land here as ok:false
    // journal honesty: READ ops never produce a law-gate entry for chat.complete
    const jf = join(vault, "law-journal.jsonl");
    if (existsSync(jf)) {
      const lines = readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const gated = lines.filter((l) => l.op === "chat.complete@1");
      expect(gated).toHaveLength(0);
    }
  });

  test("the real law spine is alive: direct law.check fails closed for unclassified ops; registry observes the provider", async () => {
    // chat.complete@1 is not yet a row in the law's risk table, so a DIRECT gate
    // query fails closed (defaultRisk EXTERNAL_MUTATION → require-consent) —
    // the law's own honest default for unclassified ops. The ROUTER path is
    // different BY CONSTRUCTION: gating is manifest-driven (risky ops only), and
    // provider.llm declares chat.complete@1 READ → the router never asks the
    // gate (proven by the tests above). Both mechanisms agree on the wire.
    const gate = await host.router.callAsRoot("law.check@1", { principal: "provider.llm", op: "chat.complete@1", payload: {} });
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      const d = gate.value as { decision: string; principal?: string };
      expect(d.decision).toBe("require-consent"); // fail-closed default: unclassified op
      expect(d.principal).toBe("provider.llm");
    }
    // the law still OBSERVED the provider as an active principal → the registry lists it
    const r = await host.router.callAsRoot("law.registry@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { plugins: string[]; states: Record<string, { state: string }> };
      expect(v.plugins).toContain("provider.llm");
      expect(v.plugins).toContain("vivim.law");
      expect(v.states["provider.llm"]?.state).toBe("active");
    }
  });

  test("router wires exactly the declared ops; provider.llm compartment is active", () => {
    const st = host.router.status();
    expect(st.routedOps).toContain("chat.complete@1");
    for (const op of ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"]) {
      expect(st.routedOps).toContain(op);
    }
    expect((st.compartments as Record<string, { state: string }>)["provider.llm"].state).toBe("active");
  });
});
