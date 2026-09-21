// tooling/gates/invoke.ts — D-442 (Ω-12 port of paper D-444): Realization Invocation Grant.
//
// Invocation is the absolute first gate: before context (Ω-9), before budget
// (Ω-2), before capability. Manifests declare policy; the mesh holds grants
// with scope + expiry; the law checks first, logs the grantId, never falls
// back silently; mid-stream revocation aborts. Pure library (headless).
// Falsifier: F-INVOKE (`tooling/gates/test/f-invoke.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export type InvokePolicy = "principal-granted" | "public" | "delegated-only" | "none";
export interface InvokeGrant {
  grantId: string;
  principalRef: string;
  realizationId: string;
  scope: string;
  expiresAt: number | null;
  namedBy: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type InvokeResult<T> = { ok: true; value: T } | Refusal;

/** Grant mint — owner signature required, ledgered. */
export function grantInvoke(input: {
  principalRef: string;
  realizationId: string;
  scope?: string;
  expiresAt?: number | null;
  namedBy: string;
  signed: boolean;
}): InvokeResult<InvokeGrant> {
  if (!input.signed) {
    return { ok: false, code: "INVOKE_UNAUTHORIZED", sentence: `Principal ${input.principalRef} is not granted permission to invoke realization ${input.realizationId}. Request refused.` };
  }
  const grantId = hash53(`invoke|${input.principalRef}|${input.realizationId}|${input.scope ?? "global"}`);
  return {
    ok: true,
    value: { grantId, principalRef: input.principalRef, realizationId: input.realizationId, scope: input.scope ?? "global", expiresAt: input.expiresAt ?? null, namedBy: input.namedBy },
  };
}

/** First-gate check: policy → grant → scope → expiry. No assembly, no claim, no network on denial. */
export function checkInvocation(input: {
  principalRef: string;
  enrolled: boolean;
  realizationId: string;
  policy: InvokePolicy;
  intentNs: string;
  grants: InvokeGrant[];
  nowMs: number;
}): InvokeResult<{ grantId: string | "public" }> {
  if (input.policy === "none") {
    return { ok: false, code: "INVOKE_POLICY_NONE", sentence: `Realization ${input.realizationId} has an invocation policy of 'none'. It cannot be invoked directly. Request refused.` };
  }
  if (input.policy === "public") {
    if (!input.enrolled) {
      return { ok: false, code: "INVOKE_UNAUTHORIZED", sentence: `Principal ${input.principalRef} is not granted permission to invoke realization ${input.realizationId}. Request refused.` };
    }
    return { ok: true, value: { grantId: "public" } };
  }
  const grant = input.grants.find((g) => g.principalRef === input.principalRef && g.realizationId === input.realizationId);
  if (!grant) {
    return { ok: false, code: "INVOKE_UNAUTHORIZED", sentence: `Principal ${input.principalRef} is not granted permission to invoke realization ${input.realizationId}. Request refused.` };
  }
  if (grant.expiresAt !== null && input.nowMs > grant.expiresAt) {
    return { ok: false, code: "INVOKE_UNAUTHORIZED", sentence: `Principal ${input.principalRef} is not granted permission to invoke realization ${input.realizationId}. Request refused.` };
  }
  if (grant.scope !== "global" && grant.scope !== input.intentNs) {
    return { ok: false, code: "INVOKE_SCOPE_VIOLATION", sentence: `Principal ${input.principalRef} is granted to invoke ${input.realizationId}, but not for namespace ${input.intentNs}. Request refused.` };
  }
  return { ok: true, value: { grantId: grant.grantId } };
}

/** Mid-stream revocation — aborts execution immediately. */
export function checkMidStream(grant: InvokeGrant | null): InvokeResult<true> {
  if (!grant) {
    return { ok: false, code: "INVOKE_GRANT_REVOKED_MID", sentence: "The invocation grant for this operation was revoked while the stream was active. Execution aborted." };
  }
  return { ok: true, value: true };
}
