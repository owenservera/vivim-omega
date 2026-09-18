// discovery.verification — index.ts (Ω8), the ENGINE plugin wiring: THE PROMOTION GATE.
//
// Op exposed (ENGINE contribution, see plugin.json):
//   discovery.verify@1 {mapping, probes, runId?, candidates?, candidatesRef?, mappingRef?, provider?}
//     → {runId, policy, results[], promoted[], stillDraft[], orphanProbes[], candidates?, vaultRef,
//        realizations[], realizationsWritten}
//   provider?: {id, class?, parserPins?} enables ns-"providers" current-state writes (PROMOTED /
//   REQUIRES_REDISCOVERY per evaluated binding, each citing the promotion event). parserPins
//   (D-355, M7) are the parser-contribution pins the run was verified against — total-validated
//   (asParserPin), dup-checked per (providerId, archetypeSlug), and written onto EVERY realization
//   row the run produces. Absent provider disables ns-providers writes entirely (verify behaves
//   exactly as before).
//
// THE INVARIANT (the hallucination cure): a DRAFT SurfaceContract becomes
// PROMOTED only through caller-supplied postcondition probes with recorded
// evidence — score ≥ policy.threshold AND probeCount ≥ policy.requiredProbes
// AND evidence complete. Confidence is RECORDED and never read by the
// decision. The thresholds are POLICY DATA (discovery.promotion-policy@1,
// loaded from the manifest the host delivered — see policy.ts).
//
// "Evidence complete" is fail-closed and TOUCHES THE VAULT: every probe's
// evidence refs are resolved through port vault.get@1 — a ref that does not
// exist in the vault can never be part of a promotion. If the resolution leg
// itself fails (missing capability, degraded vault), every unresolved ref
// fails and the promotion report says so (resolutionNotes) — no promotion
// rides on an unverifiable proof.
//
// OUTPUT: the promotion event appended to the USER'S VAULT — one append per
// run: {ns: "discovery", id: "promotion:<runId>", data: the report, meta:
// {type: "promotion"}, refs: every probe's evidence + candidatesRef +
// mappingRef (the full proof chain)} — and, in the returned report, the
// candidates with status REWRITTEN for the promoted ones (the persisted
// candidates object is never mutated: the vault is append-only; the promotion
// event is the rewrite of record).
//
// Handlers throw on bad payloads / failed appends — DEGRADED at the boundary.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { EpistemicStatus, PortResult, ProviderClass, ProviderRealization, RealizationStatus } from "@vivim/omega-contracts";
import { archetypeSlugForOp, providerRealizationId, asParserPin, parserContributionId, type ParserPin } from "@vivim/omega-contracts";
import { loadPromotionPolicy, loadGovernedParserRegistry, isGovernedParserPin, PARSER_REGISTRY_SOURCE, POLICY_SOURCE, type PromotionPolicy } from "./policy.ts";
import { evaluatePromotion, isValidProbe, refKey, type Probe, type BindingLike } from "./evaluate.ts";

