// tooling/gates/delegate.ts — D-445 (Ω-15 port of paper D-447): Bounded Consent Delegation.
//
// Lend authority, never surrender sovereignty: BDTs with scope, budget, steps,
// TTL; dual-signature acts (agent + token, never aliasing root); one-link
// chains; automatic ledgered halts. Pure library (headless).
// Falsifier: F-DELEGATE (`tooling/gates/test/f-delegate.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface BDT {
  tokenId: string;
  grantor: string;
  grantee: string;
  scope: string[];
  budgetCeiling: number;
  maxSteps: number;
  expiresAt: number;
  transitive: boolean;
  signedBy: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type DelegateResult<T> = { ok: true; value: T } | Refusal;

/** trust.delegate — explicit human tap; forever invalid without bounds. */
export function mintDelegation(input: {
  grantor: string;
  grantee: string;
  scope: string[];
  budgetCeiling: number;
  maxSteps: number;
  expiresAt: number | null;
  signed: boolean;
}): DelegateResult<BDT> {
  if (!input.signed) {
    return { ok: false, code: "DELEGATION_UNSIGNED", sentence: "Delegation requires an explicit human consent tap. No tap, no leash." };
  }
  if (input.expiresAt === null || input.budgetCeiling <= 0 || input.maxSteps <= 0 || input.scope.length === 0) {
    return { ok: false, code: "DELEGATION_UNBOUNDED", sentence: "Every delegation names its bounds: scope, budget, steps, TTL. Forever is not a valid expiration date." };
  }
  return {
    ok: true,
    value: {
      tokenId: hash53(`bdt|${input.grantor}|${input.grantee}|${input.expiresAt}`),
      grantor: input.grantor,
      grantee: input.grantee,
      scope: input.scope,
      budgetCeiling: input.budgetCeiling,
      maxSteps: input.maxSteps,
      expiresAt: input.expiresAt,
      transitive: false,
      signedBy: input.grantor,
    },
  };
}

export interface AgentAct {
  actor: string;
  authority: string;
  ns: string;
  stepsUsed: number;
  budgetSpent: number;
  nowMs: number;
}

/** agent.invoke — law validates leash before routing. */
export function agentInvoke(token: BDT | null, act: AgentAct): DelegateResult<{ actor: string; authority: string }> {
  if (!token) {
    return { ok: false, code: "DELEGATION_UNSIGNED", sentence: "Delegation requires an explicit human consent tap. No tap, no leash." };
  }
  if (!token.scope.includes(act.ns)) {
    return { ok: false, code: "DELEGATION_SCOPE_VIOLATION", sentence: `Agent ${act.actor} attempted to access ${act.ns}, but its delegation token only grants access to ${token.scope.join(", ")}. Refused.` };
  }
  if (act.nowMs > token.expiresAt) {
    return { ok: false, code: "DELEGATION_EXPIRED", sentence: `The delegation token for Agent ${act.actor} expired. Refused.` };
  }
  if (act.stepsUsed >= token.maxSteps) {
    return { ok: false, code: "DELEGATION_STEPS_EXHAUSTED", sentence: `Agent ${act.actor} has consumed its delegated step allowance. The leash has snapped. Refused.` };
  }
  if (act.budgetSpent >= token.budgetCeiling) {
    return { ok: false, code: "DELEGATION_BUDGET_EXHAUSTED", sentence: `Agent ${act.actor} has consumed its delegated budget ceiling. The leash has snapped. Refused.` };
  }
  return { ok: true, value: { actor: act.actor, authority: token.tokenId } };
}

/** Sub-delegation attempt — strictly one link. */
export function delegateTransitive(): Refusal {
  return { ok: false, code: "DELEGATION_TRANSITIVE_ATTEMPT", sentence: "Agent attempted to mint a sub-delegation. Refused. The chain of trust is strictly one link long." };
}

/** Midnight revocation — null token aborts streams. */
export function revokedMidStream(): Refusal {
  return { ok: false, code: "DELEGATION_REVOKED_MID", sentence: "The principal revoked your delegation token while this stream was active. Execution aborted." };
}
