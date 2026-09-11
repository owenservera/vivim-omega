import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(definePlugin({
  ops: {
    "law.check@1": (payload) => ({ decision: "allow", reason: "law-stub: allow-all (Ω0 stand-in)", principal: (payload as any)?.principal }),
    "law.registry@1": () => ({ plugins: ["vivim.law(stub)"], note: "real registry arrives with the Ω1 law plugin" }),
    "law.consent.grant@1": (payload) => ({ granted: true, stub: true, ...(payload as object) }),
  },
}));