export const DISCOVERY_NS = "discovery";
export const PROVIDERS_NS = "providers";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`discovery.verification: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function requirePayloadObject(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("discovery.verify@1: payload must be an object {mapping, probes}");
  }
  return payload as Record<string, unknown>;
}

/** Tolerant mapping input: the discovery.map@1 result object or a bare mapping report {bindings, ...}. */
function normalizeMapping(v: unknown): { satisfied: boolean; bindings: BindingLike[] } {
  if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("discovery.verify@1: mapping is required (the discovery.map@1 result)");
  }
  const o = v as Record<string, unknown>;
  const inner = o.bindings === undefined && typeof o.mapping === "object" && o.mapping !== null
    ? (o.mapping as Record<string, unknown>)
    : o;
  const rawBindings = Array.isArray(inner.bindings) ? inner.bindings : null;
  if (!rawBindings) throw new Error("discovery.verify@1: mapping.bindings must be an array (the discovery.map@1 result)");
  const bindings: BindingLike[] = [];
  for (const b of rawBindings) {
    if (b === null || typeof b !== "object" || Array.isArray(b)) {
      throw new Error("discovery.verify@1: each mapping binding must be an object");
    }
    const bo = b as Record<string, unknown>;
    if (typeof bo.blueprintOp !== "string" || bo.blueprintOp.length === 0) {
      throw new Error("discovery.verify@1: binding.blueprintOp must be a non-empty string");
    }
    if (typeof bo.candidateId !== "string" || bo.candidateId.length === 0) {
      throw new Error("discovery.verify@1: binding.candidateId must be a non-empty string");
    }
    bindings.push({
      blueprintOp: bo.blueprintOp,
      candidateId: bo.candidateId,
      confidence: typeof bo.confidence === "number" ? bo.confidence : null,
    });
  }
  return { satisfied: inner.satisfied === true, bindings };
}

/** Probes: the caller's postcondition checks; each must be structurally valid (candidateId, passed, evidence refs). */
function normalizeProbes(v: unknown): Probe[] {
  if (!Array.isArray(v)) throw new Error("discovery.verify@1: probes must be an array (caller-supplied postcondition checks)");
  const out: Probe[] = [];
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    if (!isValidProbe(p)) {
      throw new Error(`discovery.verify@1: probes[${i}] is malformed — {candidateId: string, passed: boolean, evidence: [{ns,id,rev}], preState?, postState?, note?}`);
    }
    out.push({
      candidateId: p.candidateId,
      preState: p.preState,
      postState: p.postState,
      passed: p.passed,
      evidence: p.evidence.map((r) => ({ ns: r.ns, id: r.id, rev: r.rev })),
      ...(typeof p.note === "string" ? { note: p.note } : {}),
    });
  }
  return out;
}

/**
 * Resolve every cited evidence ref in the vault (vault.get@1). Returns the set
 * of resolved ref keys + notes about failures. A missing capability or a
 * degraded vault leaves refs unresolved — fail-closed: no promotion.
 */
async function resolveEvidence(ctx: PluginContext, refs: Array<{ ns: string; id: string; rev: number }>): Promise<{ resolved: Set<string>; notes: string[] }> {
  const resolved = new Set<string>();
  const notes: string[] = [];
  const unique = new Map<string, { ns: string; id: string; rev: number }>();
  for (const r of refs) unique.set(refKey(r), r);
  for (const r of unique.values()) {
    const got: PortResult = await ctx.port.call("vault.get@1", { ns: r.ns, id: r.id, rev: r.rev });
    if (got.ok) { resolved.add(refKey(r)); continue; }
    notes.push(`evidence ref ${r.ns}/${r.id}@${r.rev} unresolved: ${got.error}${got.detail ? ` (${got.detail})` : ""}`);
  }
  return { resolved, notes };
}

function optionalRunId(v: unknown): string {
  if (v === undefined || v === null) return `run-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (typeof v !== "string" || v.length === 0 || v.length > 128) {
    throw new Error("discovery.verify@1: runId must be a non-empty string (≤128 chars) when provided");
  }
  return v;
}

const PROVIDER_CLASSES = ["SIMULATOR", "API_NATIVE", "BROWSER_MEDIATED"] as const;

/** Optional realization writer identity: {id, class?, parserPins?} (class defaults SIMULATOR).
 *  Absent (undefined/null) disables ns-providers writes entirely.
 *  D-355: parserPins are total-validated (asParserPin), dup-checked per
 *  (providerId, archetypeSlug) — a run may not verify the same parser twice —
 *  and GOVERNED against the manifest-declared parser registry (the fence lives
 *  in the verify handler, before any vault write). */
