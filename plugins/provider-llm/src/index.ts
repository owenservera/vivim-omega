// provider.llm — the Ω6 LLM provider plugin.
//
// A NORMAL worker-compartment plugin (no surface superpowers): one CONTRACT
// contribution, chat.complete@1 (READ — local text generation, no external
// mutation). The backend is the deterministic SIMULATOR by default; the live
// openai-compatible leg (src/live.ts) is owner-machine-only dead code in-sandbox
// (config.live + credential.use capability — see the credential law in
// docs/SURFACES.md).
//
// D-358 (M1→M2 persistence hook): the SIMULATOR path ADDITIVELY emits the
// completion as ordered line-chunks via meta.emit (D-352's strict-seq,
// close-once law; sink-or-drop for single-shot callers — they observe
// nothing). The request/response CONTRACT is unchanged (no version bump —
// the same additive precedent as the browser replay, D-357); the live leg
// stays single-shot. Streamed callers assemble exactly the bytes the return
// carries: lines joined by "\n".
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { validateChatRequest, simulateChat } from "./simulator.ts";
import { parseLiveConfig, liveComplete } from "./live.ts";

/** Emit the completion as ordered line-chunks (assembled = content exactly).
 *  One chunk per line, exactly-one-final (the shim enforces seq + close-once). */
function emitLineChunks(meta: CallMeta, content: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    meta.emit(lines[i]!, i === lines.length - 1);
  }
  return lines.length;
}

export const def = definePlugin({
  ops: {
    "chat.complete@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta) => {
      const req = validateChatRequest(payload); // throws → DEGRADED register (honest junk refusal)

      const live = ctx?.config?.["live"];
      if (live === undefined) {
        const completion = simulateChat(req); // the in-sandbox default
        emitLineChunks(meta, completion.completion.content); // D-358: additive, sink-or-drop
        return completion;
      }

      // ---- the owner-machine leg (dead code in-sandbox; see live.ts header) ----
      // Single-shot by construction: the live leg never emits (its streaming
      // story is the owner-machine tier's own future work, honestly absent).
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
