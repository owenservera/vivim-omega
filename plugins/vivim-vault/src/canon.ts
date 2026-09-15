// vivim.vault — canon.ts (Ω2)
// Canonical JSON + hashing for the vault's on-disk format v1.
//
// This mirrors @vivim/omega-host canon.ts byte-for-byte in ALGORITHM (sorted keys,
// JSON.stringify scalars, undefined-valued object keys dropped, arrays in order) so
// host-side and vault-side digests of the same value can never diverge. It is
// duplicated here (not imported) because plugin src/ may import ONLY
// @vivim/omega-shim / @vivim/omega-contracts + the vault's sqlite adapter (db.ts,
// D-361) + node builtins (B2).
//
// On-disk contract pinned in D3 03-WAVE-SPECS §1 (vault format v1):
//   cid        = sha256( canonicalJson(data) )            — CAS address
//   entry_hash = sha256( seq|causationId|ns|id|rev|cid|prev_hash )  — Merkle chain
//   genesis    = 64 zeros

import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

/** Canonical JSON: sorted object keys, no whitespace, undefined object values dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(rec[k])).join(",") + "}";
  }
  throw new Error(`canonicalJson: unsupported value ${typeof value} (${String(value)})`);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** cid = sha256 over the canonical JSON of the object data. */
export function cidOf(data: unknown): string {
  return sha256Hex(canonicalJson(data));
}

/** entry_hash = sha256 over the pipe-joined changelog row (Merkle chain link). */
export function entryHash(
  seq: number,
  causationId: string,
  ns: string,
  id: string,
  rev: number,
  cid: string,
  prevHash: string,
): string {
  return sha256Hex(`${seq}|${causationId}|${ns}|${id}|${rev}|${cid}|${prevHash}`);
}

/** Text indexed into FTS: raw string data as-is, anything else its canonical JSON. */
export function bodyText(data: unknown): string {
  return typeof data === "string" ? data : canonicalJson(data);
}
