// discovery.inference — model.ts (Ω8)
//
// The evidence + graph model this engine consumes. DUPLICATED per the B2 import
// law (plugins never import each other): the ApplicationGraph shape is the Ω7
// perception/observation engines' documented output —
//   ApplicationGraph { nodes: GraphNode[], edges: CausalEdge[] }
//   GraphNode { id, kind, label, selectorHint, evidence }
//   CausalEdge { from, to, trigger, latencyMs, evidence }
// where evidence refs point at vault objects (ns "discovery"). This module
// tolerates their output: missing edges, absent selectorHint, unknown kinds,
// malformed nodes (skipped, counted), and graphs passed as vault refs
// (resolved by the handler through the port, never by importing their code).
//
// The SurfaceContract candidate shape is declared as the manifest's SCHEMA
// contribution discovery.surfacecontract@1 — this module is its typed mirror.

export type ActionType = "click" | "type" | "read";
export type RiskHint = "EXTERNAL_MUTATION" | "MUTATION" | "READ";
export type CandidateStatus = "DRAFT" | "PROMOTED" | "REJECTED";

/** A vault object reference — the only evidence currency in the discovery mind. */
export interface EvidenceRef { ns: string; id: string; rev: number }

export interface GraphNode {
  id: string;
  kind: string;          // "button" | "field" | "list" | ... (compared case-insensitively)
  label: string;
  selectorHint: string;  // may be "" — mapping's non-empty-selector constraint will flag it
  evidence: EvidenceRef[];
}

export interface CausalEdge {
  from: string;
  to: string;
  trigger: string;
  latencyMs: number;
  evidence: EvidenceRef[];
}

export interface ApplicationGraph {
  nodes: GraphNode[];
  edges: CausalEdge[];
  source?: string;       // provenance label (fixture path, vault ref, …)
}

/** The candidate contract — born DRAFT, promoted only by discovery.verify@1. */
export interface SurfaceContract {
  id: string;            // "sc-<n>", unique within a run
  nodeId: string;        // the graph node the candidate was inferred from
  op: string;            // "message.send" — binds against blueprint ops by name
  selector: string;
  actionType: ActionType;
  riskHint: RiskHint;
  evidence: EvidenceRef[];
  status: CandidateStatus;
  confidence: number;    // recorded heuristic; NEVER a promotion input
}

// ---- tolerant normalization (their data shapes, defensively parsed) ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A structurally valid evidence ref: non-empty ns + id, integer rev ≥ 1. */
export function isEvidenceRef(v: unknown): v is EvidenceRef {
  if (!isPlainObject(v)) return false;
  return typeof v.ns === "string" && v.ns.length > 0
    && typeof v.id === "string" && v.id.length > 0
    && typeof v.rev === "number" && Number.isInteger(v.rev) && v.rev >= 1;
}

/** Vault-ref shape: {ns, id, rev} without any graph payload — how a graph may be passed. */
export function isVaultRef(v: unknown): v is EvidenceRef {
  return isEvidenceRef(v) && !("nodes" in v) && !("edges" in v);
}

function normalizeEvidence(v: unknown): EvidenceRef[] {
  if (!Array.isArray(v)) return [];
  const out: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const e of v) {
    if (!isEvidenceRef(e)) continue; // malformed refs are dropped, not fatal
    const key = `${e.ns}|${e.id}|${e.rev}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ns: e.ns, id: e.id, rev: e.rev });
  }
  return out;
}

function normalizeNode(v: unknown): GraphNode | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0) return null;
  if (typeof v.label !== "string") return null; // a labelless node carries no inference signal
  return {
    id: v.id,
    kind: typeof v.kind === "string" ? v.kind.toLowerCase() : "",
    label: v.label,
    selectorHint: typeof v.selectorHint === "string" ? v.selectorHint : "",
    evidence: normalizeEvidence(v.evidence),
  };
}

function normalizeEdge(v: unknown): CausalEdge | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.from !== "string" || typeof v.to !== "string") return null;
  return {
    from: v.from,
    to: v.to,
    trigger: typeof v.trigger === "string" ? v.trigger : "",
    latencyMs: typeof v.latencyMs === "number" && Number.isFinite(v.latencyMs) ? v.latencyMs : 0,
    evidence: normalizeEvidence(v.evidence),
  };
}

export interface GraphSummary { nodes: number; edges: number; skippedNodes: number; skippedEdges: number; source?: string }

/**
 * Tolerant graph normalization: missing edges → [], malformed nodes/edges are
 * skipped (counted in the summary — the gap is DATA, not a crash), labelless
 * nodes are dropped. Throws only on a non-object input (fail-closed DEGRADED).
 */
export function normalizeGraph(input: unknown, source?: string): { graph: ApplicationGraph; summary: GraphSummary } {
  if (!isPlainObject(input)) throw new Error("discovery.infer@1: graph must be an object (ApplicationGraph or a vault ref)");
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const nodes: GraphNode[] = [];
  let skippedNodes = 0;
  for (const n of rawNodes) {
    const norm = normalizeNode(n);
    if (norm) nodes.push(norm); else skippedNodes++;
  }
  const edges: CausalEdge[] = [];
  let skippedEdges = 0;
  for (const e of rawEdges) {
    const norm = normalizeEdge(e);
    if (norm) edges.push(norm); else skippedEdges++;
  }
  const src = source ?? (typeof input.source === "string" ? input.source : undefined);
  return {
    graph: { nodes, edges, ...(src ? { source: src } : {}) },
    summary: { nodes: nodes.length, edges: edges.length, skippedNodes, skippedEdges, ...(src ? { source: src } : {}) },
  };
}

/** True when the payload looks like an inline graph (has a nodes array) rather than a vault ref. */
export function looksLikeGraph(v: unknown): boolean {
  return isPlainObject(v) && Array.isArray(v.nodes);
}

/** Collect the unique evidence refs across a set of candidates (provenance edges for the vault append). */
export function uniqueRefs(candidates: SurfaceContract[]): EvidenceRef[] {
  const out: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    for (const r of c.evidence) {
      const key = `${r.ns}|${r.id}|${r.rev}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...r });
    }
  }
  return out;
}
