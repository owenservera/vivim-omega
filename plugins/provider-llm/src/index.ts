// provider.llm — the Ω6 LLM provider plugin.
//
// A NORMAL worker-compartment plugin (no surface superpowers): one CONTRACT
// contribution, chat.complete@1 (READ — local text generation, no external
// mutation). The backend is the deterministic SIMULATOR by default; the live
// openai-compatible leg (src/live.ts) is owner-machine-only dead code in-sandbox
// (config.live + credential.use capability — see the credential law in
// docs/SURFACES.md).
//
// The def is exported for unit tests / FakeHost (startPlugin no-ops outside a
// worker, so one module serves both transports).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { validateChatRequest, simulateChat } from "./simulator.ts";
import { parseLiveConfig, liveComplete } from "./live.ts";

export const def = definePlugin({
  ops: {
    "chat.complete@1": async (payload: unknown, ctx: PluginContext, _meta: CallMeta) => {
      const req = validateChatRequest(payload); // throws → DEGRADED register (honest junk refusal)

      const live = ctx?.config?.["live"];
      if (live === undefined) return simulateChat(req); // the in-sandbox default

      // ---- the owner-machine leg (dead code in-sandbox; see live.ts header) ----
      const cfg = parseLiveConfig(live);
      if (!ctx.capabilities.includes("credential.use")) {
        throw new Error(
          "chat.complete: config.live is set but the composition did NOT grant the credential.use capability — " +
          "refusing the live tier (fail-closed; owner-machine only, see docs/SURFACES.md credential law)",
        );
      }
      return liveComplete(ctx, cfg, req);
    },
  },
});

startPlugin(def);
