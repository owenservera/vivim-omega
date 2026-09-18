// discovery.verification — test/verify.test.ts (Ω8)
//
// THE PROMOTION GATE unit evidence:
//   • promotion at 3/3 probes with evidence (score 1.0 ≥ threshold 0.95)
//   • rejection at 2/3 (score 0.67 < 0.95) with the exact gap string
//   • CONFIDENCE ALONE NEVER PROMOTES: confidence 0.99 + score 0.6 → DRAFT;
//     the inverse: confidence 0.3 + 3/3 passing probes → PROMOTED
//   • evidence law: a passing probe without resolvable evidence doesn't count;
//     unresolvable refs → evidence incomplete → DRAFT
//   • probeCount < requiredProbes → gap
//   • THE THRESHOLD IS POLICY DATA: the shipped manifest's policy doc drives
//     the decision; a doctored manifest with different thresholds flips the
//     SAME code's outcome (loadPromotionPolicy from the contribution, never a
//     constant); malformed policy → the gate refuses to run (fail-closed)
//   • handler behavior through a fake port (evidence resolution via
//     vault.get@1 + promotion event append with the full proof chain), the
//     manifest parses green
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPromotionPolicy, loadGovernedParserRegistry, isGovernedParserPin } from "../src/policy.ts";
import { evaluatePromotion, isValidProbe, type Probe } from "../src/evaluate.ts";
import { def } from "../src/index.ts";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "..");

// ---- fixtures ----------------------------------------------------------------

const EV = [
  { ns: "discovery", id: "capture:btn-send", rev: 1 },
  { ns: "discovery", id: "capture:btn-search", rev: 1 },
  { ns: "discovery", id: "capture:btn-open", rev: 1 },
];
const ev = (i: number) => [EV[i]];

const BINDINGS = [
  { blueprintOp: "message.send@1", candidateId: "sc-1", confidence: 0.9 },
  { blueprintOp: "message.search@1", candidateId: "sc-5", confidence: 0.9 },
];

function probesFor(candidateId: string, n: number, opts: { failAt?: number[]; noEvidenceAt?: number[]; evidence?: typeof EV } = {}): Probe[] {
  const evidencePool = opts.evidence ?? EV;
  return Array.from({ length: n }, (_, i) => ({
    candidateId,
    preState: { step: i },
    postState: { step: i, applied: true },
    passed: !(opts.failAt ?? []).includes(i),
    evidence: (opts.noEvidenceAt ?? []).includes(i) ? [] : [evidencePool[i % evidencePool.length]],
    note: `probe ${i + 1}/${n}`,
  }));
}

/** All shipped fixture refs resolve; a doctored set can simulate unresolvable refs. */
function resolverFor(...keys: string[]): Set<string> {
  const all = EV.map((r) => `${r.ns}|${r.id}|${r.rev}`);
  return new Set(keys.length === 0 ? all : keys);
}

const realManifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
const policy = loadPromotionPolicy(realManifest);

// ---- the pure decision ---------------------------------------------------------

