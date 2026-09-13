// discovery.healing — unit tests (Ω9): the healing loop's decision table on the
// FakeHost, with policy read from the manifest's POLICY CONTRIBUTION (policy is
// data — proven by MUTATING the manifest, not by mocking constants).
//
// The mandated cases:
//   · no-drift path                                        → {action: "none"}
//   · drift + good candidate + 3/3 probes                  → promote (report has evidenceChain)
//   · drift + candidate missing evidence                   → {action: "reject"}
//   · drift + 2/3 probes                                   → hold-in-probation
//   · thresholds read from the POLICY contribution          — same input, different pinned policy → different decision
// Plus the honesty extras: journaling outcomes, probe-candidate exclusion,
// fail-closed payload/policy handling, determinism.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeHost, runConformance } from "@vivim/omega-testkit";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import type { PluginManifest, CompositionSpec } from "@vivim/omega-contracts";
import { def } from "../src/index.ts";
import { computeDrift, evaluateProbation, readPolicy } from "../src/heal.ts";

const PLUGIN_DIR = join(import.meta.dir, "..");
const OMEGA_ROOT = join(import.meta.dir, "../../..");

const rawManifest = parseManifest(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
const manifest: PluginManifest = rawManifest.ok ? rawManifest.value : (undefined as unknown as PluginManifest);

// ---- shared scenario data (the GATE-Ω9 story, at unit scale) ---------------------

const OLD_SELECTOR = "#compose-btn";
const NEW_SELECTOR = "button[data-testid='compose']";

const promotedContract = {
  op: "compose.click@1",
  selector: OLD_SELECTOR,
  actionType: "click",
  riskHint: "dom",
  status: "PROMOTED",
  confidence: 0.97,
  evidence: [{ capture: "cap-0001", selector: OLD_SELECTOR }],
};

const freshObservation = {
  selector: NEW_SELECTOR,
  actionType: "click",
  outcomeRates: { success: 0.98, miss: 0.02 },
};

const goodCandidate = {
  id: "cand-compose-2",
  op: "compose.click@1",
  selector: NEW_SELECTOR,
  actionType: "click",
  riskHint: "dom",
  evidence: [
    { capture: "cap-4821", selector: NEW_SELECTOR },
    { capture: "cap-4822", selector: NEW_SELECTOR },
  ],
  status: "DRAFT",
  confidence: 0.93,
};

const passingProbes = (n: number, candidateId = "cand-compose-2") =>
  Array.from({ length: n }, (_, i) => ({
    candidateId,
    preState: { probe: i, clicked: false },
    postState: { probe: i, clicked: true },
    passed: true,
  }));

/** A FakeHost with a minimal vault (append-only stub) + the healing engine installed + the capability granted. */
async function healingWorld(manifestLike: PluginManifest = manifest): Promise<{ fake: FakeHost; appended: Array<Record<string, unknown>> }> {
  const fake = new FakeHost();
  const appended: Array<Record<string, unknown>> = [];
  await fake.install(
    { ops: { "vault.append@1": (p: unknown) => { appended.push((p ?? {}) as Record<string, unknown>); return { rev: 1, cid: "sha256:" + "0".repeat(64), seq: appended.length }; } } },
    { id: "vivim.vault", contributions: { contract: [{ kind: "contract", id: "vault.append", version: "1", risk: "MUTATION" }] } },
    { capabilities: [] },
  );
  await fake.install(def, manifestLike, { capabilities: ["port:vault.append@1"] });
  fake.grant("discovery.healing", ["port:vault.append@1"]);
  return { fake, appended };
}

/** Deep-copy of the real manifest with the POLICY contribution's knobs overridden. */
function manifestWithPolicy(overrides: Record<string, unknown>): PluginManifest {
  const m = JSON.parse(JSON.stringify(manifest)) as PluginManifest;
  const policy = m.contributions.policy?.find((c) => c.id === "discovery.healing-policy");
  if (!policy) throw new Error("test fixture: manifest carries no healing policy");
  Object.assign(policy, overrides);
  return m;
}

// ---- the manifest itself is lawful (staged evidence for this plugin) ------------

describe("Ω9 manifest — the engine + policy contributions parse and validate green", () => {
  test("sdk parse + semantic validation green; the POLICY contribution carries the shipped knobs", () => {
    expect(rawManifest.ok).toBe(true);
    if (rawManifest.ok) expect(validateManifest(rawManifest.value)).toEqual([]);
    const policy = manifest.contributions.policy?.find((c) => c.id === "discovery.healing-policy");
    expect(policy).toBeTruthy();
    expect(policy).toMatchObject({ kind: "policy", id: "discovery.healing-policy", version: "1", driftThreshold: 0.3, probationProbes: 3, promotionThreshold: 0.95 });
    expect(manifest.contributions.engine).toEqual([{ kind: "engine", id: "discovery.heal", version: "1", doc: expect.any(String) }]);
    expect(manifest.capabilities.requested).toEqual(["port:vault.append@1", "port:vault.get@1"]); // D-326: prior-rev read for supersedes lineage
  });

  test("readPolicy fails CLOSED when the manifest carries no policy contribution (policy is data, not defaults)", () => {
    const bare = JSON.parse(JSON.stringify(manifest)) as PluginManifest;
    bare.contributions.policy = [];
    expect(() => readPolicy(bare)).toThrow(/no policy contribution/);
    const badNumber = manifestWithPolicy({ driftThreshold: 1.5 });
    expect(() => readPolicy(badNumber)).toThrow(/driftThreshold/);
    const badProbes = manifestWithPolicy({ probationProbes: 0 });
    expect(() => readPolicy(badProbes)).toThrow(/probationProbes/);
  });
});

// ---- the mandated decision table ------------------------------------------------

describe("Ω9 heal@1 — the healing loop's decision table", () => {
  test("no-drift path: observation still matches the promoted evidence signature → {action: 'none'}, journaled", async () => {
    const { fake, appended } = await healingWorld();
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation: { selector: OLD_SELECTOR, actionType: "click", riskHint: "dom", outcomeRates: { success: 0.98, miss: 0.02 } },
      now: 1735689600000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("none");
      expect(v.reason).toContain("below threshold");
      expect(v.drift.score).toBe(0);
      expect(v.policy.driftThreshold).toBe(0.3);
      expect(v.journal).toMatchObject({ ns: "discovery", id: "heal:1735689600000", appended: true, rev: 1 });
      // the event landed in the vault with the action + policy echo
      expect(appended).toHaveLength(1);
      expect(appended[0]).toMatchObject({ ns: "discovery", id: "heal:1735689600000" });
      expect((appended[0].data as Record<string, any>).action).toBe("none");
    }
  });

  test("drift + good candidate + 3/3 probes → PROMOTE: report carries evidenceChain (drift→rediscovery→probation→promotion) and the replacement flips DRAFT→PROMOTED", async () => {
    const { fake, appended } = await healingWorld();
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: { ...promotedContract, address: { ns: "discovery", id: "contract:compose.click", rev: 1 } },
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(3),
      now: 1735689600001,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("promote");
      expect(v.drift.score).toBeCloseTo(0.6923, 3);
      expect(v.probation).toEqual({ passed: 3, total: 3, required: 3, score: 1, threshold: 0.95, excluded: 0 });
      expect(v.replacement).toMatchObject({ id: "cand-compose-2", op: "compose.click@1", selector: NEW_SELECTOR, status: "PROMOTED" });
      expect(v.evidenceChain).toHaveLength(4);
      expect((v.evidenceChain as Array<{ stage: string }>).map((c) => c.stage)).toEqual(["drift", "rediscovery", "probation", "promotion"]);
      expect(v.journal).toMatchObject({ appended: true, id: "heal:1735689600001", rev: 1 });
      // the vault event carries the FULL chain and cites the promoted contract as provenance
      expect(appended).toHaveLength(1);
      const evt = appended[0];
      expect(evt.refs).toEqual([{ ns: "discovery", id: "contract:compose.click", rev: 1 }]);
      const data = evt.data as Record<string, any>;
      expect(data.action).toBe("promote");
      expect(data.evidenceChain).toHaveLength(4);
      expect(data.install).toContain("amendment-transport");
    }
  });

  test("drift + candidate missing evidence → {action: 'reject'} with an honest reason", async () => {
    const { fake } = await healingWorld();
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: { ...goodCandidate, evidence: [] },
      probes: passingProbes(3),
      now: 1735689600002,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("reject");
      expect(v.reason).toContain("cites no evidence");
      expect(v.replacement).toBeUndefined();
      expect(v.journal.appended).toBe(true);
    }
    // evidence: undefined (the field absent entirely) rejects too — no captures, no candidate
    const r2 = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: { op: "compose.click@1", selector: NEW_SELECTOR, status: "DRAFT" },
      now: 1735689600003,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as Record<string, any>).action).toBe("reject");
  });

  test("drift + 2/3 probes → hold-in-probation: gap report names the score gap, chain stops at the promotion gate", async () => {
    const { fake } = await healingWorld();
    const probes = [...passingProbes(2), { candidateId: "cand-compose-2", preState: {}, postState: { clicked: false }, passed: false }];
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes,
      now: 1735689600004,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("hold-in-probation");
      expect(v.probation).toMatchObject({ passed: 2, total: 3 });
      expect(v.probation.score).toBeCloseTo(2 / 3, 3);
      expect(v.gap).toMatchObject({ threshold: 0.95, probesNeeded: 0 });
      expect(v.gap.score).toBeCloseTo(2 / 3, 3);
      expect(v.gap.scoreGap).toBeCloseTo(0.95 - 2 / 3, 3);
      expect(v.replacement).toBeUndefined(); // never install a candidate below threshold
      expect(v.evidenceChain).toHaveLength(4); // the chain still records the promotion-gate refusal
      expect(v.journal.appended).toBe(true);
    }
    // 3/3 probes but only 2 supplied (below the required count): score 1 is NOT enough
    const r2 = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(2),
      now: 1735689600005,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const v2 = r2.value as Record<string, any>;
      expect(v2.action).toBe("hold-in-probation");
      expect(v2.reason).toContain("required probes");
      expect(v2.gap).toMatchObject({ probesNeeded: 1 });
    }
  });

  test("thresholds are read from the POLICY contribution: same input, different pinned policy → different decision", async () => {
    // (a) driftThreshold 0.9: the SAME drifted observation is now below threshold → none
    const strict = await healingWorld(manifestWithPolicy({ driftThreshold: 0.9 }));
    const r = await strict.fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(3),
      now: 1735689600006,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("none");
      expect(v.policy.driftThreshold).toBe(0.9);
      expect(v.reason).toContain("0.9");
    }

    // (b) promotionThreshold 0.6: 2/3 probes (score 0.667) now PROMOTES
    const lenient = await healingWorld(manifestWithPolicy({ promotionThreshold: 0.6 }));
    const probes = [...passingProbes(2), { candidateId: "cand-compose-2", preState: {}, postState: { clicked: false }, passed: false }];
    const r2 = await lenient.fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes,
      now: 1735689600007,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const v2 = r2.value as Record<string, any>;
      expect(v2.action).toBe("promote");
      expect(v2.policy.promotionThreshold).toBe(0.6);
    }

    // (c) probationProbes 2: two probes (both passing) now satisfy the required count
    const twoProbe = await healingWorld(manifestWithPolicy({ probationProbes: 2 }));
    const r3 = await twoProbe.fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(2),
      now: 1735689600008,
    });
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      const v3 = r3.value as Record<string, any>;
      expect(v3.action).toBe("promote");
      expect(v3.probation).toMatchObject({ total: 2, required: 2 });
    }
  });
});

