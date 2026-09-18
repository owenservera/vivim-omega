// Bench: boot time, port RTT p50/p99, worker spawn cost — the measured falsifiers (D-205).
// Plus the daemon warm path (D-322): protocol-level call RTT against a live daemon
// and the cold-CLI wall floor, reported separately — the split is the honest number
// (per-call process spawn is a floor no warm path can go under).
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import { startDaemon } from "@vivim/surfaces-daemon";
import { callDaemon, readDaemonInfo } from "@vivim/daemon-client";
import { IsolatePool } from "../../surfaces/daemon/src/pool.ts";

const ROOT = join(import.meta.dir, "../..");

function pct(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]; }

const SPEC = join(ROOT, "compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const vault = join(ROOT, "dev-vault");
rmSync(vault, { recursive: true, force: true });
mkdirSync(vault, { recursive: true });
const { rootKey } = ensureVault(vault);

// boot: 3 cold compiles+boots
const bootTimes: number[] = [];
for (let i = 0; i < 3; i++) {
  const t = performance.now();
  const { recipe, buildDir } = compileComposition({ ...spec, name: `bench${i}` }, join(SPEC, ".."), vault, rootKey);
  const host = await bootComposition(recipe, buildDir, vault);
  bootTimes.push(performance.now() - t);
  await host.shutdown();
}

// warm composition for RTT + spawn
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);

const rtts: number[] = [];
for (let i = 0; i < 200; i++) {
  const t = performance.now();
  const r = await host.router.callAsRoot("echo.ping@1", { i });
  if (r.ok) rtts.push(performance.now() - t);
}
const inter: number[] = [];
for (let i = 0; i < 50; i++) {
  const t = performance.now();
  const r = await host.router.callAsRoot("counter.bump@1", {});
  if (r.ok) inter.push(performance.now() - t);
}
await host.shutdown();

const sorted = [...rtts].sort((a, b) => a - b);

// Daemon warm path (same demo composition, real TCP protocol, in-process server):
// protocol-level call RTT distribution + one cold-CLI wall sample (the spawn floor).
const daemonVault = join(ROOT, "dev-vault-bench-daemon");
rmSync(daemonVault, { recursive: true, force: true });
const daemon = await startDaemon({ vaultDir: daemonVault, specPath: SPEC, idleMs: 120_000 });
const daemonInfo = readDaemonInfo(daemonVault)!;
const daemonRtts: number[] = [];
for (let i = 0; i < 50; i++) {
  const t = performance.now();
  const r = await callDaemon(daemonInfo, "call", { op: "echo.ping@1", payload: { i } });
  if (r.ok) daemonRtts.push(performance.now() - t);
}
await daemon.close();
rmSync(daemonVault, { recursive: true, force: true });
const dsorted = [...daemonRtts].sort((a, b) => a - b);

// Pool burst awareness (D-388, perf review round 2 §2.2): a burst of concurrent
// checkouts was assumed to degrade to cold spawns once it outgrew the pool.
// MEASURED (falsifier + this case): refill() runs synchronously inside acquire(),
// so the stock never starves — instead each burst checkout pays a fresh inline
// thread spawn. The wall cost IS the degradation signal, now measured every run
// alongside hits/coldFallbacks (coldFallbacks = Worker construction failed, the
// worse signal) and mirrored live by the daemon `status` op's pool snapshot.
const BURST_N = 8;
const BURST_POOL_SIZE = 2;
const burstEntry = join(ROOT, "examples/plugin-echo/src/index.ts");
const burstPool = new IsolatePool(BURST_POOL_SIZE);
burstPool.start();
const burstT0 = performance.now();
const burstWorkers = await Promise.all(Array.from({ length: BURST_N }, () => burstPool.acquire(burstEntry)));
const burstWall = performance.now() - burstT0;
const burstStats = burstPool.snapshot();
await burstPool.shutdown();
// acquired workers belong to their consumer (the bench here) — terminate exactly once
await Promise.all(burstWorkers.filter((w): w is Worker => w !== null).map((w) => w.terminate().catch(() => {})));

