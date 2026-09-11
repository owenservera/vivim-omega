// plugins/vivim-providers/src/registry.ts
// Pure derivation core for the provider registry.
import type { PluginManifest, ProviderClass, RealizationStatus, VaultProvenanceRef } from "@vivim/omega-contracts";

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
}

export interface ProviderRegistryEntry {
  archetypeSlug: string;
  providerId: string;
  providerClass: ProviderClass;
  status: RealizationStatus;
  aggregateScore: number;
  activeInComposition: boolean;
  realizationRef: VaultProvenanceRef;
  lastVerifiedAt: number | null;
  lastDriftCheckAt: number | null;
}

/**
 * Pure derivation: given installed manifests and vault realizations, derive the registry.
 * Same inputs => same output. No clock, no IO.
 */
export function deriveRegistry(
  manifests: PluginManifest[],
  realizations: ProviderRealization[],
  activeOps: Set<string>
): ProviderRegistryEntry[] {
  const entries: ProviderRegistryEntry[] = [];

  // Group realizations by archetype
  const byArchetype = new Map<string, ProviderRealization[]>();
  for (const r of realizations) {
    const list = byArchetype.get(r.archetypeSlug) ?? [];
    list.push(r);
    byArchetype.set(r.archetypeSlug, list);
  }

  for (const m of manifests) {
    // Look for provider contributions
    const providers = m.contributions?.provider ?? [];
    for (const p of providers) {
      const archetypeSlug = (p as any).archetypeSlug ?? p.id.split(".")[1]; // Fallback derivation
      const providerClass = (p as any).providerClass ?? "SIMULATOR";

      // Find the latest realization for this provider
      const archRealizations = byArchetype.get(archetypeSlug) ?? [];
      const realization = archRealizations.find(r => r.providerId === m.id);

      const status = realization?.status ?? "DRAFT";
      const aggregateScore = 0; // Placeholder until discovery.verify@1 scores are integrated

      // Check if any of this provider's ops are currently active in the composition
      const providerOps = new Set<string>();
      for (const c of m.contributions?.contract ?? []) providerOps.add(`${c.id}@${c.version}`);
      for (const c of m.contributions?.provider ?? []) providerOps.add(`${c.id}@${c.version}`);

      let activeInComposition = false;
      for (const op of providerOps) {
        if (activeOps.has(op)) {
          activeInComposition = true;
          break;
        }
      }

      entries.push({
        archetypeSlug,
        providerId: m.id,
        providerClass: providerClass as ProviderClass,
        status,
        aggregateScore,
        activeInComposition,
        realizationRef: realization ? { ns: "providers", id: `realization:${archetypeSlug}:${m.id}`, rev: 1 } : { ns: "providers", id: `realization:${archetypeSlug}:${m.id}`, rev: 0 },
        lastVerifiedAt: null,
        lastDriftCheckAt: null,
      });
    }
  }

  return entries;
}
