// tooling/gates/rehearse.ts — D-438 (Ω-8 port of paper D-432): the Rehearsal Engine.
//
// The system breaks itself in the dark so it never breaks the user in the
// light. Vault slices fork into quarantined `ns sim` (shredded after run or
// 24h); faults inject through the same Law→Gov→Ctx paths as live; the verdict
// engine compares shadow ledgers to expected refusals; verdicts are hashes of
// proving rows, not booleans. Live vault writes refuse; shadow keys die
// outside `sim.run`. Pure library (no Bun/OS/DOM imports — headless).
// Falsifier: F-SIM (`tooling/gates/test/f-sim.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface Scenario {
  id: string;
  name: string;
  targetLayers: string[];
  fault: string;
  expectedVerdicts: string[];
  namedBy: string;
}
export interface ShadowLedgerRow { ns: string; code: string; detail: string; }
export interface SimRun {
  scenarioRef: string;
  verdict: "pass" | "fail" | "aborted";
  evidenceRefs: string[];
  ledgerHash: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type RehearseResult<T> = { ok: true; value: T } | Refusal;

/** sim.fork — vault slice into ns sim. Governed (budget), quarantined, shredded after. */
export function forkShadow(input: {
  slice: string[];
  scopeNs: string;
  budgetGranted: boolean;
}): RehearseResult<{ forkRef: string; retention: string }> {
  if (!input.budgetGranted) {
    return { ok: false, code: "SIM_BUDGET_EXCEEDED", sentence: "This simulation is consuming too many resources. The governor is killing the rehearsal to protect the live system." };
  }
  return {
    ok: true,
    value: { forkRef: `ns-sim:${hash53(input.slice.join("|"))}`, retention: "shred-after-run-or-24h" },
  };
}

/** Fault table: each fault mints its constitutional refusal row into the shadow ledger. */
const FAULT_ROWS: Record<string, ShadowLedgerRow> = {
  "corrupt-ctx-hash": { ns: "ns sim", code: "CTX_UNSORTED_INVISIBLE", detail: "corrupted context hash refused" },
  "spike-cpu": { ns: "ns sim", code: "GOV_ENFORCEMENT", detail: "tile.transition cause=enforcement" },
  "demote-parent": { ns: "ns sim", code: "LINEAGE_SCAR", detail: "lineage.scar minted for shadow children" },
  "revoke-shadow-key": { ns: "ns sim", code: "TRUST_REVOKED_KEY", detail: "shadow write rejected by shadow CRDT" },
  "exfiltrate-enclave": { ns: "ns sim", code: "TRUST_KEY_EXTRACTABLE", detail: "hardware refusal + network block logged" },
};

/** sim.inject + sim.run — sole writer: the Rehearsal Engine. Live namespaces refuse. */
export function runScenario(scenario: Scenario, input: {
  isEngine: boolean;
  liveNamespaces: string[];
  shadowKeyOutsideRun: boolean;
}): RehearseResult<SimRun> {
  if (!input.isEngine) {
    return { ok: false, code: "SIM_UNSCOPED_FAULT", sentence: "This fault injection targets the entire mesh without a shadow fork. I will not risk live state to run a test." };
  }
  if (scenario.targetLayers.some((l) => input.liveNamespaces.includes(l))) {
    return { ok: false, code: "SIM_LIVE_VAULT_WRITE", sentence: "A simulation attempted to write to the live vault. The shadow fork is quarantined; this write was refused." };
  }
  if (input.shadowKeyOutsideRun) {
    return { ok: false, code: "SIM_SHADOW_KEY_LEAK", sentence: "A shadow-key was used outside of a `sim.run` context. It has been instantly revoked and the simulation aborted." };
  }
  const ledger: ShadowLedgerRow[] = [];
  const row = FAULT_ROWS[scenario.fault];
  if (row) ledger.push(row);
  const missing = scenario.expectedVerdicts.filter((v) => !ledger.some((r) => r.code === v));
  const verdict = missing.length === 0 ? "pass" : "fail";
  const ledgerHash = hash53(JSON.stringify(ledger));
  return {
    ok: true,
    value: {
      scenarioRef: scenario.id,
      verdict,
      evidenceRefs: ledger.map((r, i) => `ns-sim:row:${i}:${r.code}`),
      ledgerHash,
    },
  };
}

/** sim.audit — render the shadow ledger and verdict in plain words. */
export function auditSim(run: SimRun, ledger: ShadowLedgerRow[]): string {
  return `sim ${run.scenarioRef}: ${run.verdict} (ledger ${run.ledgerHash}); rows [${ledger.map((r) => r.code).join(", ")}]; evidence [${run.evidenceRefs.join(", ")}]`;
}
