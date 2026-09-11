// discovery.inference — index.ts (Ω8), the ENGINE plugin wiring.
//
// Op exposed (ENGINE contribution, see plugin.json):
//   discovery.infer@1 {graph, runId?} → {runId, candidates[], graphSummary, vaultRef}
//
// INPUT TOLERANCE (the Ω7 contract): `graph` is plain JSON — either an inline
// ApplicationGraph object (nodes/edges) or a vault ref {ns, id, rev} (resolved
// through the port via vault.get@1; the engine never imports perception code).
// Missing edges, unknown node kinds, and malformed nodes are tolerated and
// COUNTED in graphSummary (the gap is data, not a crash).
//
// THE ENGINE'S ONLY OUTPUTS: candidate contracts + evidence in the USER'S
// VAULT — one append per run: {ns: "discovery", id: "candidates:<runId>",
// data: {runId, graphSummary, candidates}, meta: {type: "candidates"},
// refs: the unique evidence refs cited by the candidates} (provenance edges:
// compaction honors them, the Merkle chain seals them). Candidates are born
// DRAFT; confidence is recorded; promotion is proof (discovery.verify@1).
//
// Handlers throw on bad payloads / failed port calls — the shim converts
// throws into DEGRADED returns at the port boundary (fail-closed propagation).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { inferCandidates } from "./infer.ts";
import {
  isVaultRef, looksLikeGraph, normalizeGraph, uniqueRefs,
  type SurfaceContract, type GraphSummary,
} from "./model.ts";

export const DISCOVERY_NS = "discovery";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`discovery.inference: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function requirePayloadObject(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("discovery.infer@1: payload must be an object {graph, runId?}");
  }
  return payload as Record<string, unknown>;
}

function optionalRunId(v: unknown): string {
  if (v === undefined || v === null) return `run-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (typeof v !== "string" || v.length === 0 || v.length > 128) {
    throw new Error("discovery.infer@1: runId must be a non-empty string (≤128 chars) when provided");
  }
  return v;
}

/** Resolve the `graph` payload field: inline object → normalize; vault ref → vault.get → normalize. */
async function resolveGraph(ctx: PluginContext, graphInput: unknown): Promise<{ graph: ReturnType<typeof normalizeGraph>["graph"]; summary: GraphSummary }> {
  if (graphInput === undefined || graphInput === null) {
    throw new Error("discovery.infer@1: graph is required (inline ApplicationGraph or vault ref {ns,id,rev})");
  }
  if (looksLikeGraph(graphInput) || (typeof graphInput === "object" && !Array.isArray(graphInput) && "edges" in (graphInput as Record<string, unknown>))) {
    return normalizeGraph(graphInput, "inline");
  }
  if (isVaultRef(graphInput)) {
    const ref = graphInput;
    const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: ref.ns, id: ref.id, rev: ref.rev });
    return normalizeGraph(got.data, `vault:${ref.ns}/${ref.id}@${ref.rev}`);
  }
  throw new Error("discovery.infer@1: graph must be an inline ApplicationGraph {nodes, edges} or a vault ref {ns, id, rev}");
}

export const def = definePlugin({
  onInit: (ctx: PluginContext) => {
    const schemaIds = (ctx.manifest.contributions.schema ?? []).map((c) => `${c.id}@${c.version}`);
    ctx.log(`discovery.inference up (Ω8) — infer → candidates (schema ${schemaIds.join(", ") || "n/a"}), vault ns "${DISCOVERY_NS}", evidence mandatory`);
  },

  ops: {
    "discovery.infer@1": async (payload: unknown, ctx: PluginContext, _meta: CallMeta) => {
      const p = requirePayloadObject(payload);
      const runId = optionalRunId(p.runId);
      const { graph, summary } = await resolveGraph(ctx, p.graph);
      const candidates: SurfaceContract[] = inferCandidates(graph);
      const refs = uniqueRefs(candidates);
      if (refs.length === 0 && candidates.length > 0) {
        // unreachable by construction (candidates require evidence), kept as an invariant guard
        throw new Error("discovery.infer@1: internal invariant — candidates without evidence");
      }
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: DISCOVERY_NS,
        id: `candidates:${runId}`,
        data: { runId, engine: "discovery.infer@1", graphSummary: summary, candidates },
        meta: { type: "candidates", runId },
        refs,
      });
      return {
        runId,
        engine: "discovery.infer@1",
        candidates,
        graphSummary: summary,
        vaultRef: { ns: DISCOVERY_NS, id: `candidates:${runId}`, rev: append.rev },
      };
    },
  },
});

startPlugin(def);
