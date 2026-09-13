// discovery.healing — index.ts (Ω9, D-326 G1 closure)
// The healing ENGINE, wired as one op:
//
//   discovery.heal@1 {contractEvidence, freshObservation, candidate, probes, now?, provider?, archetypeSlug?}
//     → healing report {action: none | reject | hold-in-probation | promote, …, realization}
//
// All decisions are computed by the pure core (./heal.ts) from the supplied
// data plus the POLICY contribution pinned by this manifest — policy is data,
// never constants. TWO vault side effects, both reported, neither blocking the
// decision (the decision stands on its evidence, like every other spine
// plugin's journaling law):
//   1. the healing event journaled to ns "discovery" (best-effort, pre-existing);
//   2. D-326: the current-state realization record in ns "providers"
//      (DEGRADED on drift, TESTING on probation entry) — via
//      providerRealizationId(), never hand-concatenated, superseding the prior
//      rev and citing the drift observation. `none` (no drift) and `promote`
//      (verify owns promotion) write no realization — the report says so.
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
import type { PortResult, ProviderClass, ProviderRealization, VaultProvenanceRef } from "@vivim/omega-contracts";
import { archetypeSlugForOp, providerRealizationId } from "@vivim/omega-contracts";
import { planHealing, readPolicy, type HealInput, type HealingReport, type RealizationWriteOutcome, type SurfaceContractLike } from "./heal.ts";

/** The shape returned by heal@1 (the decision + the journal outcome). */
export type { HealingReport } from "./heal.ts";

const CAP_VAULT_APPEND = "port:vault.append@1";
const CAP_VAULT_GET = "port:vault.get@1";
const PROVIDERS_NS = "providers";

const PROVIDER_CLASSES = ["SIMULATOR", "API_NATIVE", "BROWSER_MEDIATED"] as const;

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

/** D-326: current-state realization write (ns "providers").
 *  reject (drift, no admissible candidate) → DEGRADED; hold-in-probation
 *  (candidate admitted, probation underway) → TESTING. `none` (no drift) and
 *  `promote` (promotion is verify's authority) write nothing.
 *  Never throws: every skip/failure is DATA in the outcome (the healing
 *  decision stands on its evidence; the report names why the state wasn't
 *  recorded). Id via providerRealizationId(), never hand-concatenated. */
