// ghost.deep-b — hop 2, fault-injection surface mirrors crashy.please pattern.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "deep.middle-b@1": async (payload: unknown, ctx: PluginContext) => {
      const p = (payload ?? {}) as { fail?: boolean };
      if (p.fail) return { ok: false, error: "DEGRADED", detail: "injected at hop 3 (deep-b)" };
      const r = await ctx.port.call("deep.middle-c@1", { from: "deep-b", payload });
      return { hop: "deep-b", downstream: r };
    },
  },
}));
