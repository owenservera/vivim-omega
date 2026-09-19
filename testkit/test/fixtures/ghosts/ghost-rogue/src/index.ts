// ghost.rogue — bypass attempt: local flag, no arbiter. Must be inert vs ghost.lock.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

let claimed = false;
startPlugin(definePlugin({
  ops: {
    "rogue.claim@1": async () => {
      if (claimed) return { locked: false, via: "rogue-flag", reason: "already claimed locally" };
      claimed = true;
      await new Promise((r) => setTimeout(r, 80));
      claimed = false;
      return { locked: true, via: "rogue-flag", arbiter: "bypassed" };
    },
  },
}));
