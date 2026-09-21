// tooling/gates/test/f-disclosure.test.ts — the F-DISCLOSURE falsifier.
// Generated from D-439 by `omega:loop --stub D-439` (D-426, Ω-DEV.2).
// Implemented (D-439): every clause runs a real verdict against
// tooling/gates/aperture.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  auditTrail,
  floodGuard,
  prefetchStage,
  pull,
  seedContext,
  setPolicyByRealization,
} from "../aperture.ts";

describe("F-DISCLOSURE (D-439)", () => {
  test("F-DISCLOSURE.1 (seed-manifest) — seed minimal, manifest existence-honest", () => {
    const seed = seedContext({
      atoms: ["omega-3-one-sentence"],
      candidates: [
        { ref: "omega-3-full-doc", relevance: 0.92, tokens: 2100, scope: "ns.docs", grantedScopes: ["ns.docs"] },
        { ref: "ns.finance:rows", relevance: 0.88, tokens: 400, scope: "ns.finance", grantedScopes: ["ns.docs"] },
      ],
      policyRef: "policy:default",
    });
    expect(seed.atoms).toHaveLength(1);
    expect(seed.manifest).toHaveLength(2);
    expect(seed.manifest[1].sealed).toBe(true); // structure hidden, existence shown
    expect(seed.manifest[1].tokens).toBe(0);
  });

  test("F-DISCLOSURE.2 (pull-trail) — requests granted with rows; refusals sentenced", () => {
    const good = pull({ kind: "drill", ref: "dissent-rows", granted: true, budgeted: true, bytes: 400, sealed: true });
    expect(good.ok).toBe(true);
    const scoped = pull({ kind: "fetch", ref: "ns.finance:key", granted: false, budgeted: true, bytes: 0, sealed: true });
    expect(scoped.ok).toBe(false);
    if (scoped.ok) throw new Error("unreachable");
    expect(scoped.code).toBe("APERTURE_REFUSED");
    const broke = pull({ kind: "expand", ref: "related", granted: true, budgeted: false, bytes: 0, sealed: true });
    expect(broke.ok).toBe(false);
    if (broke.ok) throw new Error("unreachable");
    expect(broke.code).toBe("APERTURE_BUDGET");
  });

  test("F-DISCLOSURE.3 (no-unrowed-byte) — model bytes covered by rows or red", () => {
    const rows = [
      { kind: "request" as const, ref: "dissent-rows", detail: "drill", bytes: 400 },
      { kind: "chunk" as const, ref: "dissent-rows", detail: "sealed", bytes: 400 },
    ];
    const audit = auditTrail(rows, 800);
    expect(audit.complete).toBe(true);
    const short = auditTrail(rows, 801);
    expect(short.complete).toBe(false); // a single byte unrowed fails
  });

  test("F-DISCLOSURE.4 (prefetch-staged) — predictions receipted, never injected", () => {
    const { staged, trail } = prefetchStage([
      { ref: "dissent-rows", hit: true, profileEntry: "prof-9" },
      { ref: "budget-ctx", hit: false, profileEntry: "prof-9" },
    ]);
    expect(staged).toContain("dissent-rows");
    expect(trail[0].detail).toContain("hit");
    expect(trail[1].detail).toContain("miss");
    expect(trail.every((t) => t.kind === "prefetch")).toBe(true); // staged, not windowed
  });

  test("F-DISCLOSURE.5 (budget-itemized) — spend per request; tightening speaks", () => {
    const rows = [
      { kind: "request" as const, ref: "a", detail: "drill", bytes: 400 },
      { kind: "request" as const, ref: "b", detail: "expand", bytes: 800 },
    ];
    const audit = auditTrail(rows, 1200);
    expect(audit.accounted).toBe(1200);
  });

  test("F-DISCLOSURE.6 (profile-receipted) — prefetch cites its profile entry, badged and reversible", () => {
    const { trail } = prefetchStage([{ ref: "x", hit: true, profileEntry: "prof-9" }]);
    expect(trail[0].detail).toContain("prof-9");
  });

  test("F-DISCLOSURE.7 (policy-principal-only) — realization policy-sets refuse; floods limit", () => {
    const p = setPolicyByRealization();
    expect(p.code).toBe("APERTURE_POLICY_PRINCIPAL");
    const flood = floodGuard(500, 100);
    expect(flood.ok).toBe(false);
    if (flood.ok) throw new Error("unreachable");
    expect(flood.code).toBe("APERTURE_FLOOD");
    const calm = floodGuard(50, 100);
    expect(calm.ok).toBe(true);
  });

  test("F-DISCLOSURE.8 (retention-vacated) — shredded rows surface vacated, never silent", () => {
    const seed = seedContext({
      atoms: ["s"],
      candidates: [{ ref: "old-row", relevance: 0.9, tokens: 100, scope: "ns.docs", grantedScopes: ["*"], shredded: true }],
      policyRef: "policy:default",
    });
    expect(seed.manifest[0].ref).toContain("[vacated]");
  });
});
