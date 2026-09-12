// discovery.mapping — test/map.test.ts (Ω8)
//
// Unit evidence for the constraint solver:
//   • FULL BIND: the webmail candidate set binds all five blueprint ops
//     (message.send/list/search/read/move) — satisfied, surplus recorded
//   • MISSING send-candidate → UNSAT with gap {missingOp, reason}
//   • RISK MISMATCH → gap, never a silent bind
//   • empty selector → gap with the specific reason
//   • duplicate op candidates → deterministic best-pick + alternatives + surplus
//   • blueprint tolerance: the pack manifest form AND the {ops} form
//   • handler behavior through a fake port (payload blueprint + config
//     blueprintPath fallback + fail-closed append), the manifest parses green
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeBlueprint, baseOp } from "../src/blueprint.ts";
import { solveMapping, type CandidateLike } from "../src/solve.ts";
import { def } from "../src/index.ts";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "..");
const OMEGA_ROOT = join(PLUGIN_DIR, "../..");

// ---- fixtures ----------------------------------------------------------------

const ev = (id: string) => [{ ns: "discovery", id, rev: 1 }];

/** A full webmail candidate set — the output shape of discovery.infer@1. */
function webmailCandidates(): CandidateLike[] {
  return [
    { id: "sc-1", op: "message.send", selector: "form.compose button[type=submit]", riskHint: "EXTERNAL_MUTATION", evidence: ev("capture:btn-send"), confidence: 0.9 },
    { id: "sc-2", op: "message.compose", selector: "button.new", riskHint: "MUTATION", evidence: ev("capture:btn-compose"), confidence: 0.9 },
    { id: "sc-3", op: "message.reply", selector: "button.reply", riskHint: "EXTERNAL_MUTATION", evidence: ev("capture:btn-reply"), confidence: 0.9 },
    { id: "sc-4", op: "message.delete", selector: "button.delete", riskHint: "EXTERNAL_MUTATION", evidence: ev("capture:btn-delete"), confidence: 0.9 },
    { id: "sc-5", op: "message.search", selector: "button.search", riskHint: "READ", evidence: ev("capture:btn-search"), confidence: 0.9 },
    { id: "sc-6", op: "message.move", selector: "button.archive", riskHint: "MUTATION", evidence: ev("capture:btn-archive"), confidence: 0.9 },
    { id: "sc-7", op: "message.read", selector: "button.open", riskHint: "READ", evidence: ev("capture:btn-open"), confidence: 0.9 },
    { id: "sc-8", op: "message.list", selector: "ul.message-list", riskHint: "READ", evidence: ev("capture:list-inbox"), confidence: 0.9 },
    { id: "sc-9", op: "message.field.search", selector: "input.search", riskHint: "READ", evidence: ev("capture:field-search"), confidence: 0.9 },
    { id: "sc-10", op: "message.field.subject", selector: "input.subject", riskHint: "MUTATION", evidence: ev("capture:field-subject"), confidence: 0.9 },
    { id: "sc-11", op: "message.receive", selector: "button.receive", riskHint: "READ", evidence: ev("capture:btn-receive"), confidence: 0.9 },
  ];
}

/** The domain-email blueprint as the engine receives it: the parsed pack manifest. */
function emailPackManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(OMEGA_ROOT, "packs/domain-email/plugin.json"), "utf-8"));
}

const BINDING_OPS = ["message.send@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1", "message.receive@1"];

// ---- the pure solver ----------------------------------------------------------

