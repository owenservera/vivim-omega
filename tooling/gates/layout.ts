// tooling/gates/layout.ts — D-436 (Ω-6 port of paper D-430): Layout-by-Predicate.
//
// Spatial placement is a deterministic fold over object properties. Rules
// evaluate; pins win absolutely; conflicts resolve by priority; placements
// cite rule + evidence; concealment is refused at the gate; state is sealable;
// scrub is read-only time travel. Pure library (no Bun/OS/DOM imports).
// Falsifier: F-LAYOUT (`tooling/gates/test/f-layout.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface CanvasObject { ref: string; badge: string; ns: string; sentiment?: number; gravity?: number; }
export interface LayoutRule {
  id: string;
  predicate: (o: CanvasObject) => boolean;
  predicateDesc: string;
  zone: string;
  priority: number;
  grantedNamespaces: string[];
  state: "armed" | "paused" | "revoked";
  conceal: boolean;
}
export interface Placement {
  objectRef: string;
  ruleRef: string;
  zone: string;
  evidenceRef: string;
  watermark: number;
}
export interface Pin { objectRef: string; x: number; y: number; pinnedBy: string; pinnedAt: string; }
export interface Refusal { ok: false; code: string; sentence: string; }
export type LayoutResult<T> = { ok: true; value: T } | Refusal;

/** layout.apply — sole writer: the layout engine. Pins immune, concealment refused. */
export function applyLayout(input: {
  objects: CanvasObject[];
  rules: LayoutRule[];
  pins: Pin[];
  watermark: number;
  isEngine: boolean;
}): LayoutResult<{ placements: Placement[]; conflicts: string[] }> {
  if (!input.isEngine) {
    return { ok: false, code: "LAYOUT_NOT_ENGINE", sentence: "Only the layout engine writes placement rows. Your write was refused." };
  }
  for (const r of input.rules) {
    if (r.state !== "armed") continue;
    if (!r.id || r.predicateDesc.trim() === "") {
      return { ok: false, code: "LAYOUT_UNNAMED_RULE", sentence: "No arrangement without a named rule. Tell me how to organize, and I'll organize. I won't guess." };
    }
    if (r.conceal) {
      return { ok: false, code: "LAYOUT_CONCEALMENT", sentence: "A layout rule tried to make an object invisible. Layout arranges; it never conceals. If you want this gone, archive it — that's a different conversation." };
    }
  }
  const pinned = new Set(input.pins.map((p) => p.objectRef));
  const placements: Placement[] = [];
  const conflicts: string[] = [];
  const armed = input.rules.filter((r) => r.state === "armed").sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  for (const o of input.objects) {
    if (pinned.has(o.ref)) {
      for (const r of armed) {
        if (r.predicate(o)) conflicts.push(`layout.conflict ${o.ref}: rule ${r.id} would move a pin from ${input.pins.find((p) => p.objectRef === o.ref)?.pinnedAt}; pin wins`);
      }
      continue;
    }
    const matches = armed.filter((r) => {
      if (!r.grantedNamespaces.includes(o.ns) && !r.grantedNamespaces.includes("*")) return false;
      return r.predicate(o);
    });
    const blocked = armed.find((r) => {
      try { return r.predicate(o); } catch { return false; }
      return false;
    });
    void blocked;
    if (matches.length === 0) {
      placements.push({ objectRef: o.ref, ruleRef: "rule:default-zone", zone: "default", evidenceRef: `${o.ref}:no-match`, watermark: input.watermark });
      continue;
    }
    const [winner, ...losers] = matches;
    placements.push({ objectRef: o.ref, ruleRef: winner.id, zone: winner.zone, evidenceRef: `${o.ref}:${winner.predicateDesc}`, watermark: input.watermark });
    for (const l of losers) conflicts.push(`layout.conflict ${o.ref}: rule ${l.id} loses to ${winner.id} by priority`);
  }
  return { ok: true, value: { placements, conflicts } };
}

/** Ungranted-property rule — refused before evaluation. */
export function checkRuleGrants(rule: LayoutRule, namespaces: string[]): LayoutResult<true> {
  const missing = namespaces.find((n) => !rule.grantedNamespaces.includes(n) && !rule.grantedNamespaces.includes("*"));
  if (missing) {
    return { ok: false, code: "LAYOUT_UNGRANTED_PROPERTY", sentence: `This layout rule reads a property (\`${missing}\`) it hasn't been granted access to. Grant the scope or I won't arrange by it.` };
  }
  return { ok: true, value: true };
}

/** layout.hash — seal of placements + pins at a watermark. */
export function hashLayout(placements: Placement[], pins: Pin[], watermark: number): string {
  return hash53(JSON.stringify([placements, pins, watermark]));
}

/** layout.scrub — read-only render at a historical watermark; never mutates. */
export function scrubLayout(history: Placement[], watermark: number): Placement[] {
  return history.filter((p) => p.watermark <= watermark);
}

/** layout.inspect — why is this object where it is. */
export function inspectPlacement(
  objectRef: string,
  placements: Placement[],
  conflicts: string[],
): string {
  const p = placements.find((x) => x.objectRef === objectRef);
  const base = p ? `${objectRef} sits in ${p.zone} by rule ${p.ruleRef} (${p.evidenceRef})` : `${objectRef} is pinned or default`;
  const rel = conflicts.filter((c) => c.includes(objectRef));
  return rel.length > 0 ? `${base}; conflicts: ${rel.join(" | ")}` : base;
}
