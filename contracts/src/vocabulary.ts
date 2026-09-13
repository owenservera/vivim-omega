// @vivim/omega-contracts — vocabulary.ts
// Gate G0 — Cross-Track Vocabulary Contract
// Published as a standalone, versioned artifact to align Omega and the DB track.

import type { RiskClass } from "./manifest.ts";

/**
 * Realization Status Enum.
 * Defines the legal states of a provider realization and the components authorized
 * to perform transitions.
 */
export type RealizationStatus =
  | "DRAFT"          // Initial inference/mapping, unverified.
  | "TESTING"        // Undergoing probe-based verification (discovery.verify@1).
  | "PROMOTED"       // Proof-based promotion complete. Active candidate for routing.
  | "DEGRADED"       // Live drift detected, healing loop initiated.
  | "REQUIRES_REDISCOVERY"; // Healing failed, full re-discovery session required.

/**
 * Re-export RiskClass for cross-track completeness.
 * Originally defined in manifest.ts.
 * - EXTERNAL_MUTATION: Leaves the local vault world (requires consent).
 * - MUTATION: Internal vault/world state change (allow + journal).
 * - READ: No state change (ungated).
 */
export type { RiskClass };

/**
 * Vault Provenance Contract Shape.
 * The minimum shape any evidence reference must satisfy to be citable in the vault.
 */
export interface VaultProvenanceRef {
  ns: string;
  id: string;
  rev: number;
  cid?: string;
  meta?: unknown;
  refs?: VaultProvenanceRef[];
  /** HOW well the cited evidence is known (D-324) — orthogonal to Freshness
   *  (timing), which is untouched. Optional: old records validate untouched.
   *  VERIFIED is reserved for probe-backed writes (first adopter:
   *  discovery.verify stamps evidence from passing probes); CONTRADICTED is
   *  deferred until a producer exists — never emit it yet. */
  epistemicStatus?: EpistemicStatus;
}

/**
 * Epistemic status (D-324): the knower's relationship to the cited evidence.
 * Three values ship; VERIFIED is reserved for probe-backed writes;
 * CONTRADICTED waits for a producer (emitting it now is vocabulary without a
 * writer — the plan's top risk).
 */
export type EpistemicStatus =
  | "OBSERVED"   // directly read from a source (a vault row, a probe output)
  | "INFERRED"   // derived by a deterministic rule from observed inputs
  | "ASSUMED"    // taken as given without direct evidence (escalate, don't trust)
  | "VERIFIED";  // backed by passing postcondition probes (reserved writers only)

/**
 * CONFIDENCE VS PROOF (The Promotion Invariant).
 *
 * 1. Confidence (Lexical/Structural/Contextual fusion):
 *    - Used ONLY for candidate ranking and ordering.
 *    - Determines which candidates discovery.verify@1 spends probes on first.
 *    - Never gates promotion on its own.
 *
 * 2. Proof (Probe-based evaluation):
 *    - The ONLY mechanism that promotes a candidate from DRAFT/TESTING to PROMOTED.
 *    - Requires passing postcondition probes against the policy threshold.
 *    - "Promotion is proof, not confidence."
 */
export const PROMOTION_INVARIANT = {
  confidenceRole: "candidate-ranking",
  proofRole: "promotion-gate",
  rule: "A candidate promotes ONLY when discovery.verify@1's probe-based evaluation passes the policy threshold. Confidence scores are recorded but never act as the sole promoter.",
} as const;
