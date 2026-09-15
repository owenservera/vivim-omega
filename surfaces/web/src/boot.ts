// surfaces/web/src/boot.ts — the v1 surface boot (duplicated per surface package by law;
// see surfaces/cli/src/boot.ts header — surfaces stay independent, no cross-surface imports).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootWithRecovery } from "@vivim/omega-host";
import type { BootedHost, RecoveryReport } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";

export interface SurfaceBoot {
  host: BootedHost;
  report: RecoveryReport;
  specPath: string | null;
}

export class SurfaceBootError extends Error {
  constructor(message: string, readonly report: RecoveryReport) { super(message); }
}

const failedReport = (reason: string): RecoveryReport => ({ booted: false, source: "none", cleanedStaleSwap: false, reason });

export async function bootSurface(
  vaultDir: string,
  opts: { composition?: string; recipe?: string; defaultComposition: string },
): Promise<SurfaceBoot> {
  if (opts.recipe) {
    if (!existsSync(opts.recipe)) throw new SurfaceBootError(`recipe not found: ${opts.recipe}`, failedReport(`recipe not found: ${opts.recipe}`));
    const { host, report } = await bootWithRecovery(vaultDir, opts.recipe);
    if (!host) throw new SurfaceBootError(report.reason ?? "boot failed (fail-closed)", report);
    return { host, report, specPath: null };
  }
  const specPath = opts.composition ?? opts.defaultComposition;
  if (!existsSync(specPath)) {
    throw new SurfaceBootError(`composition spec not found: ${specPath}`, failedReport(`composition spec not found: ${specPath}`));
  }
  let spec: CompositionSpec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf-8")) as CompositionSpec; // D-361: node:fs (runtime-neutral)
  } catch (e) {
    throw new SurfaceBootError(`composition spec unparseable: ${String(e)}`, failedReport(`composition spec unparseable: ${String(e)}`));
  }
  const { rootKey } = ensureVault(vaultDir);
  const { recipe } = compileComposition(spec, join(specPath, ".."), vaultDir, rootKey);
  const recipeFile = join(vaultDir, "build", spec.name, "recipe.json");
  const { host, report } = await bootWithRecovery(vaultDir, recipeFile);
  if (!host) throw new SurfaceBootError(report.reason ?? "boot failed (fail-closed)", report);
  return { host, report, specPath };
}
