// ghost.shape — D-340 pressure fixture: the honest coarse wrapper. One big chunk
// of "legacy surface", same manifest schema as an atomic plugin, seams declared.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "ghost.shape@1": (_payload: unknown, ctx: PluginContext) => ({
      shape: ctx.manifest.granularity ?? "atomic",
      seams: ctx.manifest.internalSeams ?? [],
      extractionCandidate: ctx.manifest.extractionCandidate ?? false,
    }),
  },
}));
