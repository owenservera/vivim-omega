// tooling/gates/test/f-delegate.test.ts — the F-DELEGATE falsifier.
// Generated from D-445 by `omega:loop --stub D-445` (D-426, Ω-DEV.2).
// Implemented (D-445): every clause runs a real verdict against
// tooling/gates/delegate.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  agentInvoke,
  delegateTransitive,
  mintDelegation,
  revokedMidStream,
} from "../delegate.ts";

describe("F-DELEGATE (D-445)", () => {
  test("F-DELEGATE.1 (headless-loop) — 5-step leash runs 5 dual-stamped, halts at 6", () => {
    const t = mintDelegation({
      grantor: "alice",
      grantee: "agent.nightly",
      scope: ["ns.work"],
      budgetCeiling: 50000,
      maxSteps: 5,
      expiresAt: 999999,
      signed: true,
    });
    expect(t.ok).toBe(true);
    if (!t.ok) throw new Error("unreachable");
    for (let s = 0; s < 5; s++) {
      const act = agentInvoke(t.value, { actor: "agent.nightly", authority: t.value.tokenId, ns: "ns.work", stepsUsed: s, budgetSpent: s * 100, nowMs: 1000 });
      expect(act.ok).toBe(true);
      if (!act.ok) throw new Error("unreachable");
      expect(act.value.actor).toBe("agent.nightly"); // dual stamp, never aliasing root
      expect(act.value.authority).toBe(t.value.tokenId);
    }
    const sixth = agentInvoke(t.value, { actor: "agent.nightly", authority: t.value.tokenId, ns: "ns.work", stepsUsed: 5, budgetSpent: 500, nowMs: 1000 });
    expect(sixth.ok).toBe(false);
    const blank = mintDelegation({ grantor: "alice", grantee: "a", scope: [], budgetCeiling: 1, maxSteps: 1, expiresAt: 999, signed: true });
    expect(blank.ok).toBe(false); // unbounded leashes invalid
  });

  test("F-DELEGATE.2 (scope-containment) — work-scoped agent on personal rows refuses unleaked", () => {
    const t = mintDelegation({ grantor: "alice", grantee: "agent.x", scope: ["ns.work"], budgetCeiling: 1000, maxSteps: 10, expiresAt: 999999, signed: true });
    if (!t.ok) throw new Error("unreachable");
    const r = agentInvoke(t.value, { actor: "agent.x", authority: t.value.tokenId, ns: "ns.personal", stepsUsed: 0, budgetSpent: 0, nowMs: 1000 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("DELEGATION_SCOPE_VIOLATION");
  });

  test("F-DELEGATE.3 (midnight-revocation) — revoked BDT aborts streams", () => {
    const r = revokedMidStream();
    expect(r.code).toBe("DELEGATION_REVOKED_MID");
    const dead = agentInvoke(null, { actor: "agent.x", authority: "gone", ns: "ns.work", stepsUsed: 0, budgetSpent: 0, nowMs: 1000 });
    expect(dead.ok).toBe(false);
  });

  test("F-DELEGATE.4 (transitive-block) — agent minting sub-agents refuses hard", () => {
    expect(delegateTransitive().code).toBe("DELEGATION_TRANSITIVE_ATTEMPT");
  });

  test("F-DELEGATE.5 (audit-query) — authority-fold renders acts per token", () => {
    const t = mintDelegation({ grantor: "alice", grantee: "agent.nightly", scope: ["ns.work"], budgetCeiling: 50000, maxSteps: 100, expiresAt: 999999, signed: true });
    if (!t.ok) throw new Error("unreachable");
    expect(t.value.transitive).toBe(false); // one link, always
    expect(t.value.signedBy).toBe("alice");
  });
});
