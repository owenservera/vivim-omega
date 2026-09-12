// @vivim/omega-contracts — outcome.ts
// Outcome<T>: the plugin-level result vocabulary for expected-but-negative
// results. Thrown exceptions are reserved for genuinely unexpected failures
// (malformed manifest, vault I/O error); anything a caller can reasonably
// anticipate (unknown contract, unsupported channel, ambiguous variation,
// refused gate, failed probe) returns an Outcome. This extends the µhost's
// REFUSED/BUDGET refusal-register pattern into plugin ops consistently.
export type OutcomeStatus =
  | "OK"                   // produced a value
  | "UNKNOWN"              // concept/capability/entity not found — NOT the same as REFUSED
  | "UNSUPPORTED"          // recognized but not implemented/available in this composition
  | "AMBIGUOUS"            // multiple candidates, no tiebreak evidence
  | "CONTRADICTORY"        // evidence conflicts
  | "REFUSED"              // law.check denied (or would deny)
  | "VERIFICATION_FAILED"  // probe ran, failed
  | "EVALUATION_FAILED";   // behavior/agent evaluation ran, failed

export interface Outcome<T = unknown> {
  status: OutcomeStatus;
  value?: T;
  reason?: string;
  evidence?: unknown[]; // VaultProvenanceRef[] where applicable
}

/** Convenience constructor for the success case. */
export function ok<T>(value: T): Outcome<T> {
  return { status: "OK", value };
}

/** Convenience constructor for expected-but-negative cases. */
export function fail(
  status: Exclude<OutcomeStatus, "OK">,
  reason: string,
  evidence?: unknown[],
): Outcome<never> {
  return { status, reason, ...(evidence !== undefined ? { evidence } : {}) };
}
