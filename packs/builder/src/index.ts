// pack.builder — src/index.ts (Omega Forge Wave 0, D-406)
//
// A PACK is a plugin whose manifest bundles SCHEMA + CONTRACT + POLICY + TEST
// contributions — no special machinery. It declares the Builder Contract; the
// Forge plugins implement it. Passive v1: no ops, no capabilities, no ports —
// the machine-readable half lives in ./schemas.ts (pure data + pure functions).
import { definePlugin, startPlugin } from "@vivim/omega-shim";

export const def = definePlugin({
  onInit: (ctx) => {
    ctx.log(
      `pack.builder up — declarations only: ${ctx.manifest.contributions.schema?.length ?? 0} schema, ` +
      `${ctx.manifest.contributions.contract?.length ?? 0} contract (the frozen forge.* wire), ` +
      `${ctx.manifest.contributions.policy?.length ?? 0} policy, ${ctx.manifest.contributions.test?.length ?? 0} test`,
    );
  },
});

startPlugin(def);
