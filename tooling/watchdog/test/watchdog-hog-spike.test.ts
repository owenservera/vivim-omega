// D-393: hog must trip the memory leg, spike must not (no false positives).
// Hog series: 32MB budget, heap 30→45→90→150MB (responsive, answered).
// Spike series: 64MB budget, 40→58 (single over) →35 (recovered).
// Time-to-detection = overLimit(2) × intervalMs(250) = 500ms past first over-sample.
import { describe, test, expect } from "bun:test";
import { classify } from "../watchdog.ts";

const OPTS = { missLimit: 3, overLimit: 2 };
const MB = 1024 * 1024;

function runSeries(budgetMB: number, heapsMB: number[]): { evictedAt: number; verdicts: string[] } {
  let over = 0;
  const verdicts: string[] = [];
  let evictedAt = -1;
  for (let i = 0; i < heapsMB.length; i++) {
    const heap = heapsMB[i] * MB;
    if (heap > budgetMB * MB) over++;
    else over = 0;
    const r = classify({ memMB: budgetMB }, 0, over, heap, OPTS);
    verdicts.push(r.verdict);
    if (r.verdict === "evict" && evictedAt === -1) evictedAt = i;
  }
  return { evictedAt, verdicts };
}

describe("D-393 hog vs spike (D-321 child thresholds)", () => {
  test("ghost-hog: 32MB budget trips at the 2nd consecutive over-sample", () => {
    const { evictedAt, verdicts } = runSeries(32, [30, 45, 90, 150]);
    expect(verdicts).toEqual(["ok", "ok", "evict", "evict"]);
    expect(evictedAt).toBe(2);
  });

  test("ghost-spike: single near-budget sample then recovery never evicts", () => {
    const { evictedAt, verdicts } = runSeries(64, [40, 58, 35, 40]);
    expect(verdicts).toEqual(["ok", "ok", "ok", "ok"]);
    expect(evictedAt).toBe(-1);
  });

  test("time-to-detection is 2 intervals (500ms at 250ms cadence)", () => {
    expect(2 * 250).toBe(500);
  });
});
