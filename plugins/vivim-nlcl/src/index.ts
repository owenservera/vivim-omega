// vivim.nlcl — index.ts (Ω11), the NCLL engine plugin wrapper.
//
// The deterministic core lives in @vivim/omega-nlcl-pure (zero imports — the same bytes
// run in the browser for keystroke-latency feedback; N1). This wrapper is the ONLY thing
// the plugin adds: grounding the parse against vivim.mind's WorldModel through the port.
//
// Ops exposed (ENGINE contribution):
//   nlcl.interpret@1  {text} → Interpretation  (deterministic, traced)
//
// The interpretation is DATA: it carries the executable op payload (ir.payload), but
// EXECUTING it is the caller's business — the surface routes the intent through
// law.check + the router exactly like any root call. The language layer never executes.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { interpret, NCLL_VERSION } from "@vivim/omega-nlcl-pure";
import type { Interpretation, WorldModel } from "@vivim/omega-nlcl-pure";

interface MindSnapshotResult { world: WorldModel }

startPlugin(definePlugin({
  onInit: (ctx) => {
    ctx.log(`vivim.nlcl up (Ω11) — pure core ${NCLL_VERSION}, 17 symbol families, frames for the console ops`);
  },

  ops: {
    /** interpret {text} → Interpretation, grounded against the live WorldModel. */
    "nlcl.interpret@1": async (payload: unknown, _ctx: PluginContext) => {
      const p = (payload ?? {}) as Record<string, unknown>;
      if (typeof p !== "object" || Array.isArray(p)) throw new Error("nlcl.interpret@1: payload must be an object");
      const text = p["text"];
      if (typeof text !== "string") throw new Error("nlcl.interpret@1: {text: string} is required");

      const r: PortResult = await _ctx.port.call("mind.snapshot@1", {});
      if (!r.ok) throw new Error(`nlcl.interpret@1: mind.snapshot@1 ${r.error}: ${r.detail ?? ""} — no grounding target, refusing to guess`);
      const snap = r.value as MindSnapshotResult;
      const world = snap?.world;
      if (!world || typeof world !== "object") throw new Error("nlcl.interpret@1: mind.snapshot@1 returned no world — refusing to guess");

      const interp: Interpretation = interpret(text, world);
      return { interpretation: interp, nlclVersion: NCLL_VERSION, worldV: world.v };
    },
  },
}));
