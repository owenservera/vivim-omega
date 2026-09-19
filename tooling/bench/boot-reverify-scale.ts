// D-341 bench: boot re-verify at scale (50/100/300 plugin entries).
// Measures the CURRENT sync contentHashDir mechanism the record calls out:
// generate N fixture dirs with representative file counts/sizes, then time
// the full re-hash loop cold-cache (first pass) + warm-cache (repeat passes).
// Output matches BENCHMARKS.md style (p50/p95 totals + per-entry).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHashDir, contentHashDirAsync } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const TMP = join(ROOT, "tooling/bench/.tmp-reverify");
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];

function makeDir(id: number): string {
  const d = join(TMP, `plug-${id}`);
  mkdirSync(join(d, "src"), { recursive: true });
  const big = `export async function h${id}(x: unknown){ return { id: ${id}, x, at: Date.now() }; }\n`.repeat(20);
  writeFileSync(join(d, "src/index.ts"), big + `// entry ${id}\n`);
  writeFileSync(join(d, "src/util.ts"), `export const tag${id} = "plug-${id}";\n`.repeat(30));
  writeFileSync(join(d, "data.json"), JSON.stringify({ id, pad: "x".repeat(512) }));
  writeFileSync(join(d, "README.md"), `# plug ${id}\nRepresentative fixture.\n`);
  writeFileSync(join(d, "plugin.json"), JSON.stringify({ id: `bench.plug-${id}` }));
  return d;
}

async function scale(n: number): Promise<{ n: number; syncColdMs: number; syncWarmP50: number; syncWarmP95: number; asyncWarmP50: number; asyncWarmP95: number; perEntryMs: number }> {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const dirs: string[] = [];
  for (let i = 0; i < n; i++) dirs.push(makeDir(i));
  const coldT = performance.now();
  for (const d of dirs) contentHashDir(d);
  const syncColdMs = performance.now() - coldT;
  const totals: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    for (const d of dirs) contentHashDir(d);
    totals.push(performance.now() - t);
  }
  totals.sort((a, b) => a - b);
  const atotals: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    await Promise.all(dirs.map((d) => contentHashDirAsync(d)));
    atotals.push(performance.now() - t);
  }
  atotals.sort((a, b) => a - b);
  rmSync(TMP, { recursive: true, force: true });
  const syncWarmP50 = pct(totals, 50);
  return { n, syncColdMs: +syncColdMs.toFixed(1), syncWarmP50: +syncWarmP50.toFixed(1), syncWarmP95: +pct(totals, 95).toFixed(1), asyncWarmP50: +pct(atotals, 50).toFixed(1), asyncWarmP95: +pct(atotals, 95).toFixed(1), perEntryMs: +(syncWarmP50 / n).toFixed(3) };
}

const out: unknown[] = [];
for (const n of [50, 100, 300]) out.push(await scale(n));
console.log(JSON.stringify({ bench: "boot-reverify-scale", at: new Date().toISOString(), scales: out }, null, 2));