describe("Ω8 discovery.verification — evaluatePromotion (pure promotion decision)", () => {
  test("promotion at 3/3 probes with resolvable evidence (score 1.0 ≥ threshold 0.95)", () => {
    const probes = [...probesFor("sc-1", 3), ...probesFor("sc-5", 3)];
    const r = evaluatePromotion(policy, BINDINGS, probes, resolverFor());
    expect(r.promoted).toEqual(["sc-1", "sc-5"]);
    expect(r.stillDraft).toEqual([]);
    for (const res of r.results) {
      expect(res.status).toBe("PROMOTED");
      expect(res.score).toBe(1);
      expect(res.probeCount).toBe(3);
      expect(res.gaps).toEqual([]);
      expect(res.evidenceComplete).toBe(true);
    }
  });

  test("rejection at 2/3: score 0.67 < threshold 0.95 → DRAFT with the exact gap", () => {
    const probes = probesFor("sc-1", 3, { failAt: [2] });
    const r = evaluatePromotion(policy, [BINDINGS[0]], probes, resolverFor());
    expect(r.promoted).toEqual([]);
    expect(r.stillDraft).toEqual(["sc-1"]);
    const res = r.results[0];
    expect(res.status).toBe("DRAFT");
    expect(res.score).toBe(0.67);
    expect(res.passed).toBe(2);
    expect(res.gaps).toEqual([`score 0.67 < policy.threshold ${policy.threshold}`]);
  });

  test("CONFIDENCE ALONE NEVER PROMOTES: confidence 0.99 with score 0.6 → DRAFT", () => {
    const hi = [{ blueprintOp: "message.send@1", candidateId: "sc-1", confidence: 0.99 }];
    const probes = probesFor("sc-1", 5, { failAt: [2, 4] }); // 3/5 = 0.6
    const r = evaluatePromotion(policy, hi, probes, resolverFor());
    expect(r.results[0].confidence).toBe(0.99);
    expect(r.results[0].status).toBe("DRAFT");
    expect(r.results[0].score).toBe(0.6);
    expect(r.results[0].gaps).toContain(`score 0.6 < policy.threshold ${policy.threshold}`);
  });

  test("the inverse: LOW confidence (0.3) with 3/3 passing probes → PROMOTED (proof beats confidence)", () => {
    const lo = [{ blueprintOp: "message.send@1", candidateId: "sc-1", confidence: 0.3 }];
    const r = evaluatePromotion(policy, lo, probesFor("sc-1", 3), resolverFor());
    expect(r.results[0].confidence).toBe(0.3);
    expect(r.results[0].status).toBe("PROMOTED");
    expect(r.promoted).toEqual(["sc-1"]);
  });

  test("evidence law: a PASSING probe without evidence does not count (score drops, gap names it)", () => {
    const probes = probesFor("sc-1", 3, { noEvidenceAt: [1] }); // probe 2 passes but cites nothing
    const r = evaluatePromotion(policy, [BINDINGS[0]], probes, resolverFor());
    expect(r.results[0].status).toBe("DRAFT");
    expect(r.results[0].passed).toBe(2);
    expect(r.results[0].score).toBe(0.67);
    expect(r.results[0].evidenceComplete).toBe(false);
    expect(r.results[0].gaps.some((g) => g.startsWith("evidence incomplete"))).toBe(true);
    expect(r.results[0].gaps.some((g) => g.includes("no evidence refs"))).toBe(true);
  });

  test("evidence law: UNRESOLVABLE refs (not in the vault) fail the proof → DRAFT", () => {
    const ghost = [{ ns: "discovery", id: "capture:ghost", rev: 7 }];
    const probes = probesFor("sc-1", 3, { evidence: ghost });
    const r = evaluatePromotion(policy, [BINDINGS[0]], probes, resolverFor()); // resolver does NOT know the ghost ref
    expect(r.results[0].status).toBe("DRAFT");
    expect(r.results[0].score).toBe(0);
    expect(r.results[0].gaps.some((g) => g.includes("discovery/capture:ghost@7"))).toBe(true);
  });

  test("probeCount below requiredProbes → DRAFT with the count gap (even at score 1.0)", () => {
    const r = evaluatePromotion(policy, [BINDINGS[0]], probesFor("sc-1", 2), resolverFor());
    expect(r.results[0].status).toBe("DRAFT");
    expect(r.results[0].score).toBe(1);
    expect(r.results[0].gaps).toEqual([`probeCount 2 < policy.requiredProbes ${policy.requiredProbes}`]);
  });

  test("no probes at all → DRAFT with the honest gap; orphan probes recorded, never an error", () => {
    const probes = probesFor("sc-unknown", 2); // evidence about an unmapped candidate
    const r = evaluatePromotion(policy, BINDINGS, probes, resolverFor());
    expect(r.promoted).toEqual([]);
    expect(r.stillDraft).toEqual(["sc-1", "sc-5"]);
    for (const res of r.results) expect(res.gaps.some((g) => g.startsWith(`no probes supplied for candidate ${res.candidateId}`))).toBe(true);
    expect(r.orphanProbes).toEqual([{ candidateId: "sc-unknown", count: 2 }]);
  });

  test("probe validation: isValidProbe accepts the documented shape and rejects junk", () => {
    expect(isValidProbe({ candidateId: "sc-1", passed: true, evidence: ev(0) })).toBe(true);
    expect(isValidProbe({ candidateId: "sc-1", passed: "yes", evidence: ev(0) })).toBe(false);
    expect(isValidProbe({ candidateId: "", passed: true, evidence: ev(0) })).toBe(false);
    expect(isValidProbe({ candidateId: "sc-1", passed: true, evidence: [{ ns: "x", id: "y", rev: 0 }] })).toBe(false);
    expect(isValidProbe({ candidateId: "sc-1", passed: true })).toBe(false);
    expect(isValidProbe(null)).toBe(false);
  });
});

