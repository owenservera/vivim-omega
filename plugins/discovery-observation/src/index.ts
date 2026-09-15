// discovery.observation — index.ts (Ω7), the observation engine (wiring only).
//
// ENGINE contribution discovery.observe@1 (see plugin.json):
//
//   discovery.observe@1 {fixture: {name, pageRef?, traceRef?}, graphRef? {ns, id}}
//     → {edges, eventCount, edgesCount, drift, observationId: {ns, id, rev, cid}}
//
// The op is an ORDINARY plugin op — no special spine hooks. It:
//   1. loads + replays the captured event trace (fixtures/<name>/events.jsonl)
//      from the config-passed fixtures dir (in-sandbox fixtures, never network);
//   2. appends the trace bytes as a VAULT EVIDENCE OBJECT (default ns
//      "discovery", id "trace:<name>") and reads them back through
//      port:vault.get@1 (integrity self-check — exact bytes);
//   3. derives CausalEdges (src/trace.ts — pure): each dom-update is attributed
//      to the most recent user action (click/type) or network event in the same
//      request lineage; every edge cites its trace lines BY BYTE SPAN into the
//      appended trace object;
//   4. when graphRef is given, edge endpoints resolve to GraphNode ids from the
//      perceived ApplicationGraph (vault.get — explicit refs must resolve,
//      fail-closed); without it, edges carry the raw selector as node reference;
//   5. DRIFT: if a prior observation of the same fixture name exists in the
//      vault, its edges are the baseline — divergences (latency, structure,
//      added/removed edges) are returned as drift RECORDS. Drift is DATA,
//      never an error. A baseline lookup that cannot be satisfied simply means
//      "no baseline" — a real vault failure still fails closed at the next
//      append;
//   6. appends the observation itself to the vault (ns "discovery",
//      id "observation:<name>") with vault-level refs to the trace, the page
//      capture (when given), the graph (when given), and the baseline
//      observation (when one existed).
//
// Handlers throw on bad payloads/failed explicit port calls — the shim
// converts throws into DEGRADED returns (fail-closed propagation).
// Determinism: no clock, no random — the same trace bytes produce the same
// edges; drift depends only on the stored baseline (also authored data).
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { asApplicationGraph } from "./graph.ts";
import { compareEdges, deriveEdges, graphResolver, parseTrace, type CausalEdge, type DriftRecord } from "./trace.ts";

const DISCOVERY_NS = "discovery";

// ---- vault port plumbing (fail-closed) -----------------------------------------

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

/**
 * Soft lookup for the OPTIONAL drift baseline: any non-ok result means "no
 * baseline available". Honest because a genuinely broken vault fails closed at
 * the very next append (this op always appends); only the optional-context
 * lookup degrades gracefully.
 */
async function tryVaultGet(ctx: PluginContext, ns: string, id: string): Promise<VaultGetResult | null> {
  const r: PortResult = await ctx.port.call("vault.get@1", { ns, id });
  return r.ok ? (r.value as VaultGetResult) : null;
}

// ---- config + payload validation ------------------------------------------------

function resolveFixturesDir(config: Record<string, unknown> | undefined | null): string {
  const raw = config?.fixturesDir;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("discovery.observe@1: ctx.config.fixturesDir must be a non-empty string (composition passthrough)");
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

const FIXTURE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function requireString(op: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${op}: ${field} must be a non-empty string`);
  return value;
}

function optionalVaultRef(op: string, field: string, value: unknown): { ns: string; id: string } | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${op}: ${field} must be an object {ns, id}`);
  const ref = value as Record<string, unknown>;
  return { ns: requireString(op, `${field}.ns`, ref.ns), id: requireString(op, `${field}.id`, ref.id) };
}

function asEdges(op: string, value: unknown): CausalEdge[] {
  if (!Array.isArray(value)) throw new Error(`${op}: prior observation data.edges must be an array (corrupt baseline)`);
  return value.map((e, i) => {
    if (e === null || typeof e !== "object" || Array.isArray(e)) throw new Error(`${op}: prior edge ${i} must be an object`);
    const edge = e as Record<string, unknown>;
    if (typeof edge.id !== "string") throw new Error(`${op}: prior edge ${i} must carry a string id`);
    return edge as unknown as CausalEdge;
  });
}

// ---- the engine op ----------------------------------------------------------------

