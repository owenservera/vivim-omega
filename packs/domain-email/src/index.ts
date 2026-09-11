// pack.domain-email — src/index.ts (Ω5)
//
// A PACK is just a plugin whose manifest bundles SCHEMA + CONTRACT + POLICY + TEST
// contributions — no special machinery. It declares the ontology; a PROVIDER plugin
// implements the contracts (provider.email.file). v1 packs are passive: pure
// declarations, no ops, no capabilities. The def is exported so conformance runners
// can install it in-process; startPlugin() no-ops outside a worker (shim), so the
// same module serves both transports.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

export const def = definePlugin({
  // Intentionally no ops: packs declare, providers implement. A later pack version
  // may carry ops (e.g. domain-level derived views) without breaking this shape.
  onInit: (ctx) => {
    ctx.log(`pack.domain-email up (Ω5) — declarations only: ${ctx.manifest.contributions.schema?.length ?? 0} schema, ${ctx.manifest.contributions.contract?.length ?? 0} contract, ${ctx.manifest.contributions.policy?.length ?? 0} policy, ${ctx.manifest.contributions.test?.length ?? 0} test`);
  },
});

startPlugin(def);