// ---- the policy: DATA, not constants ------------------------------------------

describe("Ω8 discovery.verification — policy is DATA (loaded from the POLICY contribution)", () => {
  test("the SHIPPED policy doc in plugin.json is exactly {threshold 0.95, requiredProbes 3, evidenceRequired true}", () => {
    expect(policy).toEqual({
      policyId: "discovery.promotion-policy",
      version: "1.0.0",
      threshold: 0.95,
      requiredProbes: 3,
      evidenceRequired: true,
    });
  });

  test("DOCTORED manifest policy flips the SAME code's outcome — the threshold is not a constant", () => {
    const doctored = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    const doc = doctored.contributions.policy[0].policy;
    doc.threshold = 0.5;       // looser gate
    doc.requiredProbes = 2;    // fewer probes required
    const loose = loadPromotionPolicy(doctored);
    expect(loose.threshold).toBe(0.5);
    expect(loose.requiredProbes).toBe(2);

    // 2/3 probes: score 0.67 — DRAFT under the shipped policy, PROMOTED under the doctored one
    const probes = probesFor("sc-1", 3, { failAt: [2] });
    const strict = evaluatePromotion(policy, [BINDINGS[0]], probes, resolverFor());
    const looseR = evaluatePromotion(loose, [BINDINGS[0]], probes, resolverFor());
    expect(strict.results[0].status).toBe("DRAFT");
    expect(looseR.results[0].status).toBe("PROMOTED");
    expect(looseR.results[0].gaps).toEqual([]);
  });

  test("evidenceRequired=false: passing probes without evidence count (policy choice, recorded)", () => {
    const doctored = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    doctored.contributions.policy[0].policy.evidenceRequired = false;
    const noEv = loadPromotionPolicy(doctored);
    const probes = probesFor("sc-1", 3, { noEvidenceAt: [1] });
    const r = evaluatePromotion(noEv, [BINDINGS[0]], probes, resolverFor());
    expect(r.results[0].status).toBe("PROMOTED"); // the policy chose to not require evidence
    expect(r.results[0].evidenceComplete).toBe(false); // still recorded honestly
  });

  test("fail-closed: a malformed or missing policy refuses the gate (no invented thresholds)", () => {
    const noPolicy = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    noPolicy.contributions.policy = [];
    expect(() => loadPromotionPolicy(noPolicy)).toThrow(/no POLICY contribution discovery.promotion-policy/);

    const badThreshold = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    badThreshold.contributions.policy[0].policy.threshold = 1.5;
    expect(() => loadPromotionPolicy(badThreshold)).toThrow(/policy.threshold must be a number in \(0,1\]/);

    const badProbes = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    badProbes.contributions.policy[0].policy.requiredProbes = 0;
    expect(() => loadPromotionPolicy(badProbes)).toThrow(/policy.requiredProbes must be an integer/);

    const badEvidence = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    badEvidence.contributions.policy[0].policy.evidenceRequired = "yes";
    expect(() => loadPromotionPolicy(badEvidence)).toThrow(/policy.evidenceRequired must be a boolean/);

    const noDoc = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    delete noDoc.contributions.policy[0].policy;
    expect(() => loadPromotionPolicy(noDoc)).toThrow(/carries no policy object/);
  });
});