describe("Ω8 discovery.mapping — solveMapping (pure constraint solving)", () => {
  test("FULL BIND: all six blueprint ops bind exactly one candidate; surplus recorded, satisfied", () => {
    const blueprint = normalizeBlueprint(emailPackManifest(), "test-pack");
    expect(blueprint.ops.map((o) => o.op).sort()).toEqual([...BINDING_OPS].sort());
    const report = solveMapping(webmailCandidates(), blueprint);
    expect(report.satisfied).toBe(true);
    expect(report.gaps).toEqual([]);
    expect(report.bindings).toHaveLength(6);
    const boundOps = report.bindings.map((b) => b.blueprintOp).sort();
    expect(boundOps).toEqual(BINDING_OPS.sort());
    const send = report.bindings.find((b) => b.blueprintOp === "message.send@1")!;
    expect(send).toMatchObject({ candidateId: "sc-1", selector: "form.compose button[type=submit]", riskHint: "EXTERNAL_MUTATION", confidence: 0.9 });
    // surplus: compose/reply/delete + the two typing contracts — recorded, NOT an error
    expect(report.surplus.map((s) => s.candidateId).sort()).toEqual(["sc-10", "sc-2", "sc-3", "sc-4", "sc-9"]);
    expect(report.stats).toMatchObject({ blueprintOps: 6, candidates: 11, bound: 6, gaps: 0, surplus: 5 });
  });

  test("MISSING send-candidate → UNSAT with gap {missingOp, reason names the op}", () => {
    const blueprint = normalizeBlueprint(emailPackManifest(), "test-pack");
    const candidates = webmailCandidates().filter((c) => c.op !== "message.send" && c.op !== "message.receive");
    const report = solveMapping(candidates, blueprint);
    expect(report.satisfied).toBe(false);
    expect(report.gaps).toHaveLength(2); // send AND receive are both absent — honest gap data
    expect(report.gaps[0].missingOp).toBe("message.send@1");
    expect(report.gaps[0].reason).toContain("no candidate with op message.send");
    // everything else still binds — a partial mapping is honest data
    expect(report.bindings).toHaveLength(4);
  });

  test("RISK MISMATCH → gap, never a silent bind (blueprint EXTERNAL_MUTATION vs candidate READ)", () => {
    const blueprint = normalizeBlueprint({ ops: [{ op: "message.send@1", risk: "EXTERNAL_MUTATION" }] }, "test");
    const misRisk = [{ id: "sc-1", op: "message.send", selector: "button.send", riskHint: "READ", evidence: ev("capture:btn-send"), confidence: 0.9 }];
    const report = solveMapping(misRisk, blueprint);
    expect(report.satisfied).toBe(false);
    expect(report.gaps).toHaveLength(1); // risk-mismatch on the single blueprint op — no silent bind
    expect(report.gaps[0].missingOp).toBe("message.send@1");
    expect(report.gaps[0].reason).toContain("risk mismatch (READ != EXTERNAL_MUTATION)");
    expect(report.bindings).toEqual([]);
    // the ineligible candidate is recorded as surplus with the mismatch reason
    expect(report.surplus).toHaveLength(1);
    expect(report.surplus[0].reason).toContain("ineligible (empty selector or risk mismatch)");
  });

  test("EMPTY SELECTOR → gap with the specific reason (selector non-empty is a constraint)", () => {
    const blueprint = normalizeBlueprint({ ops: [{ op: "message.search@1", risk: "READ" }] }, "test");
    const emptySel = [{ id: "sc-5", op: "message.search", selector: "", riskHint: "READ", evidence: ev("capture:btn-search"), confidence: 0.9 }];
    const report = solveMapping(emptySel, blueprint);
    expect(report.satisfied).toBe(false);
    expect(report.gaps[0].reason).toContain("empty selector");
  });

  test("DUPLICATE op candidates → deterministic best-pick (confidence desc, evidence desc, id asc) + alternatives recorded", () => {
    const blueprint = normalizeBlueprint({ ops: [{ op: "message.search@1", risk: "READ" }] }, "test");
    const dup = [
      { id: "sc-a", op: "message.search", selector: "button.search", riskHint: "READ", evidence: ev("capture:a"), confidence: 0.6 },
      { id: "sc-b", op: "message.search", selector: "button.search2", riskHint: "READ", evidence: [...ev("capture:b1"), ...ev("capture:b2")], confidence: 0.6 },
      { id: "sc-c", op: "message.search", selector: "button.search3", riskHint: "READ", evidence: ev("capture:c1"), confidence: 0.6 },
    ];
    // sc-b and sc-c tie on confidence; sc-b carries MORE evidence → best; sc-a loses on confidence
    const report = solveMapping(dup, blueprint);
    expect(report.satisfied).toBe(true);
    expect(report.bindings[0].candidateId).toBe("sc-b");
    expect(report.bindings[0].alternatives).toEqual(["sc-a", "sc-c"]); // every other ELIGIBLE candidate, recorded
    expect(report.surplus.map((s) => s.candidateId).sort()).toEqual(["sc-a", "sc-c"]);
  });

  test("baseOp strips the version: 'message.send@1' → 'message.send'", () => {
    expect(baseOp("message.send@1")).toBe("message.send");
    expect(baseOp("message.send")).toBe("message.send");
  });

  test("blueprint tolerance: pack manifest form AND normalized {ops} form; missing risk → READ", () => {
    const fromPack = normalizeBlueprint(emailPackManifest(), "pack");
    const fromDoc = normalizeBlueprint({ ops: [{ op: "message.send@1", risk: "EXTERNAL_MUTATION" }, { op: "message.read@1" }] }, "doc");
    expect(fromPack.source).toBe("pack");
    expect(fromPack.ops.find((o) => o.op === "message.move@1")!.risk).toBe("MUTATION");
    expect(fromDoc.ops).toEqual([
      { op: "message.send@1", risk: "EXTERNAL_MUTATION" },
      { op: "message.read@1", risk: "READ" }, // no declared risk → read-class (router semantics)
    ]);
    expect(() => normalizeBlueprint({ contributions: {} }, "x")).toThrow(/carries no ops/);
    expect(() => normalizeBlueprint(42, "x")).toThrow(/blueprint must be an object/);
  });
});

