// D-392 falsifier: same-compartment flood (Homa analog).
// 20 slow busyMs=150 flood echo.ping@1, then 50 fast calls must jump via cap.
// Before: fast p99 toward SLOW_N*BUSY, timeouts>0. After: p99 bounded, timeouts~0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
const SPEC = join(ROOT, "compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const vault = join(ROOT, "dev-vault-bench-priority");
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);
const SLOW_N = 20, SLOW_BUSY_MS = 150, FAST_N = 50, FAST_DEADLINE_MS = 500;
const slow = Array.from({ length: SLOW_N }, () => host.router.callAsRoot("echo.ping@1", { busyMs: SLOW_BUSY_MS }));
const fastTimes: number[] = [];
let timedOut = 0;
const fast = Array.from({ length: FAST_N }, async (_, i) => {
  await new Promise((r) => setTimeout(r, i * 2));
  const t = performance.now();
  const r = await host.router.callAsRoot("echo.ping@1", {}, FAST_DEADLINE_MS);
  if (r.ok) fastTimes.push(performance.now() - t); else timedOut++;
});
await Promise.all([...slow, ...fast]);
await host.shutdown();
fastTimes.sort((a, b) => a - b);
console.log(JSON.stringify({ slowN: SLOW_N, slowBusyMs: SLOW_BUSY_MS, fastN: FAST_N, fastRtt: { n: fastTimes.length, p50: +pct(fastTimes, 50).toFixed(1), p99: +pct(fastTimes, 99).toFixed(1) }, timedOut }, null, 2));
