// D-398 signal unit tests.
import { describe, test, expect } from "bun:test";
import { crossed, breachEvent, chainBroken, SWEEP_INTERVAL_MS } from "../src/signals.ts";

describe("D-398 signals", () => {
  test("crossed finds newly load-bearing ids only", () => {
    const prev = [{ id: "a", fanIn: 6, blastRadius: 1 }];
    const next = [...prev, { id: "b", fanIn: 7, blastRadius: 2 }];
    expect(crossed(prev, next)).toEqual([{ id: "b", fanIn: 7, blastRadius: 2 }]);
    expect(crossed(next, next)).toEqual([]);
  });
  test("breach carries compartment plus numbers", () => {
    const b = breachEvent("ghost.hog", 150, 32);
    expect(b.compartment).toBe("ghost.hog");
    expect(b.measuredMB).toBe(150);
  });
  test("chain-broken is most severe boolean", () => {
    expect(chainBroken(false)).toBe(true);
    expect(chainBroken(true)).toBe(false);
  });
  test("sweep interval justified, not round-default", () => {
    expect(SWEEP_INTERVAL_MS).toBe(5000);
  });
});
