// provider.compose — the BROKEN-world fixture (Ω9, GATE-Ω9 scenario).
//
// A minimal provider whose promoted selector went stale: the live UI moved the
// compose button, so this provider keeps clicking where the button USED to be.
// The op is honest about it — it answers {clicked: false, triedSelector} — which
// is exactly the class of failure drift detection exists for: the provider is
// alive, its CONTRACT is wrong.
//
// NOTE: fixtures are NOT workspace members (they live inside discovery-healing's
// test tree, outside the plugins/* workspace glob), so the shim is imported by
// relative path — a third party's plugin resolves the same module from its
// installed @vivim/omega-shim dependency. Same shim, same wire, same behavior.
import { definePlugin, startPlugin } from "../../../../../../shim/src/index.ts";

/** The STALE promoted selector — the deliberate breakage (see ../provider-fixed for the healed twin). */
const SELECTOR = "#compose-btn";

export const def = definePlugin({
  ops: {
    "compose.click@1": (payload: unknown) => {
      const p = (payload ?? {}) as { buttons?: unknown };
      const buttons = Array.isArray(p.buttons) ? p.buttons.filter((b): b is string => typeof b === "string") : [];
      const clicked = buttons.includes(SELECTOR);
      return { clicked, triedSelector: SELECTOR, buttonsSeen: buttons.length, world: "broken" };
    },
  },
});

startPlugin(def);
