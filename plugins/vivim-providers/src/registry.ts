// plugins/vivim-providers/src/registry.ts
// Pure derivation core for the provider registry: vault realization records +
// liveness signals → ProviderRegistryEntry rows. Same inputs => same output.
// No clock, no IO.
//
// Realization-driven (not manifest-driven): an entry exists iff a realization
// record exists in ns "providers". Manifests are optional enrichment for
// op-level activity when plugin-liveness is unavailable. Unwritten archetypes
// have no row at all (absence reads as DRAFT downstream — same default the
// scaffold used, without fabricating rev-0 refs).
import type {
  PluginManifest, ProviderClass, ProviderRealization, RealizationStatus, VaultProvenanceRef,
} from "@vivim/omega-contracts";

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

export interface RegistryInput {
  realizations: Array<ProviderRealization & { rev: number }>; // rev = vault record rev (fills realizationRef)
  activePluginIds?: Set<string>;  // live compartment ids (law.registry states) — primary activity signal
  manifests?: PluginManifest[];   // optional enrichment for op-level activity fallback
  activeOps?: Set<string>;        // routable ops currently served (used only with manifests)
}

const STATUSES: readonly string[] = ["DRAFT", "TESTING", "PROMOTED", "DEGRADED", "REQUIRES_REDISCOVERY"];

/** Structural validation for realization rows read back from the vault.
 *  Takes the stored data + its vault rev separately; returns the record with
 *  rev attached (fills realizationRef downstream), or null when malformed. */
export function asRealization(data: unknown, rev: unknown): (ProviderRealization & { rev: number }) | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.archetypeSlug !== "string" || r.archetypeSlug.length === 0) return null;
  if (typeof r.providerId !== "string" || r.providerId.length === 0) return null;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  const status = STATUSES.includes(r.status as string) ? (r.status as RealizationStatus) : null;
  if (status === null) return null;
  const providerClass = (["SIMULATOR", "API_NATIVE", "BROWSER_MEDIATED"] as readonly string[]).includes(r.providerClass as string)
    ? (r.providerClass as ProviderClass)
    : "SIMULATOR";
  return { ...(r as unknown as ProviderRealization), providerClass, status, rev };
}

function opsActiveFor(
  providerId: string, manifests: PluginManifest[] | undefined, activeOps: Set<string> | undefined,
): boolean {
  if (!manifests || !activeOps) return false;
  const m = manifests.find((x) => x.id === providerId);
  if (!m) return false;
  const ops = new Set<string>();
  for (const c of m.contributions?.contract ?? []) ops.add(`${c.id}@${c.version}`);
  for (const c of m.contributions?.provider ?? []) ops.add(`${c.id}@${c.version}`);
  for (const op of ops) if (activeOps.has(op)) return true;
  return false;
}

export function deriveRegistry(inputs: RegistryInput): ProviderRegistryEntry[] {
  const { realizations, activePluginIds, manifests, activeOps } = inputs;
  const entries: ProviderRegistryEntry[] = realizations.map(({ rev, ...r }) => {
    const active = activePluginIds !== undefined
      ? activePluginIds.has(r.providerId)
      : opsActiveFor(r.providerId, manifests, activeOps);
    return {
      archetypeSlug: r.archetypeSlug,
      providerId: r.providerId,
      providerClass: r.providerClass,
      status: r.status,
      // Placeholders with documented owners: aggregateScore ← discovery.verify@1
      // scores when probes start reporting them; timestamps ← verify/heal writes.
      aggregateScore: 0,
      activeInComposition: active,
      realizationRef: { ns: "providers", id: `realization:${r.archetypeSlug}:${r.providerId}`, rev },
      lastVerifiedAt: null,
      lastDriftCheckAt: null,
    };
  });
  entries.sort((a, b) =>
    a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : a.archetypeSlug < b.archetypeSlug ? -1 : 1,
  );
  return entries;
}

