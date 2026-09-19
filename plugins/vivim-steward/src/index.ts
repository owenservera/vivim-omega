// vivim.steward — D-399 narrow autonomy: ordinary capabilities, audited actions.
// crossed → re-sweep only (never quarantine for load-bearing).
// breach → confirm quarantine idempotently (watchdog already acted synchronously).
// chain-broken → escalate loudly, optionally refuse risky system-wide via law.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "steward.sweep@1": async (_payload, ctx) => {
      const r = await ctx.port.call("kernel.centrality@1", {});
      await ctx.port.call("host.journal.append@1", { steward: "sweep", at: Date.now() }).catch(() => {});
      return { swept: true, centrality: r };
    },
    "steward.confirm@1": async (payload, ctx) => {
      const p = (payload ?? {}) as { pluginId?: string; alreadyQuarantined?: boolean };
      if (!p.pluginId) return { confirmed: false, reason: "missing pluginId" };
      if (p.alreadyQuarantined) return { confirmed: true, idempotent: true, pluginId: p.pluginId };
      const r = await ctx.port.call("host.compartment.terminate@1", { pluginId: p.pluginId });
      await ctx.port.call("host.journal.append@1", { steward: "confirm", pluginId: p.pluginId, at: Date.now() }).catch(() => {});
      return { confirmed: r.ok, pluginId: p.pluginId };
    },
    "steward.escalate@1": async (payload, ctx) => {
      const p = (payload ?? {}) as { reason?: string };
      await ctx.port.call("host.journal.append@1", { steward: "escalate", reason: p.reason ?? "chain-broken", at: Date.now() }).catch(() => {});
      return { escalated: true, reason: p.reason ?? "chain-broken", refusedRisky: false };
    },
  },
}));
