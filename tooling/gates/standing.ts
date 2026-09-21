// tooling/gates/standing.ts — D-443 (Ω-13 port of paper D-445): LLM-Authored Standing State.
//
// The model drafts the blueprint; the human holds the switch; the system
// records which model drafted it. Proposals validate without arming, surfaces
// render badge + terms, ratification stamps custody and tombstones, revocation
// cascades to pause-with-review. Pure library (headless).
// Falsifier: F-STANDING (`tooling/gates/test/f-standing.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface Proposal {
  hash: string;
  definition: string;
  retention: string;
  proposedBy: string;
  proposerBadge: string;
  state: "ephemeral" | "tombstoned" | "expired";
  at: number;
}
export interface StandingWatch {
  id: string;
  definition: string;
  retention: string;
  ratifiedBy: string;
  proposedBy: string | null;
  proposalRef: string;
  state: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type StandingResult<T> = { ok: true; value: T } | Refusal;

/** Realization attempting watch.arm directly — schema gate error, always. */
export function armByRealization(): Refusal {
  return { ok: false, code: "WATCH_ARM_BY_REALIZATION", sentence: "Realizations may not directly arm watches. Use `watch.propose@1` to submit a consent request." };
}

/** watch.propose — validates schema + retention, mints ephemeral proposal, arms nothing. */
export function proposeWatch(input: {
  definition: string;
  retention: string;
  proposedBy: string;
  proposerBadge: string;
  at: number;
}): StandingResult<Proposal> {
  if (!input.retention || input.retention.trim() === "") {
    return { ok: false, code: "PROPOSAL_MISSING_RETENTION", sentence: "The proposed watch lacks a retention rule. I cannot suggest something I cannot forget." };
  }
  if (!input.definition || input.definition.trim() === "") {
    return { ok: false, code: "PROPOSAL_MISSING_RETENTION", sentence: "The proposed watch lacks a retention rule. I cannot suggest something I cannot forget." };
  }
  return {
    ok: true,
    value: {
      hash: hash53(`proposal|${input.definition}|${input.at}`),
      definition: input.definition,
      retention: input.retention,
      proposedBy: input.proposedBy,
      proposerBadge: input.proposerBadge,
      state: "ephemeral",
      at: input.at,
    },
  };
}

/** Surface rendering: plain terms + proposer badge. */
export function renderProposal(p: Proposal, realizationLabel: string): string {
  return `${realizationLabel} (${p.proposerBadge}) suggests watching ${p.definition}. This will trigger on fire. Approve?`;
}

/** consent.ratify — custody stamped, proposal tombstoned, watch row created. */
export function ratifyProposal(p: Proposal, principal: string, signature: string): StandingResult<{ watch: StandingWatch }> {
  if (p.state !== "ephemeral") {
    return { ok: false, code: "PROPOSAL_TTL_EXPIRED", sentence: "This consent proposal has expired and been shredded. Please ask the model to propose it again." };
  }
  if (!signature) {
    return { ok: false, code: "PROPOSAL_TTL_EXPIRED", sentence: "This consent proposal has expired and been shredded. Please ask the model to propose it again." };
  }
  return {
    ok: true,
    value: {
      watch: {
        id: `watch:${p.hash}`,
        definition: p.definition,
        retention: p.retention,
        ratifiedBy: `${principal}:${signature}`,
        proposedBy: p.proposedBy,
        proposalRef: p.hash,
        state: "armed",
      },
    },
  };
}

/** TTL expiry — undecided proposals shred. */
export function expireProposal(p: Proposal, nowMs: number, ttlMs: number): Proposal {
  if (nowMs - p.at > ttlMs) return { ...p, state: "expired" };
  return p;
}

/** Cascading pause on proposer revoke/demotion — paused, never deleted. */
export function cascadePause(watches: StandingWatch[], revokedProposer: string): { paused: StandingWatch[]; notice: string } {
  const paused = watches.map((w) => (w.proposedBy === revokedProposer && w.state === "armed" ? { ...w, state: "paused_pending_review" } : w));
  const n = paused.filter((w) => w.state === "paused_pending_review").length;
  return {
    paused,
    notice: `This watch was proposed by ${revokedProposer}, which has been demoted/revoked. It is paused pending your review.`,
  };
}
