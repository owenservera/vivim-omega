// discovery.healing — heal.ts (Ω9)
// The healing loop's PURE core: policy extraction, drift detection, candidate
// validation, probation evaluation, and report assembly. One deterministic
// function over supplied data — no clocks, no IO, no ambient state (the only
// non-determinism, the event timestamp, is supplied by the caller/wiring).
//
// Input tolerance law: the discovery pipeline's DATA shapes arrive as plain
// JSON payloads (SurfaceContract candidates, probe results, promotion policy)
// and this module NEVER imports discovery-* code — the shapes are mirrored
// here as tolerant optional fields, so a missing or extra field degrades an
// AXIS, never the whole operation.
//
// The loop (this file implements stages 1–4; the atomic install is host
// machinery driven by the promote decision, see test/integration.test.ts):
//   1. DRIFT        promoted evidence signature vs fresh observation
//   2. REDISCOVERY  replacement candidate must cite evidence (and match the
//                   re-observed behavior — rediscovery runs against fresh
//                   captures, not against memory)
//   3. PROBATION    postcondition probes scored against the POLICY threshold
//   4. PROMOTION    score ≥ threshold AND enough probes → promote; else hold

import type { PluginManifest } from "@vivim/omega-contracts";

// ---- tolerant data shapes (the discovery pipeline's outputs, as plain JSON) ----

/** A SurfaceContract as produced by the discovery pipeline (Ω7/Ω8) or read from the vault. */
export interface SurfaceContractLike {
  op?: string;
  selector?: string;
  actionType?: string;
  riskHint?: string;
  evidence?: unknown;               // captures the contract cites (array | object | string)
  status?: "DRAFT" | "PROMOTED" | "REJECTED" | string;
  confidence?: number;
  /** Expected outcome rates recorded at promotion time (tolerated axis). */
  outcomeRates?: Record<string, number>;
  id?: string;                      // candidate identity (probes reference it)
  candidateId?: string;             // tolerated alias
  /** Vault address of this contract object — used as the provenance ref for heal events. */
  address?: { ns: string; id: string; rev: number };
}

/** The re-observed behavior of the live target (fresh capture). */
export interface FreshObservationLike {
  op?: string;
  selector?: string;
  actionType?: string;
  riskHint?: string;
  outcomeRates?: Record<string, number>;
}

/** One postcondition probe result: run the candidate, check the world after. */
export interface ProbeResultLike {
  candidateId?: string;
  preState?: unknown;
  postState?: unknown;
  passed?: boolean;
}

/** The healing policy — versioned DATA pinned by the manifest's POLICY contribution. */
export interface HealingPolicy {
  policyId: string;
  version: string;
  driftThreshold: number;
  probationProbes: number;
  promotionThreshold: number;
}

/** The heal@1 payload (tolerant: every field is optional; primaries are validated fail-closed). */
export interface HealInput {
  contractEvidence?: SurfaceContractLike;
  freshObservation?: FreshObservationLike;
  candidate?: SurfaceContractLike | null;
  probes?: ProbeResultLike[] | null;
  now?: number;
  /** D-326: identity of the realized provider whose current state this drift
   *  concerns — {id, class?} (class defaults SIMULATOR). Absent → the
   *  realization write is skipped with a named reason (the decision still stands). */
  provider?: { id?: unknown; class?: unknown } | null;
  /** D-326: explicit archetype slug. Absent → derived from
   *  contractEvidence.op (same rule as verification). */
  archetypeSlug?: unknown;
}

// ---- policy extraction (policy is data, not constants) --------------------------

/**
 * Read the healing policy from a manifest's POLICY contribution
 * (`discovery.healing-policy@<version>`). Missing or malformed policy fails
 * CLOSED — a healing engine without its thresholds is not a healing engine.
 */
