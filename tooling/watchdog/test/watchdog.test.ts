// tooling/watchdog — unit tests: the pure policy classifier (D-360) + the
// D-388 per-compartment cadence. The boot-based falsifiers live in
// host/test/adversarial.test.ts (cases 13/14) and the wiring test below.
import { describe, test, expect, afterEach } from "bun:test";
import { classify, budgetStatus, dueForSample, watchdogTickInterval, startWatchdog, type WatchdogBudget } from "../watchdog.ts";

const OPTS = { missLimit: 3, overLimit: 2 };

describe("watchdog classify (D-360 policy)", () => {
  test("healthy compartment stays ok", () => {
    expect(classify({ memMB: 64 }, 0, 0, 1024, OPTS).verdict).toBe("ok");
  });

  test("unresponsive: missStreak at the limit evicts", () => {
    const r = classify({ memMB: 64 }, 3, 0, undefined, OPTS);
    expect(r.verdict).toBe("evict");
    expect(r.reason).toContain("unresponsive");
  });

  test("isolated misses never accumulate (streak resets on answer)", () => {
    expect(classify({ memMB: 64 }, 1, 0, undefined, OPTS).verdict).toBe("ok");
    expect(classify({ memMB: 64 }, 2, 0, undefined, OPTS).verdict).toBe("ok");
  });

  test("memory: overStreak at the limit evicts with the measured heap", () => {
    const r = classify({ memMB: 32 }, 0, 2, 96 * 1024 * 1024, OPTS);
    expect(r.verdict).toBe("evict");
    expect(r.reason).toContain("heap over budget");
    expect(r.reason).toContain("96MB");
  });

  test("memory: one over sample then recovery does not evict", () => {
    expect(classify({ memMB: 64 }, 0, 1, 96 * 1024 * 1024, OPTS).verdict).toBe("ok");
  });

  test("no declared memMB → no memory verdict (unresponsiveness still applies)", () => {
    expect(classify({}, 0, 5, 96 * 1024 * 1024, OPTS).verdict).toBe("ok");
    expect(classify({}, 3, 5, 96 * 1024 * 1024, OPTS).verdict).toBe("evict");
  });

  test("D-366: unresponsive evicts fast, memory evicts graceful", () => {
    expect(classify({ memMB: 64 }, 3, 0, undefined, OPTS).fast).toBe(true);
    expect(classify({ memMB: 32 }, 0, 2, 96 * 1024 * 1024, OPTS).fast).toBe(false);
    expect(classify({ memMB: 64 }, 0, 0, 1024, OPTS).fast).toBe(false);
  });

  test("D-366: budgetStatus distinguishes declared vs default", () => {
    const budgets = new Map([["a", { memMB: 32 }]]);
    expect(budgetStatus("a", budgets, 256)).toEqual({ memMB: 32, declared: true });
    expect(budgetStatus("b", budgets, 256)).toEqual({ memMB: 256, declared: false });
  });
});

describe("D-388 · per-compartment watchdog cadence (the interim L-1 measure)", () => {
  test("dueForSample: never-sampled is always due", () => {
    expect(dueForSample(undefined, 250, undefined, 1000)).toBe(true);
    expect(dueForSample({ intervalMs: 50 }, 250, undefined, 1000)).toBe(true);
  });

  test("dueForSample: a declared interval tightens ONLY its own compartment", () => {
    expect(dueForSample({ intervalMs: 50 }, 250, 1000, 1020)).toBe(false); // 20ms < 50ms
    expect(dueForSample({ intervalMs: 50 }, 250, 1000, 1050)).toBe(true);  // 50ms ≥ 50ms
    // no declaration → the global default governs (250 here): 20ms is NOT due
    expect(dueForSample({ memMB: 64 }, 250, 1000, 1020)).toBe(false);
    expect(dueForSample({ memMB: 64 }, 250, 1000, 1250)).toBe(true);
    // declarations never LOOSEN below the global default's meaning for others —
    // but a declared interval larger than global is honored for that compartment
    expect(dueForSample({ intervalMs: 1000 }, 250, 1000, 1100)).toBe(false);
  });

  test("dueForSample: non-positive/absent declarations fall back to the global cadence", () => {
    expect(dueForSample({ intervalMs: 0 }, 250, 1000, 1250)).toBe(true);
    expect(dueForSample({ intervalMs: -5 }, 250, 1000, 1250)).toBe(true);
    expect(dueForSample({}, 250, 1000, 1250)).toBe(true);
    expect(dueForSample({ intervalMs: 0 }, 250, 1000, 1249)).toBe(false);
  });

  test("watchdogTickInterval: the timer serves the tightest declared cadence, default 250 untouched", () => {
    expect(watchdogTickInterval({}, new Map())).toBe(250);
    expect(watchdogTickInterval({ intervalMs: 100 }, new Map())).toBe(100);
    expect(watchdogTickInterval({}, new Map([["a", { intervalMs: 50 }]]))).toBe(50);
    expect(watchdogTickInterval({ intervalMs: 100 }, new Map([["a", { intervalMs: 50 }]]))).toBe(50);
    // invalid declarations never speed the timer up
    expect(watchdogTickInterval({}, new Map([["a", { intervalMs: 0 }]]))).toBe(250);
    expect(watchdogTickInterval({}, new Map([["a", { intervalMs: -1 }]]))).toBe(250);
  });

  test("wiring: the tight compartment is probed ~5× more often than the default one over the same window", async () => {
    const probes: Record<string, number> = { tight: 0, loose: 0 };
    const timers: ReturnType<typeof setInterval>[] = [];
    const workers = new Map<string, {
      on(evt: string, cb: (m: unknown) => void): void;
      off(evt: string, cb: (m: unknown) => void): void;
      postMessage(m: { type?: string }): void;
    }>();
    const fakeWorker = (id: string) => {
      let w = workers.get(id);
      if (w) return w; // STABLE object per compartment — the watchdog re-resolves it every tick
      const listeners = new Set<(m: unknown) => void>();
      const reply = setInterval(() => {
        for (const cb of listeners) cb({ type: "probeStat", heapUsed: 1024 }); // always responsive
      }, 5);
      timers.push(reply);
      w = {
        on(evt: string, cb: (m: unknown) => void) { if (evt === "message") listeners.add(cb); },
        off(evt: string, cb: (m: unknown) => void) { if (evt === "message") listeners.delete(cb); },
        postMessage(m: { type?: string }) { if (m.type === "probe") probes[id]!++; },
      };
      workers.set(id, w);
      return w;
    };
    const router = {
      status: () => ({ compartments: { tight: { state: "active" }, loose: { state: "active" } } }),
      compartmentWorker: (id: string) => fakeWorker(id),
      journal: () => {},
      callAsRoot: async () => ({ ok: true }),
    } as unknown as Parameters<typeof startWatchdog>[0];
    const budgets = new Map<string, WatchdogBudget>([
      ["tight", { memMB: 64, intervalMs: 40 }],
      ["loose", { memMB: 64 }], // no declaration → the global default (200 here) governs, UNCHANGED
    ]);
    const wd = startWatchdog(router, { intervalMs: 200, budgets });
    await new Promise((r) => setTimeout(r, 700));
    wd.stop();
    for (const t of timers) clearInterval(t);
    // tight (40ms cadence over ~700ms) vs loose (200ms global, unchanged)
    expect(probes.tight!).toBeGreaterThanOrEqual(10);
    expect(probes.loose!).toBeLessThanOrEqual(4);
    expect(probes.tight!).toBeGreaterThan(probes.loose! * 2);
  }, 10_000);
});
