// tooling/gates/aperture.ts — D-439 (Ω-9 port of paper D-433): Progressive Adaptive Disclosure.
//
// Context is disclosed, never poured: a minimal seed plus an existence-honest
// manifest; the model pulls (drill/expand/fetch/manifest) through law + budget;
// prefetch stages but never injects; spend is itemized; profiles are badged,
// reversible receipts; every byte leaves a row. Pure library (headless).
// Falsifier: F-DISCLOSURE (`tooling/gates/test/f-disclosure.test.ts`). Zero host LOC.

export interface ManifestEntry { ref: string; relevance: number; tokens: number; sealed: boolean; shredded?: boolean; }
export interface Seed { atoms: string[]; manifest: ManifestEntry[]; policyRef: string; }
export interface DisclosureRow {
  kind: "seed" | "request" | "chunk" | "refusal" | "spend" | "prefetch" | "profile";
  ref: string;
  detail: string;
  bytes: number;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type ApertureResult<T> = { ok: true; value: T } | Refusal;

/** Seed + manifest: sensitive namespaces appear existence-only (no structure leak). */
export function seedContext(input: {
  atoms: string[];
  candidates: Array<{ ref: string; relevance: number; tokens: number; scope: string; grantedScopes: string[]; shredded?: boolean }>;
  policyRef: string;
}): Seed {
  const manifest: ManifestEntry[] = input.candidates.map((c) => {
    const allowed = c.grantedScopes.includes(c.scope) || c.grantedScopes.includes("*");
    if (!allowed) return { ref: `${c.scope}:sealed`, relevance: 0, tokens: 0, sealed: true };
    if (c.shredded) return { ref: `${c.ref}[vacated]`, relevance: c.relevance, tokens: 0, sealed: false, shredded: true };
    return { ref: c.ref, relevance: c.relevance, tokens: c.tokens, sealed: false };
  });
  return { atoms: input.atoms, manifest, policyRef: input.policyRef };
}

export type PullKind = "drill" | "expand" | "fetch" | "manifest";

/** Pull: law-gated, budget-claimed, sealed, ledgered — then disclosed. */
export function pull(input: {
  kind: PullKind;
  ref: string;
  granted: boolean;
  budgeted: boolean;
  bytes: number;
  sealed: boolean;
}): ApertureResult<DisclosureRow> {
  if (!input.granted) {
    return { ok: false, code: "APERTURE_REFUSED", sentence: "That disclosure is outside your scope. The request is ledgered; nothing was revealed." };
  }
  if (!input.budgeted) {
    return { ok: false, code: "APERTURE_BUDGET", sentence: "Disclosure budget exhausted mid-turn. The governor tightened the aperture because spend outran citations." };
  }
  if (!input.sealed) {
    return { ok: false, code: "APERTURE_UNSEALED", sentence: "Undisclosed bytes never cross. Sealed first, then revealed." };
  }
  return { ok: true, value: { kind: "request", ref: input.ref, detail: `${input.kind}:${input.ref}`, bytes: input.bytes } };
}

/** Policy-setting by a realization — always refused (principal-only). */
export function setPolicyByRealization(): Refusal {
  return { ok: false, code: "APERTURE_POLICY_PRINCIPAL", sentence: "Disclosure policy is set by principals, never by realizations. Your request may pull; it may not rule." };
}

/** Flood guard: runaway drill spam rate-limits at the aperture. */
export function floodGuard(requestsInWindow: number, limit: number): ApertureResult<true> {
  if (requestsInWindow > limit) {
    return { ok: false, code: "APERTURE_FLOOD", sentence: "Disclosure requests are flooding. The aperture is rate-limiting pulls until the turn settles." };
  }
  return { ok: true, value: true };
}

/** Prefetch: staged predictions with hit/miss receipts; staged chunks cross only via pull acts. */
export function prefetchStage(predictions: Array<{ ref: string; hit: boolean; profileEntry: string }>): {
  staged: string[];
  trail: DisclosureRow[];
} {
  return {
    staged: predictions.map((p) => p.ref),
    trail: predictions.map((p) => ({
      kind: "prefetch" as const,
      ref: p.ref,
      detail: `${p.hit ? "hit" : "miss"}:profile:${p.profileEntry}`,
      bytes: 0,
    })),
  };
}

/** Trail audit: every byte accounted; unrowed bytes fail. */
export function auditTrail(rows: DisclosureRow[], modelBytes: number): { accounted: number; complete: boolean } {
  const accounted = rows.filter((r) => r.kind === "chunk" || r.kind === "request").reduce((n, r) => n + r.bytes, 0);
  return { accounted, complete: accounted >= modelBytes };
}
