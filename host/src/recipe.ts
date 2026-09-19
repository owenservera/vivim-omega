// µhost — recipe.ts: the Recipe is the only grantor. Verify signature (B4), pin atomically,
// and compile composition specs into signed recipes at first boot.
import type { CompositionEntry, CompositionSpec, PluginManifest, Recipe } from "@vivim/omega-contracts";
import { validateManifestHonesty } from "@vivim/omega-contracts";
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { canonicalJson, contentHashDir, contentHashDirAsync, sha256Hex, signJson, verifyJson, atomicWrite } from "./canon.ts";

export interface RecipeVerified { recipe: Recipe; warnings: string[] }

export function parseRecipe(text: string): Recipe {
  const r = JSON.parse(text);
  if (r.recipeVersion !== 1) throw new Error(`recipe: unsupported recipeVersion ${r.recipeVersion}`);
  if (r.hashAlgo !== "sha256") throw new Error(`recipe: unsupported hashAlgo ${r.hashAlgo}`);
  if (typeof r.name !== "string" || !r.name) throw new Error("recipe: missing name");
  if (!Array.isArray(r.composition) || r.composition.length === 0) throw new Error("recipe: empty composition");
  for (const e of r.composition) {
    if (typeof e.id !== "string" || !e.id) throw new Error("recipe: entry missing id");
    if (typeof e.manifestHash !== "string" || !e.manifestHash.startsWith("sha256:")) throw new Error(`recipe: ${e.id} bad manifestHash`);
    if (typeof e.contentHash !== "string" || !e.contentHash.startsWith("sha256:")) throw new Error(`recipe: ${e.id} bad contentHash`);
    if (!e.grant || !Array.isArray(e.grant.capabilities) || !Array.isArray(e.grant.contracts)) throw new Error(`recipe: ${e.id} bad grant`);
    if (typeof e.bootPhase !== "number" || !Number.isInteger(e.bootPhase) || e.bootPhase < 0) throw new Error(`recipe: ${e.id} bad bootPhase`);
    if (typeof e.source !== "string" || typeof e.manifestPath !== "string") throw new Error(`recipe: ${e.id} missing source/manifestPath`);
  }
  if (!r.rootOfTrust || typeof r.rootOfTrust.publicKey !== "string" || typeof r.rootOfTrust.keyId !== "string") throw new Error("recipe: bad rootOfTrust");
  if (typeof r.signature !== "string") throw new Error("recipe: missing signature");
  return r as Recipe;
}

function unsignedRecipe(r: Recipe): Record<string, unknown> {
  const { signature: _sig, ...rest } = r as Recipe & { signature: string };
  return rest as unknown as Record<string, unknown>;
}

export function verifyRecipeSignature(r: Recipe): boolean {
  return verifyJson(unsignedRecipe(r), r.rootOfTrust.publicKey, r.signature);
}

/** Structural law: bootPhase 0 belongs to vivim.law; routed ops are unique (conflict = refuse). */
export function verifyCompositionInvariants(r: Recipe): string[] {
  const errors: string[] = [];
  const phase0 = r.composition.filter((e) => e.bootPhase === 0);
  if (phase0.length !== 1 || phase0[0].id !== "vivim.law") {
    errors.push("bootPhase 0 must be exactly one entry with id 'vivim.law'");
  }
  const seen = new Map<string, string>();
  for (const e of r.composition) {
    for (const op of e.grant.contracts) {
      if (seen.has(op)) errors.push(`routed op conflict: ${op} granted to both ${seen.get(op)} and ${e.id}`);
      seen.set(op, e.id);
    }
  }
  return errors;
}

export function loadPinnedRecipe(vaultDir: string): Recipe | null {
  const p = join(vaultDir, "recipe.pinned");
  if (!existsSync(p)) return null;
  return parseRecipe(readFileSync(p, "utf-8"));
}

export function pinRecipe(vaultDir: string, r: Recipe): void {
  atomicWrite(join(vaultDir, "recipe.pinned"), JSON.stringify(r, null, 2));
}

export function cleanupStaleSwap(vaultDir: string): boolean {
  // D-384: atomicWrite's tmp name is unique (`${path}.tmp-<pid>-<rand>`, the casPut
  // pattern), so the stale-swap sweep matches the whole tmp family — the fixed legacy
  // name first, then any unique-suffixed garbage a mid-swap crash may have left.
  const legacy = join(vaultDir, "recipe.pinned.tmp");
  const existed = existsSync(legacy);
  if (existed) rmSync(legacy, { force: true });
  let swept = false;
  try {
    for (const name of readdirSync(vaultDir)) {
      if (!name.startsWith("recipe.pinned.tmp-")) continue;
      rmSync(join(vaultDir, name), { force: true });
      swept = true;
    }
  } catch { /* unreadable vault dir — boot verify fails closed downstream anyway */ }
  return existed || swept;
}

// ---- compile: the first-boot ceremony (spec → signed manifests + signed recipe) ----

function parseManifest(text: string): PluginManifest {
  const m = JSON.parse(text);
  if (m.manifestVersion !== "1") throw new Error(`manifest: bad manifestVersion`);
  if (typeof m.id !== "string" || !m.id) throw new Error("manifest: missing id");
  if (typeof m.entry !== "string" || !m.entry) throw new Error(`manifest ${m.id}: missing entry`);
  if (typeof m.contentHash !== "string") m.contentHash = "";
  m.publisher ??= { keyId: "", signature: "" };
  m.contributions ??= {}; m.dependencies ??= []; m.capabilities ??= { requested: [] };
  m.runtime ??= { tier: "worker-thread", budget: {} };
  m.granularity ??= "atomic"; // D-340: granularity is data; absent = atomic (the already-extracted default)
  return m as PluginManifest;
}

