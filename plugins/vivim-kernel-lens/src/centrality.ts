// vivim.kernel-lens — centrality.ts (D-340 §2.1)
//
// Computed load-bearing status (kernel requirement #7): fan-in / blast-radius,
// swept over a SNAPSHOT of the host graph. Pure function over plain data —
// same snapshot ⇒ same report, always falsifiable against the host's own
// graph. The lens never holds a live handle into host state; it queries,
// computes, reports. Nobody labels a node "core" — a shared algorithm becomes
// load-bearing purely because enough things now depend on it.
//
// fanIn(id)   = distinct principals joined to id by ANY edge (offers + holds):
//               offerors answer the op; holders consume it. The load-bearing
//               signal counts both — the Rust kernel's incoming-neighbor count,
//               split across Ω's two edge kinds without losing the sum.
// blastRadius = BFS over grant edges BOTH directions: every node reachable
//               from id through the capability graph — everything affected if
//               id's behavior changes.

export interface GraphNodeView { id: string; kind?: string; granularity?: string; extractionCandidate?: boolean }
export interface GraphEdgeView { to: string; capability: string; kind?: string }

export interface Centrality { fanIn: number; blastRadius: number }

/** Per-deployment tuning, carried as composition config (data, never authority). */
export interface LensConfig { fanInThreshold: number; blastRadiusThreshold: number }

/** Same conservative defaults as vivim_omega_core::centrality. */
export const DEFAULT_THRESHOLDS: LensConfig = { fanInThreshold: 5, blastRadiusThreshold: 20 };

export function isLoadBearing(c: Centrality, cfg: LensConfig): boolean {
  return c.fanIn >= cfg.fanInThreshold || c.blastRadius >= cfg.blastRadiusThreshold;
}

export interface SweepReport {
  loadBearing: Array<{ id: string; fanIn: number; blastRadius: number }>;
  thresholds: LensConfig;
  nodeCount: number;
  edgeCount: number;
}

/** The sweep: one pass over the snapshot edges, one BFS per node. Off the hot
 *  dispatch path by design — this is a per-request report, never a router hop. */
export function sweep(snapshot: { nodes: GraphNodeView[]; edges: GraphEdgeView[] }, cfg: LensConfig = DEFAULT_THRESHOLDS): SweepReport {
  const inAdj = new Map<string, Set<string>>();
  const outAdj = new Map<string, Set<string>>();
  for (const n of snapshot.nodes) {
    inAdj.set(n.id, new Set());
    outAdj.set(n.id, new Set());
  }
  for (const e of snapshot.edges) {
    outAdj.get(e.to)?.add(e.capability);
    inAdj.get(e.capability)?.add(e.to);
  }
  const blastRadius = (id: string): number => {
    const seen = new Set<string>([id]);
    const queue = [...(outAdj.get(id) ?? []), ...(inAdj.get(id) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(outAdj.get(next) ?? []), ...(inAdj.get(next) ?? []));
    }
    seen.delete(id);
    return seen.size;
  };
  const loadBearing: Array<{ id: string; fanIn: number; blastRadius: number }> = [];
  for (const n of snapshot.nodes) {
    const c: Centrality = { fanIn: inAdj.get(n.id)?.size ?? 0, blastRadius: blastRadius(n.id) };
    if (isLoadBearing(c, cfg)) loadBearing.push({ id: n.id, ...c });
  }
  return { loadBearing, thresholds: cfg, nodeCount: snapshot.nodes.length, edgeCount: snapshot.edges.length };
}
