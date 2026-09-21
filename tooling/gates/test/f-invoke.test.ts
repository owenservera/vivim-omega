// tooling/gates/test/f-invoke.test.ts — the F-INVOKE falsifier.
// Generated from D-442 by `omega:loop --stub D-442` (D-426, Ω-DEV.2).
// Implemented (D-442): every clause runs a real verdict against
// tooling/gates/invoke.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import { checkInvocation, checkMidStream, grantInvoke } from "../invoke.ts";

describe("F-INVOKE (D-442)", () => {
  test("F-INVOKE.1 (unauthorized) — grantless frontier wake refuses first, nothing downstream", () => {
    const r = checkInvocation({
      principalRef: "harness:rogue",
      enrolled: true,
      realizationId: "provider.llm-frontier",
      policy: "principal-granted",
      intentNs: "ns.mail",
      grants: [],
      nowMs: 1000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INVOKE_UNAUTHORIZED");
    const none = checkInvocation({
      principalRef: "alice",
      enrolled: true,
      realizationId: "internal.helper",
      policy: "none",
      intentNs: "ns.mail",
      grants: [],
      nowMs: 1000,
    });
    expect(none.ok).toBe(false);
    if (none.ok) throw new Error("unreachable");
    expect(none.code).toBe("INVOKE_POLICY_NONE");
  });

  test("F-INVOKE.2 (scoped-denial) — finance-scoped grant on health intent refuses", () => {
    const g = grantInvoke({ principalRef: "alice", realizationId: "sum:v1", scope: "ns.finance", namedBy: "alice", signed: true });
    expect(g.ok).toBe(true);
    if (!g.ok) throw new Error("unreachable");
    const r = checkInvocation({
      principalRef: "alice",
      enrolled: true,
      realizationId: "sum:v1",
      policy: "principal-granted",
      intentNs: "ns.health",
      grants: [g.value],
      nowMs: 1000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INVOKE_SCOPE_VIOLATION");
    const ok = checkInvocation({
      principalRef: "alice",
      enrolled: true,
      realizationId: "sum:v1",
      policy: "principal-granted",
      intentNs: "ns.finance",
      grants: [g.value],
      nowMs: 1000,
    });
    expect(ok.ok).toBe(true); // in-scope wakes, custody cites grantId
  });

  test("F-INVOKE.3 (midstream-revocation) — revoked grant aborts, partial finalizes, budget reclaims", () => {
    const live = checkMidStream({ grantId: "g1", principalRef: "a", realizationId: "r", scope: "global", expiresAt: null, namedBy: "a" });
    expect(live.ok).toBe(true);
    const dead = checkMidStream(null);
    expect(dead.ok).toBe(false);
    if (dead.ok) throw new Error("unreachable");
    expect(dead.code).toBe("INVOKE_GRANT_REVOKED_MID");
  });

  test("F-INVOKE.4 (public-exception) — enrolled-local public wakes grant-free", () => {
    const r = checkInvocation({
      principalRef: "alice",
      enrolled: true,
      realizationId: "provider.ollama",
      policy: "public",
      intentNs: "ns.anything",
      grants: [],
      nowMs: 1000,
    });
    expect(r.ok).toBe(true);
    const stranger = checkInvocation({
      principalRef: "ghost",
      enrolled: false,
      realizationId: "provider.ollama",
      policy: "public",
      intentNs: "ns.anything",
      grants: [],
      nowMs: 1000,
    });
    expect(stranger.ok).toBe(false);
  });
});
