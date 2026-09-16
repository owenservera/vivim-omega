// µhost — canon.ts: canonical JSON, content hashing, ed25519 (node:crypto, no deps).
// One implementation; the SDK/tooling import it from here so digests can never diverge.
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { retryOsLock } from "@vivim/omega-platform"; // E-1: one backoff discipline for the rename boundary

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson((value as Record<string, unknown>)[k])).join(",") + "}";
  }
  throw new Error(`canonicalJson: unsupported value ${String(value)}`);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const EXCLUDE_CONTENT = new Set(["node_modules", ".git", "plugin.json", "package.json", "package.json.orig", ".DS_Store"]);

/** Content hash over a plugin dir: sorted relative paths, each file's sha256, chained. */
export function contentHashDir(dir: string): string {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (EXCLUDE_CONTENT.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  files.sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(relative(dir, f).split(sep).join("/"));
    h.update(sha256Hex(readFileSync(f)));
  }
  return `sha256:${h.digest("hex")}`;
}

export interface RootKey { keyId: string; publicKey: string; privateKeyPem: string }

export function generateRootKey(): RootKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; x: string };
  const pubRaw = Buffer.from(jwk.x, "base64url");
  return {
    keyId: `sha256:${sha256Hex(pubRaw)}`,
    publicKey: pubRaw.toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function loadRootKeyPem(keyFile: string): RootKey {
  const j = JSON.parse(readFileSync(keyFile, "utf-8"));
  return { keyId: j.keyId, publicKey: j.publicKey, privateKeyPem: j.privateKeyPem };
}

export function signJson(value: unknown, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return edSign(null, Buffer.from(canonicalJson(value)), key).toString("base64");
}

export function verifyJson(value: unknown, publicKeyB64: string, signatureB64: string): boolean {
  try {
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKeyB64, "base64").toString("base64url") }, format: "jwk" });
    return edVerify(null, Buffer.from(canonicalJson(value)), pub, Buffer.from(signatureB64, "base64"));
  } catch { return false; }
}

export function mintToken(prefix = "tok"): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function atomicWrite(path: string, data: string): void {
  // write-tmp → rename: the rename is the atomic durability boundary (B4).
  // writeFileSync (not a streaming writer) so no handle lingers for the rename.
  // Windows: transient locks (AV/indexer, lazy handle release) can EPERM/EBUSY
  // the rename. Bounded retry with backoff via the shared seam helper — the
  // boundary is unchanged, rename stays atomic.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  retryOsLock(() => renameSync(tmp, path));
}

export { writeFileSync };
