// discovery.verification — evaluate.ts (Ω8), the PURE promotion decision.
//
// PROMOTION IS PROOF, NOT CONFIDENCE. For each mapped candidate:
//   score    = passing probes / total probes for that candidate
//   passing  = probe.passed === true AND (policy.evidenceRequired → the probe
//              cites well-formed evidence that the caller RESOLVED in the
//              vault — resolution is a port concern, injected as a predicate)
//   PROMOTED ⟺ probeCount ≥ policy.requiredProbes
//              AND score ≥ policy.threshold
//              AND (policy.evidenceRequired → evidence complete)
// otherwise the candidate STAYS DRAFT with a gap report naming exactly which
// invariant failed. `confidence` is carried through, recorded, and NEVER read
// by the decision — a candidate with confidence 0.99 and score 0.6 stays
// DRAFT; a candidate with confidence 0.3 and score 1.0 promotes.
//
// Pure module: no ports, no fs, deterministic — unit-testable in-process.

import type { PromotionPolicy } from "./policy.ts";

export interface EvidenceRef { ns: string; id: string; rev: number }

/** One caller-supplied postcondition check (fixture replay harness). */
export interface Probe {
  candidateId: string;
  preState?: unknown;      // recorded fixture state before the simulated op
  postState?: unknown;     // recorded fixture state after (the postcondition is checked by the CALLER)
  passed: boolean;         // the caller's postcondition verdict
  evidence: EvidenceRef[]; // vault refs to the capture spans — MANDATORY for a passing proof
  note?: string;
}

/** The binding rows of a mapping report (discovery.map@1 output). */
export interface BindingLike {
  blueprintOp: string;
  candidateId: string;
  selector?: string;
  confidence?: number | null;
}

export type CandidateOutcome = "PROMOTED" | "DRAFT";

export interface CandidateVerification {
  candidateId: string;
  blueprintOp: string;
  probeCount: number;
  passed: number;          // probes that passed WITH valid evidence
  score: number;           // passed / probeCount (0 when no probes)
  confidence: number | null; // recorded, never decisive
  evidenceComplete: boolean;
  status: CandidateOutcome;
  gaps: string[];          // why NOT promoted (empty when promoted)
}

export interface PromotionEvaluation {
  results: CandidateVerification[];
  promoted: string[];      // candidateIds
  stillDraft: string[];    // candidateIds
  orphanProbes: Array<{ candidateId: string; count: number }>; // probes citing unmapped candidates (recorded, not errors)
  policy: PromotionPolicy;
}

function isRef(v: unknown): v is EvidenceRef {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    && typeof (v as Record<string, unknown>).ns === "string" && ((v as Record<string, unknown>).ns as string).length > 0
    && typeof (v as Record<string, unknown>).id === "string" && ((v as Record<string, unknown>).id as string).length > 0
    && typeof (v as Record<string, unknown>).rev === "number" && Number.isInteger(((v as Record<string, unknown>).rev as number)) && ((v as Record<string, unknown>).rev as number) >= 1;
}

export function isValidProbe(v: unknown): v is Probe {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.candidateId !== "string" || p.candidateId.length === 0) return false;
  if (typeof p.passed !== "boolean") return false;
  if (!Array.isArray(p.evidence)) return false;
  return p.evidence.every(isRef);
}

/** Key for dedupe/lookup of resolved refs — "ns|id|rev". */
export function refKey(r: EvidenceRef): string {
  return `${r.ns}|${r.id}|${r.rev}`;
}

/**
 * Evaluate promotion for every mapping binding. `resolved` is the set of
 * evidence refs the CALLER resolved in the vault (handler: via vault.get@1);
 * refs absent from it count as unresolvable → the proof citing them fails.
 */
export function evaluatePromotion(
  policy: PromotionPolicy,
  bindings: BindingLike[],
  probes: Probe[],
  resolved: Set<string>,
): PromotionEvaluation {
  const results: CandidateVerification[] = [];
  const promoted: string[] = [];
  const stillDraft: string[] = [];
  const mappedIds = new Set(bindings.map((b) => b.candidateId));

  // orphan probes: evidence about candidates the mapping never bound — recorded, never an error
  const orphanCounts = new Map<string, number>();
  for (const pr of probes) {
    if (!mappedIds.has(pr.candidateId)) orphanCounts.set(pr.candidateId, (orphanCounts.get(pr.candidateId) ?? 0) + 1);
  }
  const orphanProbes = [...orphanCounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([candidateId, count]) => ({ candidateId, count }));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  for (const binding of bindings) {
    const own = probes.filter((pr) => pr.candidateId === binding.candidateId);
    const gaps: string[] = [];

    const evidenceOk = (pr: Probe): boolean =>
      pr.evidence.length > 0 && pr.evidence.every((r) => resolved.has(refKey(r)));

    const evidenceComplete = own.length > 0 && own.every(evidenceOk);
    const passed = own.filter((pr) => pr.passed && (!policy.evidenceRequired || evidenceOk(pr))).length;
    const score = own.length === 0 ? 0 : passed / own.length;

    if (own.length === 0) {
      gaps.push(`no probes supplied for candidate ${binding.candidateId} (${binding.blueprintOp})`);
    } else {
      if (own.length < policy.requiredProbes) {
        gaps.push(`probeCount ${own.length} < policy.requiredProbes ${policy.requiredProbes}`);
      }
      if (score < policy.threshold) {
        gaps.push(`score ${round2(score)} < policy.threshold ${policy.threshold}`);
      }
      if (policy.evidenceRequired && !evidenceComplete) {
        const bad = own.filter((pr) => !evidenceOk(pr));
        const first = bad[0] !== undefined ? prEvidenceLabel(bad[0]) : "unknown";
        const detail = bad.length === 1 ? `probe citing ${first}` : `${bad.length} probes (first: ${first})`;
        gaps.push(`evidence incomplete — ${detail} — every probe must cite resolvable vault refs`);
      }
    }

    const promotable = gaps.length === 0;
    const status: CandidateOutcome = promotable ? "PROMOTED" : "DRAFT";
    if (promotable) promoted.push(binding.candidateId); else stillDraft.push(binding.candidateId);
    results.push({
      candidateId: binding.candidateId,
      blueprintOp: binding.blueprintOp,
      probeCount: own.length,
      passed,
      score: round2(score),
      confidence: typeof binding.confidence === "number" ? binding.confidence : null,
      evidenceComplete,
      status,
      gaps,
    });
  }

  return { results, promoted, stillDraft, orphanProbes, policy };
}

function prEvidenceLabel(pr: Probe): string {
  const refs = pr.evidence.map((r) => `${r.ns}/${r.id}@${r.rev}`).join(", ");
  return refs.length > 0 ? `${pr.candidateId} → [${refs}] (unresolved or malformed)` : `${pr.candidateId} → (no evidence refs)`;
}
