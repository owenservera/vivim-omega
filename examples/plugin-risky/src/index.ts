// omega.risky — Ω1 gate fixture. risky.op@1 declares EXTERNAL_MUTATION (routed through
// law.check by the µhost); risky.read@1 declares READ (never gated). No outbound caps.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "risky.read@1": (payload) => ({ read: true, payload, at: Date.now() }),
    "risky.op@1": (payload) => ({ mutated: payload }),
  },
}));
