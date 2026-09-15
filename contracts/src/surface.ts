// @vivim/omega-contracts — surface.ts
// D-359: THE SHARED SURFACE DERIVATION (360 addendum A2).
//
// docs/SURFACES.md §"The MCP surface" states the tool-generation rule:
// tools are generated FROM THE BOOTED COMPOSITION'S ROUTED OPS — nothing
// else. That rule is one derivation source consumed by several surfaces:
// the MCP tools/list, the CLI's routed-op sugar, and (as of D-359) chat
// resolution's capability-name set. This module is the derivation of
// record — one definition, imported by every consumer, so the consumer set
// can extend WITHOUT a third, separately-maintained binding appearing.
import type { PluginManifest } from "./manifest.ts";
import { riskyOps, routableOps } from "./manifest.ts";

/** Per-routed-op surface metadata: owning plugin + the manifest's declared
 *  risk (READ is the ungated default — riskyOps() filters non-READ only). */
export interface SurfaceOpMeta {
  pluginId: string;
  risk: string;
}

/** op → {owner plugin, declared risk} from the composition's verified
 *  manifests. The exact derivation the MCP surface has run since Ω6
 *  (previously private in surfaces/mcp — moved here, unchanged, when chat
 *  resolution became the third consumer). */
export function surfaceOpMeta(manifests: Map<string, PluginManifest>): Map<string, SurfaceOpMeta> {
  const map = new Map<string, SurfaceOpMeta>();
  for (const [pluginId, m] of manifests) {
    const risky = riskyOps(m);
    for (const op of routableOps(m)) {
      const risk = risky.get(op);
      map.set(op, { pluginId, risk: risk ?? "READ" });
    }
  }
  return map;
}

/** The canonical capability-name set for a booted composition: derived from
 *  its routed ops, nothing else — sorted, deduped, grammar-preserved. Callers
 *  pass `router.status().routedOps` verbatim (boot reality, not a manifest
 *  reconstruction). */
export function capabilityNamesFromRouted(routedOps: readonly string[]): string[] {
  return [...new Set(routedOps)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
