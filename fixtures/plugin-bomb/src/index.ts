// omega.bomb — D-360 falsifier fixture. Two consumption modes:
//   mode "spin": a synchronous infinite loop — wedges the worker's event loop,
//                so shim probe responses become impossible (the unresponsive leg),
//                with ZERO net allocation (no OOM risk to the test process).
//   mode "heap": a responsive heap bomber — keeps the loop alive (probeStat keeps
//                arriving) while growing old-gen objects past the declared budget
//                (~1MB per 25ms ≈ 40MB/s; crosses 32MB well inside the sample window,
//                detected before it can threaten the host process).
import { definePlugin, startPlugin } from "../../../shim/src/index.ts"; // the shim, by path — fixtures/ is not a workspace package (D-360 fixture note)

startPlugin(definePlugin({
  ops: {
    "bomb.alloc@1": (payload: { mode?: string }) => {
      const mode = payload?.mode ?? "heap";
      if (mode === "spin") {
        let x = 1;
        for (;;) { x += Math.sqrt(x + 1); if (!Number.isFinite(x) || x > 1e15) x = 1; }
      }
      const keep: number[][] = [];
      const timer = setInterval(() => { keep.push(new Array(131072).fill(0)); }, 25);
      (timer as unknown as { unref?: () => void }).unref?.();
      return { started: mode };
    },
  },
}));
