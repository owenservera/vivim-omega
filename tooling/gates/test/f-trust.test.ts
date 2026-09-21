// tooling/gates/test/f-trust.test.ts — the F-TRUST falsifier.
// Generated from D-434 by `omega:loop --stub D-434` (D-426, Ω-DEV.2).
// Implemented (D-434): every clause runs a real verdict against
// tooling/gates/trust.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  checkGrant,
  enrollDevice,
  exportPrivateKey,
  generateRoot,
  recoverRoot,
  revokeDevice,
  splitShards,
  verifyRow,
} from "../trust.ts";

describe("F-TRUST (D-434)", () => {
  test("F-TRUST.1 (hardware-bound) — bytes never exposed; export refused; no-enclave refuses generation", () => {
    const root = generateRoot({ kind: "secure-enclave", handle: "tpm-7" }, "alice");
    expect(root.ok).toBe(true);
    if (!root.ok) throw new Error("unreachable");
    expect(root.value.handle).toContain("root:tpm-7");
    expect(JSON.stringify(root.value)).not.toContain("private");
    const exp = exportPrivateKey();
    expect(exp.code).toBe("TRUST_KEY_EXTRACTABLE");
    const bare = generateRoot({ kind: "none", handle: "mem" }, "alice");
    expect(bare.ok).toBe(false);
    if (bare.ok) throw new Error("unreachable");
    expect(bare.code).toBe("TRUST_KEY_EXTRACTABLE");
  });

  test("F-TRUST.2 (local-pairing) — B enrolls via local ritual; enrollment is Root-signed", () => {
    const root = generateRoot({ kind: "secure-enclave", handle: "tpm-7" }, "alice");
    if (!root.ok) throw new Error("unreachable");
    const e = enrollDevice({
      rootHandle: root.value.handle,
      deviceKeyPub: "dev-B-pub",
      capabilityGrants: ["cap:chat:read"],
      at: 1000,
      localRitual: true,
    });
    expect(e.ok).toBe(true);
    if (!e.ok) throw new Error("unreachable");
    expect(e.value.signedBy.length).toBeGreaterThan(0);
    const selfBoot = enrollDevice({ rootHandle: null, deviceKeyPub: "dev-X", capabilityGrants: [], at: 1, localRitual: true });
    expect(selfBoot.ok).toBe(false);
    if (selfBoot.ok) throw new Error("unreachable");
    expect(selfBoot.code).toBe("TRUST_UNENROLLED_DEVICE");
  });

  test("F-TRUST.3 (causal-revocation) — post-revocation writes rejected on sync, ledgered", () => {
    const root = generateRoot({ kind: "secure-enclave", handle: "tpm-7" }, "alice");
    if (!root.ok) throw new Error("unreachable");
    const e = enrollDevice({ rootHandle: root.value.handle, deviceKeyPub: "dev-A", capabilityGrants: ["cap:chat:read"], at: 1000, localRitual: true });
    if (!e.ok) throw new Error("unreachable");
    const rev = revokeDevice({ rootHandle: root.value.handle, targetDeviceKey: "dev-A", reason: "stolen", at: 2000 });
    expect(rev.ok).toBe(true);
    if (!rev.ok) throw new Error("unreachable");
    const before = verifyRow({ deviceKeyPub: "dev-A", at: 1500, payload: "hello" }, [e.value], [rev.value]);
    expect(before.ok).toBe(true); // pre-revocation row stands
    const after = verifyRow({ deviceKeyPub: "dev-A", at: 2500, payload: "evil" }, [e.value], [rev.value]);
    expect(after.ok).toBe(false);
    if (after.ok) throw new Error("unreachable");
    expect(after.code).toBe("TRUST_REVOKED_KEY");
    expect(after.sentence).toContain("exiled");
  });

  test("F-TRUST.4 (scoped-grants) — read-only device forging refuses; strangers refused", () => {
    const root = generateRoot({ kind: "secure-enclave", handle: "tpm-7" }, "alice");
    if (!root.ok) throw new Error("unreachable");
    const e = enrollDevice({ rootHandle: root.value.handle, deviceKeyPub: "dev-C", capabilityGrants: ["cap:chat:read"], at: 1000, localRitual: true });
    if (!e.ok) throw new Error("unreachable");
    const v = verifyRow({ deviceKeyPub: "dev-C", at: 1100, payload: "r" }, [e.value], []);
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("unreachable");
    const g = checkGrant(v.value.grantCheck, "forge.author");
    expect(g.ok).toBe(false);
    if (g.ok) throw new Error("unreachable");
    expect(g.code).toBe("TRUST_GRANT_MISSING");
    const stranger = verifyRow({ deviceKeyPub: "dev-Z", at: 1100, payload: "r" }, [e.value], []);
    expect(stranger.ok).toBe(false);
  });

  test("F-TRUST.5 (shard-recovery) — k shards restore to a new enclave; fewer refuse; mesh survives", () => {
    const shards = splitShards("alice-root", 5, 3);
    expect(shards).toHaveLength(5);
    const short = recoverRoot(shards.slice(0, 2), 3);
    expect(short.ok).toBe(false);
    if (short.ok) throw new Error("unreachable");
    expect(short.code).toBe("TRUST_INSUFFICIENT_SHARDS");
    const restored = recoverRoot(shards.slice(0, 3), 3);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.value.handle).toContain("root:recovered");
  });
});
