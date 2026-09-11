// vivim.vault — roundtrip.ts (Ω2)
// The swap-safety harness: read every object (hot + cold) and the whole changelog from
// the current dataDir, write a complete copy to targetDir (DB rows + CAS blobs + FTS
// rebuild), run verify() on the copy, and compare chain heads. A replacement vault
// plugin must pass this before any recipe swap — equal head hash + verify ok on the
// copy means the copy is byte-faithful at the semantic level (chain, objects, blobs).
//
// The copy is written through the same DDL + WAL settings; the FTS body is re-derived
// deterministically (data if string, else canonical JSON) from the COPIED blobs — which
// doubles as proof that the copy's CAS is complete.

import { mkdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { casCopyAll, casGet } from "./cas.ts";
import { bodyText } from "./canon.ts";
import { dbPath, DDL, ftsUpsert, openVault } from "./db.ts";
import type { VaultDB } from "./db.ts";
import { verify } from "./verify.ts";
import { Database } from "bun:sqlite";

export interface RoundtripResult { ok: boolean; entries: number; headHash: string; detail?: string; blobsCopied?: number }

export function roundtrip(v: VaultDB, targetDir: string): RoundtripResult {
  if (typeof targetDir !== "string" || targetDir.length === 0 || !isAbsolute(targetDir)) {
    throw new Error(`vault.roundtrip@1: targetDir must be an absolute path (got ${String(targetDir)})`);
  }
  const srcRoot = resolve(v.dataDir);
  const dstRoot = resolve(targetDir);
  // Containment via relative(), not startsWith(root + "/") — separators are
  // platform-specific and a "/" suffix never matches a "\"-joined path.
  const dstInSrc = relative(srcRoot, dstRoot);
  const srcInDst = relative(dstRoot, srcRoot);
  const inside = (rel: string): boolean => rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside(dstInSrc) || inside(srcInDst)) {
    throw new Error(`vault.roundtrip@1: targetDir must be disjoint from the vault dataDir (${srcRoot})`);
  }

  mkdirSync(dstRoot, { recursive: true });
  const blobsCopied = casCopyAll(v.dataDir, dstRoot);

  const target = new Database(dbPath(dstRoot));
  target.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  target.exec(DDL);
  try {
    target.exec("BEGIN IMMEDIATE");
    const src = v.db;
    for (const row of src.query("SELECT seq, causationId, ns, id, rev, cid, entry_hash, prev_hash FROM changelog ORDER BY seq ASC").all() as unknown as Record<string, string | number>[]) {
      target.query("INSERT INTO changelog (seq, causationId, ns, id, rev, cid, entry_hash, prev_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(row.seq, row.causationId, row.ns, row.id, row.rev, row.cid, row.entry_hash, row.prev_hash);
    }
    for (const row of src.query("SELECT ns, id, rev, cid, meta FROM objects").all() as unknown as Record<string, string | number>[]) {
      target.query("INSERT INTO objects (ns, id, rev, cid, meta) VALUES (?, ?, ?, ?, ?)")
        .run(row.ns, row.id, row.rev, row.cid, row.meta);
    }
    for (const row of src.query("SELECT ns, id, rev, cid, meta, moved_at FROM cold_objects").all() as unknown as Record<string, string | number>[]) {
      target.query("INSERT INTO cold_objects (ns, id, rev, cid, meta, moved_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(row.ns, row.id, row.rev, row.cid, row.meta, row.moved_at);
    }
    // FTS rebuild from the COPIED blobs (deterministic body derivation)
    for (const row of src.query("SELECT ns, id, rev, cid FROM objects").all() as unknown as { ns: string; id: string; rev: number; cid: string }[]) {
      let body: string | null = null;
      try { body = bodyText(casGet(dstRoot, row.cid)); } catch { /* missing blob in copy — verify() will report it */ }
      if (body !== null) ftsUpsert(target, row.ns, row.id, row.rev, body);
    }
    target.exec("COMMIT");
  } catch (err) {
    try { target.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw err;
  } finally {
    target.close();
  }

  // verify on the copy, through the same open path a replacement plugin would use
  const copy = openVault(dstRoot);
  let result: RoundtripResult;
  try {
    const verdict = verify(copy);
    result = {
      ok: verdict.ok,
      entries: verdict.entries,
      headHash: verdict.headHash,
      blobsCopied,
      ...(verdict.detail !== undefined ? { detail: verdict.detail } : {}),
    };
  } finally {
    copy.close();
  }
  return result;
}
