// ghost.twin — D-340 pressure fixture: the second generation of echo, live in the
// SAME boot as v1 (a different op version string — additive, no route conflict).
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    // The v2 generation answers echo.ping@2 — new callers, new version.
    "echo.ping@2": (payload: unknown) => ({ twin: true, generation: 2, payload, at: Date.now() }),
    // A version-locked caller: calls the OLD exact op through its 1.x-pinned token
    // and must hit v1 (the omega.echo compartment), never be yanked to this twin.
    "twin.probe@1": async (_payload: unknown, ctx: PluginContext) => {
      const r = await ctx.port.call("echo.ping@1", { probedBy: "ghost.twin" });
      return { pinnedTo: r.ok ? "v1" : "REFUSED", upstream: r };
    },
  },
}));
