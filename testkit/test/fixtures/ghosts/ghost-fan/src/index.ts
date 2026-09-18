// ghost.fan — D-340 pressure fixture: one swarm member. Cloned to ghost.fan-N
// with rewritten ids by the suite; the code is identical (ops are stable).
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "fan.run@1": async (payload: unknown, ctx: PluginContext) => {
      const p = (payload ?? {}) as { concurrency?: number };
      const k = typeof p.concurrency === "number" && p.concurrency > 0 ? Math.min(p.concurrency, 8) : 4;
      const results = await Promise.all(
        Array.from({ length: k }, (_, i) => ctx.port.call("ghost.load@1", { fan: i })),
      );
      return { fan: ctx.manifest.id, concurrency: k, results };
    },
  },
}));
