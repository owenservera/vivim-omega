// ghost.hog — D-393 fixture: controlled memory grower past 32MB budget.
// Responsive by design (probeStat keeps answering) so the MEMORY leg, not the
// unresponsive leg, must catch it. Rate mirrors fixtures/plugin-bomb heap mode.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

const keep: number[][] = [];
startPlugin(definePlugin({
  ops: {
    "hog.grow@1": async () => {
      const timer = setInterval(() => { keep.push(new Array(131072).fill(0)); }, 25);
      (timer as unknown as { unref?: () => void }).unref?.();
      return { started: true, budgetMB: 32 };
    },
  },
}));