// ---- the governed parser-pin registry: DATA, fail-closed genealogy (D-355/W1) --

describe("D-355 discovery.verification — the governed parser-pin registry is DATA (the genealogy fence)", () => {
  const registryOf = (m: unknown) => loadGovernedParserRegistry(m as Parameters<typeof loadGovernedParserRegistry>[0]);
  const base = () => JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
  const registryDoc = (m: Record<string, unknown>) =>
    (m.contributions as { policy: Array<{ id: string; policy?: Record<string, unknown> }> }).policy
      .find((c) => c.id === "discovery.parser-registry")!;

  test("the SHIPPED registry is exactly the five governed parser pins (a closed, reviewed set)", () => {
    const r = registryOf(realManifest);
    expect([...r.pins.keys()].sort()).toEqual([
      "parser:chat.complete:llm@1",
      "parser:history.import:chatgpt@1",
      "parser:history.import:claude@1",
      "parser:history.import:gemini@1",
      "parser:message.send:browser@1",
    ]);
  });

  test("isGovernedParserPin: exact triple match — right identity at the wrong version refuses", () => {
    const r = registryOf(realManifest);
    expect(isGovernedParserPin(r, { providerId: "browser", archetypeSlug: "message.send", version: "1" })).toBe(true);
    expect(isGovernedParserPin(r, { providerId: "llm", archetypeSlug: "chat.complete", version: "1" })).toBe(true);
    expect(isGovernedParserPin(r, { providerId: "llm", archetypeSlug: "chat.complete", version: "2" })).toBe(false);
    expect(isGovernedParserPin(r, { providerId: "generic", archetypeSlug: "history.import", version: "1" })).toBe(false);
  });

  test("fail-closed: missing / empty / duplicate / malformed registry refuses the gate", () => {
    const none = base();
    none.contributions.policy = none.contributions.policy.filter((c: { id: string }) => c.id !== "discovery.parser-registry");
    expect(() => registryOf(none)).toThrow(/no POLICY contribution discovery.parser-registry/);

    const empty = base();
    registryDoc(empty).policy!.governedParserPins = [];
    expect(() => registryOf(empty)).toThrow(/governedParserPins must be a non-empty array/);

    const dup = base();
    const doc = registryDoc(dup);
    doc.policy!.governedParserPins = [...(doc.policy!.governedParserPins as unknown[]), { providerId: "llm", archetypeSlug: "chat.complete", version: "1" }];
    expect(() => registryOf(dup)).toThrow(/lists parser:chat.complete:llm@1 twice/);

    const malformed = base();
    registryDoc(malformed).policy!.governedParserPins = [{ providerId: "llm", archetypeSlug: "chat.complete@1", version: "1" }];
    expect(() => registryOf(malformed)).toThrow(/archetypeSlug must be the bare op name/);
  });
});

// ---- the handler (fake port; startPlugin no-ops outside a worker) -----------

function fakeCtx(opts: { resolvable?: Set<string>; appendOk?: boolean } = {}): { ctx: PluginContext; calls: Array<{ op: string; payload: unknown }> } {
  const calls: Array<{ op: string; payload: unknown }> = [];
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
  const resolvable = opts.resolvable ?? resolverFor();
  const ctx: PluginContext = {
    manifest,
    capabilities: ["port:vault.append@1", "port:vault.get@1"],
    config: {},
    port: {
      call: async (op: string, payload?: unknown) => {
        calls.push({ op, payload });
        if (op === "vault.get@1") {
          const p = payload as { ns: string; id: string; rev: number };
          const key = `${p.ns}|${p.id}|${p.rev}`;
          if (resolvable.has(key)) return { ok: true, value: { rev: p.rev, cid: "sha256:e", data: {}, meta: null, refs: [] } };
          return { ok: false, error: "DEGRADED", detail: `no object ${p.ns}/${p.id}@${p.rev} (not found)` };
        }
        if (op === "vault.append@1") {
          if (opts.appendOk === false) return { ok: false, error: "REFUSED", detail: "no capability token for vault.append@1" };
          return { ok: true, value: { rev: 3, cid: "sha256:p", seq: 9 } };
        }
        return { ok: false, error: "REFUSED", detail: `unexpected op ${op}` };
      },
    },
    log: () => {},
  };
  return { ctx, calls };
}

