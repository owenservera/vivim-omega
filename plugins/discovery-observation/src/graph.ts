// discovery.observation — graph.ts (Ω7)
// LOCAL MIRROR of the discovery.* SCHEMA contributions declared by
// plugins/discovery-perception (the contract of record). Duplicated per the B2
// import law — compartments never import each other's code. Keep this in sync
// with discovery-perception/src/model.ts; the manifest field lists are the law.
import type { CausalEdge } from "./trace.ts";

export const NODE_KINDS = ["control", "field", "button", "list", "container"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export interface EvidenceRef {
  /** G0 minimum (D-357 falsifier fix): the vault object coordinates — the
   *  triple inference's normalizeEvidence requires; casRef-only refs were
   *  silently dropped downstream (the perceive→infer seam zeroed). */
  ns: string;
  id: string;
  rev: number;
  /** '<ns>/<id>@<rev>' — DERIVED from the triple (kept for byte-span citation readers). */
  casRef: string;
  /** UTF-8 byte offsets [start, end) into the referenced capture bytes. */
  span?: { start: number; end: number };
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  selectorHint: string;
  evidence: EvidenceRef[];
}

export interface ApplicationGraph {
  id: string;
  capturedAt: number;
  source: { fixtureName: string };
  nodes: GraphNode[];
  edges: CausalEdge[];
}

/** Validate + narrow an unknown vault payload into an ApplicationGraph (fail-closed). */
export function asApplicationGraph(op: string, value: unknown): ApplicationGraph {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${op}: graph payload must be an object`);
  }
  const g = value as Record<string, unknown>;
  if (typeof g.id !== "string" || g.id.length === 0) throw new Error(`${op}: graph.id must be a non-empty string`);
  if (typeof g.capturedAt !== "number" || !Number.isInteger(g.capturedAt)) throw new Error(`${op}: graph.capturedAt must be an integer`);
  if (!Array.isArray(g.nodes)) throw new Error(`${op}: graph.nodes must be an array`);
  const nodes: GraphNode[] = g.nodes.map((n, i) => {
    if (n === null || typeof n !== "object" || Array.isArray(n)) throw new Error(`${op}: graph.nodes[${i}] must be an object`);
    const node = n as Record<string, unknown>;
    if (typeof node.id !== "string" || node.id.length === 0) throw new Error(`${op}: graph.nodes[${i}].id must be a non-empty string`);
    if (typeof node.selectorHint !== "string" || node.selectorHint.length === 0) {
      throw new Error(`${op}: graph.nodes[${i}].selectorHint must be a non-empty string`);
    }
    return { id: node.id, kind: (node.kind ?? "container") as NodeKind, label: String(node.label ?? ""), selectorHint: node.selectorHint, evidence: [] };
  });
  return {
    id: g.id,
    capturedAt: g.capturedAt,
    source: (g.source ?? {}) as { fixtureName?: string },
    nodes,
    edges: Array.isArray(g.edges) ? (g.edges as CausalEdge[]) : [],
  };
}
