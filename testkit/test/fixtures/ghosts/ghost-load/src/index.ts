// ghost.load — D-340 pressure fixture: the shared-algorithm middle hop.
// Nobody labels this core. When a swarm of plugins holds port:ghost.load@1,
// computed centrality must surface it as load-bearing on its own.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "ghost.load@1": async (payload: unknown, ctx: PluginContext) => {
      const r = await ctx.port.call("echo.ping@1", { from: "ghost.load", payload });
      return { amplified: true, upstream: r };
    },
  },
}));
