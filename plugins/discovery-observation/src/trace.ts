// discovery.observation — trace.ts (Ω7)
// The pure event-trace model: parser, causal-edge derivation, drift comparison.
// NO shim/port imports here (unit tests import this module in-process);
// src/index.ts is the only file that touches ports. The TS types below MIRROR
// the discovery.* SCHEMA contributions declared by plugins/discovery-perception
// (the contract of record) — duplicated per the B2 import law.
//
// Determinism law: nothing in this module reads the clock, random, or
// filesystem — the same trace bytes always produce the same edges.
import type { EvidenceRef, GraphNode } from "./graph.ts";

export type TraceEventType = "click" | "type" | "network" | "dom-update";
export type EdgeTrigger = "click" | "type" | "network";

export interface TraceEvent {
  type: TraceEventType;
  targetSelector: string;
  ts: number;
  detail?: Record<string, unknown>;
}

export interface CausalEdge {
  id: string;
  from: string; // GraphNode id when a graph was supplied, else the raw selector
  to: string;
  trigger: EdgeTrigger;
  latencyMs: number;
  evidence: EvidenceRef[];
}

export interface DriftRecord {
  edgeId: string;
  kind: "latency" | "structure" | "edge-added" | "edge-removed";
  field?: string;
  baseline?: number | string;
  observed?: number | string;
  deltaMs?: number;
}

export interface ParsedTrace {
  events: TraceEvent[];
  /** Byte span [start, end) of each parsed line, in UTF-8 bytes over the whole trace text. */
  spans: Array<{ start: number; end: number }>;
}

// ---- parsing ---------------------------------------------------------------------

/**
 * Parse an events.jsonl trace: one JSON object per line
 * ({type, targetSelector, ts, detail?}). Computes the UTF-8 byte span of every
 * line so edges can cite exact evidence slices of the appended trace object.
 * Malformed lines throw (fail-closed — the shim turns throws into DEGRADED).
 */
