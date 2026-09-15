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
//   Variation(All)     ← ./variation.ts  (D-308 — re-exported for the one surface)
//   Agent(All)         ← ./agent.ts      (D-309)
//   Outcome(All)       ← ./outcome.ts    (D-312)
//   ProviderRealization← HERE            (canonical ns "providers" record shape)

import type { ProviderClass } from "./manifest.ts";
import type { EpistemicStatus, RealizationStatus, VaultProvenanceRef } from "./vocabulary.ts";
import { PROMOTION_INVARIANT } from "./vocabulary.ts";
import type { RiskClass } from "./manifest.ts";
import type { Variation, VariationChannel } from "./variation.ts";
import type { AgentIdentity, BehaviorContract, DecisionRecord } from "./agent.ts";
import type { Outcome, OutcomeStatus } from "./outcome.ts";
import type {
  ComputationKind, ResolveBranch, ResolveDecision, ResolveOutcome,
  ResolveOutcomeStatus, ScorecardRow,
} from "./computation.ts";
import { resolveDecisionId } from "./computation.ts";
import type {
  AgentSnapshot, Bootstrap, ControlModel, DelegationRecord, DelegateEnvelope,
  DescribeFocus, EvolutionEvaluation, EvolutionProposal, EvolutionTransition,
} from "./control.ts";
import {
  BOOTSTRAP_VERSION, CONTROL_ENTRYPOINTS, CONTROL_MODEL_VERSION,
  CONTROL_NAMESPACES, delegationId, evolutionId,
} from "./control.ts";

export type { ProviderClass };
export type { EpistemicStatus, RealizationStatus, VaultProvenanceRef };
export { PROMOTION_INVARIANT };
export type { RiskClass };
export type { Variation, VariationChannel };
export type { AgentIdentity, BehaviorContract, DecisionRecord };
export type { Outcome, OutcomeStatus };
export type {
  ComputationKind, ResolveBranch, ResolveDecision, ResolveOutcome,
  ResolveOutcomeStatus, ScorecardRow,
};
export { resolveDecisionId };
export type {
  AgentSnapshot, Bootstrap, ControlModel, DelegationRecord, DelegateEnvelope,
  DescribeFocus, EvolutionEvaluation, EvolutionProposal, EvolutionTransition,
};
export {
  BOOTSTRAP_VERSION, CONTROL_ENTRYPOINTS, CONTROL_MODEL_VERSION,
  CONTROL_NAMESPACES, delegationId, evolutionId,
};

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

/** Canonical vault object id for a provider realization record (ns "providers").
 *  Shared by writers (discovery.verify appends) and readers (providers registry
 *  queries) so the convention lives in exactly one place. */
export function providerRealizationId(archetypeSlug: string, providerId: string): string {
  if (typeof archetypeSlug !== "string" || archetypeSlug.length === 0) {
    throw new Error("providerRealizationId: archetypeSlug must be a non-empty string");
  }
  if (typeof providerId !== "string" || providerId.length === 0) {
    throw new Error("providerRealizationId: providerId must be a non-empty string");
  }
  if (archetypeSlug.includes(":") || providerId.includes(":")) {
    throw new Error("providerRealizationId: neither part may contain ':' (id grammar)");
  }
  return `realization:${archetypeSlug}:${providerId}`;
}

/** Canonical archetype slug for a routable op: the bare op name ("message.send@1" → "message.send").
 *  Identical semantics to mapping's local baseOp (last "@" wins); centralized here so
 *  writers (verification) and readers (providers registry) derive the same slug. */
export function archetypeSlugForOp(op: string): string {
  if (typeof op !== "string" || op.length === 0) throw new Error("archetypeSlugForOp: op must be a non-empty string");
  const at = op.lastIndexOf("@");
  return at > 0 ? op.slice(0, at) : op;
}

/**
 * ProviderRealization: the current-state record for one provider's realization of one
 * archetype (vault ns "providers", id `realization:<archetypeSlug>:<providerId>`).
 * Written by discovery.verify@1 (PROMOTED / REQUIRES_REDISCOVERY) and discovery.healing
 * (DEGRADED / TESTING); read by vivim.providers. This is the CURRENT state — the
 * ns "discovery" promotion events are the audit log (append-only forever); realization
 * records are latest-wins. The two must never be collapsed into one write.
 */
export interface ProviderRealization {
  archetypeSlug: string;
  providerId: string;
  providerClass: ProviderClass;
  status: RealizationStatus;
  discoverySessionRef: VaultProvenanceRef | null;
  opMapRef: VaultProvenanceRef | null;
  entityMapRef: VaultProvenanceRef | null;
  streamRefs: Array<{ capabilitySlug: string; ref: VaultProvenanceRef }>;
  evidenceRefs: VaultProvenanceRef[];
  supersedes: VaultProvenanceRef | null;
  createdAt: number;
  /** D-355 (M7): the parser pins the run was verified against — WHICH parser
   *  contribution version realizes this archetype for this provider (P-D3
   *  genealogy). Optional: pre-D-355 records (upstream rows, re-landed trees)
   *  carry no pins; consumers treat absence as "unpinned" and the D-357
   *  realization bar refuses sends that need a pin the record lacks. */
  parserPins?: import("./parser.ts").ParserPin[];
  /** Vault record revision — absent on writes, filled by readers (vault.get rev). Not stored. */
  rev?: number;
}