// Cold floor: one full CLI child process, warm vault, --no-daemon (documents what
// the warm path removes; machine-dependent — spawn-dominated, not product-dominated).
const coldVault = join(ROOT, "dev-vault-bench-cold");
rmSync(coldVault, { recursive: true, force: true });
const coldChild = Bun.spawn(
  ["bun", "run", join(ROOT, "surfaces/cli/src/cli.ts"), "call", "echo.ping@1", '{"i":0}',
    "--vault", coldVault, "--composition", SPEC, "--no-daemon"],
  { stdout: "ignore", stderr: "ignore" },
);
const coldT0 = performance.now();
await coldChild.exited;
const coldCliMs = Math.round(performance.now() - coldT0);
rmSync(coldVault, { recursive: true, force: true });

const result = {
  at: new Date().toISOString(),
  bootMs: Math.round(Math.min(...bootTimes)),
  portRtt: { n: rtts.length, p50: +pct(sorted, 50).toFixed(2), p99: +pct(sorted, 99).toFixed(2), unit: "ms" },
  interCompartmentRtt: { n: inter.length, p50: +[...inter].sort((a, b) => a - b)[Math.floor(inter.length / 2)].toFixed(2), unit: "ms" },
  envelope: { rttP99Max: 50, bootMax: 500, unit: "ms" },
  daemonCallRtt: { n: daemonRtts.length, p50: +(dsorted.length ? pct(dsorted, 50).toFixed(2) : -1), unit: "ms" },
  poolBurst: {
    n: BURST_N, poolSize: BURST_POOL_SIZE, wallMs: +burstWall.toFixed(1),
    hits: burstStats.hits, coldFallbacks: burstStats.coldFallbacks,
    fallbackRate: +((burstStats.coldFallbacks / Math.max(1, burstStats.checkouts)) * 100).toFixed(1),
    unit: "ms", note: "MEASURED: sync refill serves every burst checkout from parked stock (0 fallbacks) — the burst cost is the inline thread spawn per checkout; size the pool ≥ peak concurrent boots (D-388)",
  },
  coldCliCallMs: coldCliMs,
};
writeFileSync(join(ROOT, "build", "benchmarks.json"), JSON.stringify(result, null, 2));
// Append-only: preserve every prior wave's entry (the old code overwrote the file
// despite the header claiming append-only). Header match is loose (first line
// starting with "# BENCHMARKS") because historical entries vary in dash style.
const BENCH_FILE = join(ROOT, "BENCHMARKS.md");
const prev = existsSync(BENCH_FILE) ? readFileSync(BENCH_FILE, "utf-8") : "";
const header = "# BENCHMARKS — append-only, measured falsifiers per wave\n\n";
const firstNl = prev.indexOf("\n");
const hasHeader = firstNl >= 0 && prev.slice(0, firstNl).startsWith("# BENCHMARKS");
const body = hasHeader ? prev.slice(firstNl + 1).replace(/^\r?\n/, "") : prev;
const line = `## ${result.at} — daemon warm path (D-322)
- daemon call RTT p50: ${result.daemonCallRtt.p50} ms over ${result.daemonCallRtt.n} protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: ${result.coldCliCallMs} ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
- pool burst (D-388): ${result.poolBurst.n} concurrent checkouts vs poolSize ${result.poolBurst.poolSize} → ${result.poolBurst.hits} hit / ${result.poolBurst.coldFallbacks} cold fallbacks (${result.poolBurst.fallbackRate}% fallback rate) in ${result.poolBurst.wallMs} ms wall — the burst-degradation signal is measured, not invisible
`;
writeFileSync(BENCH_FILE, `${header}${body}${body.endsWith("\n") || body.length === 0 ? "" : "\n"}${line}`);
console.log(JSON.stringify(result, null, 2));
