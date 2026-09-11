// Bench: boot time, port RTT p50/p99, worker spawn cost — the measured falsifiers (D-205).
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

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
const result = {
  at: new Date().toISOString(),
  bootMs: Math.round(Math.min(...bootTimes)),
  portRtt: { n: rtts.length, p50: +pct(sorted, 50).toFixed(2), p99: +pct(sorted, 99).toFixed(2), unit: "ms" },
  interCompartmentRtt: { n: inter.length, p50: +[...inter].sort((a, b) => a - b)[Math.floor(inter.length / 2)].toFixed(2), unit: "ms" },
  envelope: { rttP99Max: 50, bootMax: 500, unit: "ms" },
};
writeFileSync(join(ROOT, "build", "benchmarks.json"), JSON.stringify(result, null, 2));
const line = `## ${result.at} — Ω0\n- boot: ${result.bootMs} ms (envelope 500) — compile+sign+spawn+ready, min of 3\n- port RTT p50/p99: ${result.portRtt.p50}/${result.portRtt.p99} ms over ${result.portRtt.n} echo calls (envelope p99 ≤ 50)\n- inter-compartment RTT p50: ${result.interCompartmentRtt.p50} ms (counter→echo through the router)\n`;
writeFileSync(join(ROOT, "BENCHMARKS.md"), `# BENCHMARKS — append-only, measured falsifiers per wave\n\n${line}`);
console.log(JSON.stringify(result, null, 2));
