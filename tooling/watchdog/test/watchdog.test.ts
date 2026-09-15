// tooling/watchdog — unit tests: the pure policy classifier (D-360).
// The boot-based falsifiers live in host/test/adversarial.test.ts (cases 13/14).
import { describe, test, expect } from "bun:test";
import { classify } from "../watchdog.ts";

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
});
