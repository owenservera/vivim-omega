// @vivim/omega-contracts — computation.ts
// D-323: the computation-kind axis + resolve/scorecard record shapes.
//
// ComputationKind is deliberately NOT a fourth ProviderClass member (D-306's
// reservation stands): execution modality (SIMULATOR/API_NATIVE/
// BROWSER_MEDIATED — HOW an op executes) and reasoning kind (DETERMINISTIC/
// PROBABILISTIC/HUMAN — WHAT KIND of task this is) are different axes. An
// API_NATIVE provider can serve a deterministic lookup; a SIMULATOR never
// serves a judgment call. Conflating them would force provider-class edits
// for every new reasoning kind.
import type { VaultProvenanceRef } from "./vocabulary.ts";

/** Reasoning kind: what KIND of task a decision is, before spending execution. */
export type ComputationKind =
  | "DETERMINISTIC"  // rule-covered or simulator-proven: run it, ledger it
  | "PROBABILISTIC"  // model/probe-mediated: run with evidence, score it
  | "HUMAN";         // safe default: escalate rather than guess

/** Which branch of the classify rule table produced a decision. */
export type ResolveBranch = "rule" | "realization" | "human";

/** Resolve decision (vault ns "resolve", id `resolve:<decisionId>`, rev 1):
 *  the routing verdict. Written by resolve.classify@1, read by
 *  resolve.report@1 (same id, rev 2) and strategy.scorecard@1. */
export interface ResolveDecision {
  decisionId: string;
  kind: ComputationKind;
  /** The routed capability: a rule's action op (branch rule), `<slug>@1`
   *  (branch realization, v0 convention), or "" (branch human — escalate). */
  capability: string;
  branch: ResolveBranch;
  reason: string;
  evidenceRefs: VaultProvenanceRef[];
  /** Authorizing build decision — always D-323 for classifier verdicts. */
  buildDecisionRef: "D-323";
  createdAt: number;
}

/** Resolve outcome status: did the routed execution succeed? */
export type ResolveOutcomeStatus = "ok" | "failed";

/** Resolve outcome (vault ns "resolve", id `resolve:<decisionId>`, rev 2):
 *  appended by resolve.report@1. Same object lineage as the decision —
 *  audit log (rev 1: what was decided) and outcome (rev 2: what happened)
 *  stay two revs of one object, like every other spine discipline. */
export interface ResolveOutcome {
  decisionId: string;
  kind: ComputationKind;
  capability: string;
  status: ResolveOutcomeStatus;
  execMs: number;
  reportedAt: number;
}

/** One scorecard row: pure aggregation over (kind, capability). Scoreboards
 *  inform — they never decide (no thresholds, no auto-actions until a
 *  consumer with thresholds ships). */
export interface ScorecardRow {
  kind: ComputationKind;
  capability: string;
  n: number;
  okRate: number;
  p50ExecMs: number;
}

/** Canonical vault object id for a resolve decision/outcome pair (ns "resolve"). */
export function resolveDecisionId(decisionId: string): string {
  if (typeof decisionId !== "string" || decisionId.length === 0) {
    throw new Error("resolveDecisionId: decisionId must be a non-empty string");
  }
  if (/[\u0000|:]/.test(decisionId)) {
    throw new Error("resolveDecisionId: decisionId must not contain '|' or NUL or ':' (id grammar)");
  }
  return `resolve:${decisionId}`;
}