// ---- the handler (fake port; startPlugin no-ops outside a worker) -----------

function fakeCtx(opts: { config?: Record<string, unknown>; appendOk?: boolean } = {}): { ctx: PluginContext; calls: Array<{ op: string; payload: unknown }> } {
  const calls: Array<{ op: string; payload: unknown }> = [];
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
  const ctx: PluginContext = {
    manifest,
    capabilities: ["port:vault.append@1"],
    config: opts.config ?? {},
    port: {
      call: async (op: string, payload?: unknown) => {
        calls.push({ op, payload });
        if (op === "vault.append@1") {
          if (opts.appendOk === false) return { ok: false, error: "REFUSED", detail: "no capability token for vault.append@1" };
          return { ok: true, value: { rev: 2, cid: "sha256:m", seq: 4 } };
        }
        return { ok: false, error: "REFUSED", detail: `unexpected op ${op}` };
      },
    },
    log: () => {},
  };
  return { ctx, calls };
}

const META: CallMeta = { causationId: "c_test", deadlineMs: 5000, from: "root" };

describe("Ω8 discovery.mapping — handler (discovery.map@1 via fake port)", () => {
  test("payload blueprint + the whole infer-result object as candidates → report persisted with provenance refs", async () => {
    const { ctx, calls } = fakeCtx();
    const inferResult = { runId: "r1", candidates: webmailCandidates(), vaultRef: { ns: "discovery", id: "candidates:r1", rev: 1 } };
    const r = await def.ops!["discovery.map@1"]!({
      candidates: inferResult, // tolerance: the whole infer result object
      blueprint: emailPackManifest(),
      runId: "map-r1",
      candidatesRef: inferResult.vaultRef,
    }, ctx, META);
    const v = r as { satisfied: boolean; bindings: unknown[]; surplus: unknown[]; vaultRef: { ns: string; id: string; rev: number } };
    expect(v.satisfied).toBe(true);
    expect(v.bindings).toHaveLength(6);
    expect(v.vaultRef).toEqual({ ns: "discovery", id: "mapping:map-r1", rev: 2 });
    const append = calls.find((c) => c.op === "vault.append@1")!;
    const p = append.payload as { ns: string; id: string; refs: Array<{ ns: string; id: string }>; meta: { type: string } };
    expect(p.ns).toBe("discovery");
    expect(p.id).toBe("mapping:map-r1");
    expect(p.meta.type).toBe("mapping");
    // provenance: the candidates object + every BOUND candidate's evidence (6 bindings → 6 capture spans + candidates ref)
    expect(p.refs).toHaveLength(7);
    expect(p.refs).toContainEqual({ ns: "discovery", id: "candidates:r1", rev: 1 });
    expect(p.refs).toContainEqual({ ns: "discovery", id: "capture:btn-send", rev: 1 });
  });

  test("blueprint from CONFIG path when the payload omits it (absolute path passes through)", async () => {
    const { ctx } = fakeCtx({ config: { blueprintPath: join(OMEGA_ROOT, "packs/domain-email/plugin.json") } });
    const r = await def.ops!["discovery.map@1"]!({ candidates: webmailCandidates(), runId: "map-r2" }, ctx, META);
    const v = r as { satisfied: boolean; blueprintSource: string; bindings: unknown[] };
    expect(v.satisfied).toBe(true);
    expect(v.bindings).toHaveLength(6);
    expect(v.blueprintSource).toContain("domain-email");
  });

  test("UNSAT propagates honestly: gap report + still persisted (the gap is data)", async () => {
    const { ctx, calls } = fakeCtx();
    const candidates = webmailCandidates().filter((c) => c.op !== "message.send" && c.op !== "message.receive");
    const r = await def.ops!["discovery.map@1"]!({ candidates, blueprint: emailPackManifest(), runId: "map-r3" }, ctx, META);
    const v = r as { satisfied: boolean; gaps: Array<{ missingOp: string }> };
    expect(v.satisfied).toBe(false);
    expect(v.gaps[0].missingOp).toBe("message.send@1");
    expect(calls.find((c) => c.op === "vault.append@1")).toBeTruthy();
  });

  test("fail-closed: refused vault.append throws; unreadable blueprint path throws; malformed candidates throw", async () => {
    const ok = fakeCtx();
    await expect(def.ops!["discovery.map@1"]!({ candidates: webmailCandidates(), runId: "x" }, ok.ctx, META)).rejects.toThrow(/blueprint is required/);
    const badPath = fakeCtx({ config: { blueprintPath: "/no/such/blueprint.json" } });
    await expect(def.ops!["discovery.map@1"]!({ candidates: webmailCandidates(), runId: "x" }, badPath.ctx, META)).rejects.toThrow(/cannot read blueprintPath/);
    const noAppend = fakeCtx({ appendOk: false });
    await expect(def.ops!["discovery.map@1"]!({ candidates: webmailCandidates(), blueprint: emailPackManifest(), runId: "x" }, noAppend.ctx, META))
      .rejects.toThrow(/vault.append@1 REFUSED/);
    const junk = fakeCtx();
    await expect(def.ops!["discovery.map@1"]!({ candidates: "nope", blueprint: emailPackManifest(), runId: "x" }, junk.ctx, META)).rejects.toThrow(/candidates must be an array/);
    await expect(def.ops!["discovery.map@1"]!({ candidates: [{ id: "sc-1", selector: "x", riskHint: "READ" }], blueprint: emailPackManifest(), runId: "x" }, junk.ctx, META))
      .rejects.toThrow(/candidate sc-1: op must be a non-empty string/);
  });
});

// ---- the manifest (declarations are the product) ------------------------------

describe("Ω8 discovery.mapping — manifest declarations", () => {
  const raw = readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8");

  test("parses + validates green through the sdk mirror; ENGINE contribution routable; append-only capability", () => {
    const r = parseManifest(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateManifest(r.value)).toEqual([]);
    const m = JSON.parse(raw);
    expect(m.contributions.engine).toEqual([
      expect.objectContaining({ kind: "engine", id: "discovery.map", version: "1" }),
      expect.objectContaining({ kind: "engine", id: "discovery.variations", version: "1" }),
    ]);
    expect(m.capabilities.requested).toEqual(["port:vault.append@1"]);
  });
});
