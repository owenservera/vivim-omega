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
