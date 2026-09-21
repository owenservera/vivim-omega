// tooling/gates/test/f-badge.test.ts — the F-BADGE falsifier.
// Generated from D-437 by `omega:loop --stub D-437` (D-426, Ω-DEV.2).
// Implemented (D-437): every clause runs a real verdict against
// tooling/gates/badge.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  demoteBadge,
  effectiveBadge,
  forgeFromDemoted,
  proposeBadge,
  ratifyProposal,
  scarChildren,
} from "../badge.ts";

describe("F-BADGE (D-437)", () => {
  test("F-BADGE.1 (proposal-engine) — 10 clean uses mint a proposal; badge unchanged", () => {
    const p = proposeBadge({
      targetRef: "tile:forged-1",
      currentBadge: "speculative",
      proposedBadge: "harvested",
      evidenceRefs: ["analytics:row:441"],
      cleanUses: 10,
      threshold: 10,
      isEngine: true,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) throw new Error("unreachable");
    expect(p.value.state).toBe("pending"); // engine stops here — never flips itself
    const thin = proposeBadge({
      targetRef: "tile:vibes",
      currentBadge: "speculative",
      proposedBadge: "harvested",
      evidenceRefs: [],
      cleanUses: 2,
      threshold: 10,
      isEngine: true,
    });
    expect(thin.ok).toBe(false);
    if (thin.ok) throw new Error("unreachable");
    expect(thin.code).toBe("BADGE_UNEARNED_PROMOTION");
  });

  test("F-BADGE.2 (ratification-gate) — no signature refuses; signature promotes", () => {
    const p = proposeBadge({
      targetRef: "tile:forged-1",
      currentBadge: "speculative",
      proposedBadge: "harvested",
      evidenceRefs: ["analytics:row:441"],
      cleanUses: 100,
      threshold: 10,
      isEngine: true,
    });
    if (!p.ok) throw new Error("unreachable");
    const unsigned = ratifyProposal(p.value, { signature: null, delegated: false });
    expect(unsigned.ok).toBe(false);
    if (unsigned.ok) throw new Error("unreachable");
    expect(unsigned.code).toBe("BADGE_AUTO_RATIFY");
    const signed = ratifyProposal(p.value, { signature: "alice:sig:1", delegated: false });
    expect(signed.ok && signed.value).toBe("harvested");
  });

  test("F-BADGE.3 (loud-demotion) — 3 mine failures demote with spoken + ledgered sentence", () => {
    const d = demoteBadge("provider:notion", 3, 99);
    expect(d.tier).toBe("speculative");
    expect(d.sentence).toContain("not do it silently");
    expect(d.ledger).toContain("badge.demote");
  });

  test("F-BADGE.4 (transitive-scar) — demoted parent scars all children; effective badges fall", () => {
    const scars = scarChildren("forge:notion-toolkit", ["t1", "t2"], "speculative", "synthetic-mine-fail");
    expect(scars).toHaveLength(2);
    expect(effectiveBadge("harvested", scars.filter((s) => s.childRef === "t1"))).toBe("speculative");
  });

  test("F-BADGE.5 (forensic-history) — birth row intact, scar dated", () => {
    const birth = { badge: "harvested" as const, at: 100 };
    const scars = scarChildren("forge:x", ["tile:y"], "demoted", "contract-failure");
    expect(birth.badge).toBe("harvested"); // never rewritten
    expect(effectiveBadge(birth.badge, scars)).toBe("demoted");
    expect(scars[0].reason).toBe("contract-failure");
  });

  test("F-BADGE.6 (orphan-born-scarred) — forging from a demoted parent births speculative + scar", () => {
    const { tier, scar } = forgeFromDemoted("forge:fallen", "demoted", "tile:newborn");
    expect(tier).toBe("speculative");
    expect(scar.parentRef).toBe("forge:fallen");
  });
});
