// ghost.spike — D-393 fixture: transient spike then release (no false positive).
import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "spike.burst@1": async () => {
      const tmp: number[][] = [];
      for (let i = 0; i < 8; i++) tmp.push(new Array(65536).fill(i));
      await new Promise((r) => setTimeout(r, 50));
      tmp.length = 0;
      return { spiked: true, recovered: true };
    },
  },
}));
