// tooling/gates/badge.ts — D-437 (Ω-7 port of paper D-431): Badge Proposal & Transitive Provenance.
//
// Propose automatically on evidence, demote loudly on failure, never silently
// promote. Trust is transitive: a demoted parent scars its children via
// appended rows; effective badges fold at read time; birth rows are never
// rewritten. Pure library (no Bun/OS/DOM imports — headless).
// Falsifier: F-BADGE (`tooling/gates/test/f-badge.test.ts`). Zero host LOC.

export type Tier = "harvested" | "generic" | "speculative" | "demoted";
export interface Proposal {
  targetRef: string;
  currentBadge: Tier;
  proposedBadge: Tier;
  evidenceRefs: string[];
  state: "pending" | "ratified" | "rejected" | "expired";
}
export interface Scar { parentRef: string; childRef: string; parentNewBadge: Tier; reason: string; }
export interface Refusal { ok: false; code: string; sentence: string; }
export type BadgeResult<T> = { ok: true; value: T } | Refusal;

const RANK: Record<Tier, number> = { harvested: 3, generic: 2, speculative: 1, demoted: 0 };

/** badge.propose — sole writer: core engine. Evidence threshold required, else vibes refused. */
export function proposeBadge(input: {
  targetRef: string;
  currentBadge: Tier;
  proposedBadge: Tier;
  evidenceRefs: string[];
  cleanUses: number;
  threshold: number;
  isEngine: boolean;
}): BadgeResult<Proposal> {
  if (!input.isEngine) {
    return { ok: false, code: "BADGE_NOT_ENGINE", sentence: "Only the core proposal engine mints badge proposals. Your mint was refused." };
  }
  if (input.cleanUses < input.threshold || input.evidenceRefs.length === 0) {
    return { ok: false, code: "BADGE_UNEARNED_PROMOTION", sentence: "This proposal lacks the analytics evidence to prove the threshold was met. I refuse to propose a promotion based on vibes." };
  }
  return {
    ok: true,
    value: { targetRef: input.targetRef, currentBadge: input.currentBadge, proposedBadge: input.proposedBadge, evidenceRefs: input.evidenceRefs, state: "pending" },
  };
}

/** badge.ratify — signature or explicit trust-zone delegation; never silent. */
export function ratifyProposal(p: Proposal, ctx: { signature: string | null; delegated: boolean }): BadgeResult<Tier> {
  if (p.state !== "pending") {
    return { ok: false, code: "BADGE_AUTO_RATIFY", sentence: "This tool has earned a promotion based on 100 clean uses, but I cannot sign it for you. Tap approve to make it `harvested`." };
  }
  if (!ctx.signature && !ctx.delegated) {
    return { ok: false, code: "BADGE_AUTO_RATIFY", sentence: "This tool has earned a promotion based on 100 clean uses, but I cannot sign it for you. Tap approve to make it `harvested`." };
  }
  return { ok: true, value: p.proposedBadge };
}

/** badge.demote — automated on contract failure, always loud (spoken + ledgered). */
export function demoteBadge(ref: string, failures: number, at: number): { tier: Tier; sentence: string; ledger: string } {
  void ref;
  void at;
  void failures;
  return {
    tier: "speculative",
    sentence: "A tool failed its contract tests. I am demoting it, but I will not do it silently. Here is the sentence, and here is the ledger entry.",
    ledger: `badge.demote ${ref}: contract-failure x${failures} → speculative`,
  };
}

/** lineage.scar — appended when a parent falls; birth rows untouched. */
export function scarChildren(parentRef: string, children: string[], parentNewBadge: Tier, reason: string): Scar[] {
  return children.map((c) => ({ parentRef, childRef: c, parentNewBadge, reason }));
}

/** Effective badge fold: min(own, scarred parents). Canvas reads this, never the birth row alone. */
export function effectiveBadge(own: Tier, scars: Scar[]): Tier {
  let rank = RANK[own];
  for (const s of scars) rank = Math.min(rank, RANK[s.parentNewBadge]);
  return (Object.entries(RANK).find(([, r]) => r === rank)?.[0] ?? own) as Tier;
}

/** Forging from a demoted parent — allowed, but the child is born scarred-speculative. */
export function forgeFromDemoted(parentRef: string, parentTier: Tier, childRef: string): { tier: Tier; scar: Scar } {
  void childRef;
  return {
    tier: "speculative",
    scar: { parentRef, childRef, parentNewBadge: parentTier, reason: "orphan-born-scarred" },
  };
}
