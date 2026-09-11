// Ω4 sdk — manifest signing: digests NEVER reimplemented (host canon wrappers).
// Cross-verified against the host's own signJson/verifyJson so the ceremony in
// sdk/src/sign.ts cannot diverge from host/src/recipe.ts.
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateRootKey, signJson, verifyJson, contentHashDir } from "@vivim/omega-host";
import { signManifest, verifyManifest, signPluginDir, contentHash, keyIdForPrivateKey } from "@vivim/omega-sdk";
import type { PluginManifest } from "@vivim/omega-contracts";

function validManifest(): PluginManifest {
  return {
    manifestVersion: "1",
    id: "omega.sign",
    version: "0.1.0",
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: { contract: [{ kind: "contract", id: "sign.op", version: "1", risk: "READ" }] },
    dependencies: [],
    capabilities: { requested: [] },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 64 } },
    contentHash: "",
  };
}

describe("Ω4 sdk sign — manifest signing via host canon", () => {
  test("signManifest injects {keyId, signature}; verifyManifest round-trips; keyId derivation matches the root key", () => {
    const root = generateRootKey();
    expect(keyIdForPrivateKey(root.privateKeyPem)).toBe(root.keyId);
    const signed = signManifest(validManifest(), root.privateKeyPem);
    expect(signed.publisher.keyId).toBe(root.keyId);
    expect(signed.publisher.signature.length).toBeGreaterThan(0);
    expect(verifyManifest(signed, root.publicKey)).toBe(true);
    // the exact cross-check: sdk signing verifies under the HOST's own verifyJson
    const unsigned = { ...signed, publisher: { keyId: signed.publisher.keyId, signature: "" } };
    expect(verifyJson(unsigned, root.publicKey, signed.publisher.signature)).toBe(true);
    expect(signJson(unsigned, root.privateKeyPem)).toBe(signed.publisher.signature); // byte-identical ceremony
  });

  test("tamper → verify false (content, risk, id, version all covered by the digest)", () => {
    const root = generateRootKey();
    const signed = signManifest(validManifest(), root.privateKeyPem);
    const tampered: PluginManifest[] = [
      { ...signed, description: "sneaked in" },
      { ...signed, contributions: { contract: [{ kind: "contract", id: "sign.op", version: "1", risk: "MUTATION" }] } },
      { ...signed, id: "omega.other" },
      { ...signed, version: "0.2.0" },
      { ...signed, publisher: { keyId: signed.publisher.keyId, signature: "forged" } },
    ];
    for (const t of tampered) expect(verifyManifest(t, root.publicKey)).toBe(false);
  });

  test("wrong key / unsigned manifest → verify false", () => {
    const root = generateRootKey();
    const other = generateRootKey();
    const signed = signManifest(validManifest(), root.privateKeyPem);
    expect(verifyManifest(signed, other.publicKey)).toBe(false);
    expect(verifyManifest(validManifest(), root.publicKey)).toBe(false); // unsigned (empty signature)
  });

  test("contentHash re-export is the host implementation (identical digests on a temp dir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "omega-sdk-hash-"));
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "plugin.json"), "{}");        // excluded by B1 content rule
      writeFileSync(join(dir, "package.json"), "{}");       // excluded
      mkdirSync(join(dir, "node_modules"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "junk.js"), "junk"); // excluded
      writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;");
      const viaSdk = contentHash(dir);
      expect(viaSdk).toBe(contentHashDir(dir));   // same implementation, never a second digest
      expect(viaSdk).toMatch(/^sha256:[0-9a-f]{64}$/);
      // content change → hash change
      writeFileSync(join(dir, "src", "index.ts"), "export const x = 2;");
      expect(contentHash(dir)).not.toBe(viaSdk);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("signPluginDir: compiles ONE plugin the way the host ceremony does (hash stamp + signature)", () => {
    const dir = mkdtempSync(join(tmpdir(), "omega-sdk-sign-"));
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      const m = validManifest();
      writeFileSync(join(dir, "plugin.json"), JSON.stringify(m, null, 2));
      writeFileSync(join(dir, "src", "index.ts"), "export const def = {};");
      const root = generateRootKey();
      const { manifest, manifestText } = signPluginDir(dir, root.privateKeyPem);
      expect(manifest.contentHash).toBe(contentHashDir(dir)); // B1 stamp
      expect(verifyManifest(manifest, root.publicKey)).toBe(true);
      // text round-trips back through JSON to the same verified object
      const re = JSON.parse(manifestText) as PluginManifest;
      expect(verifyManifest(re, root.publicKey)).toBe(true);
      expect(re.contentHash).toBe(manifest.contentHash);
      // plugin.json itself was NOT modified (the signed form lives in the build dir, like the host)
      expect(JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8")).publisher.signature).toBe("");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
