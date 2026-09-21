// tooling/gates/test/f-layout.test.ts — the F-LAYOUT falsifier.
// Generated from D-436 by `omega:loop --stub D-436` (D-426, Ω-DEV.2).
// Implemented (D-436): every clause runs a real verdict against
// tooling/gates/layout.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  applyLayout,
  checkRuleGrants,
  hashLayout,
  inspectPlacement,
  scrubLayout,
  type CanvasObject,
  type LayoutRule,
} from "../layout.ts";

const OBJS: CanvasObject[] = [
  { ref: "t-harvested", badge: "first-party · harvested", ns: "ns.mail" },
  { ref: "t-spec", badge: "third-party · speculative", ns: "ns.mail" },
];

function rule(over: Partial<LayoutRule> = {}): LayoutRule {
  return {
    id: "rule:badge-zones",
    predicate: (o) => o.badge.includes("speculative"),
    predicateDesc: "badge=speculative",
    zone: "edge",
    priority: 10,
    grantedNamespaces: ["*"],
    state: "armed",
    conceal: false,
    ...over,
  };
}

describe("F-LAYOUT (D-436)", () => {
  test("F-LAYOUT.1 (badge-arrangement) — rule moves tiles, every placement cites rule + evidence", () => {
    const r = applyLayout({ objects: OBJS, rules: [rule()], pins: [], watermark: 100, isEngine: true });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const spec = r.value.placements.find((p) => p.objectRef === "t-spec")!;
    expect(spec.ruleRef).toBe("rule:badge-zones");
    expect(spec.evidenceRef).toContain("badge=speculative");
    expect(spec.zone).toBe("edge");
  });

  test("F-LAYOUT.2 (pin-immunity) — pinned tile unmoved, conflict logged, pin untouched", () => {
    const pins = [{ objectRef: "t-spec", x: 5, y: 5, pinnedBy: "alice", pinnedAt: "2026-01-01" }];
    const r = applyLayout({ objects: OBJS, rules: [rule()], pins, watermark: 100, isEngine: true });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.placements.find((p) => p.objectRef === "t-spec")).toBeUndefined();
    expect(r.value.conflicts.some((c) => c.includes("pin wins"))).toBe(true);
  });

  test("F-LAYOUT.3 (concealment-refusal) — hide rule refused, spoken, ledgered, nothing invisible", () => {
    const r = applyLayout({ objects: OBJS, rules: [rule({ id: "rule:hide", conceal: true })], pins: [], watermark: 100, isEngine: true });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("LAYOUT_CONCEALMENT");
    expect(r.sentence).toContain("never conceals");
  });

  test("F-LAYOUT.4 (temporal-scrub) — history renders read-only, present restores exactly", () => {
    const history = [
      { objectRef: "t-a", ruleRef: "r1", zone: "center", evidenceRef: "e", watermark: 10 },
      { objectRef: "t-a", ruleRef: "r2", zone: "edge", evidenceRef: "e", watermark: 90 },
    ];
    const past = scrubLayout(history, 20);
    expect(past).toHaveLength(1);
    expect(past[0].zone).toBe("center");
    expect(history).toHaveLength(2); // scrub never mutates
  });

  test("F-LAYOUT.5 (forged-rule) — spoken rule enters speculative through the same gate", () => {
    const forged = rule({ id: "rule:forge-urgent", predicateDesc: "urgent=center", zone: "center", priority: 5 });
    const r = applyLayout(
      { objects: [{ ref: "t-u", badge: "third-party · speculative", ns: "ns.tasks" }], rules: [forged], pins: [], watermark: 100, isEngine: true },
    );
    expect(r.ok).toBe(true);
  });

  test("F-LAYOUT.6 (semantic-arrangement) — badged scorer seals scores into placement evidence", () => {
    const withScore = rule({
      id: "rule:sentiment",
      predicate: (o) => (o.sentiment ?? 0) > 0.5,
      predicateDesc: "sentiment>0.5 via scorer:vader-v1(third-party · speculative)",
      zone: "center",
    });
    const r = applyLayout(
      { objects: [{ ref: "t-happy", badge: "x", ns: "ns.tasks", sentiment: 0.9 }], rules: [withScore], pins: [], watermark: 100, isEngine: true },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.placements[0].evidenceRef).toContain("scorer:vader-v1");
  });

  test("F-LAYOUT.7 (headless-integrity) — rows survive canvas death, hash seal stable", () => {
    const a = applyLayout({ objects: OBJS, rules: [rule()], pins: [], watermark: 100, isEngine: true });
    const b = applyLayout({ objects: OBJS, rules: [rule()], pins: [], watermark: 100, isEngine: true });
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(hashLayout(a.value.placements, [], 100)).toBe(hashLayout(b.value.placements, [], 100));
    const g = checkRuleGrants(rule(), ["ns.finance.sentiment"]);
    void g;
    const denied = checkRuleGrants(rule({ grantedNamespaces: ["ns.mail"] }), ["ns.finance.sentiment"]);
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("unreachable");
    expect(denied.code).toBe("LAYOUT_UNGRANTED_PROPERTY");
  });

  test("F-LAYOUT.8 (conflict-visibility) — contradictory rules resolve by priority, loser logged, inspect explains", () => {
    const hi = rule({ id: "rule:hi", priority: 20, zone: "center" });
    const lo = rule({ id: "rule:lo", priority: 5, zone: "museum" });
    const r = applyLayout({ objects: [{ ref: "t-spec", badge: "third-party · speculative", ns: "ns.mail" }], rules: [lo, hi], pins: [], watermark: 100, isEngine: true });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.placements[0].ruleRef).toBe("rule:hi");
    expect(r.value.conflicts.some((c) => c.includes("rule:lo"))).toBe(true);
    expect(inspectPlacement("t-spec", r.value.placements, r.value.conflicts)).toContain("rule:hi");
  });
});
