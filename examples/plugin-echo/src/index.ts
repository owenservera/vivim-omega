import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "echo.ping@1": async (payload) => {
      const delayMs = (payload as { delayMs?: number } | null)?.delayMs ?? 0;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return { echo: true, payload, at: Date.now() };
    },
  },
}));