export function readPolicy(manifest: PluginManifest | { contributions?: PluginManifest["contributions"] }): HealingPolicy {
  const list = (manifest as PluginManifest).contributions?.policy ?? [];
  const c = list.find((x) => x.id === "discovery.healing-policy");
  if (!c) throw new Error("discovery.heal@1: manifest carries no policy contribution 'discovery.healing-policy' — policy is DATA and must be pinned by the manifest (fail-closed)");
  const raw = c as typeof c & Record<string, unknown>;
  const driftThreshold = raw.driftThreshold;
  const probationProbes = raw.probationProbes;
  const promotionThreshold = raw.promotionThreshold;
  if (typeof driftThreshold !== "number" || !(driftThreshold > 0 && driftThreshold <= 1)) {
    throw new Error(`discovery.heal@1: policy driftThreshold must be a number in (0, 1] (got ${String(driftThreshold)})`);
  }
  if (typeof probationProbes !== "number" || !Number.isInteger(probationProbes) || probationProbes < 1) {
    throw new Error(`discovery.heal@1: policy probationProbes must be an integer >= 1 (got ${String(probationProbes)})`);
  }
  if (typeof promotionThreshold !== "number" || !(promotionThreshold > 0 && promotionThreshold <= 1)) {
    throw new Error(`discovery.heal@1: policy promotionThreshold must be a number in (0, 1] (got ${String(promotionThreshold)})`);
  }
  return { policyId: `${c.id}@${c.version}`, version: String(c.version), driftThreshold, probationProbes, promotionThreshold };
}

// ---- drift detection (stage 1) --------------------------------------------------

export interface DriftAxisReport {
  axis: string;          // "selector" | "actionType" | "riskHint" | "outcomeRates"
  compared: boolean;     // both sides supplied the field
  diff: number;          // normalized divergence ∈ [0, 1] (0 when not compared)
}

export interface DriftReport {
  score: number;         // the WORST normalized axis divergence (fail-sensitive)
  axes: DriftAxisReport[];
  note?: string;
}

/** Dice bigram similarity ∈ [0,1] — graded, deterministic string affinity. */
function bigramDice(a: string, b: string): number {
  const grams = (s: string): string[] => { const out: string[] = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
  const A = grams(a), B = grams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of B) { const c = counts.get(g) ?? 0; if (c > 0) { inter++; counts.set(g, c - 1); } }
  return (2 * inter) / (A.length + B.length);
}

function stringAxis(axis: string, a: unknown, b: unknown, graded: boolean): DriftAxisReport {
  if (typeof a !== "string" || a.length === 0 || typeof b !== "string" || b.length === 0) {
    return { axis, compared: false, diff: 0 };
  }
  if (a === b) return { axis, compared: true, diff: 0 };
  if (!graded) return { axis, compared: true, diff: 1 };
  return { axis, compared: true, diff: 1 - bigramDice(a, b) };
}

function isRates(v: unknown): v is Record<string, number> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  for (const x of Object.values(v)) if (typeof x !== "number" || !Number.isFinite(x)) return false;
  return true;
}

/** outcomeRates divergence: normalized L1 over the key union (each side's missing key = 0), clamped to [0,1]. */
function ratesAxis(a: unknown, b: unknown): DriftAxisReport {
  if (!isRates(a) || !isRates(b) || Object.keys(a).length === 0) return { axis: "outcomeRates", compared: false, diff: 0 };
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  let l1 = 0;
  for (const k of keys) l1 += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return { axis: "outcomeRates", compared: true, diff: Math.min(1, l1 / 2) };
}

/**
 * Drift = the worst normalized axis divergence. A full flip on ANY single
 * behavioral axis is complete drift (fail-sensitive — corroboration on other
 * axes can never mask a diverged one); cosmetic jitter on one axis (a selector
 * grown by one character) stays proportionally small.
 */
