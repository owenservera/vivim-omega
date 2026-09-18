// ghost.stale — D-340 pressure fixture: the caller asking for a vanished version.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "stale.run@1": async (_payload: unknown, ctx: PluginContext) => {
      // Asks for a version no offeror answers; the declared 1.x range earns the
      // generation fallback — the compatible v1 answers instead of REFUSED.
      const r = await ctx.port.call("echo.ping@3", { from: "ghost.stale", note: "asked for a vanished version" });
      return { stale: true, resolvedInstead: r };
    },
  },
}));
