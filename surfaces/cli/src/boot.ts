// surfaces/cli/src/boot.ts — the v1 surface boot.
//
// v1 honesty (docs/SURFACES.md): surfaces are OUTSIDE-compartment scripts — the
// "root principal" pattern the demo and the host tests use. This module drives
// the µhost's PUBLIC API exactly like the µhost CLI's `compose` path:
//
//   spec → compileComposition (sign each manifest + stamp contentHash + sign the
//   recipe) → bootWithRecovery (verify incoming → pin → spawn compartments).
//
// The surface adds NO boot machinery, NO executors, and NO policy of its own:
// every later call goes through host.router.callAsRoot, so an external trigger
// enters the SAME Gate → Resolve → Execute flow as any in-compartment call.
//
// (Duplicated per surface package — surfaces stay independent packages with no
// cross-surface imports; same discipline as plugin-side canon.ts duplication.)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootWithRecovery } from "@vivim/omega-host";
import type { BootedHost, RecoveryReport } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";

export interface SurfaceBoot {
  host: BootedHost;
  report: RecoveryReport;
  /** The composition spec this boot compiled (null when booted via --recipe). */
  specPath: string | null;
}

/** Boot failed — the surface refuses to run (fail-closed, B4). */
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
    throw new SurfaceBootError(`composition spec unparseable: ${String(e)}`, failedReport(`composition spec unparseable: ${specPath}`));
  }
  const { rootKey } = ensureVault(vaultDir);
  const { recipe } = compileComposition(spec, join(specPath, ".."), vaultDir, rootKey);
  const recipeFile = join(vaultDir, "build", spec.name, "recipe.json");
  const { host, report } = await bootWithRecovery(vaultDir, recipeFile);
  if (!host) throw new SurfaceBootError(report.reason ?? "boot failed (fail-closed)", report);
  return { host, report, specPath };
}