export function computeDrift(contract: SurfaceContractLike, observation: FreshObservationLike): DriftReport {
  const axes: DriftAxisReport[] = [
    stringAxis("selector", contract.selector, observation.selector, true),   // graded: selectors drift by degrees
    stringAxis("actionType", contract.actionType, observation.actionType, false),
    stringAxis("riskHint", contract.riskHint, observation.riskHint, false),
    ratesAxis(contract.outcomeRates, observation.outcomeRates),
  ];
  const compared = axes.filter((x) => x.compared);
  const score = compared.length === 0 ? 0 : Math.max(...compared.map((x) => x.diff));
  return { score, axes, ...(compared.length === 0 ? { note: "no comparable axes — the supplied evidence and observation share no behavioral field" } : {}) };
}

// ---- rediscovery (stage 2) ------------------------------------------------------

/** How many evidence items a candidate cites (0 = cites nothing). */
export function evidenceCited(candidate: SurfaceContractLike): number {
  const e = candidate.evidence;
  if (Array.isArray(e)) return e.length;
  if (typeof e === "string") return e.length > 0 ? 1 : 0;
  if (typeof e === "object" && e !== null) return Object.keys(e).length;
  return 0;
}

export type CandidateCheck =
  | { ok: true; candidateId: string | null; cited: number }
  | { ok: false; reason: string };

/**
 * A replacement candidate is admissible when it (a) cites evidence, (b) targets
 * the SAME op as the drifted contract, and (c) matches the fresh observation's
 * selector — rediscovery runs against fresh captures, not against memory.
 */
export function validateCandidate(
  candidate: SurfaceContractLike | null | undefined,
  contract: SurfaceContractLike,
  observation: FreshObservationLike,
): CandidateCheck {
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, reason: "no replacement candidate supplied — rediscovery must produce a DRAFT SurfaceContract before probation" };
  }
  const cited = evidenceCited(candidate);
  if (cited === 0) {
    return { ok: false, reason: "replacement candidate cites no evidence — a candidate promoted without captures would be a guess, not a rediscovery" };
  }
  if (typeof contract.op === "string" && typeof candidate.op === "string" && candidate.op !== contract.op) {
    return { ok: false, reason: `candidate op ${candidate.op} does not match the drifted contract op ${contract.op}` };
  }
  if (typeof observation.selector === "string" && observation.selector.length > 0
    && typeof candidate.selector === "string" && candidate.selector.length > 0
    && candidate.selector !== observation.selector) {
    return { ok: false, reason: `candidate selector ${JSON.stringify(candidate.selector)} does not match the fresh observation ${JSON.stringify(observation.selector)} — rediscovery must cite the re-observed behavior` };
  }
  return { ok: true, candidateId: candidate.id ?? candidate.candidateId ?? null, cited };
}

// ---- probation (stage 3) --------------------------------------------------------

export interface ProbationReport {
  passed: number;          // probes with passed === true (for this candidate)
  total: number;           // admissible probes (candidateId matches, when the candidate has an id)
  required: number;        // policy.probationProbes
  score: number;           // passed / total (0 when total = 0)
  threshold: number;       // policy.promotionThreshold
  excluded: number;        // probes referencing a DIFFERENT candidate
}

/** Evaluate postcondition probes against the candidate under the promotion policy. */
export function evaluateProbation(
  probes: ProbeResultLike[] | null | undefined,
  candidateId: string | null,
  policy: HealingPolicy,
): ProbationReport {
  const all = Array.isArray(probes) ? probes : [];
  let total = 0, passed = 0, excluded = 0;
  for (const p of all) {
    if (candidateId !== null && typeof p.candidateId === "string" && p.candidateId.length > 0 && p.candidateId !== candidateId) {
      excluded++;
      continue;
    }
    total++;
    if (p.passed === true) passed++;
  }
  return {
    passed,
    total,
    required: policy.probationProbes,
    score: total > 0 ? passed / total : 0,
    threshold: policy.promotionThreshold,
    excluded,
  };
}

