// discovery.healing — index.ts (Ω9)
// The healing ENGINE, wired as one op:
//
//   discovery.heal@1 {contractEvidence, freshObservation, candidate, probes, now?}
//     → healing report {action: none | reject | hold-in-probation | promote, …}
//
// All decisions are computed by the pure core (./heal.ts) from the supplied
// data plus the POLICY contribution pinned by this manifest — policy is data,
// never constants. The ONE side effect is the healing event journaled to the
// user's vault (ns "discovery", id "heal:<ts>") through the port, best-effort:
// a vault failure is reported in the report (journal.appended: false + detail)
// and never blocks the healing decision — the decision stands on its evidence,
// like every other spine plugin's journaling law.
//
// The promote decision does NOT install anything: the amendment transport
// (recipe re-compile → atomic pin swap → reboot, Ω0 host machinery) is a
// separate user-signed step driven by the report (see test/integration.test.ts,
// the GATE-Ω9 end-to-end).
//
// This file exports the def explicitly: FakeHost and the conformance runner
// import the def in-process — startPlugin() no-ops safely outside a worker.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { CallMeta, PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { planHealing, readPolicy, type HealInput, type HealingReport, type SurfaceContractLike } from "./heal.ts";

/** The shape returned by heal@1 (the decision + the journal outcome). */
export type { HealingReport } from "./heal.ts";

const CAP_VAULT_APPEND = "port:vault.append@1";

function asObject(op: string, v: unknown): Record<string, unknown> {
  if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${op}: payload must be an object`);
  }
  return v as Record<string, unknown>;
}

/** Best-effort vault journaling — ONLY when the composition granted the capability. */
async function journalHealEvent(
  ctx: PluginContext,
  event: { ns: string; id: string; data: Record<string, unknown>; refs: Array<{ ns: string; id: string; rev: number }> },
  meta: CallMeta,
): Promise<HealingReport["journal"]> {
  if (!ctx.capabilities.includes(CAP_VAULT_APPEND)) {
    return { ns: event.ns, id: event.id, appended: false, detail: `capability ${CAP_VAULT_APPEND} not granted — healing decision stands, event not journaled` };
  }
  try {
    const r: PortResult = await ctx.port.call("vault.append@1", {
      ns: event.ns,
      id: event.id,
      data: event.data,
      meta: { source: "discovery.healing", causationId: meta.causationId },
      ...(event.refs.length > 0 ? { refs: event.refs } : {}),
    });
    if (r.ok) {
      const v = (r.value ?? {}) as { rev?: number; seq?: number };
      return { ns: event.ns, id: event.id, appended: true, ...(typeof v.rev === "number" ? { rev: v.rev } : {}), ...(typeof v.seq === "number" ? { seq: v.seq } : {}) };
    }
    return { ns: event.ns, id: event.id, appended: false, detail: `vault append ${r.error}: ${r.detail ?? ""}` };
  } catch (e) {
    return { ns: event.ns, id: event.id, appended: false, detail: `vault append threw: ${String(e)}` };
  }
}

export const def = definePlugin({
  ops: {
    "discovery.heal@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta) => {
      if (!ctx) throw new Error("discovery.heal@1: no plugin context (policy lives in the manifest; the vault lives behind the port)");
      const p = asObject("discovery.heal@1", payload) as HealInput & Record<string, unknown>;

      // primary inputs fail closed; everything else degrades per-axis (heal.ts)
      if (p.contractEvidence === null || p.contractEvidence === undefined || typeof p.contractEvidence !== "object") {
        throw new Error("discovery.heal@1: contractEvidence is required (the promoted contract or its evidence signature)");
      }
      if (p.freshObservation === null || p.freshObservation === undefined || typeof p.freshObservation !== "object") {
        throw new Error("discovery.heal@1: freshObservation is required (the re-observed behavior)");
      }
      const now = p.now === undefined || p.now === null ? Date.now() : (typeof p.now === "number" && Number.isFinite(p.now) ? p.now : (() => { throw new Error("discovery.heal@1: now must be a finite number when supplied"); })());

      // policy = the manifest's POLICY contribution (data pinned by the recipe)
      const policy = readPolicy(ctx.manifest);
      const decision = planHealing(
        {
          contractEvidence: p.contractEvidence as SurfaceContractLike,
          freshObservation: p.freshObservation,
          candidate: (p.candidate ?? null) as SurfaceContractLike | null,
          probes: (p.probes ?? null) as HealInput["probes"],
          now,
        },
        policy,
        now,
      );

      const journal = await journalHealEvent(ctx, decision.event, meta);
      const report: HealingReport = {
        action: decision.action,
        reason: decision.reason,
        policy: decision.policy,
        drift: decision.drift,
        ...(decision.candidate !== undefined ? { candidate: decision.candidate } : {}),
        ...(decision.probation !== undefined ? { probation: decision.probation } : {}),
        ...(decision.replacement !== undefined ? { replacement: decision.replacement } : {}),
        ...(decision.evidenceChain !== undefined ? { evidenceChain: decision.evidenceChain } : {}),
        ...(decision.gap !== undefined ? { gap: decision.gap } : {}),
        journal,
        at: now,
      };
      ctx.log(`discovery.healing: ${report.action} (${decision.reason}) — event ${journal.id} ${journal.appended ? "journaled" : "NOT journaled"}`);
      return report;
    },
  },
});

startPlugin(def);
