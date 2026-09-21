// tooling/gates/test/f-liveness.test.ts — the F-LIVENESS falsifier.
// Generated from D-444 by `omega:loop --stub D-444` (D-426, Ω-DEV.2).
// Implemented (D-444): every clause runs a real verdict against
// tooling/gates/live.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  demotionSignal,
  history,
  probe,
  pulse,
  schemaDrift,
  silentFallback,
  type LivenessContract,
} from "../live.ts";

const CONTRACT: LivenessContract = { maxTTFTms: 2000, maxTokenRateMs: 50, schemaStrictness: "strict", heartbeatIntervalS: 3600 };

describe("F-LIVENESS (D-444)", () => {
  test("F-LIVENESS.1 (latency-injection) — 5s TTFT on 2s contract completes degraded with warning", () => {
    const p = pulse({
      realizationRef: "provider.x",
      measuredAt: 1,
      ttftMs: 5000,
      tokenRateMs: 40,
      schemaPasses: 5,
      schemaTotal: 5,
      evidenceRefs: ["w5:turn:881"],
      contract: CONTRACT,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) throw new Error("unreachable");
    expect(p.value.state).toBe("degraded");
    const phantom = pulse({
      realizationRef: "provider.x",
      measuredAt: 1,
      ttftMs: 100,
      tokenRateMs: 10,
      schemaPasses: 1,
      schemaTotal: 1,
      evidenceRefs: [],
      contract: CONTRACT,
    });
    expect(phantom.ok).toBe(false);
    if (phantom.ok) throw new Error("unreachable");
    expect(phantom.code).toBe("LIVENESS_PHANTOM_METRIC");
  });

  test("F-LIVENESS.2 (schema-drift) — dropped fields sink pass rates, breach signals", () => {
    const p = pulse({
      realizationRef: "provider.y",
      measuredAt: 2,
      ttftMs: 300,
      tokenRateMs: 20,
      schemaPasses: 1,
      schemaTotal: 4,
      evidenceRefs: ["w5:1", "w5:2", "w5:3", "w5:4"],
      contract: CONTRACT,
    });
    expect(p.ok && p.value.state).toBe("degraded");
    const drift = schemaDrift("provider.y", 3);
    expect(drift.ok).toBe(true);
    const swap = silentFallback();
    expect(swap.code).toBe("LIVENESS_SILENT_FALLBACK");
  });

  test("F-LIVENESS.3 (zombie-probe) — hung port times out per contract to critical", () => {
    const hung = probe({ lastInvokedAt: 0, nowMs: 7200 * 1000, heartbeatIntervalS: 3600, budgetGranted: true, responds: false });
    expect(hung.ok && hung.value.state).toBe("critical");
    const fresh = probe({ lastInvokedAt: 7100 * 1000, nowMs: 7200 * 1000, heartbeatIntervalS: 3600, budgetGranted: true, responds: true });
    expect(fresh.ok && fresh.value.state).toBe("healthy");
  });

  test("F-LIVENESS.4 (handoff) — 24h degraded consumes into badge proposals", () => {
    const pulses = [1, 2, 3].map((i) => ({
      realizationRef: "provider.z",
      measuredAt: i * 10 * 3600 * 1000,
      ttftMs: 9000,
      tokenRateMs: 200,
      schemaPassRate: 0.2,
      state: "degraded" as const,
      evidenceRefs: [`w5:${i}`],
    }));
    const { signal } = demotionSignal(pulses, 24 * 3600 * 1000, 3 * 10 * 3600 * 1000);
    expect(signal).toBe(true);
    const single = demotionSignal(pulses.slice(0, 1), 24 * 3600 * 1000, 10 * 3600 * 1000);
    expect(single.signal).toBe(false); // one pulse never sustains
  });

  test("F-LIVENESS.5 (ledger-query) — latency history folds from rows, never RAM-hidden", () => {
    const rows = [
      { realizationRef: "x", measuredAt: 200, ttftMs: 400, tokenRateMs: 10, schemaPassRate: 1, state: "healthy" as const, evidenceRefs: ["w5:1"] },
      { realizationRef: "x", measuredAt: 100, ttftMs: 9000, tokenRateMs: 10, schemaPassRate: 1, state: "degraded" as const, evidenceRefs: ["w5:0"] },
    ];
    expect(history(rows).map((h) => h.at)).toEqual([100, 200]);
  });
});