function normalizeProvider(v: unknown): { id: string; class: ProviderClass; parserPins: ParserPin[] } | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new Error("discovery.verify@1: provider must be {id, class?, parserPins?}");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) {
    throw new Error("discovery.verify@1: provider.id must be a non-empty string");
  }
  if (o.id.includes(":")) {
    throw new Error("discovery.verify@1: provider.id must not contain ':' (realization id grammar)");
  }
  const cls = o.class === undefined ? "SIMULATOR" : o.class;
  if (!(PROVIDER_CLASSES as readonly string[]).includes(cls as string)) {
    throw new Error(`discovery.verify@1: provider.class must be one of ${PROVIDER_CLASSES.join("|")}`);
  }
  const pins: ParserPin[] = [];
  if (o.parserPins !== undefined) {
    if (!Array.isArray(o.parserPins)) {
      throw new Error("discovery.verify@1: provider.parserPins must be an array of ParserPin");
    }
    const seen = new Set<string>();
    for (const raw of o.parserPins) {
      const pin = asParserPin(raw); // total validation — throws with the reason
      if (pin.providerId !== o.id) {
        throw new Error(`discovery.verify@1: parser pin providerId ${pin.providerId} does not match provider.id ${o.id} (fail-closed genealogy)`);
      }
      const key = parserContributionId(pin.providerId, pin.archetypeSlug);
      if (seen.has(key)) {
        throw new Error(`discovery.verify@1: duplicate parser pin for ${key} (a run verifies a parser once)`);
      }
      seen.add(key);
      pins.push(pin);
    }
  }
  return { id: o.id, class: cls as ProviderClass, parserPins: pins };
}

/** Rewrite candidate statuses in the RETURNED report (copies; the vault object is append-only). */
function rewriteCandidates(candidates: unknown, promoted: Set<string>): unknown {
  if (!Array.isArray(candidates)) return undefined;
  return candidates.map((c) => {
    if (c === null || typeof c !== "object") return c;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : null;
    return { ...o, status: id !== null && promoted.has(id) ? "PROMOTED" : (typeof o.status === "string" ? o.status : "DRAFT") };
  });
}

/** The promotion event's provenance refs: every probe's evidence + candidatesRef + mappingRef. */
function promotionRefs(probes: Probe[], extraRefs: unknown[]): Array<{ ns: string; id: string; rev: number }> {
  const out: Array<{ ns: string; id: string; rev: number }> = [];
  const seen = new Set<string>();
  const push = (r: { ns: string; id: string; rev: number }) => {
    const k = refKey(r);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ...r });
  };
  for (const pr of probes) for (const r of pr.evidence) push(r);
  for (const e of extraRefs) {
    if (e !== null && typeof e === "object" && !Array.isArray(e)) {
      const o = e as Record<string, unknown>;
      if (typeof o.ns === "string" && typeof o.id === "string" && typeof o.rev === "number") push({ ns: o.ns, id: o.id, rev: o.rev });
    }
  }
  return out;
}

