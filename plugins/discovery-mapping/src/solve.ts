// discovery.mapping — solve.ts (Ω8), the PURE constraint solver.
//
// THE CONSTRAINT PROBLEM: given inferred candidate SurfaceContracts and the
// domain pack's blueprint (its CONTRACT contributions), bind each blueprint op
// to EXACTLY ONE candidate such that:
//   C1 op-name match:     candidate.op === baseOp(blueprintOp)   ("message.send")
//   C2 selector non-empty: the candidate has a real selectorHint
//   C3 risk compatibility: candidate.riskHint === blueprintOp.risk (STRICT —
//      blueprint EXTERNAL_MUTATION needs candidate riskHint EXTERNAL_MUTATION;
//      a mismatch is a GAP, never a silent bind)
// A blueprint op with no bindable candidate → UNSAT + gap {missingOp, reason}
// (the reason distinguishes "no candidate inferred" from "risk mismatch" from
// "empty selector"). Candidates not bound are SURPLUS — recorded, never an
// error (the blueprint is the domain's demand; extra surfaces are supply).
// When several candidates satisfy the same op, the solver picks ONE
// deterministically (confidence desc, evidence count desc, id asc — recorded,
// never silent) and lists the rest as alternatives in the binding + surplus.
//
// Pure module: no ports, no fs, deterministic — unit-testable in-process.

import type { Blueprint, BlueprintOp } from "./blueprint.ts";
import { baseOp } from "./blueprint.ts";

/** The candidate input shape (the discovery.surfacecontract@1 fields the solver needs). */
export interface CandidateLike {
  id: string;
  op: string;
  selector: string;
  riskHint: string;
  evidence?: Array<{ ns: string; id: string; rev: number }>;
  confidence?: number;
  status?: string;
  /** Explicit variation channel hint ("KEYBOARD", "MENU_PATH", ...). Absent →
   *  variations.ts defaults to UI_ELEMENT (no inference without evidence). */
  channel?: string;
}

export interface Binding {
  blueprintOp: string;       // "message.send@1"
  candidateId: string;
  selector: string;
  riskHint: string;
  confidence: number | null;
  evidenceCount: number;
  alternatives: string[];    // other eligible candidate ids for the same op (recorded)
}

export interface MappingGap { missingOp: string; reason: string }

export interface SurplusEntry { candidateId: string; op: string; reason: string }

export interface MappingReport {
  satisfied: boolean;
  bindings: Binding[];
  gaps: MappingGap[];
  surplus: SurplusEntry[];
  stats: { blueprintOps: number; candidates: number; bound: number; gaps: number; surplus: number };
  blueprintSource: string;
}

/** Deterministic best-pick: confidence desc → evidence count desc → id asc. */
function pickBest(pool: CandidateLike[]): CandidateLike {
  return [...pool].sort((a, b) => {
    const ca = typeof a.confidence === "number" ? a.confidence : -1;
    const cb = typeof b.confidence === "number" ? b.confidence : -1;
    if (ca !== cb) return cb - ca;
    const ea = a.evidence?.length ?? 0;
    const eb = b.evidence?.length ?? 0;
    if (ea !== eb) return eb - ea;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** Solve the binding constraints. Blueprint ops are processed in declaration order. */
export function solveMapping(candidates: CandidateLike[], blueprint: Blueprint): MappingReport {
  const bindings: Binding[] = [];
  const gaps: MappingGap[] = [];
  const surplus: SurplusEntry[] = [];
  const bound = new Set<string>();

  for (const bp of blueprint.ops) {
    const want = baseOp(bp.op);
    const opMatches = candidates.filter((c) => c.op === want);
    if (opMatches.length === 0) {
      const inferredOps = [...new Set(candidates.map((c) => c.op))].sort().join(", ") || "(none)";
      gaps.push({ missingOp: bp.op, reason: `no candidate with op ${want} (inferred ops: ${inferredOps})` });
      continue;
    }
    const eligible = opMatches.filter((c) => c.selector.length > 0 && c.riskHint === bp.risk);
    if (eligible.length === 0) {
      const reasons = opMatches.map((c) =>
        c.selector.length === 0
          ? `${c.id}: empty selector`
          : `${c.id}: risk mismatch (${c.riskHint} != ${bp.risk})`,
      );
      gaps.push({ missingOp: bp.op, reason: `op match exists but none eligible — ${reasons.join("; ")}` });
      continue;
    }
    const best = pickBest(eligible);
    bound.add(best.id);
    bindings.push({
      blueprintOp: bp.op,
      candidateId: best.id,
      selector: best.selector,
      riskHint: best.riskHint,
      confidence: typeof best.confidence === "number" ? best.confidence : null,
      evidenceCount: best.evidence?.length ?? 0,
      alternatives: eligible.filter((c) => c.id !== best.id).map((c) => c.id),
    });
  }

  // Surplus: every candidate not bound (never an error — recorded supply).
  const boundOpByCandidate = new Map<string, string>();
  for (const b of bindings) boundOpByCandidate.set(b.candidateId, b.blueprintOp);
  for (const c of candidates) {
    if (bound.has(c.id)) continue;
    const want = boundOpByCandidate.get(c.id);
    let inBlueprintButRejected = false;
    for (const bp of blueprint.ops) {
      if (baseOp(bp.op) === c.op) { inBlueprintButRejected = true; break; }
    }
    const reason = want
      ? `alternative not selected for ${want} (bound elsewhere; lower rank by tie-break: confidence desc, evidence desc, id asc)`
      : inBlueprintButRejected
        ? `op ${c.op} is required by the blueprint but this candidate was ineligible (empty selector or risk mismatch)`
        : `op ${c.op} is not required by the blueprint (supply without demand)`;
    surplus.push({ candidateId: c.id, op: c.op, reason });
  }

  return {
    satisfied: gaps.length === 0,
    bindings,
    gaps,
    surplus,
    stats: {
      blueprintOps: blueprint.ops.length,
      candidates: candidates.length,
      bound: bindings.length,
      gaps: gaps.length,
      surplus: surplus.length,
    },
    blueprintSource: blueprint.source,
  };
}
