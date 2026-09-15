// tooling/watchdog/resourcelimits-probe.ts — D-321's repro, re-run per runtime/upgrade.
// Spawns a worker with the tightest resourceLimits configuration and applies
// old-generation OBJECT pressure (Buffer probes are vacuous — Buffers sit outside
// the V8 heap on every runtime). Outcome recorded in BENCHMARKS.md + D-360 evidence.
//
// Run: bun run tooling/watchdog/resourcelimits-probe.ts [capMB] [targetMB]
import { Worker } from "node:worker_threads";

const capMB = Number(process.argv[2] ?? 32);
const targetMB = Number(process.argv[3] ?? 217); // D-321's observed runaway size
const expected = Math.floor(targetMB / 16) + 1;  // a grow sample every 16MB + the done sample

const workerSrc = `
const { parentPort } = require("node:worker_threads");
const keep = [];
for (let i = 0; i < ${targetMB}; i++) {
  keep.push(new Array(131072).fill(i)); // ~1MB of old-gen objects per iteration
  if (i % 16 === 15) parentPort.postMessage({ grow: process.memoryUsage().heapUsed });
}
parentPort.postMessage({ done: process.memoryUsage().heapUsed });
`;

const worker = new Worker(workerSrc, { eval: true, resourceLimits: { maxOldGenerationSizeMb: capMB, maxYoungGenerationSizeMb: capMB / 2 } });
const t0 = Date.now();
let peak = 0;
let received = 0;
let threw = "";
const finish = (exitCode: number): void => {
  const verdict = threw
    ? `ENFORCED (worker threw: ${threw})`
    : peak === 0
      ? "INCONCLUSIVE (no samples received — probe bug, do not cite)"
      : peak > capMB * 1024 * 1024
        ? `NOT ENFORCED (heap grew to ${Math.round(peak / 1048576)}MB inside a ${capMB}MB cap, no error)`
        : "enforced-or-bounded (heap stayed under cap)";
  console.log(JSON.stringify({ capMB, targetMB, peakHeapMB: Math.round(peak / 1048576), samples: received, exitCode, wallMs: Date.now() - t0, verdict }, null, 2));
  process.exit(0);
};
worker.on("message", (m: { grow?: number; done?: number; threw?: string }) => {
  received++;
  const heap = m.grow ?? m.done ?? 0;
  if (heap > peak) peak = heap;
  if (m.threw) threw = m.threw;
  if (m.done !== undefined || received >= expected) setTimeout(() => finish(0), 50); // let trailing messages drain
});
worker.on("error", (e) => { threw = String(e); finish(1); });
setTimeout(() => finish(-1), 30_000); // never hang the gate path