export const def = definePlugin({
  onInit: (ctx: PluginContext) => {
    // Fail-closed policy load at boot: a compartment whose manifest lost its
    // policy data refuses to serve the gate rather than inventing thresholds.
    const policy = loadPromotionPolicy(ctx.manifest);
    ctx.log(`discovery.verification up (Ω8) — promotion gate: threshold ${policy.threshold}, requiredProbes ${policy.requiredProbes}, evidenceRequired ${policy.evidenceRequired} (policy ${policy.policyId}@${policy.version} — DATA, not code)`);
  },

  ops: {
    "discovery.verify@1": async (payload: unknown, ctx: PluginContext, _meta: CallMeta) => {
      const p = requirePayloadObject(payload);
      const runId = optionalRunId(p.runId);
      const policy: PromotionPolicy = loadPromotionPolicy(ctx.manifest);
      const mapping = normalizeMapping(p.mapping);
      const probes = normalizeProbes(p.probes);

      // Provider identity + the D-355 GENEALOGY FENCE, BEFORE any vault write:
      // a run that CARRIES parser pins may only pin GOVERNED parser
      // contributions (the manifest-declared registry is the closed set).
      // Anything else is a caller invention — it refuses here, so an ungoverned
      // pin can never land a promotion event or a realization row (fail-closed;
      // the fence the W1 falsifier exercises). Absent provider / absent pins
      // disable the genealogy leg entirely (verify behaves exactly as before).
      const provider = normalizeProvider(p.provider);
      if (provider !== null && provider.parserPins.length > 0) {
        const registry = loadGovernedParserRegistry(ctx.manifest);
        for (const pin of provider.parserPins) {
          if (!isGovernedParserPin(registry, pin)) {
            throw new Error(
              `discovery.verify@1: parser pin ${parserContributionId(pin.providerId, pin.archetypeSlug)}@${pin.version} is not a governed parser contribution (${PARSER_REGISTRY_SOURCE}) — refusing (fail-closed genealogy: parsers are signed manifest data, never caller inventions)`,
            );
          }
        }
      }

      // Resolve every cited evidence ref — the vault is the proof substrate.
      const allRefs = probes.flatMap((pr) => pr.evidence);
      const { resolved, notes: resolutionNotes } = await resolveEvidence(ctx, allRefs);

      const evaluation = evaluatePromotion(policy, mapping.bindings, probes, resolved);
      const promotedSet = new Set(evaluation.promoted);
      const candidatesOut = rewriteCandidates(p.candidates, promotedSet);

      const reportData = {
        runId,
        engine: "discovery.verify@1",
        mappingSatisfied: mapping.satisfied,
        ...evaluation,
        policy: { ...evaluation.policy, source: POLICY_SOURCE }, // after the spread: source rides WITH the policy data
        resolutionNotes,
      };
      const refs = promotionRefs(probes, [p.candidatesRef, p.mappingRef]);
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: DISCOVERY_NS,
        id: `promotion:${runId}`,
        data: reportData,
        meta: { type: "promotion", runId },
        refs,
      });

      // A3 (D-319): current-state realization records, ALONGSIDE the audit-log
      // promotion event above — never instead of it. Optional payload
      // provider?: {id, class?}: absent means verify behaves exactly as before
      // (realizations: [], realizationsWritten: 0). Status per binding:
      // PROMOTED (proven) | REQUIRES_REDISCOVERY (probes ran and some failed)
      // | TESTING (probes all pass so far but proof incomplete — still under
      // evaluation). Never-probed bindings get no record (absence reads as
      // DRAFT downstream, matching the registry default).
      const realizations: Array<{ id: string; status: RealizationStatus; rev: number }> = [];
      if (provider !== null) {
        for (const r of evaluation.results) {
          const failed = r.probeCount - r.passed;
          const status: RealizationStatus | null =
            r.status === "PROMOTED" ? "PROMOTED"
            : r.probeCount === 0 ? null
            : failed > 0 ? "REQUIRES_REDISCOVERY" : "TESTING";
          if (status === null) continue;
          const slug = archetypeSlugForOp(r.blueprintOp);
          const id = providerRealizationId(slug, provider.id);
          // D-324: evidence from probes that PASSED is stamped VERIFIED
          // (probe-backed — the reserved writer adopts the reserved value
          // first); failed-probe evidence stays unmarked (claimed, not proven).
          const VERIFIED: EpistemicStatus = "VERIFIED";
          const refs = probes
            .filter((pr) => pr.candidateId === r.candidateId)
            .flatMap((pr) => pr.evidence.map((e) => pr.passed
              ? { ns: e.ns, id: e.id, rev: e.rev, epistemicStatus: VERIFIED }
              : { ns: e.ns, id: e.id, rev: e.rev }));
          const record: ProviderRealization = {
            archetypeSlug: slug,
            providerId: provider.id,
            providerClass: provider.class,
            status,
            discoverySessionRef: null,
            opMapRef: null,
            entityMapRef: null,
            streamRefs: [],
            evidenceRefs: refs,
            supersedes: null,
            createdAt: Date.now(),
            // D-355 (M7): every realization row this run writes carries the
            // pins the run was verified against (the P-D3 genealogy link).
            ...(provider.parserPins.length > 0 ? { parserPins: provider.parserPins } : {}),
          };
          const w = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
            ns: PROVIDERS_NS,
            id,
            data: record,
            meta: { type: "realization", archetype: slug, provider: provider.id, status },
            refs: [...refs, { ns: DISCOVERY_NS, id: `promotion:${runId}`, rev: append.rev }],
          });
          realizations.push({ id, status, rev: w.rev });
        }
      }

      return {
        runId,
        engine: "discovery.verify@1",
        ...reportData,
        ...(candidatesOut !== undefined ? { candidates: candidatesOut } : {}),
        vaultRef: { ns: DISCOVERY_NS, id: `promotion:${runId}`, rev: append.rev },
        realizations,
        realizationsWritten: realizations.length,
      };
    },
  },
});

startPlugin(def);