async function writeRealizationStatus(
  ctx: PluginContext,
  args: {
    action: string;
    contract: SurfaceContractLike;
    provider: unknown;
    archetypeSlug: unknown;
    journal: HealingReport["journal"];
    now: number;
  },
): Promise<RealizationWriteOutcome> {
  const { action, contract, now } = args;
  const status = action === "reject" ? "DEGRADED" : action === "hold-in-probation" ? "TESTING" : null;
  if (status === null) {
    return {
      written: false,
      detail: `no realization write for action "${action}" (none: no drift; promote: promotion is discovery.verify@1's authority)`,
    };
  }
  if (!ctx.capabilities.includes(CAP_VAULT_APPEND)) {
    return { written: false, detail: `capability ${CAP_VAULT_APPEND} not granted — drift state not recorded` };
  }
  // Identity: explicit slug wins, else derive from the drifted contract's op.
  let slug: string;
  if (typeof args.archetypeSlug === "string" && args.archetypeSlug.length > 0) {
    slug = args.archetypeSlug;
  } else if (typeof contract.op === "string" && contract.op.length > 0) {
    try {
      slug = archetypeSlugForOp(contract.op);
    } catch (e) {
      return { written: false, detail: `cannot derive archetype slug from contract op: ${String(e)}` };
    }
  } else {
    return { written: false, detail: "no archetypeSlug supplied and contractEvidence.op absent — status not attributable" };
  }
  const prov = (args.provider ?? null) as { id?: unknown; class?: unknown } | null;
  if (prov === null || typeof prov !== "object" || typeof prov.id !== "string" || prov.id.length === 0) {
    return { written: false, detail: "no provider identity supplied (heal@1 provider?: {id, class?}) — status not attributable" };
  }
  const cls: ProviderClass = prov.class === undefined ? "SIMULATOR" : (prov.class as ProviderClass);
  if (!(PROVIDER_CLASSES as readonly string[]).includes(cls)) {
    return { written: false, detail: `provider.class must be one of ${PROVIDER_CLASSES.join("|")} (got ${JSON.stringify(prov.class)})` };
  }
  let id: string;
  try {
    id = providerRealizationId(slug, prov.id);
  } catch (e) {
    return { written: false, detail: `unrealizable provider identity: ${String(e)}` };
  }
  // Prior rev: supersedes lineage + carry-forward of verify's evidence chain.
  // vault.get is read-only diagnosis support — a missing cap degrades to a
  // fresh record (noted), never blocks the write.
  let priorData: Record<string, unknown> | null = null;
  let priorRev: number | null = null;
  if (ctx.capabilities.includes(CAP_VAULT_GET)) {
    try {
      const got: PortResult = await ctx.port.call("vault.get@1", { ns: PROVIDERS_NS, id });
      if (got.ok) {
        const v = got.value as { rev?: unknown; data?: unknown };
        if (typeof v.rev === "number" && v.data !== null && typeof v.data === "object" && !Array.isArray(v.data)) {
          priorData = v.data as Record<string, unknown>;
          priorRev = v.rev;
        }
      }
    } catch {
      priorData = null; // read failure degrades to a fresh record below
    }
  }
  // Evidence: the drifted contract's vault address (when supplied) + this heal
  // event's own revision (when journaled) — the realization cites its proof.
  const evidenceRefs: VaultProvenanceRef[] = [];
  const addr = (contract as { address?: unknown }).address as { ns?: unknown; id?: unknown; rev?: unknown } | undefined;
  if (addr && typeof addr.ns === "string" && typeof addr.id === "string" && typeof addr.rev === "number") {
    evidenceRefs.push({ ns: addr.ns, id: addr.id, rev: addr.rev });
  }
  if (args.journal.appended && typeof args.journal.rev === "number") {
    evidenceRefs.push({ ns: args.journal.ns, id: args.journal.id, rev: args.journal.rev });
  }
  const record: ProviderRealization = {
    archetypeSlug: slug,
    providerId: prov.id,
    providerClass: cls,
    status,
    discoverySessionRef: (priorData?.["discoverySessionRef"] as ProviderRealization["discoverySessionRef"]) ?? null,
    opMapRef: (priorData?.["opMapRef"] as ProviderRealization["opMapRef"]) ?? null,
    entityMapRef: (priorData?.["entityMapRef"] as ProviderRealization["entityMapRef"]) ?? null,
    streamRefs: Array.isArray(priorData?.["streamRefs"]) ? (priorData!["streamRefs"] as ProviderRealization["streamRefs"]) : [],
    evidenceRefs,
    supersedes: priorRev !== null ? { ns: PROVIDERS_NS, id, rev: priorRev } : null,
    createdAt: now,
  };
  try {
    const r: PortResult = await ctx.port.call("vault.append@1", {
      ns: PROVIDERS_NS,
      id,
      data: record,
      meta: { type: "realization", archetype: slug, provider: prov.id, status, writer: "discovery.healing" },
      refs: evidenceRefs,
    });
    if (!r.ok) return { written: false, id, status, detail: `vault append ${r.error}: ${r.detail ?? ""}` };
    const v = (r.value ?? {}) as { rev?: number };
    return { written: true, id, status, ...(typeof v.rev === "number" ? { rev: v.rev } : {}) };
  } catch (e) {
    return { written: false, id, status, detail: `vault append threw: ${String(e)}` };
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
      const realization = await writeRealizationStatus(ctx, {
        action: decision.action,
        contract: p.contractEvidence as SurfaceContractLike,
        provider: p.provider,
        archetypeSlug: p.archetypeSlug,
        journal,
        now,
      });
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
        realization,
        at: now,
      };
      ctx.log(`discovery.healing: ${report.action} (${decision.reason}) — event ${journal.id} ${journal.appended ? "journaled" : "NOT journaled"}; realization ${realization.written ? `${realization.id} → ${realization.status} rev ${realization.rev}` : `NOT written (${realization.detail})`}`);
      return report;
    },
  },
});

startPlugin(def);
