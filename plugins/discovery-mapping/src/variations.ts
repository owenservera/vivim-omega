// discovery.mapping — variations.ts (D-308)
// Variation derivation: group inferred candidates by canonical contract id,
// promoting solveMapping's recorded alternatives to first-class entities with
// their own status lifecycle, channel, and evidence. Pure: same candidates in,
// same variations out. Additive — discovery.map@1 output is untouched.
import type {
  RealizationStatus, VaultProvenanceRef, Variation, VariationChannel,
} from "@vivim/omega-contracts";
import type { CandidateLike } from "./solve.ts";

export const VARIATION_CHANNELS = ["UI_ELEMENT", "KEYBOARD", "MENU_PATH", "NETWORK_DIRECT"] as const;
export const VARIATION_STATUSES = ["DRAFT", "TESTING", "PROMOTED", "DEGRADED", "REQUIRES_REDISCOVERY"] as const;

function asChannel(v: unknown): VariationChannel {
  // Explicit channel only: the current inference emits no channel evidence, so
  // anything unclaimed defaults to UI_ELEMENT (documented) rather than being
  // inferred. KEYBOARD/MENU_PATH/NETWORK_DIRECT arrive with Upgrade-3 evidence.
  return (VARIATION_CHANNELS as readonly string[]).includes(v as string)
    ? (v as VariationChannel)
    : "UI_ELEMENT";
}

function asStatus(v: unknown): RealizationStatus {
  return (VARIATION_STATUSES as readonly string[]).includes(v as string)
    ? (v as RealizationStatus)
    : "DRAFT";
}

/** Group candidates into Variations keyed by canonical contract id.
 *  contractId is `${op}@1` (bare-major routable form — candidates carry base op names).
 *  Multiple Variations per contractId coexist: promotion is per-Variation. */
export function deriveVariations(
  candidates: CandidateLike[],
  opts: { providerId: string; discoveredAt: string },
): Variation[] {
  if (typeof opts.providerId !== "string" || opts.providerId.length === 0) {
    throw new Error("deriveVariations: providerId must be a non-empty string");
  }
  if (typeof opts.discoveredAt !== "string" || opts.discoveredAt.length === 0) {
    throw new Error("deriveVariations: discoveredAt must be a non-empty ISO timestamp string");
  }
  return candidates.map((c) => ({
    contractId: `${c.op}@1`,
    providerId: opts.providerId,
    channel: asChannel((c as { channel?: unknown }).channel),
    status: asStatus(c.status),
    selectorOrPath: c.selector,
    evidence: (c.evidence ?? []).map((e) => ({ ns: e.ns, id: e.id, rev: e.rev }) as VaultProvenanceRef),
    discoveredAt: opts.discoveredAt,
  }));
}

/** Index Variations by contractId (many live realizations per canonical op). */
export function groupVariations(variations: Variation[]): Record<string, Variation[]> {
  const out: Record<string, Variation[]> = {};
  for (const v of variations) {
    (out[v.contractId] ??= []).push(v);
  }
  return out;
}
