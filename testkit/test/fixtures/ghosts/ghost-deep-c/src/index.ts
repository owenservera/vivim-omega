// ghost.deep-c — hop 3, bridges into ghost.load.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "deep.middle-c@1": async (payload: unknown, ctx: PluginContext) => {
      const r = await ctx.port.call("ghost.load@1", { from: "deep-c", payload });
      return { hop: "deep-c", downstream: r };
    },
  },
}));
