// ghost.lock — D-340 pressure fixture: contends for a shared state key through
// the ONE host-side arbiter (host.state.acquire@1 / host.state.release@1).
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

const KEY = "ghost:critical-section";

startPlugin(definePlugin({
  ops: {
    "lock.zone@1": async (payload: unknown, ctx: PluginContext) => {
      const p = (payload ?? {}) as { holdMs?: number };
      const holdMs = typeof p.holdMs === "number" && p.holdMs > 0 ? Math.min(p.holdMs, 500) : 80;
      const acq = await ctx.port.call("host.state.acquire@1", { key: KEY, mode: "exclusive" });
      if (!acq.ok) {
        return { locked: false, contender: ctx.manifest.id, refused: acq.error, detail: acq.detail ?? "" };
      }
      await new Promise((r) => setTimeout(r, holdMs)); // the critical section
      await ctx.port.call("host.state.release@1", { key: KEY });
      return { locked: true, contender: ctx.manifest.id, heldForMs: holdMs };
    },
  },
}));
