// vivim.kernel-lens — index.ts (D-340): wiring only.
//
// THE LENS, never an author (the vivim.mind pattern, one level deeper):
// everything below READS through one host capability (host.kernel.lens —
// the graph snapshot + audit chain READ surface) and reports derived data.
// There is no write path anywhere in this plugin, and nothing in the
// dispatch path ever consults it — that is the Option C placement, not an
// accident: mechanism stayed host-side, derived/queryable state lives here.
//
// Ops exposed (READ-risk CONTRACT contributions):
//   kernel.centrality@1     {} → {loadBearing, thresholds, nodeCount, edgeCount}
//   kernel.audit.verify@1   {} → {verified, length, headHash, signerKeyId}
//
// Fail-closed: a non-ok host port call throws → DEGRADED at the port
// boundary. The lens NEVER degrades to guessing.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import { HOST_OPS, type PortResult } from "@vivim/omega-contracts";
import { sweep, DEFAULT_THRESHOLDS, type LensConfig, type GraphNodeView, type GraphEdgeView } from "./centrality.ts";

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`kernel-lens: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

/** Thresholds from composition config (data, never authority); invalid values
 *  fall back to the kernel defaults rather than being trusted. */
function parseConfig(config: Record<string, unknown>): LensConfig {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  return {
    fanInThreshold: num(config["fanInThreshold"]) ?? DEFAULT_THRESHOLDS.fanInThreshold,
    blastRadiusThreshold: num(config["blastRadiusThreshold"]) ?? DEFAULT_THRESHOLDS.blastRadiusThreshold,
  };
}

startPlugin(definePlugin({
  onInit: (ctx) => {
    const cfg = parseConfig(ctx.config);
    ctx.log(`vivim.kernel-lens up (D-340) — lens: thresholds fanIn ${cfg.fanInThreshold} / blastRadius ${cfg.blastRadiusThreshold}, one READ capability, zero write paths`);
  },

  ops: {
    /** The computed load-bearing report (requirement #7): a node crosses the
     *  threshold because the graph says so, never because someone assigned it. */
    "kernel.centrality@1": async (_payload: unknown, ctx: PluginContext) => {
      const snapshot = await portCall<{ nodes: GraphNodeView[]; edges: GraphEdgeView[] }>(ctx, HOST_OPS.graphSnapshot, {});
      const report = sweep(snapshot, parseConfig(ctx.config));
      ctx.log(`kernel-lens: sweep — ${report.nodeCount} nodes, ${report.edgeCount} edges, ${report.loadBearing.length} load-bearing`);
      return report;
    },

    /** The tamper-evidence verdict (requirement #8) over the chain copy-out. */
    "kernel.audit.verify@1": async (_payload: unknown, ctx: PluginContext) => {
      const chain = await portCall<{ verified: boolean; length: number; headHash: string; signerKeyId: string }>(ctx, HOST_OPS.auditChain, {});
      ctx.log(`kernel-lens: audit chain — ${chain.verified ? "VERIFIED" : "BROKEN"} at ${chain.length} entries, head ${chain.headHash.slice(0, 12)}…`);
      const { verified, length, headHash, signerKeyId } = chain;
      return { verified, length, headHash, signerKeyId };
    },
  },
}));
