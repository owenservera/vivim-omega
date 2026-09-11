// @vivim/omega-sdk — sign.ts
// Manifest signing helpers. Digests are NEVER reimplemented here: canonicalJson,
// sha256, ed25519 and content hashing all come from @vivim/omega-host/src/canon.ts
// (the one implementation — digests must never diverge).
import type { PluginManifest } from "@vivim/omega-contracts";
import { signJson, verifyJson, contentHashDir, sha256Hex } from "@vivim/omega-host";
import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Derive the canonical keyId (sha256 of the raw public key) from a pkcs8 PEM — same derivation as host canon.generateRootKey. */
export function keyIdForPrivateKey(privateKeyPem: string): string {
  const pub = createPublicKey(privateKeyPem);
  const jwk = pub.export({ format: "jwk" }) as { kty: string; x: string };
  const pubRaw = Buffer.from(jwk.x, "base64url");
  return `sha256:${sha256Hex(pubRaw)}`;
}

function unsignedForm(m: PluginManifest): PluginManifest {
  // EXACTLY the host ceremony's unsigned form (recipe.ts compile/verify):
  // same fields, publisher.keyId kept, signature blanked.
  return { ...m, publisher: { keyId: m.publisher.keyId, signature: "" } };
}

/**
 * Sign a manifest with the vault root-of-trust key: injects publisher {keyId, signature}
 * (ed25519 over the canonical JSON of the unsigned form). Key id is derived from the
 * private key, so the record is self-consistent by construction.
 */
export function signManifest(manifest: PluginManifest, rootPrivateKeyPem: string): PluginManifest {
  const keyId = keyIdForPrivateKey(rootPrivateKeyPem);
  const unsigned = { ...manifest, publisher: { keyId, signature: "" } };
  const signature = signJson(unsigned, rootPrivateKeyPem);
  return { ...unsigned, publisher: { keyId, signature } };
}

/** Verify a manifest's publisher signature against a root public key (raw ed25519, base64). */
export function verifyManifest(manifest: PluginManifest, rootPublicKeyB64: string): boolean {
  try {
    return verifyJson(unsignedForm(manifest), rootPublicKeyB64, manifest.publisher.signature);
  } catch {
    return false;
  }
}

/**
 * The compile ceremony for ONE plugin dir: read plugin.json, stamp the content hash
 * (B1: over the dir excluding plugin.json/package.json/node_modules), sign, and
 * serialize. Returns the signed manifest text + object — byte-identical semantics
 * with host recipe.compileComposition's per-entry step.
 */
export function signPluginDir(dir: string, rootPrivateKeyPem: string): { manifest: PluginManifest; manifestText: string } {
  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8")) as PluginManifest;
  const withHash: PluginManifest = { ...manifest, contentHash: contentHashDir(dir) };
  const signed = signManifest(withHash, rootPrivateKeyPem);
  return { manifest: signed, manifestText: JSON.stringify(signed, null, 2) };
}

/** B1 content hashing over a plugin dir — re-exported from the host (never reimplemented). */
export { contentHashDir as contentHash };
export { contentHashDir, signJson, verifyJson };
