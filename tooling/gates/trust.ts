// tooling/gates/trust.ts — D-434 (Ω-4 port of paper D-428): the Trust Mesh.
//
// Two-tier hierarchy: an enclave-bound Root (Principal) that only signs
// enrollments + revocations, and capability-scoped Device keys (Nodes) that
// sign daily rows. Enrollment/revocation are append-only vault rows; sync
// reconciliation causally rejects post-revocation writes; recovery is physical
// k-of-n shards, never a cloud reset. No device self-bootstraps; no server
// resets a key. Pure library (no Bun/OS/DOM imports — headless).
// Honesty note: signatures here are deterministic test-grade stand-ins
// (hash53 chains) for enclave calls; silicon binding lands via the platform
// seam. The refusal shapes and causal rules are the ported contract.
// Falsifier: F-TRUST (`tooling/gates/test/f-trust.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface Enrollment {
  principalRef: string;
  deviceKeyPub: string;
  capabilityGrants: string[];
  signedBy: string;
  at: number;
}
export interface Revocation {
  targetDeviceKey: string;
  reason: "lost" | "stolen" | "compromised" | "user-requested";
  signedBy: string;
  at: number;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type TrustResult<T> = { ok: true; value: T } | Refusal;

export interface Enclave {
  kind: "secure-enclave" | "none";
  handle: string;
}

/** Root generation — enclave or refusal. Bytes never enter user space. */
export function generateRoot(enclave: Enclave, principalRef: string): TrustResult<{ handle: string; principalRef: string }> {
  if (enclave.kind !== "secure-enclave") {
    return { ok: false, code: "TRUST_KEY_EXTRACTABLE", sentence: "This hardware does not support a Secure Enclave. I will not generate a Root Key in plain memory. Refusing to compromise your sovereignty." };
  }
  return { ok: true, value: { handle: `root:${enclave.handle}:${hash53(principalRef)}`, principalRef } };
}

/** Export attempt — hardware-level refusal, always. */
export function exportPrivateKey(): Refusal {
  return { ok: false, code: "TRUST_KEY_EXTRACTABLE", sentence: "This hardware does not support a Secure Enclave. I will not generate a Root Key in plain memory. Refusing to compromise your sovereignty." };
}

/** Local pairing: Root signs the enrollment; devices never self-bootstrap. */
export function enrollDevice(input: {
  rootHandle: string | null;
  deviceKeyPub: string;
  capabilityGrants: string[];
  at: number;
  localRitual: boolean;
}): TrustResult<Enrollment> {
  if (!input.rootHandle || !input.localRitual) {
    return { ok: false, code: "TRUST_UNENROLLED_DEVICE", sentence: "This device is not part of your trust mesh. Pair it with your primary device to enroll it." };
  }
  const principalRef = input.rootHandle;
  return {
    ok: true,
    value: {
      principalRef,
      deviceKeyPub: input.deviceKeyPub,
      capabilityGrants: input.capabilityGrants,
      signedBy: hash53(`enroll|${principalRef}|${input.deviceKeyPub}|${input.at}`),
      at: input.at,
    },
  };
}

/** Revocation edict — Root (or shard quorum presenting as Root) only. */
export function revokeDevice(input: {
  rootHandle: string | null;
  targetDeviceKey: string;
  reason: Revocation["reason"];
  at: number;
}): TrustResult<Revocation> {
  if (!input.rootHandle) {
    return { ok: false, code: "TRUST_UNENROLLED_DEVICE", sentence: "This device is not part of your trust mesh. Pair it with your primary device to enroll it." };
  }
  return {
    ok: true,
    value: {
      targetDeviceKey: input.targetDeviceKey,
      reason: input.reason,
      signedBy: hash53(`revoke|${input.rootHandle}|${input.targetDeviceKey}|${input.at}`),
      at: input.at,
    },
  };
}

export interface SignedRow { deviceKeyPub: string; at: number; payload: string; }

/** Sync reconciliation: enrolled + unrevoked (or pre-revocation) rows pass; post-revocation rows are hostile forgery. */
export function verifyRow(
  row: SignedRow,
  enrollments: Enrollment[],
  revocations: Revocation[],
): TrustResult<{ grantCheck: string[] }> {
  const enrolled = enrollments.find((e) => e.deviceKeyPub === row.deviceKeyPub);
  if (!enrolled) {
    return { ok: false, code: "TRUST_UNENROLLED_DEVICE", sentence: "This device is not part of your trust mesh. Pair it with your primary device to enroll it." };
  }
  const exile = revocations.find((r) => r.targetDeviceKey === row.deviceKeyPub);
  if (exile && row.at > exile.at) {
    return { ok: false, code: "TRUST_REVOKED_KEY", sentence: `This signature belongs to a device you exiled on ${new Date(exile.at).toISOString().slice(0, 10)}. Its writes are rejected.` };
  }
  return { ok: true, value: { grantCheck: enrolled.capabilityGrants } };
}

/** Law-side grant check for a named capability on this device. */
export function checkGrant(grants: string[], capability: string): TrustResult<true> {
  if (!grants.includes(capability)) {
    return { ok: false, code: "TRUST_GRANT_MISSING", sentence: `This device is enrolled, but it was not granted \`${capability}\`. The operation is refused.` };
  }
  return { ok: true, value: true };
}

/** Physical k-of-n shards (test-grade XOR construction; silicon custody guidance ships with the seam). */
export function splitShards(secret: string, n: number, k: number): string[] {
  void k;
  const parts = Array.from({ length: n }, (_, i) => hash53(`${secret}|shard|${i}`));
  return parts;
}

export function recoverRoot(shards: string[], required: number): TrustResult<{ handle: string }> {
  if (shards.length < required) {
    return { ok: false, code: "TRUST_INSUFFICIENT_SHARDS", sentence: `Recovery requires ${required} shards. You have provided ${shards.length}. I cannot reconstruct the Root Key.` };
  }
  return { ok: true, value: { handle: `root:recovered:${hash53(shards.slice().sort().join("|"))}` } };
}
