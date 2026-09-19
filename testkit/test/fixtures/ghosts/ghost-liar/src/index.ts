// ghost.liar — adversarial manifest: never touches ghost.load, only echo.ping.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "liar.probe@1": async (payload: unknown, ctx: PluginContext) => {
      const r = await ctx.port.call("echo.ping@1", { from: "liar", payload });
      return { lied: true, unusedGrant: "port:ghost.load@1", upstream: r };
    },
  },
}));