// ---- honesty extras --------------------------------------------------------------

describe("Ω9 heal@1 — honesty extras", () => {
  test("journaling is best-effort: capability not granted → decision stands, journal.appended false with a reason", async () => {
    const fake = new FakeHost();
    await fake.install(def, manifest, { capabilities: [] }); // no port:vault.append@1 granted
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(3),
      now: 1735689600009,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("promote"); // the decision does NOT depend on the vault
      expect(v.journal.appended).toBe(false);
      expect(v.journal.detail).toContain("not granted");
    }
  });

  test("probes referencing a DIFFERENT candidate are excluded, not counted against the score", async () => {
    const { fake } = await healingWorld();
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: [...passingProbes(3), { candidateId: "someone-elses-candidate", preState: {}, postState: {}, passed: false }],
      now: 1735689600010,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("promote");
      expect(v.probation).toMatchObject({ passed: 3, total: 3, excluded: 1 });
    }
  });

  test("candidate diverging from the fresh observation is rejected (rediscovery cites the re-observed behavior, not memory)", async () => {
    const { fake } = await healingWorld();
    const r = await fake.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: { ...goodCandidate, selector: "#a-third-selector" },
      probes: passingProbes(3),
      now: 1735689600011,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as Record<string, any>;
      expect(v.action).toBe("reject");
      expect(v.reason).toContain("does not match the fresh observation");
    }
  });

  test("missing primary inputs fail CLOSED: DEGRADED with an attributable detail", async () => {
    const { fake } = await healingWorld();
    const noContract = await fake.callAsRoot("discovery.heal@1", { freshObservation });
    expect(noContract.ok).toBe(false);
    if (!noContract.ok) {
      expect(noContract.error).toBe("DEGRADED");
      expect(noContract.detail).toContain("contractEvidence");
    }
    const noObservation = await fake.callAsRoot("discovery.heal@1", { contractEvidence: promotedContract });
    expect(noObservation.ok).toBe(false);
    if (!noObservation.ok) expect(noObservation.detail).toContain("freshObservation");
  });

  test("the loop is deterministic: identical input → identical report (event ids included, via `now`)", async () => {
    const a = await healingWorld();
    const b = await healingWorld();
    const input = {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: goodCandidate,
      probes: passingProbes(3),
      now: 1735689600012,
    };
    const ra = await a.fake.callAsRoot("discovery.heal@1", input);
    const rb = await b.fake.callAsRoot("discovery.heal@1", input);
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) expect(JSON.stringify(ra.value)).toBe(JSON.stringify(rb.value));
  });

  test("pure core: drift axis math (graded selector, categorical actionType, rates L1) and the fail-sensitive max", () => {
    const d = computeDrift(
      { selector: "#compose-btn", actionType: "click", riskHint: "dom", outcomeRates: { success: 0.99 } },
      { selector: NEW_SELECTOR, actionType: "click", riskHint: "dom", outcomeRates: { success: 0.98 } },
    );
    expect(d.score).toBeGreaterThan(0.3);
    expect(d.axes.find((x) => x.axis === "selector")?.diff).toBeCloseTo(0.6923, 3);
    expect(d.axes.find((x) => x.axis === "actionType")?.diff).toBe(0);
    expect(d.axes.find((x) => x.axis === "outcomeRates")?.diff).toBeCloseTo(0.005, 6);
    // a full actionType flip is COMPLETE drift even when the selector matches
    const flip = computeDrift({ selector: "#x", actionType: "click" }, { selector: "#x", actionType: "type" });
    expect(flip.score).toBe(1);
    // nothing comparable → 0 with an honest note
    const empty = computeDrift({ actionType: "click" }, { selector: "#x" });
    expect(empty.score).toBe(0);
    expect(empty.note).toBeTruthy();
  });

  test("pure core: probation evaluation with no candidate id counts every probe (tolerant input)", () => {
    const policy = readPolicy(manifest);
    const p = evaluateProbation([{ passed: true }, { passed: false }, { candidateId: "whatever", passed: true }], null, policy);
    expect(p).toMatchObject({ passed: 2, total: 3, excluded: 0 });
  });
});

// ---- the engine passes conformance against its target composition context -------

describe("Ω9 heal@1 — conformance (staged → verified → active) against the healing composition", () => {
  test("runConformance with compositions/healing.json as the target world: all three stages green", async () => {
    const spec = JSON.parse(readFileSync(join(OMEGA_ROOT, "compositions", "healing.json"), "utf-8")) as CompositionSpec;
    const report = await runConformance(PLUGIN_DIR, { composition: spec, config: {} });
    expect(report.pluginId).toBe("discovery.healing");
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.active).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.ops).toEqual(["discovery.heal@1"]);
    expect(report.fixture).toBe("test/conformance.fixture.ts");
    // the dependency declaration (contract:vault.append@1) is satisfied by the composition's vault grants
    expect(report.contentHash.computed).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
