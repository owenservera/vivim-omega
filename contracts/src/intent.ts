// @vivim/omega-contracts — intent.ts (PROPOSED D-389 Phase 1)
import type { ComputationKind, ResolveBranch } from "./computation.ts";
import type { OutcomeStatus } from "./outcome.ts";
import type { PortErrorCode, PrincipalKind, VaultProvenanceRef } from "./port.ts";
import type { JsonValue } from "./vocabulary.ts";

export type IntentState =
  | "submitted" | "resolving" | "planned" | "awaiting_approval"
  | "executing" | "succeeded" | "failed" | "rejected" | "cancelling" | "cancelled";

export interface IntentStep {
  stepId: string;
  capability: string;
  branch: ResolveBranch;
  kind: ComputationKind;
  dependsOn: string[];
  status: "pending" | "gated" | "executing" | "done" | "failed" | "skipped";
  resolveDecisionId?: string;
  consentId?: string;
  execution?: {
    attempt: number;
    leaseExpiresAt?: number;
    lastErrorCode?: PortErrorCode | OutcomeStatus;
  };
}

export interface Intent {
  id: string;
  type: string;
  sourcePrincipal: string;
  sourceKind: PrincipalKind;
  payload: JsonValue;
  payloadHash: string;
  constraints?: { deadlineMs?: number; idempotencyKey?: string };
  parentIntentId?: string;
  causationId: string;
  state: IntentState;
  steps: IntentStep[];
  planRef?: { planType: string; planVersion: string };
  outcome?: { status: OutcomeStatus; reason?: string };
  evidence: VaultProvenanceRef[];
  createdAt: number;
}

const INTENT_HEX_RE = /^[0-9a-f]{16,64}$/;

export function intentId(hex: string): string {
  if (typeof hex !== "string" || !INTENT_HEX_RE.test(hex)) {
    throw new Error("intentId: hex must be 16-64 lowercase hex characters");
  }
  return `intent:${hex}`;
}

export function isStepDone(step: IntentStep): boolean {
  return step.status === "done" || step.status === "skipped" || step.status === "failed";
}
