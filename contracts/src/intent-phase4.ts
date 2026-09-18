// @vivim/omega-contracts — intent-phase4.ts (D-389 Phase 4)
// Compensation/saga ledger + IntentContext (locale/power/network/battery).

/** Context threaded with an intent call (§4, deferred until Phase 4). */
export interface IntentContext {
  locale?: string;         // e.g. "en-US"
  power?: { source?: string; level?: number }; // approximate device power context
  network?: { type?: string; latencyMs?: number };
  battery?: { percent?: number; charging?: boolean };
  environment?: Record<string, unknown>;
}

/** A compensation request (saga step) — separate, law-gated intent that reverses
 * effects of a completed step (§3.9, §4). Requires its own consent gate. */
export interface CompensationIntent {
  parentIntentId: string;
  parentStepId: string;
  reason: string;
  compensationSteps: Array<{
    stepId: string;
    capability: string;     // the compensating op (e.g., rollback/reverse operation)
    dependsOn: string[];    // compensation steps must execute in dependency order
    consentId?: string;
  }>;
  requiredConsent?: boolean; // compensation actions are themselves risky (§4)
}

/** A saga/compensation evidence reference for audit (§3.2 evidence model). */
export interface SagaEvidenceRef {
  ns: string;
  id: string;
  rev: number;
  kind: "compensation-request" | "compensation-executed" | "intent-cancelled";
  meta?: { parentStepId: string; parentIntentId: string };
}
