// Part1 §3: law + vault saturation to failure (not just light-load ops/s).
// Ramps concurrency, finds where queue stops draining, measures blast radius
// on unrelated plugins + deadline interaction. Output matches BENCHMARKS.md.
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];

const SPEC = join(ROOT, "compositions/spine.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
spec.entries.push({ id: "vivim.kernel-lens", source: "../plugins/vivim-kernel-lens", bootPhase: 2, grant: { capabilities: ["host.kernel.lens"], contracts: ["kernel.centrality@1", "kernel.audit.verify@1"] } });
const vault = join(ROOT, "dev-vault-saturation");
rmSync(vault, { recursive: true, force: true });
mkdirSync(vault, { recursive: true });
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);

const probe = await host.router.callAsRoot("risky.op@1", { i: -1 });
const consentId = (probe.detail?.match(/consent_[0-9a-f]{16}/) ?? [])[0];
if (consentId) await host.router.callAsRoot("law.consent.grant@1", { consentId, principal: "root", scope: "risky.op@1" });

async function lawLevel(width: number, n: number): Promise<unknown> {
  const lat: number[] = [];
  let timedOut = 0;
  const t0 = performance.now();
  const unrelated: number[] = [];
  const storm = Array.from({ length: n }, async (_, i) => {
    const s = performance.now();
    const r = await host.router.callAsRoot("risky.op@1", { i }, 2000);
    if (r.ok) lat.push(performance.now() - s);
    else timedOut++;
  });
  const probeUnrelated = (async () => {
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const r = await host.router.callAsRoot("echo.ping@1", { i });
      if (r.ok) unrelated.push(performance.now() - s);
      await new Promise((r) => setTimeout(r, 10));
    }
  })();
  await Promise.all([...storm, probeUnrelated]);
  const wall = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  unrelated.sort((a, b) => a - b);
  return { width, n, opsPerSec: Math.round(lat.length / wall), p50Ms: +pct(lat, 50).toFixed(2), p99Ms: +pct(lat, 99).toFixed(2), timedOut, unrelatedP50Ms: unrelated.length ? +pct(unrelated, 50).toFixed(2) : -1 };
}

async function vaultLevel(width: number, n: number): Promise<unknown> {
  const lat: number[] = [];
  const t0 = performance.now();
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    const s = performance.now();
    const r = await host.router.callAsRoot("vault.append@1", { ns: "sat", id: `w-${width}-${i}`, data: { i } });
    if (r.ok) lat.push(performance.now() - s);
  }));
  const wall = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const r0 = performance.now();
  await host.router.callAsRoot("vault.get@1", { ns: "sat", id: "w-10-0" });
  const readMs = performance.now() - r0;
  return { width, n, writesPerSec: Math.round(lat.length / wall), p50Ms: +pct(lat, 50).toFixed(2), p99Ms: +pct(lat, 99).toFixed(2), readAfterMs: +readMs.toFixed(2) };
}

const law: unknown[] = [];
for (const w of [10, 20, 40]) law.push(await lawLevel(w, w * 10));
const vaultW: unknown[] = [];
for (const w of [10, 20, 40]) vaultW.push(await vaultLevel(w, 100));
await host.shutdown();
rmSync(vault, { recursive: true, force: true });
console.log(JSON.stringify({ bench: "law-vault-saturation", at: new Date().toISOString(), law, vault: vaultW }, null, 2));
