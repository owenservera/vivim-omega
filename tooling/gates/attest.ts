// Attest: the existence proof — a real composition boots, real ops round-trip, recovery drills pass.
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, bootWithRecovery, HOST_OPS } from "@vivim/omega-host";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const ROOT = join(import.meta.dir, "../..");

export interface AttestResult { ok: boolean; detail?: unknown; reason?: string }

export async function attest(): Promise<AttestResult> {
  const SPEC = join(ROOT, "compositions/demo.json");
  const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
  const vault = join(ROOT, "dev-vault");
  const bootStart = performance.now();
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  const compileMs = performance.now() - bootStart;
  const host = await bootComposition(recipe, buildDir, vault);
  const bootMs = performance.now() - bootStart;

  const echo = await host.router.callAsRoot("echo.ping@1", { attest: true });
  const bump = await host.router.callAsRoot("counter.bump@1", {});
  const value = await host.router.callAsRoot("counter.value@1", {});
  const stats = await host.router.callAsRoot(HOST_OPS.compartmentStats, {});
  const denial = await host.router.callAsRoot("no.such.op@1", {});
  const deadline = await host.router.callAsRoot("echo.ping@1", { delayMs: 400 }, 60);
  await host.shutdown();

  // recovery drill: mid-swap tmp + replay content mutation (drill vault has its OWN root key).
  // E-9: unique drill dir — a fixed name would collide across concurrent gates on one box.
  const drillVault = omegaTmp("omega-attest", `drill-${Date.now()}-${process.pid}`);
  rmSync(drillVault, { recursive: true, force: true });
  mkdirSync(drillVault, { recursive: true });
  const drillRoot = ensureVault(drillVault).rootKey;
  const c1 = compileComposition(spec, join(SPEC, ".."), drillVault, drillRoot);
  const { pinRecipe } = await import("@vivim/omega-host");
  pinRecipe(drillVault, c1.recipe);
  writeFileSync(join(drillVault, "recipe.pinned.tmp"), "garbage-from-crash");
  const r1 = await bootWithRecovery(drillVault);
  await r1.host?.shutdown();
  const srcFile = join(c1.buildDir, c1.recipe.composition[1].source, "src/index.ts");
  const original = readFileSync(srcFile, "utf-8");
  // try/finally: a crashed drill must never leave the build dir mutated —
  // a leftover "// mutated" would fail every later verify on this vault.
  writeFileSync(srcFile, original + "\n// mutated");
  let r2: Awaited<ReturnType<typeof bootWithRecovery>>;
  try {
    r2 = await bootWithRecovery(drillVault);
    await r2.host?.shutdown();
  } finally {
    writeFileSync(srcFile, original);
  }

  const checks = [
    echo.ok, bump.ok, value.ok, stats.ok,
    !denial.ok && (denial as any).error === "REFUSED",
    !deadline.ok && (deadline as any).error === "BUDGET",
    r1.report.cleanedStaleSwap && r1.report.booted && r1.report.source === "pinned",
    !r2.host && (r2.report.reason ?? "").includes("pinned recipe corrupt"),
  ];
  const ok = checks.every(Boolean);
  return {
    ok,
    detail: {
      compileMs: Math.round(compileMs), bootMs: Math.round(bootMs),
      echo: (echo as any).ok, counterBump: (bump as any)?.ok, counterValue: (value as any)?.value,
      compartments: Object.keys((stats as any).value ?? {}),
      refusalRegister: (denial as any).error, budgetRegister: (deadline as any).error,
      recovery: { midSwapCleaned: r1.report.cleanedStaleSwap, replayRefused: !r2.host },
    },
    reason: ok ? undefined : `attest checks failed: ${checks.map((c, i) => (c ? "" : i)).filter(Boolean).join(",")}`,
  };
}
