// µhost — graph.ts: the single capability graph (kernel requirements #1 and #6).
// Every principal (compartment, kernel identity) and every capability (routable op,
// granted authority) is a node in ONE graph; a grant is a signed edge holder→capability.
// "Global" is not a parallel mechanism — it is an edge to genesis:everyone, an ordinary
// signed grant like any scoped one.
//
// Two adjacency kinds, deliberately distinct (D-340 impl note a — the doc sketch's
// single map would misroute dispatch once capability-request edges land in it):
//   offer: the entry is the ROUTED IMPLEMENTATION of the op (recipe grant.contracts)
//   hold:  the entry was GRANTED the capability (recipe grant.capabilities, port:* etc)
// whoOffers() is the hot dispatch path (ports.ts calls it on every routed op) and must
// stay O(1)-ish: a Set lookup, never a traversal. fanIn()/blastRadius() are off-path.
import type { SignedGrant } from "./audit.ts";
import type { Granularity } from "@vivim/omega-contracts";

export type NodeId = string;
export type NodeKind = "principal" | "capability";
export type EdgeKind = "offer" | "hold";

export interface GraphNode { id: NodeId; kind: NodeKind; granularity?: Granularity; extractionCandidate?: boolean }

interface Edge { to: NodeId; capability: NodeId; kind: EdgeKind; grant: SignedGrant }

/** Copy-out snapshot for READ-side consumers (kernel-lens): plain data only. */
export interface GraphSnapshot { nodes: GraphNode[]; edges: Array<{ to: NodeId; capability: NodeId; kind: EdgeKind }> }

export class CapabilityGraph {
  private nodes = new Map<NodeId, GraphNode>();
  private offerors = new Map<NodeId, Set<NodeId>>();
  private holders = new Map<NodeId, Set<NodeId>>();
  private outgoing = new Map<NodeId, Set<NodeId>>();
  private edges: Edge[] = [];

  upsertNode(n: GraphNode): void {
    this.nodes.set(n.id, n);
    if (!this.offerors.has(n.id)) this.offerors.set(n.id, new Set());
    if (!this.holders.has(n.id)) this.holders.set(n.id, new Set());
    if (!this.outgoing.has(n.id)) this.outgoing.set(n.id, new Set());
  }

  node(id: NodeId): GraphNode | undefined { return this.nodes.get(id); }

  /** Refuses an edge whose grant does not verify — no capability without provenance.
   *  Mirrors graph.rs: existence checks only; kind filtering happens at query time.
   *  `to` may be any node kind — genesis:kernel grants genesis:schema (a capability)
   *  the self-describe capability, which IS the schema-of-schema closing loop. */
  grant(from: NodeId, to: NodeId, capability: NodeId, g: SignedGrant, kind: EdgeKind = "offer"): void {
    if (!this.nodes.has(from)) throw new Error(`graph: unknown principal ${from}`);
    if (!this.nodes.has(to)) throw new Error(`graph: unknown principal ${to}`);
    if (!this.nodes.has(capability)) throw new Error(`graph: unknown capability ${capability}`);
    if (!g.verify()) throw new Error(`graph: grant signature does not verify — refusing edge ${from}→${to}:${capability}`);
    this.edges.push({ to, capability, kind, grant: g });
    (kind === "offer" ? this.offerors : this.holders).get(capability)!.add(to);
    this.outgoing.get(to)!.add(capability);
  }

  /** HOT PATH (dispatch): the routed implementations of a capability. O(1) lookup. */
  whoOffers(capability: NodeId): NodeId[] { return [...(this.offerors.get(capability) ?? [])]; }

  /** Who was granted the capability (consumers + genesis principals like everyone). */
  whoHolds(capability: NodeId): NodeId[] { return [...(this.holders.get(capability) ?? [])]; }

  /** Load-bearing signal (kernel requirement #7 input): offers + holds both count —
   *  a shared algorithm becomes load-bearing because consumers HOLD it, not because
   *  anyone labeled it a tool. */
  fanIn(id: NodeId): number { return (this.offerors.get(id)?.size ?? 0) + (this.holders.get(id)?.size ?? 0); }

  /** BFS reachability over grant edges (both directions) — off the hot path. */
  blastRadius(id: NodeId): number {
    if (!this.nodes.has(id)) return 0;
    const seen = new Set<NodeId>([id]);
    const queue = [...(this.outgoing.get(id) ?? []), ...(this.offerors.get(id) ?? []), ...(this.holders.get(id) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(this.outgoing.get(next) ?? []), ...(this.offerors.get(next) ?? []), ...(this.holders.get(next) ?? []));
    }
    seen.delete(id);
    return seen.size;
  }

  snapshot(): GraphSnapshot {
    return {
      nodes: [...this.nodes.values()].map((n) => ({ ...n })),
      edges: this.edges.map((e) => ({ to: e.to, capability: e.capability, kind: e.kind })),
    };
  }
}
