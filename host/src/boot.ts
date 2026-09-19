// µhost — boot.ts: verify everything (B1/B4), then spawn compartments in bootPhase order
// (phase 0 = vivim.law, enforced at verify time), mint tokens, wire the router.
// D-340: boot first attaches the genesis kernel (5 nodes, 2 closing grants — the ONLY
// hardcoded identities) to the router; every Recipe entry then registers as ordinary
// data on top of it. Genesis closes on itself; the phase-0 law rule still guards boot
// order for the gate. Two rules, one kernel, no per-composition genesis.
import type { PluginManifest, Recipe } from "@vivim/omega-contracts";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { ownerOnly } from "@vivim/omega-platform"; // D-372: the seam owns permissions (never throws, Windows-safe)
import { join, resolve } from "node:path";
import { generateRootKey, loadRootKeyPem } from "./canon.ts";
import { verifyRecipeSignature, verifyCompositionInvariants, verifyEntryWithRoot, verifyEntryWithRootAsync } from "./recipe.ts";
import { buildRoutingTable, PortRouter } from "./ports.ts";
import { bootstrapKernel } from "./genesis.ts";
import { checkoutCompartment } from "./worker.ts";

export interface BootedHost {
  recipe: Recipe;
  buildDir: string;
  router: PortRouter;
  manifests: Map<string, PluginManifest>;
  shutdown(): Promise<void>;
}

export function ensureVault(vaultDir: string): { rootKey: ReturnType<typeof loadRootKeyPem> } {
  mkdirSync(vaultDir, { recursive: true });
  const keyFile = join(vaultDir, "keys", "root-of-trust");
  if (!existsSync(keyFile)) {
    const key = generateRootKey();
    mkdirSync(join(vaultDir, "keys"), { recursive: true });
    writeFileSync(keyFile, JSON.stringify({ keyId: key.keyId, publicKey: key.publicKey, privateKeyPem: key.privateKeyPem }, null, 2), { mode: 0o600 });
    ownerOnly(keyFile); // D-372 seam (best-effort on Windows ACLs — the writeFileSync mode above already applied where supported)
  }
  if (!existsSync(join(vaultDir, "format.json"))) writeFileSync(join(vaultDir, "format.json"), JSON.stringify({ vaultFormat: 1 }, null, 2));
  return { rootKey: loadRootKeyPem(keyFile) };
}

/** Full B1/B4 verification. Returns ALL errors (fail-closed on any). */
export function verifyComposition(recipe: Recipe, buildDir: string, vaultPublicKey: string): { manifests: Map<string, PluginManifest>; errors: string[] } {
  const errors: string[] = [];
  if (!verifyRecipeSignature(recipe)) errors.push("recipe signature invalid");
  if (recipe.rootOfTrust.publicKey !== vaultPublicKey) errors.push("recipe root-of-trust does not match the vault key");
  errors.push(...verifyCompositionInvariants(recipe));
  const manifests = new Map<string, PluginManifest>();
  for (const e of recipe.composition) {
    const { manifest, errors: entryErrors } = verifyEntryWithRoot(e, resolve(buildDir), recipe.rootOfTrust.publicKey);
    errors.push(...entryErrors);
    if (manifest) manifests.set(e.id, manifest);
  }
  if (errors.length === 0) {
    const { errors: routingErrors } = buildRoutingTable(recipe, manifests);
    errors.push(...routingErrors);
  }
  return { manifests, errors };
}

/** D-341: async twin — entries hash concurrently; same errors, O(largest) wall not O(total). */
export async function verifyCompositionAsync(recipe: Recipe, buildDir: string, vaultPublicKey: string): Promise<{ manifests: Map<string, PluginManifest>; errors: string[] }> {
  const errors: string[] = [];
  if (!verifyRecipeSignature(recipe)) errors.push("recipe signature invalid");
  if (recipe.rootOfTrust.publicKey !== vaultPublicKey) errors.push("recipe root-of-trust does not match the vault key");
  errors.push(...verifyCompositionInvariants(recipe));
  const manifests = new Map<string, PluginManifest>();
  const resolved = resolve(buildDir);
  const outs = await Promise.all(recipe.composition.map((e) => verifyEntryWithRootAsync(e, resolved, recipe.rootOfTrust.publicKey)));
  outs.forEach(({ manifest, errors: ee }, i) => { errors.push(...ee); if (manifest) manifests.set(recipe.composition[i].id, manifest); });
  if (errors.length === 0) errors.push(...buildRoutingTable(recipe, manifests).errors);
  return { manifests, errors };
}

export async function bootComposition(recipe: Recipe, buildDir: string, vaultDir: string): Promise<BootedHost> {
  const { rootKey } = ensureVault(vaultDir);
  const { manifests, errors } = await verifyCompositionAsync(recipe, resolve(buildDir), rootKey.publicKey);
  if (errors.length > 0) throw new Error(`fail-closed boot: ${errors.join("; ")}`);
  // D-340 genesis (see record): closed bootstrap before entries; D-331 lazy (see record).
  const router = new PortRouter({ vaultDir, journal: true, kernel: bootstrapKernel(rootKey.keyId, rootKey.privateKeyPem, rootKey.publicKey) });
  router.onDemandSpawn = async (id: string): Promise<void> => {
    const d = router.peekDormant(id);
    if (!d) return;
    const handle = await checkoutCompartment(d.entry.id, d.srcDir, d.entryFile);
    router.register(d.entry, d.manifest, handle, d.tokens);
    handle.post({ type: "init", manifest: d.manifest, tokens: d.tokens, capabilities: d.entry.grant.capabilities, ...(d.config ? { config: d.config } : {}) });
    await router.waitActive(id); // D-363: event path — bounded, no poll
  };
  const eager: string[] = [];
  const phases = [...recipe.composition].sort((a, b) => a.bootPhase - b.bootPhase);
  for (const e of phases) {
    const m = manifests.get(e.id)!;
    const srcDir = resolve(buildDir, e.source);
    const tokens = router.mintTokensFor(e);
    if (e.bootPhase === 0) {
      const handle = await checkoutCompartment(e.id, srcDir, m.entry);
      router.register(e, m, handle, tokens);
      handle.post({ type: "init", manifest: m, tokens, capabilities: e.grant.capabilities, ...(e.config ? { config: e.config } : {}) });
      eager.push(e.id);
    } else {
      router.registerDormant(e, m, tokens, { srcDir, entryFile: m.entry, ...(e.config ? { config: e.config } : {}) });
    }
  }
  // D-363: readiness rides the router's `ready` message (waitActive) — same 10s bound, minus the 25ms tick.
  await Promise.all(eager.map((id) => router.waitActive(id)));
  return { recipe, buildDir, router, manifests, shutdown: () => router.shutdown() };
}