const META: CallMeta = { causationId: "c_test", deadlineMs: 5000, from: "root" };

function mapResult(satisfied = true) {
  return {
    runId: "r1",
    satisfied,
    bindings: BINDINGS.map((b) => ({ ...b, selector: "button.x", riskHint: "READ", alternatives: [] })),
    gaps: [],
    surplus: [],
    vaultRef: { ns: "discovery", id: "mapping:r1", rev: 2 },
  };
}

describe("Ω8 discovery.verification — handler (discovery.verify@1 via fake port)", () => {
  const candidates = [
    { id: "sc-1", nodeId: "btn-send", op: "message.send", selector: "button.send", actionType: "click", riskHint: "EXTERNAL_MUTATION", evidence: ev(0), status: "DRAFT", confidence: 0.9 },
    { id: "sc-5", nodeId: "btn-search", op: "message.search", selector: "button.search", actionType: "click", riskHint: "READ", evidence: ev(1), status: "DRAFT", confidence: 0.9 },
  ];

  test("3/3 probes → PROMOTED: candidates rewritten in the returned report + promotion event appended with the full proof chain", async () => {
    const { ctx, calls } = fakeCtx();
    const probes = [...probesFor("sc-1", 3), ...probesFor("sc-5", 3)];
    const r = await def.ops!["discovery.verify@1"]!({
      mapping: mapResult(), probes, runId: "verify-1",
      candidates, candidatesRef: { ns: "discovery", id: "candidates:r1", rev: 1 }, mappingRef: { ns: "discovery", id: "mapping:r1", rev: 2 },
    }, ctx, META);
    const v = r as { promoted: string[]; stillDraft: string[]; candidates: Array<{ id: string; status: string }>; vaultRef: { ns: string; id: string; rev: number }; policy: Record<string, unknown> };
    expect(v.promoted).toEqual(["sc-1", "sc-5"]);
    expect(v.stillDraft).toEqual([]);
    expect(v.policy).toMatchObject({ threshold: 0.95, requiredProbes: 3, evidenceRequired: true });
    // the returned report rewrites candidate status (copies — the vault object is append-only)
    expect(v.candidates.find((c) => c.id === "sc-1")!.status).toBe("PROMOTED");
    expect(v.candidates.find((c) => c.id === "sc-5")!.status).toBe("PROMOTED");
    expect(v.vaultRef).toEqual({ ns: "discovery", id: "promotion:verify-1", rev: 3 });
    // the promotion event: data carries the decision + policy, refs carry the full proof chain
    const append = calls.find((c) => c.op === "vault.append@1")!;
    const p = append.payload as { ns: string; id: string; refs: Array<{ ns: string; id: string }>; data: { promoted: string[]; policy: Record<string, unknown> } };
    expect(p.ns).toBe("discovery");
    expect(p.id).toBe("promotion:verify-1");
    expect(p.data.promoted).toEqual(["sc-1", "sc-5"]);
    expect(p.data.policy.threshold).toBe(0.95);
    // refs: probe evidence (three distinct capture spans — each probe replays its own
    // fixture state) + candidatesRef + mappingRef — provenance, deduped
    expect(p.refs).toHaveLength(5);
    expect(p.refs).toContainEqual({ ns: "discovery", id: "capture:btn-send", rev: 1 });
    expect(p.refs).toContainEqual({ ns: "discovery", id: "capture:btn-open", rev: 1 });
    expect(p.refs).toContainEqual({ ns: "discovery", id: "candidates:r1", rev: 1 });
    expect(p.refs).toContainEqual({ ns: "discovery", id: "mapping:r1", rev: 2 });
  });

  test("2/3 probes → DRAFT: gap report, no promotion event rewrite, resolution untouched", async () => {
    const { ctx, calls } = fakeCtx();
    const probes = probesFor("sc-1", 3, { failAt: [2] });
    const r = await def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes, runId: "verify-2", candidates }, ctx, META);
    const v = r as { promoted: string[]; stillDraft: string[]; candidates: Array<{ id: string; status: string }>; results: Array<{ candidateId: string; gaps: string[] }> };
    expect(v.promoted).toEqual([]);
    expect(v.stillDraft).toEqual(["sc-1", "sc-5"]); // sc-5 has NO probes → also DRAFT (honest)
    expect(v.candidates.find((c) => c.id === "sc-1")!.status).toBe("DRAFT");
    const send = v.results.find((res) => res.candidateId === "sc-1")!;
    expect(send.gaps).toEqual([`score 0.67 < policy.threshold 0.95`]);
    expect(calls.find((c) => c.op === "vault.append@1")).toBeTruthy(); // the rejection event is also evidence
  });

  test("unresolvable evidence refs: the handler RESOLVES through vault.get@1 and fails the proof closed", async () => {
    // the resolver knows ONLY the search capture span — the send span does not exist in the vault;
    // all three probes cite the send span, so no probe's evidence resolves
    const { ctx, calls } = fakeCtx({ resolvable: resolverFor("discovery|capture:btn-search|1") });
    const probes = probesFor("sc-1", 3, { evidence: [EV[0]] });
    const r = await def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes, runId: "verify-3" }, ctx, META);
    const v = r as { promoted: string[]; resolutionNotes: string[]; results: Array<{ score: number; evidenceComplete: boolean }> };
    expect(v.promoted).toEqual([]);
    expect(v.results[0].score).toBe(0);
    expect(v.results[0].evidenceComplete).toBe(false);
    expect(v.resolutionNotes.some((n) => n.includes("capture:btn-send") && n.includes("unresolved"))).toBe(true);
    // evidence resolution actually hit the vault port (once per unique ref)
    const gets = calls.filter((c) => c.op === "vault.get@1");
    expect(gets).toHaveLength(1);
  });

  test("fail-closed: refused append throws; malformed mapping/probes throw (DEGRADED upstream)", async () => {
    const ok = fakeCtx();
    await expect(def.ops!["discovery.verify@1"]!({ probes: [], runId: "x" }, ok.ctx, META)).rejects.toThrow(/mapping is required/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: "junk", runId: "x" }, ok.ctx, META)).rejects.toThrow(/mapping is required/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: { satisfied: true }, runId: "x" }, ok.ctx, META)).rejects.toThrow(/mapping.bindings must be an array/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: "junk", runId: "x" }, ok.ctx, META)).rejects.toThrow(/probes must be an array/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: [{ candidateId: "x", passed: true, evidence: "junk" }], runId: "x" }, ok.ctx, META))
      .rejects.toThrow(/probes\[0\] is malformed/);
    const noAppend = fakeCtx({ appendOk: false });
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: probesFor("sc-1", 3), runId: "x" }, noAppend.ctx, META))
      .rejects.toThrow(/vault.append@1 REFUSED/);
  });
});

