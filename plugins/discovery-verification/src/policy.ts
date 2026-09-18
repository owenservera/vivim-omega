// discovery.verification — policy.ts (Ω8)
//
// THE PROMOTION POLICY IS DATA. The thresholds that turn probe evidence into a
// PROMOTED SurfaceContract live in this plugin's POLICY contribution
// (discovery.promotion-policy@1, see plugin.json), loaded here from the
// MANIFEST the host delivered — never from a code constant. Amendments ship as
// a new plugin version + Recipe re-compile (the composition pins the policy by
// content hash); the µhost never re-implements the gate.
//
// The policy doc is validated fail-closed: a malformed policy (threshold out
// of (0,1], non-integer probes, missing evidenceRequired) refuses the op —
// an unverifiable policy can never promote anything.

import type { PluginManifest } from "@vivim/omega-contracts";
import { asParserPin, parserContributionId, type ParserPin } from "@vivim/omega-contracts";

export interface PromotionPolicy {
  policyId: string;
  version: string;
  threshold: number;        // score ≥ threshold → promotable (0.95 shipped)
  requiredProbes: number;   // probeCount ≥ requiredProbes (3 shipped)
  evidenceRequired: boolean; // every probe must cite resolvable vault evidence (true shipped)
}

/** Where a loaded policy came from (recorded in every promotion event). */
export const POLICY_SOURCE = "manifest:discovery.promotion-policy@1";

const POLICY_CONTRIBUTION_ID = "discovery.promotion-policy";

/** Load + validate the promotion policy from a manifest's POLICY contribution. Throws on malformed/missing policy. */
export function loadPromotionPolicy(manifest: PluginManifest): PromotionPolicy {
  const list = manifest.contributions.policy ?? [];
  const hit = list.find((c) => c.id === POLICY_CONTRIBUTION_ID);
  if (!hit) {
    throw new Error(`discovery.verify@1: manifest carries no POLICY contribution ${POLICY_CONTRIBUTION_ID} — the promotion gate refuses to run without versioned policy data`);
  }
  const doc = (hit as { policy?: unknown }).policy;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`discovery.verify@1: policy contribution ${POLICY_CONTRIBUTION_ID}@${hit.version} carries no policy object`);
  }
  const p = doc as Record<string, unknown>;
  const threshold = p.threshold;
  const requiredProbes = p.requiredProbes;
  const evidenceRequired = p.evidenceRequired;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`discovery.verify@1: policy.threshold must be a number in (0,1] — got ${String(threshold)}`);
  }
  if (typeof requiredProbes !== "number" || !Number.isInteger(requiredProbes) || requiredProbes < 1) {
    throw new Error(`discovery.verify@1: policy.requiredProbes must be an integer ≥ 1 — got ${String(requiredProbes)}`);
  }
  if (typeof evidenceRequired !== "boolean") {
    throw new Error(`discovery.verify@1: policy.evidenceRequired must be a boolean — got ${String(evidenceRequired)}`);
  }
  return {
    policyId: typeof p.policyId === "string" && p.policyId.length > 0 ? p.policyId : `${POLICY_CONTRIBUTION_ID}`,
    version: typeof p.version === "string" && p.version.length > 0 ? p.version : hit.version,
    threshold,
    requiredProbes,
    evidenceRequired,
  };
}

// ---- the governed parser-pin registry (D-355 fail-closed genealogy, W1) ------

const REGISTRY_CONTRIBUTION_ID = "discovery.parser-registry";

/** Where the governed parser set came from (recorded in refusals, never invented). */
export const PARSER_REGISTRY_SOURCE = "manifest:discovery.parser-registry@1";

export interface GovernedParserRegistry {
  policyId: string;
  version: string;
  /** key = `parser:<archetype>:<provider>@<version>` → the governed pin. */
  pins: Map<string, ParserPin>;
}

/** Load + validate the governed parser-pin registry from the manifest's POLICY
 *  contribution. Throws on malformed/missing registry — a gate that cannot
 *  name the governed parsers refuses to verify parser genealogy at all
 *  (fail-closed: no registry, no pins, no promotions carrying pins). */
export function loadGovernedParserRegistry(manifest: PluginManifest): GovernedParserRegistry {
  const list = manifest.contributions.policy ?? [];
  const hit = list.find((c) => c.id === REGISTRY_CONTRIBUTION_ID);
  if (!hit) {
    throw new Error(`discovery.verify@1: manifest carries no POLICY contribution ${REGISTRY_CONTRIBUTION_ID} — the gate refuses parser-pinned verifications without the governed registry (${PARSER_REGISTRY_SOURCE})`);
  }
  const doc = (hit as { policy?: unknown }).policy;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`discovery.verify@1: policy contribution ${REGISTRY_CONTRIBUTION_ID}@${hit.version} carries no policy object`);
  }
  const p = doc as Record<string, unknown>;
  const raw = p.governedParserPins;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`discovery.verify@1: ${REGISTRY_CONTRIBUTION_ID}.governedParserPins must be a non-empty array of ParserPin`);
  }
  const pins = new Map<string, ParserPin>();
  for (const rawPin of raw) {
    const pin = asParserPin(rawPin); // total validation — throws with the reason
    const key = `${parserContributionId(pin.providerId, pin.archetypeSlug)}@${pin.version}`;
    if (pins.has(key)) {
      throw new Error(`discovery.verify@1: ${REGISTRY_CONTRIBUTION_ID} lists ${key} twice (a governed parser is declared once)`);
    }
    pins.set(key, pin);
  }
  return {
    policyId: typeof p.policyId === "string" && p.policyId.length > 0 ? p.policyId : `${REGISTRY_CONTRIBUTION_ID}`,
    version: typeof p.version === "string" && p.version.length > 0 ? p.version : hit.version,
    pins,
  };
}

/** Is this pin GOVERNED? Exact match on (providerId, archetypeSlug, version)
 *  against the manifest-declared registry — the pin a run carries must be a
 *  signed parser contribution, not a caller invention (D-355 §4: an
 *  unpinned/unknown parser identity REFUSES discovery-derived re-verification;
 *  the fence the W1 falsifier exercises). */
export function isGovernedParserPin(registry: GovernedParserRegistry, pin: ParserPin): boolean {
  const key = `${parserContributionId(pin.providerId, pin.archetypeSlug)}@${pin.version}`;
  return registry.pins.has(key);
}
