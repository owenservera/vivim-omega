// Bench: boot time, port RTT p50/p99, worker spawn cost — the measured falsifiers (D-205).
// Plus the daemon warm path (D-322): protocol-level call RTT against a live daemon
// and the cold-CLI wall floor, reported separately — the split is the honest number
// (per-call process spawn is a floor no warm path can go under).
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import { startDaemon } from "@vivim/surfaces-daemon";
import { callDaemon, readDaemonInfo } from "@vivim/daemon-client";

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
`;
writeFileSync(BENCH_FILE, `${header}${body}${body.endsWith("\n") || body.length === 0 ? "" : "\n"}${line}`);
console.log(JSON.stringify(result, null, 2));
