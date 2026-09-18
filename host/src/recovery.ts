// µhost — recovery.ts: B4 fail-closed. Boot either yields a valid composition or preserves
// the previous one. Incoming recipes are pinned only AFTER full verification; a mid-swap
// crash leaves recipe.pinned.tmp* garbage (unique-suffixed since D-384; cleaned on next
// boot) and the old pin intact.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Recipe } from "@vivim/omega-contracts";
import { parseRecipe, verifyRecipeSignature, verifyCompositionInvariants, loadPinnedRecipe, pinRecipe, cleanupStaleSwap, verifyEntryWithRoot } from "./recipe.ts";
import { ensureVault, bootComposition, type BootedHost } from "./boot.ts";

export interface RecoveryReport {
  booted: boolean;
  source: "incoming" | "pinned" | "none";
  cleanedStaleSwap: boolean;
  reason?: string;
}

/**
 * The one boot path. Order: verify incoming (if any) → pin → boot. Verification failure of
 * the incoming recipe falls back to the pinned one; a corrupt pinned pin refuses to boot.
 */
export async function bootWithRecovery(vaultDir: string, incomingRecipeFile?: string): Promise<{ host: BootedHost | null; report: RecoveryReport }> {
  const { rootKey } = ensureVault(vaultDir);
  const cleanedStaleSwap = cleanupStaleSwap(vaultDir);
  const report: RecoveryReport = { booted: false, source: "none", cleanedStaleSwap };

  const tryRecipe = (r: Recipe, buildDir: string): string | null => {
    if (!verifyRecipeSignature(r)) return "recipe signature invalid";
    if (r.rootOfTrust.publicKey !== rootKey.publicKey) return "recipe root-of-trust key mismatch";
    const inv = verifyCompositionInvariants(r);
    if (inv.length > 0) return inv.join("; ");
    for (const e of r.composition) {
      const { errors } = verifyEntryWithRoot(e, resolve(buildDir), r.rootOfTrust.publicKey);
      if (errors.length > 0) return `entry ${e.id}: ${errors.join("; ")}`;
    }
    return null;
  };

  if (incomingRecipeFile && existsSync(incomingRecipeFile)) {
    try {
      const r = parseRecipe(readFileSync(incomingRecipeFile, "utf-8"));
      const buildDir = join(incomingRecipeFile, "..");
      const problem = tryRecipe(r, resolve(buildDir));
      if (!problem) {
        pinRecipe(vaultDir, r);
        const host = await bootComposition(r, buildDir, vaultDir);
        report.booted = true; report.source = "incoming";
        return { host, report };
      }
      report.reason = `incoming recipe rejected: ${problem}`;
    } catch (err) {
      report.reason = `incoming recipe unparseable: ${String(err)}`;
    }
  }

  const pinned = (() => { try { return loadPinnedRecipe(vaultDir); } catch (err) { return { __corrupt: String(err) } as unknown as Recipe | null; } })();
  if (!pinned) {
    report.reason = `${report.reason ?? ""} no pinned recipe — refusing to boot (fail-closed)`.trim();
    return { host: null, report };
  }
  if ((pinned as any).__corrupt) {
    report.reason = `pinned recipe unparseable: ${(pinned as any).__corrupt} — recovery mode (refusing to boot)`;
    return { host: null, report };
  }
  const buildDir = join(vaultDir, "build", pinned.name);
  const problem = tryRecipe(pinned, resolve(buildDir));
  if (problem) {
    report.reason = `pinned recipe corrupt: ${problem} — recovery mode (refusing to boot)`;
    return { host: null, report };
  }
  const host = await bootComposition(pinned, buildDir, vaultDir);
  report.booted = true; report.source = "pinned";
  if (report.reason) console.error(`[recovery] ${report.reason}`);
  return { host, report };
}