startPlugin(definePlugin({
  onInit: (ctx) => {
    const dir = typeof (ctx.config as Record<string, unknown> | undefined)?.fixturesDir === "string"
      ? String((ctx.config as Record<string, unknown>).fixturesDir)
      : "<unset>";
    ctx.log(`discovery.observation up (Ω7) — fixturesDir=${dir}, vault ns "${DISCOVERY_NS}", zero LLM, zero network, drift is data`);
  },

  ops: {
    "discovery.observe@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "discovery.observe@1";
      if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`${op}: payload must be an object`);
      }
      const p = payload as Record<string, unknown>;
      if (p.fixture === null || p.fixture === undefined || typeof p.fixture !== "object" || Array.isArray(p.fixture)) {
        throw new Error(`${op}: payload.fixture must be an object {name, pageRef?, traceRef?}`);
      }
      const f = p.fixture as Record<string, unknown>;
      const name = requireString(op, "fixture.name", f.name);
      if (!FIXTURE_NAME.test(name)) {
        throw new Error(`${op}: fixture.name must match ^[a-z0-9][a-z0-9-]*$ (single path segment, got "${name}")`);
      }
      const pageRef = optionalVaultRef(op, "fixture.pageRef", f.pageRef);
      const traceRef = optionalVaultRef(op, "fixture.traceRef", f.traceRef) ?? { ns: DISCOVERY_NS, id: `trace:${name}` };
      const graphRef = optionalVaultRef(op, "graphRef", p.graphRef);

      // 1. load + parse the captured trace (fixture bytes — the capture stands in for a live CDP trace)
      const fixturesDir = resolveFixturesDir(ctx.config);
      const raw = readFileSync(join(fixturesDir, name, "events.jsonl"), "utf-8");
      const { events, spans } = parseTrace(raw);
      if (events.length === 0) throw new Error(`${op}: fixture ${name}/events.jsonl contains no events`);

      // 2. append the trace bytes as a vault evidence object; read them back (integrity self-check)
      const trace = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: traceRef.ns,
        id: traceRef.id,
        data: raw,
        meta: { type: "capture", kind: "trace", fixture: name, events: events.length, bytes: Buffer.byteLength(raw, "utf-8") },
        refs: [],
      });
      const readBack = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: traceRef.ns, id: traceRef.id, rev: trace.rev });
      if (readBack.data !== raw) {
        throw new Error(`${op}: trace round-trip mismatch — vault.get returned different bytes than were appended (rev ${trace.rev})`);
      }

      // 3. graph resolution (explicit ref → must resolve, fail-closed) + provenance refs
      const provenanceRefs: Array<{ ns: string; id: string; rev: number }> = [{ ns: traceRef.ns, id: traceRef.id, rev: trace.rev }];
      let resolveNode: (selector: string) => string | null;
      if (pageRef) {
        const page = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: pageRef.ns, id: pageRef.id });
        provenanceRefs.push({ ns: pageRef.ns, id: pageRef.id, rev: page.rev });
      }
      if (graphRef) {
        const g = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: graphRef.ns, id: graphRef.id });
        const graph = asApplicationGraph(op, g.data);
        resolveNode = graphResolver(graph.nodes);
        provenanceRefs.push({ ns: graphRef.ns, id: graphRef.id, rev: g.rev });
      } else {
        // stand-alone mode: edges carry the raw selector as node reference — they
        // attach to a graph later by selectorHint match (documented in DISCOVERY.md)
        resolveNode = (selector) => selector;
      }

      // 4. derive causal edges; every edge cites its trace lines by byte span
      // (D-357 G0 fix: pass the full {ns, id, rev} triple, not the derived string)
      const { edges, skippedUnresolved, unattributedUpdates } = deriveEdges(events, spans, resolveNode, {
        ns: traceRef.ns, id: traceRef.id, rev: trace.rev,
      });

      // 5. drift vs the prior observation of the same fixture (data, never error)
      const observationId = { ns: DISCOVERY_NS, id: `observation:${name}` };
      let drift: DriftRecord[] = [];
      let baselineRev: number | null = null;
      const prior = await tryVaultGet(ctx, observationId.ns, observationId.id);
      if (prior) {
        const data = prior.data as Record<string, unknown> | null;
        if (data !== null && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.edges)) {
          drift = compareEdges(asEdges(op, data.edges), edges);
          baselineRev = prior.rev;
          provenanceRefs.push({ ns: observationId.ns, id: observationId.id, rev: prior.rev });
        } // a prior object without edges is not a baseline (not an error — it predates edge derivation)
      }

      // 6. persist the observation with its evidence refs
      const observation = {
        fixture: name,
        eventCount: events.length,
        edgesCount: edges.length,
        edges,
        drift,
        traceStart: events[0]!.ts,
        traceEnd: events[events.length - 1]!.ts,
        skippedUnresolved,
        unattributedUpdates,
        ...(baselineRev !== null ? { baselineRev } : {}),
      };
      const appended = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: observationId.ns,
        id: observationId.id,
        data: observation,
        meta: { type: "observation", fixture: name, edgesCount: edges.length, driftCount: drift.length, evidenceObject: `${traceRef.ns}/${traceRef.id}@${trace.rev}` },
        refs: provenanceRefs,
      });

      // 7. result — drift rides along as data
      return {
        edges,
        eventCount: events.length,
        edgesCount: edges.length,
        drift,
        observationId: { ns: observationId.ns, id: observationId.id, rev: appended.rev, cid: appended.cid },
      };
    },
  },
}));
