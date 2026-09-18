// pack.domain-import — src/index.ts (Ω5/W1, pack #2)
//
// A PACK is just a plugin whose manifest bundles SCHEMA + CONTRACT + POLICY + TEST
// contributions — no special machinery (same shape as pack.domain-email). It declares
// the import ontology; the parser family (plugins/vivim-chat, D-355 parser
// contributions, NOT routable) produces the rows, and a W3 writer materializes them.
// v1 packs are passive: pure declarations, no ops, no capabilities.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

export const def = definePlugin({
  // Intentionally no ops: packs declare, providers/writers implement.
  onInit: (ctx) => {
    ctx.log(`pack.domain-import up (W1) — declarations only: ${ctx.manifest.contributions.schema?.length ?? 0} schema, ${ctx.manifest.contributions.contract?.length ?? 0} contract, ${ctx.manifest.contributions.policy?.length ?? 0} policy, ${ctx.manifest.contributions.test?.length ?? 0} test`);
  },
});

startPlugin(def);
