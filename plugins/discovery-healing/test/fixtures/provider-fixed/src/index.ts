// provider.compose — the FIXED-world fixture (Ω9, GATE-Ω9 scenario).
// The healed twin of ../provider-broken: same plugin id, same op id/version,
// same wire shape — only the selector constant changed to the re-observed
// button location (plus the manifest version bump 0.1.0 → 0.1.1, so the
// amended recipe differs from the broken one in BOTH manifest and content
// hashes — a genuinely new pin, not a reshuffle).
//
// NOTE: fixtures are NOT workspace members (they live inside discovery-healing's
// test tree), so the shim is imported by relative path — a third party's plugin
// resolves the same module from its installed @vivim/omega-shim dependency.
import { definePlugin, startPlugin } from "../../../../../../shim/src/index.ts";

/** The HEALED selector — cites the fresh observation ("the button moved here"). */
const SELECTOR = "button[data-testid='compose']";

export const def = definePlugin({
  ops: {
    "compose.click@1": (payload: unknown) => {
      const p = (payload ?? {}) as { buttons?: unknown };
      const buttons = Array.isArray(p.buttons) ? p.buttons.filter((b): b is string => typeof b === "string") : [];
      const clicked = buttons.includes(SELECTOR);
      return { clicked, triedSelector: SELECTOR, buttonsSeen: buttons.length, world: "healed" };
    },
  },
});

startPlugin(def);