// ---- the manifest (declarations are the product) ------------------------------

describe("Ω8 discovery.verification — manifest declarations", () => {
  const raw = readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8");

  test("parses + validates green; ENGINE + POLICY contributions; capability request append+get", () => {
    const r = parseManifest(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateManifest(r.value)).toEqual([]);
    const m = JSON.parse(raw);
    expect(m.contributions.engine).toEqual([
      expect.objectContaining({ kind: "engine", id: "discovery.verify", version: "1" }),
    ]);
    const policyC = m.contributions.policy[0];
    expect(policyC.id).toBe("discovery.promotion-policy");
    expect(policyC.policy).toMatchObject({ threshold: 0.95, requiredProbes: 3, evidenceRequired: true });
    expect(m.capabilities.requested).toEqual(["port:vault.append@1", "port:vault.get@1"]);
  });
});

describe("D-319 verification — ns providers realization writes (additive, alongside the audit event)", () => {
  test("provider supplied: PROMOTED → record; proof-failed → REQUIRES_REDISCOVERY; unprobed → no record", async () => {
    const { ctx, calls } = fakeCtx();
    const probes = [...probesFor("sc-1", 3), ...probesFor("sc-5", 3, { failAt: [0, 1, 2] })];
    const r = await def.ops!["discovery.verify@1"]!({
      mapping: mapResult(), probes, runId: "verify-r1",
      provider: { id: "provider.email.file" },
    }, ctx, META);
    const v = r as {
      promoted: string[]; realizations: Array<{ id: string; status: string; rev: number }>; realizationsWritten: number;
    };
    expect(v.promoted).toEqual(["sc-1"]);
    expect(v.realizationsWritten).toBe(2);
    const provAppends = calls.filter((c) => c.op === "vault.append@1" && (c.payload as { ns: string }).ns === "providers");
    expect(provAppends).toHaveLength(2);
    const send = provAppends.find((c) => (c.payload as { id: string }).id === "realization:message.send:provider.email.file")!;
    const sendData = (send.payload as { data: Record<string, unknown> }).data;
    expect(sendData.status).toBe("PROMOTED");
    expect(sendData.providerClass).toBe("SIMULATOR"); // defaulted (class omitted)
    expect(sendData.archetypeSlug).toBe("message.send");
    expect(sendData.createdAt).toEqual(expect.any(Number));
    // cites the promotion event as its proof link (audit log ↔ current state)
    expect((send.payload as { refs: unknown[] }).refs).toContainEqual({ ns: "discovery", id: "promotion:verify-r1", rev: 3 });
    const search = provAppends.find((c) => (c.payload as { id: string }).id === "realization:message.search:provider.email.file")!;
    expect((search.payload as { data: Record<string, unknown> }).data.status).toBe("REQUIRES_REDISCOVERY");
  });

  test("binding with zero probes gets no record (absence reads as DRAFT downstream)", async () => {
    const { ctx, calls } = fakeCtx();
    const r = await def.ops!["discovery.verify@1"]!({
      mapping: mapResult(), probes: [...probesFor("sc-1", 3)], runId: "verify-r2",
      provider: { id: "provider.email.file", class: "API_NATIVE" },
    }, ctx, META);
    const v = r as { realizationsWritten: number; realizations: Array<{ id: string }> };
    expect(v.realizationsWritten).toBe(1);
    expect(v.realizations.map((x) => x.id)).toEqual(["realization:message.send:provider.email.file"]);
    expect(calls.filter((c) => (c.payload as { ns: string }).ns === "providers")).toHaveLength(1);
  });

  test("no provider supplied: behavior identical to before (no providers-ns writes)", async () => {
    const { ctx, calls } = fakeCtx();
    const r = await def.ops!["discovery.verify@1"]!({
      mapping: mapResult(), probes: [...probesFor("sc-1", 3)], runId: "verify-r3",
    }, ctx, META);
    const v = r as { realizationsWritten: number; realizations: unknown[] };
    expect(v.realizationsWritten).toBe(0);
    expect(v.realizations).toEqual([]);
    expect(calls.filter((c) => (c.payload as { ns: string }).ns === "providers")).toHaveLength(0);
  });

  test("malformed provider fails closed (DEGRADED via throw)", async () => {
    const { ctx } = fakeCtx();
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: [], runId: "x", provider: { id: "" } }, ctx, META))
      .rejects.toThrow(/provider\.id/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: [], runId: "x", provider: { id: "p", class: "NOPE" } }, ctx, META))
      .rejects.toThrow(/provider\.class/);
    await expect(def.ops!["discovery.verify@1"]!({ mapping: mapResult(), probes: [], runId: "x", provider: "p" }, ctx, META))
      .rejects.toThrow(/provider must be/);
  });
});
