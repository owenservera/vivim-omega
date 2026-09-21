// tooling/gates/test/f-sim.test.ts — the F-SIM falsifier.
// Generated from D-438 by `omega:loop --stub D-438` (D-426, Ω-DEV.2).
// Implemented (D-438): every clause runs a real verdict against
// tooling/gates/rehearse.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import { auditSim, forkShadow, runScenario, type Scenario } from "../rehearse.ts";

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    id: "sim:ctx-corrupt",
    name: "context corruption",
    targetLayers: ["ctx"],
    fault: "corrupt-ctx-hash",
    expectedVerdicts: ["CTX_UNSORTED_INVISIBLE"],
    namedBy: "core-daemon",
    ...over,
  };
}

describe("F-SIM (D-438)", () => {
  test("F-SIM.1 (context-corruption) — corrupted ctx hash yields the refusal row, verdict pass", () => {
    const fork = forkShadow({ slice: ["ctx:1"], scopeNs: "ns sim", budgetGranted: true });
    expect(fork.ok).toBe(true);
    const run = runScenario(scenario(), { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: false });
    expect(run.ok).toBe(true);
    if (!run.ok) throw new Error("unreachable");
    expect(run.value.verdict).toBe("pass");
    expect(run.value.evidenceRefs[0]).toContain("CTX_UNSORTED_INVISIBLE");
  });

  test("F-SIM.2 (starvation) — spiked CPU mints enforcement transition in shadow", () => {
    const run = runScenario(
      scenario({ id: "sim:starve", fault: "spike-cpu", expectedVerdicts: ["GOV_ENFORCEMENT"], targetLayers: ["gov"] }),
      { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: false },
    );
    expect(run.ok && run.value.verdict).toBe("pass");
  });

  test("F-SIM.3 (lineage-cascade) — demoted shadow parent scars shadow children", () => {
    const run = runScenario(
      scenario({ id: "sim:cascade", fault: "demote-parent", expectedVerdicts: ["LINEAGE_SCAR"], targetLayers: ["badge"] }),
      { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: false },
    );
    expect(run.ok && run.value.verdict).toBe("pass");
  });

  test("F-SIM.4 (lost-laptop) — revoked shadow-key writes rejected by shadow CRDT", () => {
    const run = runScenario(
      scenario({ id: "sim:lost", fault: "revoke-shadow-key", expectedVerdicts: ["TRUST_REVOKED_KEY"], targetLayers: ["trust"] }),
      { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: false },
    );
    expect(run.ok && run.value.verdict).toBe("pass");
  });

  test("F-SIM.5 (negative-proof) — exfiltration audit shows enclave refusal + network block", () => {
    const run = runScenario(
      scenario({ id: "sim:exfil", fault: "exfiltrate-enclave", expectedVerdicts: ["TRUST_KEY_EXTRACTABLE"], targetLayers: ["trust"] }),
      { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: false },
    );
    expect(run.ok).toBe(true);
    if (!run.ok) throw new Error("unreachable");
    const words = auditSim(run.value, [{ ns: "ns sim", code: "TRUST_KEY_EXTRACTABLE", detail: "hardware refusal + network block logged" }]);
    expect(words).toContain("pass");
    expect(words).toContain("TRUST_KEY_EXTRACTABLE");
  });

  test("F-SIM.6 (live-immunity) — live-namespace targeting refuses, budget kills hungry rehearsals", () => {
    const live = runScenario(scenario({ targetLayers: ["ns canvas"] }), { isEngine: true, liveNamespaces: ["ns canvas"], shadowKeyOutsideRun: false });
    expect(live.ok).toBe(false);
    if (live.ok) throw new Error("unreachable");
    expect(live.code).toBe("SIM_LIVE_VAULT_WRITE");
    const leak = runScenario(scenario(), { isEngine: true, liveNamespaces: [], shadowKeyOutsideRun: true });
    expect(leak.ok).toBe(false);
    const broke = forkShadow({ slice: ["x"], scopeNs: "ns sim", budgetGranted: false });
    expect(broke.ok).toBe(false);
    if (broke.ok) throw new Error("unreachable");
    expect(broke.code).toBe("SIM_BUDGET_EXCEEDED");
  });
});