export interface CompileResult { recipe: Recipe; buildDir: string }

export function compileComposition(
  spec: CompositionSpec, specDir: string, vaultDir: string,
  rootKey: { keyId: string; publicKey: string; privateKeyPem: string },
): CompileResult {
  const buildDir = join(vaultDir, "build", spec.name);
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(join(buildDir, "manifests"), { recursive: true });
  const entries: CompositionEntry[] = [];
  for (const se of spec.entries) {
    const srcDir = resolve(specDir, se.source);
    const manifestPath = join(srcDir, "plugin.json");
    const m = parseManifest(readFileSync(manifestPath, "utf-8"));
    if (m.id !== se.id) throw new Error(`spec entry id ${se.id} does not match manifest id ${m.id}`);
    const honesty = validateManifestHonesty(m); // D-340: dishonest self-reporting refuses the compile (fail-closed)
    if (honesty.length > 0) throw new Error(`manifest honesty: ${honesty.join("; ")}`);
    const contentHash = contentHashDir(srcDir);
    m.contentHash = contentHash;
    const unsigned = { ...m, publisher: { keyId: rootKey.keyId, signature: "" } };
    const signature = signJson(unsigned, rootKey.privateKeyPem);
    const signed: PluginManifest = { ...unsigned, publisher: { keyId: rootKey.keyId, signature } };
    const manifestFile = join(buildDir, "manifests", `${m.id.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`);
    const manifestText = JSON.stringify(signed, null, 2);
    // write-tmp → rename: manifest installs atomically too (B4)
    atomicWrite(manifestFile, manifestText);
    entries.push({
      id: m.id, version: m.version,
      source: relative(buildDir, srcDir),
      manifestPath: relative(buildDir, manifestFile),
      manifestHash: `sha256:${sha256Hex(manifestText)}`,
      contentHash,
      grant: se.grant,
      bootPhase: se.bootPhase,
      ...(se.config ? { config: se.config } : {}),
    });
  }
  const unsignedRecipeObj = {
    recipeVersion: 1, hashAlgo: "sha256", name: spec.name,
    composition: entries, rootOfTrust: { keyId: rootKey.keyId, publicKey: rootKey.publicKey },
  };
  const recipe: Recipe = {
    ...unsignedRecipeObj,
    signature: signJson(unsignedRecipeObj, rootKey.privateKeyPem),
  } as Recipe;
  atomicWrite(join(buildDir, "recipe.json"), JSON.stringify(recipe, null, 2));
  return { recipe, buildDir };
}

/** B1 verification of one entry: manifest digest, publisher signature (vs the RECIPE's root of trust), content hash. */
export function verifyEntryWithRoot(e: CompositionEntry, buildDir: string, rootPublicKey: string): { manifest: PluginManifest | null; errors: string[] } {
  const errors: string[] = [];
  const manifestFile = join(buildDir, e.manifestPath);
  let text: string;
  try { text = readFileSync(manifestFile, "utf-8"); } catch { return { manifest: null, errors: [`manifest unreadable: ${e.manifestPath}`] }; }
  if (`sha256:${sha256Hex(text)}` !== e.manifestHash) errors.push(`manifestHash mismatch for ${e.id}`);
  const m = parseManifest(text);
  const unsigned = { ...m, publisher: { keyId: m.publisher.keyId, signature: "" } };
  if (!verifyJson(unsigned, rootPublicKey, m.publisher.signature)) errors.push(`publisher signature invalid for ${e.id}`);
  const srcDir = resolve(buildDir, e.source);
  if (!existsSync(srcDir)) errors.push(`source dir missing: ${e.source}`);
  else if (contentHashDir(srcDir) !== e.contentHash) errors.push(`contentHash mismatch for ${e.id}`);
  return { manifest: m, errors };
}

/** D-341: async entry verify — same checks, async hash; entries run concurrently via boot verify. */
export async function verifyEntryWithRootAsync(e: CompositionEntry, buildDir: string, rootPublicKey: string): Promise<{ manifest: PluginManifest | null; errors: string[] }> {
  const errors: string[] = [];
  const manifestFile = join(buildDir, e.manifestPath);
  let text: string;
  try { text = readFileSync(manifestFile, "utf-8"); } catch { return { manifest: null, errors: [`manifest unreadable: ${e.manifestPath}`] }; }
  if (`sha256:${sha256Hex(text)}` !== e.manifestHash) errors.push(`manifestHash mismatch for ${e.id}`);
  const m = parseManifest(text);
  const unsigned = { ...m, publisher: { keyId: m.publisher.keyId, signature: "" } };
  if (!verifyJson(unsigned, rootPublicKey, m.publisher.signature)) errors.push(`publisher signature invalid for ${e.id}`);
  const srcDir = resolve(buildDir, e.source);
  if (!existsSync(srcDir)) errors.push(`source dir missing: ${e.source}`);
  else try { if (await contentHashDirAsync(srcDir) !== e.contentHash) errors.push(`contentHash mismatch for ${e.id}`); } catch (err) { errors.push(`contentHash error for ${e.id}: ${String(err)}`); }
  return { manifest: m, errors };
}
