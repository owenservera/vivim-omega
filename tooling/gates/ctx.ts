// tooling/gates/ctx.ts — D-433 (Ω-3 port of paper D-427): Context Assembly, the Mind Spine.
//
// No realization ever reads the vault. Realizations receive sealed contexts,
// assembled by core, under the governor, through the law. Selection is
// deterministic-first; semantic scorers participate only as badged grantable
// realizations; summarization is a nested sealed atom; forgetting propagates
// as named `vacated` markers; indexes are disposable projections.
// Pure library (no Bun/OS/DOM imports — headless by construction).
// Falsifier: F-CTX (`tooling/gates/test/f-ctx.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface VaultRowRef { offset: number; ns: string; bytes: number; shredded?: boolean; }
export interface CtxPolicy {
  id: string;
  scope: string;
  weights: Record<string, number>;
  scorerGrants: string[];
  budgetDefaults: Record<string, number>;
  namedBy: string;
}
export interface CtxArtifact {
  id: string;
  intentRef: string;
  policyRef: string;
  rows: VaultRowRef[];
  transforms: string[];
  scorerRefs: Array<{ ref: string; badge: string; confidence: number }>;
  budgetClaimRef: string;
  tokenCount: number;
  seal: string;
  badge: { tier: string; generality: string };
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type CtxResult<T> = { ok: true; value: T } | Refusal;

export function sealCtx(a: Omit<CtxArtifact, "seal">): string {
  return hash53(JSON.stringify([a.intentRef, a.policyRef, a.rows, a.transforms, a.scorerRefs, a.budgetClaimRef, a.tokenCount]));
}

/** Deterministic-first selection: recency + binding + explicit refs, all pure vault folds. */
export function selectRows(
  candidates: Array<{ ref: VaultRowRef; recency: number; bound: boolean; explicit: boolean }>,
  policy: CtxPolicy,
  cap: number,
): VaultRowRef[] {
  const score = (c: (typeof candidates)[number]): number =>
    c.recency * (policy.weights.recency ?? 1) +
    (c.bound ? (policy.weights.binding ?? 10) : 0) +
    (c.explicit ? (policy.weights.explicit ?? 100) : 0) +
    (policy.weights[c.ref.ns] ?? 0);
  return candidates
    .slice()
    .sort((a, b) => score(b) - score(a))
    .slice(0, cap)
    .map((c) => c.ref);
}

/** ctx.assemble — sole writer: the assembler. Every transform named or refused. */
export function assembleCtx(input: {
  id: string;
  intentRef: string;
  policy: CtxPolicy | null;
  rows: VaultRowRef[];
  transforms: string[];
  scorerRefs: CtxArtifact["scorerRefs"];
  budgetClaimRef: string;
  tokenCount: number;
  badge: CtxArtifact["badge"];
  ctx: { isAssembler: boolean };
}): CtxResult<CtxArtifact> {
  if (!input.ctx.isAssembler) {
    return { ok: false, code: "CTX_ASSEMBLER_GRANT", sentence: "The assembler cannot be granted, shipped, or forked. Scorers and summarizers pass the normal door; the constitution doesn't." };
  }
  if (!input.policy) {
    return { ok: false, code: "CTX_POLICY_UNNAMED", sentence: "No assembly without a named policy. Tell me how to choose what you see, and I'll choose." };
  }
  if (!input.budgetClaimRef) {
    return { ok: false, code: "CTX_NO_BUDGET", sentence: "This context has no token budget. The governor decides what cognition costs before cognition spends." };
  }
  if (input.transforms.some((t) => !t || t.trim() === "")) {
    return { ok: false, code: "CTX_UNSORTED_INVISIBLE", sentence: "A context was assembled with an unrecorded transform. That assembly is refused — sorting is an editorial act and must be named." };
  }
  const base: Omit<CtxArtifact, "seal"> = {
    id: input.id,
    intentRef: input.intentRef,
    policyRef: input.policy.id,
    rows: input.rows,
    transforms: input.transforms,
    scorerRefs: input.scorerRefs,
    budgetClaimRef: input.budgetClaimRef,
    tokenCount: input.tokenCount,
    badge: input.badge,
  };
  return { ok: true, value: { ...base, seal: sealCtx(base) } };
}

/** Direct vault fetch by a realization — always refused. */
export function realizationReadsVault(): Refusal {
  return { ok: false, code: "CTX_REALIZATION_READS_VAULT", sentence: "Realizations receive sealed contexts; they don't read the vault. That fetch was refused." };
}

/** ctx.replay — re-feed a sealed ctx to a named realization; cites the SAME artifact. */
export function replayCtx(artifact: CtxArtifact, realizationRef: string): { eventIntentRef: string; ctxRef: string; realizationRef: string } {
  return { eventIntentRef: `${artifact.intentRef}:replay`, ctxRef: artifact.id, realizationRef };
}

/** ctx.inspect — render the artifact in plain words (every surface gets it). */
export function inspectCtx(a: CtxArtifact): string {
  const rows = a.rows.map((r) => (r.shredded ? `${r.ns}@${r.offset}[vacated]` : `${r.ns}@${r.offset}`)).join(", ");
  return `ctx ${a.id} for ${a.intentRef} under ${a.policyRef}: rows [${rows}]; transforms [${a.transforms.join(" → ") || "none"}]; scorers [${a.scorerRefs.map((s) => `${s.ref}(${s.badge},${s.confidence})`).join(", ") || "none"}]; tokens ${a.tokenCount} on claim ${a.budgetClaimRef}; seal ${a.seal}.`;
}

/** Forgetting: shredded rows replay as named vacated markers, never silent omission. */
export function applyForgetting(a: CtxArtifact, shreddedOffsets: number[]): CtxArtifact {
  const rows = a.rows.map((r) => (shreddedOffsets.includes(r.offset) ? { ...r, shredded: true } : r));
  const base: Omit<CtxArtifact, "seal"> = { ...a, rows };
  return { ...base, seal: sealCtx(base) };
}

/** Token accounting: spend per ctx joins realization × namespace. */
export function accountTokens(
  artifacts: Array<{ realization: string; rows: VaultRowRef[]; tokenCount: number }>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const a of artifacts) {
    for (const r of a.rows) {
      out[a.realization] ??= {};
      out[a.realization][r.ns] ??= 0;
      out[a.realization][r.ns] += Math.floor(a.tokenCount / Math.max(1, a.rows.length));
    }
  }
  return out;
}
