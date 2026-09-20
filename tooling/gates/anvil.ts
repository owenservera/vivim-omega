// tooling/gates/anvil.ts — the ANVIL freeze (Omega Forge Wave 0, D-404).
// The anvil is the frozen pre-boot edge: the sdk package whose load-bearing
// exports are the five functions everything else strikes against —
//   parseManifest · validateManifest · signPluginDir · contentHashDir · createPortClient
// (plus their support surface: the zod mirror, the streaming consumer half
// D-352, and — as the one-time Wave 0 allowance — the generality validators
// D-405). It is NOT a Forge, it hosts no builder logic, and it does not grow:
// after Wave 0 the rule is remove-to-add, exactly as B5 freezes the host.
//
// Two walls, both hard-gated:
//   anvil-loc     — sdk/src ≤ ANVIL_BUDGET LOC (the house counting method,
//                   same as gate.ts §1 host-loc: every .ts line in the dir)
//   anvil-surface — the exported names of @vivim/omega-sdk must equal the
//                   frozen ANVIL_EXPORT_SURFACE snapshot. A new export or a
//                   removed one fails until the snapshot is amended by a
//                   decision record (the "no new exported function without a
//                   D-record" law, mechanically enforced).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** D-404: measured pre-Wave-0 baseline 721 + 126 landed generality-validator
 *  lines + 3 headroom. After Wave 0: remove-to-add, no exceptions. */
export const ANVIL_BUDGET = 860;

/** The frozen export surface of @vivim/omega-sdk (sorted). Amending this list
 *  requires a decision record in the same commit — the surface-shape test and
 *  the gate's anvil-surface check both fail on any silent drift. */
export const ANVIL_EXPORT_SURFACE: readonly string[] = [
  "CompositionEntrySchema", "CompositionSpecEntrySchema", "CompositionSpecSchema",
  "ConsentGrantSchema", "ContributionSchema", "DependencyRefSchema",
  "EVIDENCE_REF_PATTERN", "FRESHNESS_STATES", "GENEROSITY_LEVELS", "GeneralitySchema",
  "HASH_PATTERN", "ID_PATTERN", "LangContributionSchema", "LangFrameSlotSchema",
  "LangLexiconEntrySchema", "LangOpFrameSchema", "LawDecisionSchema",
  "MINE_PATTERN", "OP_PATTERN", "PORT_ERROR_CODES", "PluginManifestSchema",
  "PortMessageSchema", "PortResultSchema", "RISK_CLASSES", "RUNTIME_TIERS",
  "RecipeSchema", "RefusalReportSchema", "VERSION_PATTERN",
  "contentHash", "contentHashDir", "createPortClient", "describeGrants",
  "grantableFromOps", "keyIdForPrivateKey", "parseManifest", "parseRecipeShape",
  "signJson", "signManifest", "signPluginDir", "streamRootCall",
  "validateComposition", "validateGenerality", "validateManifest", "verifyJson", "verifyManifest",
];

/** The house LOC-counting method (gate.ts §1): every line of every .ts file
 *  directly in the dir, blank and comment lines included — the wall is the
 *  wall, comment-golf is not a diet. */
export function anvilLoc(sdkSrc: string): number {
  let total = 0;
  for (const f of readdirSync(sdkSrc)) {
    const p = join(sdkSrc, f);
    if (statSync(p).isDirectory()) continue;
    if (!f.endsWith(".ts")) continue;
    total += readFileSync(p, "utf-8").split("\n").length;
  }
  return total;
}

export interface AnvilLocResult { ok: boolean; loc: number; budget: number; issues: string[] }

/** The LOC wall. Fails with the overage named — the fix is removal, not amendment. */
export function checkAnvilLoc(sdkSrc: string, budget: number = ANVIL_BUDGET): AnvilLocResult {
  const loc = anvilLoc(sdkSrc);
  const issues: string[] = [];
  if (loc > budget) {
    issues.push(`anvil (sdk/src) is ${loc} LOC (budget ${budget}, frozen D-404) — remove-to-add: the pre-boot edge does not grow`);
  }
  return { ok: issues.length === 0, loc, budget, issues };
}

export interface AnvilSurfaceResult { ok: boolean; added: string[]; removed: string[]; issues: string[] }

/** The surface wall: exported names must equal the frozen snapshot exactly.
 *  `exported` is the live key set of the sdk entry point (the gate imports it
 *  and hands the keys over; tests hand synthetic sets). */
export function checkAnvilSurface(exported: readonly string[]): AnvilSurfaceResult {
  const frozen = new Set(ANVIL_EXPORT_SURFACE);
  const live = new Set(exported);
  const added = [...live].filter((k) => !frozen.has(k)).sort();
  const removed = [...frozen].filter((k) => !live.has(k)).sort();
  const issues: string[] = [];
  if (added.length > 0) {
    issues.push(`anvil surface grew without a decision record: new exports ${added.join(", ")} — amend ANVIL_EXPORT_SURFACE + a D-record in the same commit, or move the surface into a plugin`);
  }
  if (removed.length > 0) {
    issues.push(`anvil surface shrank without a decision record: missing exports ${removed.join(", ")} — a freeze erodes in both directions; amend with a D-record or restore the export`);
  }
  return { ok: issues.length === 0, added, removed, issues };
}

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  const loc = checkAnvilLoc(join(ROOT, "sdk/src"));
  console.log(JSON.stringify(loc, null, 2));
  process.exit(loc.ok ? 0 : 1);
}
