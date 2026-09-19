import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "echo.ping@1": async (payload) => {
      const p = (payload as { delayMs?: number; busyMs?: number } | null) ?? {};
      if (p.delayMs) await new Promise((r) => setTimeout(r, p.delayMs));
      if (p.busyMs) { const end = Date.now() + p.busyMs; let x = 1; while (Date.now() < end) x += Math.sqrt(x + 1); }
      return { echo: true, payload, at: Date.now() };
    },

    // D-352 falsifier op (CONTRACT/READ): emits each item of {chunks:[…]} as an
    // ordered chunk (last marked final), returns the terminating value. No
    // provider involved — this is the no-provider ordered-delivery proof the
    // D-339 record demands before any provider touches the primitive.
    // violateAfterFinal is the deliberate protocol-violation hook: the extra
    // emit throws inside the handler promise → the shim converts it into a
    // DEGRADED return (fail-closed producer side), which the falsifier asserts.
    // stallAfter/stallMs stall mid-stream so the falsifier can prove the BUDGET
    // register: the ordered prefix survives, the tail is dropped, BUDGET wins.
    "echo.stream@1": async (payload, _ctx, meta) => {
      const p = (payload ?? {}) as { chunks?: unknown[]; violateAfterFinal?: boolean; stallAfter?: number; stallMs?: number };
      const items = Array.isArray(p.chunks) ? p.chunks : [];
      for (let i = 0; i < items.length; i++) {
        if (p.stallAfter !== undefined && p.stallMs && i === p.stallAfter) await new Promise((r) => setTimeout(r, p.stallMs));
        meta.emit(items[i], i === items.length - 1);
      }
      if (p.violateAfterFinal) meta.emit("after-final", true);
      return { echo: true, streamed: items.length, at: Date.now() };
    },
  },
}));
