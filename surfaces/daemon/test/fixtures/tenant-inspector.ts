// Fixture tenant B: observes every channel tenant A could have polluted and
// reports home on probe. Runs in a FRESH isolate per pool design — any observed
// residue is a state-bleed proof (the ship-blocker for D-329).
import { parentPort, threadId } from "node:worker_threads";
import { box } from "./tenant-shared.ts";

const g = globalThis as Record<string, unknown>;
parentPort!.on("message", (m: unknown) => {
  if ((m as { type?: unknown })?.type !== "inspect") return;
  parentPort!.postMessage({
    type: "inspection",
    threadId,
    bleed: g.__bleed ?? null,
    ticks: g.__ticks ?? null,
    fn: typeof g.__fn,
    sharedBox: (box as { value: unknown }).value ?? null,
  });
});