// ---- the report + decision assembly (stages 1→4 as one pure function) -----------

export type HealingAction = "none" | "reject" | "hold-in-probation" | "promote";

export interface EvidenceLink {
  stage: "drift" | "rediscovery" | "probation" | "promotion";
  detail: Record<string, unknown>;
}

export interface GapReport {
  score: number;
  threshold: number;
  scoreGap: number;
  probesNeeded: number;
}

export interface HealingDecision {
  action: HealingAction;
  reason: string;
  policy: HealingPolicy & { source: string };
  drift: DriftReport;
  candidate?: { id: string | null; status?: string; evidenceCited: number };
  probation?: ProbationReport;
  replacement?: SurfaceContractLike;
  evidenceChain?: EvidenceLink[];
  gap?: GapReport;
  /** The vault event to journal (ns discovery, id heal:<ts>) — data carries the full chain. */
  event: { ns: "discovery"; id: string; data: Record<string, unknown>; refs: Array<{ ns: string; id: string; rev: number }> };
}

/** The op's RETURN shape: the decision plus the journal outcome (never the event data itself — that went to the vault). */
export interface HealingReport extends Omit<HealingDecision, "event"> {
  journal: {
    ns: string;
    id: string;
    appended: boolean;
    rev?: number;
    seq?: number;
    detail?: string;
  };
  /** D-326: the ns-"providers" current-state write (DEGRADED on drift, TESTING
   *  on probation entry), filled by the wiring — never by the pure core. */
  realization?: RealizationWriteOutcome;
  at: number;
}

/** Outcome of the healing realization write (ns "providers"). `written: false`
 *  is DATA, not an exception: the healing decision stands on its evidence like
 *  every other spine plugin's journaling law — but the reason is always named. */
export interface RealizationWriteOutcome {
  written: boolean;
  id?: string;
  status?: "DEGRADED" | "TESTING";
  rev?: number;
  detail?: string;
}

