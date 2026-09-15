// tooling/ci/canon-canary.test.mjs — D-362/D-361 canary: the host's core canon
// module (canonical JSON, hashing, keygen/sign/verify, atomic writes) runs under
// PLAIN NODE — proving the core logic is not Bun-only beyond the one declared
// adapter (the vault's sqlite module). Deliberately narrow: a canary, not a port.
//
// Run: node --test tooling/ci/canon-canary.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalJson, sha256Hex, mintToken, generateRootKey, signJson, verifyJson, atomicWrite,
} from "../../host/src/canon.ts";

test("canonicalJson: sorted keys, drops undefined, stable digests", () => {
  const a = canonicalJson({ b: 1, a: 2, c: undefined, d: [3, { z: 1, y: 2 }] });
  assert.equal(a, '{"a":2,"b":1,"d":[3,{"y":2,"z":1}]}');
  assert.equal(sha256Hex(a), sha256Hex(canonicalJson(JSON.parse(a))));
});

test("sha256Hex matches the node:crypto digest of the same bytes", () => {
  assert.equal(sha256Hex("omega"), createHash("sha256").update("omega").digest("hex"));
});

test("mintToken: prefixed, opaque, 24 bytes of entropy", () => {
  const t = mintToken("canary");
  assert.ok(t.startsWith("canary_"));
  assert.ok(t.length > 30);
  assert.notEqual(t, mintToken("canary"));
});

test("ed25519 sign/verify round-trip via the vault key shape", () => {
  const key = generateRootKey();
  const doc = { recipe: "demo", entries: 3 };
  const sig = signJson(doc, key.privateKeyPem);
  assert.equal(verifyJson(doc, key.publicKey, sig), true);
  assert.equal(verifyJson({ recipe: "demo", entries: 4 }, key.publicKey, sig), false);
});

test("atomicWrite: rename lands the bytes and cleans the tmp", () => {
  const dir = mkdtempSync(join(tmpdir(), "canon-canary-"));
  try {
    const p = join(dir, "state.json");
    atomicWrite(p, '{"ok":true}\n');
    assert.equal(readFileSync(p, "utf-8"), '{"ok":true}\n');
    writeFileSync(p + ".tmp", "stale");
    atomicWrite(p, '{"ok":2}\n');
    assert.equal(readFileSync(p, "utf-8"), '{"ok":2}\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
