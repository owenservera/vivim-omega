// tooling/gates/test/f-adapt.test.ts — the F-ADAPT falsifier.
// Generated from D-446 by `omega:loop --stub D-446` (D-426, Ω-DEV.2).
// Implemented (D-446): every clause runs a real verdict against
// tooling/gates/adapt.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  auditPrefetch,
  directExec,
  dumbSwitch,
  registerAdaptation,
  silentOverride,
  vetoCheck,
} from "../adapt.ts";

describe("F-ADAPT (D-446)", () => {
  test("F-ADAPT.1 (propose-dispose) — pinned-moving proposal vetoed, logged, proposer adapts", () => {
    const exec = directExec("ml-layout");
    expect(exec.code).toBe("ADAPT_DIRECT_EXEC");
    const veto = vetoCheck({ pinned: true, layerId: "ml-layout", objectRef: "t-home" });
    expect(veto.ok).toBe(true);
    if (!veto.ok) throw new Error("unreachable");
    expect(veto.value.conflict).toContain("LAYOUT_PIN_CONFLICT");
    expect(silentOverride().code).toBe("ADAPT_SILENT_OVERRIDE");
  });

  test("F-ADAPT.2 (global-dumb) — kill-switch drops ML, deterministic rules carry all function", () => {
    const { active, fallenBack } = dumbSwitch(new Set(["aperture-ml", "layout-ml"]), "global");
    expect(active.size).toBe(0);
    expect(fallenBack).toHaveLength(2); // nothing halts: baselines take over
    const scoped = dumbSwitch(new Set(["aperture-ml", "layout-ml"]), "layout-ml");
    expect(scoped.active.has("aperture-ml")).toBe(true);
    expect(scoped.active.has("layout-ml")).toBe(false);
  });

  test("F-ADAPT.3 (transparency-audit) — prefetchwhy shows scorer, confidence, inputs, badge", () => {
    const words = auditPrefetch({ scorer: "scorer:qwen-v1", confidence: 0.81, inputs: ["ns.docs:100"], badge: "third-party · speculative" });
    expect(words).toContain("scorer:qwen-v1");
    expect(words).toContain("0.81");
    expect(words).toContain("ns.docs:100");
    const hidden = registerAdaptation({ id: "ml-x", fallback: "recency", revoked: false, weightsRef: null });
    expect(hidden.ok).toBe(false);
    if (hidden.ok) throw new Error("unreachable");
    expect(hidden.code).toBe("ADAPT_HIDDEN_STATE");
  });

  test("F-ADAPT.4 (fallback-survival) — ML death freezes state, manual substrate continues", () => {
    const noFallback = registerAdaptation({ id: "ml-y", fallback: "", revoked: false, weightsRef: "vault:weights:1" });
    expect(noFallback.ok).toBe(false);
    if (noFallback.ok) throw new Error("unreachable");
    expect(noFallback.code).toBe("ADAPT_NO_FALLBACK");
    const good = registerAdaptation({ id: "ml-y", fallback: "chronological-stack", revoked: false, weightsRef: "vault:weights:1" });
    expect(good.ok).toBe(true); // registered WITH fallback: death degrades, never throws
  });
});