function policyEcho(policy: HealingPolicy): HealingPolicy & { source: string } {
  return { ...policy, source: `manifest POLICY contribution ${policy.policyId}` };
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * The healing loop as ONE deterministic operation. Primary inputs
 * (contractEvidence, freshObservation) are validated fail-closed by the CALLER
 * (the op handler) before this runs; everything else degrades per-axis.
 */
export function planHealing(input: HealInput, policy: HealingPolicy, now: number): HealingDecision {
  const contract = input.contractEvidence!;
  const observation = input.freshObservation!;
  const pol = policyEcho(policy);

  // stage 1 — drift
  const drift = computeDrift(contract, observation);
  const eventId = `heal:${now}`;
  const base = {
    policy: pol,
    drift: { ...drift, score: round(drift.score) },
    event: {
      ns: "discovery" as const,
      id: eventId,
      data: {},           // filled per-branch below
      refs: contract.address && typeof contract.address.ns === "string"
        && typeof contract.address.id === "string" && typeof contract.address.rev === "number"
        ? [{ ns: contract.address.ns, id: contract.address.id, rev: contract.address.rev }]
        : [],
    },
  };

  const eventData = (action: HealingAction, reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    source: "discovery.healing",
    op: "discovery.heal@1",
    action,
    reason,
    contractOp: contract.op ?? null,
    policy: { policyId: pol.policyId, driftThreshold: pol.driftThreshold, probationProbes: pol.probationProbes, promotionThreshold: pol.promotionThreshold },
    drift: { score: round(drift.score), axes: drift.axes },
    at: now,
    ...extra,
  });

  // below threshold → nothing to heal
  if (drift.score < policy.driftThreshold) {
    const reason = `drift ${round(drift.score)} below threshold ${policy.driftThreshold} — the promoted contract still matches the observation`;
    return {
      ...base,
      action: "none",
      reason,
      event: { ...base.event, data: eventData("none", reason) },
    };
  }

  // stage 2 — rediscovery
  const check = validateCandidate(input.candidate, contract, observation);
  const candidateEcho = input.candidate
    ? { id: check.ok ? check.candidateId : (input.candidate.id ?? input.candidate.candidateId ?? null), status: input.candidate.status, evidenceCited: evidenceCited(input.candidate) }
    : undefined;
  if (!check.ok) {
    return {
      ...base,
      action: "reject",
      reason: check.reason,
      ...(candidateEcho ? { candidate: candidateEcho } : {}),
      event: { ...base.event, data: eventData("reject", check.reason, { candidate: candidateEcho ?? null }) },
    };
  }

  // stage 3 — probation
  const probation = evaluateProbation(input.probes, check.candidateId, policy);
  const chain: EvidenceLink[] = [
    {
      stage: "drift",
      detail: { score: round(drift.score), threshold: policy.driftThreshold, axes: drift.axes, contractOp: contract.op ?? null, observedSelector: observation.selector ?? null },
    },
    {
      stage: "rediscovery",
      detail: { candidateId: check.candidateId, evidenceCited: check.cited, candidateSelector: input.candidate!.selector ?? null, matchesObservation: true },
    },
    {
      stage: "probation",
      detail: { passed: probation.passed, total: probation.total, required: probation.required, score: round(probation.score, 4), threshold: probation.threshold, excluded: probation.excluded },
    },
  ];

  // stage 4 — promotion gate
  const scoreOk = probation.score >= policy.promotionThreshold;
  const probesOk = probation.total >= policy.probationProbes;
  if (scoreOk && probesOk) {
    const replacement: SurfaceContractLike = { ...input.candidate!, status: "PROMOTED" }; // the promote flips DRAFT → PROMOTED
    chain.push({
      stage: "promotion",
      detail: {
        action: "promote",
        replacement: { op: replacement.op ?? null, selector: replacement.selector ?? null, actionType: replacement.actionType ?? null, status: "PROMOTED", confidence: replacement.confidence ?? null },
        install: "amendment-transport: recipe re-compile + atomic pin swap (host machinery, B4)",
      },
    });
    const reason = `probation ${probation.passed}/${probation.total} (score ${round(probation.score)}) ≥ promotionThreshold ${policy.promotionThreshold} with ${probation.total} ≥ ${policy.probationProbes} required probes — promote`;
    return {
      ...base,
      action: "promote",
      reason,
      candidate: candidateEcho,
      probation,
      replacement,
      evidenceChain: chain,
      event: {
        ...base.event,
        data: eventData("promote", reason, {
          replacement,
          probation: { passed: probation.passed, total: probation.total, score: round(probation.score) },
          evidenceChain: chain,
          install: "amendment-transport: recipe re-compile + atomic pin swap (host machinery, B4)",
        }),
      },
    };
  }

  const gap: GapReport = {
    score: round(probation.score),
    threshold: policy.promotionThreshold,
    scoreGap: round(Math.max(0, policy.promotionThreshold - probation.score)),
    probesNeeded: Math.max(0, policy.probationProbes - probation.total),
  };
  chain.push({
    stage: "promotion",
    detail: { action: "hold-in-probation", gap, reason: "score or probe count below policy — the candidate stays in shadow probation" },
  });
  const reason = !probesOk
    ? `probation carried ${probation.total} of ${policy.probationProbes} required probes — hold in probation`
    : `probation score ${round(probation.score)} < promotionThreshold ${policy.promotionThreshold} — hold in probation`;
  return {
    ...base,
    action: "hold-in-probation",
    reason,
    candidate: candidateEcho,
    probation,
    evidenceChain: chain,
    gap,
    event: {
      ...base.event,
      data: eventData("hold-in-probation", reason, {
        probation: { passed: probation.passed, total: probation.total, score: round(probation.score) },
        gap,
        evidenceChain: chain,
      }),
    },
  };
}
