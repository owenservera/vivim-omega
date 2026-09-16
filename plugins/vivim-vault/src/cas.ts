// vivim.vault — cas.ts (Ω2)
// Content-addressed blob store: <dataDir>/cas/<cid[0:2]>/<cid> (sharded "cas/ab/<sha256hex>").
//
// Durability boundary: write-tmp → fsync → rename. A crash between the tmp write and
// the rename leaves an orphan "<cid>.tmp-…" file and NO partial blob at the final path —
// readers only ever address exact cid paths, so leftovers are inert (ignored by get/verify
// and skipped by roundtrip copying). put() is idempotent: the same content maps to the
// same cid; an existing final blob short-circuits.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, cidOf } from "./canon.ts";
import { retryOsLock } from "@vivim/omega-platform"; // E-1: one backoff discipline for the rename boundary

const CID_RE = /^[0-9a-f]{64}$/;

/** Sharded CAS path for a cid. Malformed cids (tampered rows) are refused — never path-joined. */
export function casPath(dataDir: string, cid: string): string {
  if (!CID_RE.test(cid)) throw new Error(`cas: malformed cid '${cid}'`);
  return join(dataDir, "cas", cid.slice(0, 2), cid);
}

/** Best-effort directory fsync (makes the rename durable on Linux; inert where unsupported). */
function dirFsync(dir: string): void {
  try {
    const fd = openSync(dir, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* directory fsync unsupported — best effort, never blocks the vault */ }
}

/** Store canonical JSON of `data`; returns the cid. Idempotent + atomic. */
export function casPut(dataDir: string, data: unknown): string {
  const text = canonicalJson(data);
  const cid = cidOf(data);
  const final = casPath(dataDir, cid);
  if (existsSync(final)) return cid; // content-addressed idempotence — same bytes, same address
  const shard = join(dataDir, "cas", cid.slice(0, 2));
  mkdirSync(shard, { recursive: true });
  const tmp = join(shard, `.${cid}.tmp-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  writeFileSync(tmp, text);
  const fd = openSync(tmp, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  // The rename is the atomic durability boundary — never bypassed, but retried:
  // transient OS locks (AV/indexer, SMB/NFS contention, lazy handle release on
  // Windows) surface as EPERM/EBUSY/EACCES. Shared seam helper (E-1), same
  // discipline as host atomicWrite (canon.ts); anything else throws immediately.
  retryOsLock(() => renameSync(tmp, final));
  dirFsync(shard);
  return cid;
}

/** Read a blob back and parse it. Throws (→ DEGRADED at the op boundary) if missing. */
export function casGet(dataDir: string, cid: string): unknown {
  const p = casPath(dataDir, cid);
  if (!existsSync(p)) throw new Error(`cas: missing blob ${cid}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Does the blob exist? Malformed cids count as missing (tamper-safe). */
export function casHas(dataDir: string, cid: string): boolean {
  try { return existsSync(casPath(dataDir, cid)); } catch { return false; }
}

/** List every well-formed blob cid under <dataDir>/cas (skips tmp/orphan files). */
export function casList(dataDir: string): string[] {
  const root = join(dataDir, "cas");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const shard of readdirSync(root)) {
    if (!/^[0-9a-f]{2}$/.test(shard)) continue;
    for (const name of readdirSync(join(root, shard))) {
      if (CID_RE.test(name)) out.push(name);
    }
  }
  return out;
}

/** Copy every well-formed blob into <targetDir>/cas preserving shard layout. */
export function casCopyAll(dataDir: string, targetDir: string): number {
  const src = join(dataDir, "cas");
  if (!existsSync(src)) return 0;
  let n = 0;
  for (const shard of readdirSync(src)) {
    if (!/^[0-9a-f]{2}$/.test(shard)) continue;
    const srcShard = join(src, shard);
    for (const name of readdirSync(srcShard)) {
      if (!CID_RE.test(name)) continue; // leftover .tmp files and orphans are not part of the vault
      const dstShard = join(targetDir, "cas", shard);
      mkdirSync(dstShard, { recursive: true });
      copyFileSync(join(srcShard, name), join(dstShard, name));
      n++;
    }
  }
  return n;
}