export function parseTrace(text: string): ParsedTrace {
  const events: TraceEvent[] = [];
  const spans: Array<{ start: number; end: number }> = [];
  let byteCursor = 0;
  for (const line of text.split("\n")) {
    const lineBytes = Buffer.byteLength(line, "utf-8") + 1; // +1 for the "\n" the split consumed
    if (line.trim().length === 0) {
      byteCursor += lineBytes;
      continue; // blank lines (incl. the trailing newline) carry no event
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      throw new Error(`parseTrace: malformed event line at byte ${byteCursor}: ${String(e)}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`parseTrace: event line at byte ${byteCursor} must be an object`);
    }
    const ev = parsed as Record<string, unknown>;
    const type = ev.type;
    if (type !== "click" && type !== "type" && type !== "network" && type !== "dom-update") {
      throw new Error(`parseTrace: event line at byte ${byteCursor} has bad type ${JSON.stringify(type)}`);
    }
    if (typeof ev.targetSelector !== "string" || ev.targetSelector.length === 0) {
      throw new Error(`parseTrace: event line at byte ${byteCursor} must carry a non-empty targetSelector`);
    }
    if (typeof ev.ts !== "number" || !Number.isInteger(ev.ts)) {
      throw new Error(`parseTrace: event line at byte ${byteCursor} must carry an integer ts`);
    }
    if (ev.detail !== undefined && (typeof ev.detail !== "object" || ev.detail === null || Array.isArray(ev.detail))) {
      throw new Error(`parseTrace: event line at byte ${byteCursor} detail must be an object when provided`);
    }
    events.push({ type, targetSelector: ev.targetSelector, ts: ev.ts, detail: ev.detail as Record<string, unknown> | undefined });
    spans.push({ start: byteCursor, end: byteCursor + Buffer.byteLength(line, "utf-8") });
    byteCursor += lineBytes;
  }
  return { events, spans };
}

// ---- causal-edge derivation --------------------------------------------------------

export type NodeResolver = (selector: string) => string | null;

export interface DeriveResult {
  edges: CausalEdge[];
  /** dom-updates whose cause/target selector did not resolve to a graph node (data, not error). */
  skippedUnresolved: number;
  /** dom-updates with no attributable cause in the trace (data, not error). */
  unattributedUpdates: number;
}

interface Group {
  cause: TraceEvent;
  causeLine: number;
  /** line indices of network events attributed to the group so far. */
  networkLines: number[];
}

function requestIdOf(ev: TraceEvent | undefined): string | undefined {
  const rid = ev?.detail?.requestId;
  return typeof rid === "string" && rid.length > 0 ? rid : undefined;
}

/**
 * Derive causal edges from a trace. Attribution rules (deterministic):
 *  - a click/type event starts a new causal group (the most recent user action wins);
 *  - a network event joins the open group if the group has no network yet, or if
 *    its requestId matches a network line already in the group (request lineage —
 *    streaming chunks share the initiating request); otherwise it starts its own
 *    network-attributed group (a server push, a different request);
 *  - every dom-update in the open group emits ONE edge: trigger = the cause's
 *    type (click|type|network), from = cause target, to = dom-update target,
 *    latencyMs = ts(dom) − ts(cause), evidence = cause line + network lines so
 *    far + this dom line, each cited by byte span into the appended trace object.
 * dom-updates with no open group are unattributed; edges whose endpoints do not
 * resolve to graph nodes are skipped — both are COUNTED, never thrown (drift is
 * data, not error).
 */
export function deriveEdges(events: TraceEvent[], spans: Array<{ start: number; end: number }>, resolve: NodeResolver, source: { ns: string; id: string; rev: number }): DeriveResult {
  const edges: CausalEdge[] = [];
  let skippedUnresolved = 0;
  let unattributedUpdates = 0;
  let group: Group | null = null;

  // D-357 G0 fix: every edge evidence ref carries the {ns, id, rev} triple + the
  // derived casRef (casRef-only refs were dropped by inference's fail-closed filter).
  const casRef = `${source.ns}/${source.id}@${source.rev}`;
  const ref = (line: number): EvidenceRef => ({ ns: source.ns, id: source.id, rev: source.rev, casRef, span: { ...spans[line]! } });

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (ev.type === "click" || ev.type === "type") {
      group = { cause: ev, causeLine: i, networkLines: [] };
      continue;
    }
    if (ev.type === "network") {
      if (!group) {
        group = { cause: ev, causeLine: i, networkLines: [] }; // network-attributed group (no user action)
        continue;
      }
      const rid = requestIdOf(ev);
      const groupRids = new Set<string>();
      for (const j of group.networkLines) {
        const g = requestIdOf(events[j]);
        if (g !== undefined) groupRids.add(g);
      }
      const joinsLineage = group.networkLines.length === 0 || rid === undefined || groupRids.has(rid);
      if (joinsLineage) group.networkLines.push(i);
      else group = { cause: ev, causeLine: i, networkLines: [] }; // different request lineage → new cause
      continue;
    }
    // dom-update
    if (!group) {
      unattributedUpdates++;
      continue;
    }
    const from = resolve(group.cause.targetSelector);
    const to = resolve(ev.targetSelector);
    if (from === null || to === null) {
      skippedUnresolved++;
      continue;
    }
    const evidence: EvidenceRef[] = [ref(group.causeLine), ...group.networkLines.map(ref), ref(i)];
    edges.push({
      id: `e${edges.length}`,
      from,
      to,
      trigger: group.cause.type === "network" ? "network" : group.cause.type,
      latencyMs: ev.ts - group.cause.ts,
      evidence,
    });
  }
  return { edges, skippedUnresolved, unattributedUpdates };
}

/** Resolver over a perceived ApplicationGraph: selectorHint → node id (first wins). */
export function graphResolver(nodes: GraphNode[]): NodeResolver {
  const bySelector = new Map<string, string>();
  for (const n of nodes) if (!bySelector.has(n.selectorHint)) bySelector.set(n.selectorHint, n.id);
  return (selector) => bySelector.get(selector) ?? null;
}

// ---- drift comparison (data, never error) -------------------------------------------

/**
 * Compare a fresh edge set against a baseline (a prior observation of the same
 * fixture). Latency differences, endpoint/trigger changes, and added/removed
 * edges are all returned as drift RECORDS — divergence is observed data.
 */
export function compareEdges(baseline: CausalEdge[], observed: CausalEdge[]): DriftRecord[] {
  const drift: DriftRecord[] = [];
  const byId = new Map(baseline.map((e) => [e.id, e] as const));
  for (const oe of observed) {
    const be = byId.get(oe.id);
    if (!be) {
      drift.push({ edgeId: oe.id, kind: "edge-added" });
      continue;
    }
    if (be.from !== oe.from) drift.push({ edgeId: oe.id, kind: "structure", field: "from", baseline: be.from, observed: oe.from });
    if (be.to !== oe.to) drift.push({ edgeId: oe.id, kind: "structure", field: "to", baseline: be.to, observed: oe.to });
    if (be.trigger !== oe.trigger) drift.push({ edgeId: oe.id, kind: "structure", field: "trigger", baseline: be.trigger, observed: oe.trigger });
    if (be.latencyMs !== oe.latencyMs) {
      drift.push({
        edgeId: oe.id, kind: "latency", field: "latencyMs",
        baseline: be.latencyMs, observed: oe.latencyMs, deltaMs: oe.latencyMs - be.latencyMs,
      });
    }
  }
  const observedIds = new Set(observed.map((e) => e.id));
  for (const be of baseline) {
    if (!observedIds.has(be.id)) drift.push({ edgeId: be.id, kind: "edge-removed" });
  }
  return drift;
}
