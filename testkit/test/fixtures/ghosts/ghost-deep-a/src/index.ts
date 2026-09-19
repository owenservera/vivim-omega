// ghost.deep-a — hop 1 of the 5-hop chain.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "deep.entry@1": async (payload: unknown, ctx: PluginContext) => {
      const r = await ctx.port.call("deep.middle-b@1", { from: "deep-a", payload });
      return { hop: "deep-a", downstream: r };
    },
  },
}));
