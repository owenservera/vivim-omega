import { definePlugin, startPlugin } from "@vivim/omega-shim";
import { principalKind } from "@vivim/omega-contracts";

// Ω0 law stub — D-353: the stand-in describe carries the REAL kind
// classification (shared contracts vocabulary) but honestly empty forbidden /
// consent state — the stub owns no tables. Compositions granting
// law.describe@1 over the stub get truthful "kind" answers and truthful
// "nothing stored" answers, never fabricated ones.
startPlugin(definePlugin({
  ops: {
    "law.check@1": (payload) => ({ decision: "allow", reason: "law-stub: allow-all (Ω0 stand-in)", principal: (payload as any)?.principal }),
    "law.registry@1": () => ({ plugins: ["vivim.law(stub)"], note: "real registry arrives with the Ω1 law plugin" }),
    "law.consent.grant@1": (payload) => ({ granted: true, stub: true, ...(payload as object) }),
    "law.describe@1": (payload) => {
      const principal = (payload as { principal?: string } | null)?.principal ?? "";
      if (!principal) throw new Error("law-stub describe: payload requires {principal}");
      return { principal, kind: principalKind(principal), forbidden: { ops: [], persisted: false }, consents: [], generation: 1 };
    },
  },
}));
