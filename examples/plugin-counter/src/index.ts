import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

let count = 0;

startPlugin(definePlugin({
  onInit(ctx: PluginContext) { ctx.log("counter booted"); },
  ops: {
    "counter.bump@1": async (_payload, ctx) => {
      count += 1;
      const r = await ctx.port.call("echo.ping@1", { count });
      return { count, echoResult: r };
    },
    "counter.value@1": () => ({ count }),
  },
}));
