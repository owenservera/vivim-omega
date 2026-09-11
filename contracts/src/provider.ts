// @vivim/omega-contracts — provider.ts
// Gate G0 & Ω14.0: Provider realization vocabulary and class definitions.
// This module is the consolidation facade for the cross-track vocabulary
// contract: canonical definitions live where they were first pinned
// (ProviderClass in manifest.ts since Ω14.0-round-2; RealizationStatus,
// RiskClass and VaultProvenanceRef in vocabulary.ts since Gate G0-round-2)
// and are re-exported here so integrators (e.g. the DB-track control plane)
// have ONE import surface for the whole G0 vocabulary. Nothing is redefined
// here except EvidenceRef (below) — redefinition would clash via `export *`.
//
// Single-source-of-truth map:
//   ProviderClass      ← ./manifest.ts   (Ω14.0)
//   RealizationStatus  ← ./vocabulary.ts (Gate G0, with transition docs)
//   RiskClass          ← ./manifest.ts   (canonical; via vocabulary.ts)
//   VaultProvenanceRef ← ./vocabulary.ts (rich provenance shape)
//   PROMOTION_INVARIANT← ./vocabulary.ts (confidence-ranks / proof-promotes)
//   EvidenceRef        ← HERE            (minimal G0 provenance shape, see
//                        docs/VOCABULARY-CONTRACT-G0.md §4)

import type { ProviderClass } from "./manifest.ts";
import type { RealizationStatus } from "./vocabulary.ts";
import type { RiskClass } from "./manifest.ts";

export type { ProviderClass };
export type { RealizationStatus };
export type { RiskClass };

/**
 * ProviderClass defines how a realization's ops execute.
 * Structured to admit a future 4th member (e.g., "INTELLIGENCE_HARNESS" for DB-track
 * LLM-serving harnesses) without a breaking change.
 * (Canonical definition in ./manifest.ts — re-exported here for the G0 surface.)
 */

/**
 * RealizationStatus defines the lifecycle state of a provider realization.
 * This enum is the strict cross-track vocabulary contract (Gate G0).
 *
 * Legal Transitions:
 * - DRAFT -> TESTING (via discovery-compiler advancing to VERIFYING)
 * - TESTING -> PROMOTED (via discovery.verify@1 probe-based evaluation)
 * - TESTING -> REQUIRES_REDISCOVERY (via discovery.verify@1 probe failure)
 * - PROMOTED -> DEGRADED (via discovery.heal@1 drift detection exceeding threshold)
 * - DEGRADED -> TESTING (via healing probation)
 * - REQUIRES_REDISCOVERY -> DRAFT (via new discovery session)
 *
 * Component Ownership:
 * - `discovery-verification` writes PROMOTED / REQUIRES_REDISCOVERY.
 * - `discovery-healing` writes DEGRADED / TESTING (probation).
 * - `vivim.providers` aggregates and caches, but NEVER writes status directly.
 * (Canonical definition in ./vocabulary.ts — re-exported here for the G0 surface.)
 */

/**
 * RiskClass defines the mutation boundary for operations.
 *
 * - READ: No state change. Ungated by default.
 * - MUTATION: Internal state change (e.g., vault append). Allowed + journaled by default.
 * - EXTERNAL_MUTATION: Leaves the local vault world. Requires explicit consent (require-consent) by default.
 * (Canonical definition in ./manifest.ts — re-exported here for the G0 surface.)
 */

/**
 * The minimum shape any evidence reference must satisfy to be citable in the vault.
 * This is the vault provenance contract shape (VOCABULARY-CONTRACT-G0.md §4).
 * VaultProvenanceRef (./vocabulary.ts) is the rich extension: every
 * VaultProvenanceRef is structurally an EvidenceRef (extra fields optional).
 */
export interface EvidenceRef {
  ns: string;
  id: string;
  rev: number;
}
