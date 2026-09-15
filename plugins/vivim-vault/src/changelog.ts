// vivim.vault — changelog.ts (Ω2)
// The append path: CAS the data, insert the object revision (hot), upsert the FTS row,
// extend the Merkle-chained changelog — one IMMEDIATE transaction, one enqueueWrite.
//
// Chain law: entry_hash = sha256(seq|causationId|ns|id|rev|cid|prev_hash) where
// prev_hash is the previous entry's entry_hash (genesis = 64 zeros). The chain is
// grown from what is on disk (head read inside the same transaction), so post-tamper
// appends extend the tampered chain and verify() flags the tampered seq.
//
// rev allocation reads MAX(rev) from the CHANGED LOG (not objects): compaction moves
// revisions out of `objects` but never out of `changelog`, so revisions can never
// collide with compacted history.

import type { Database, Ref, VaultDB } from "./db.ts";
import { casPut } from "./cas.ts";
import { bodyText, entryHash, GENESIS_HASH } from "./canon.ts";
import { envelopeOf, ftsUpsert } from "./db.ts";

export interface ChangelogRow {
  seq: number; causationId: string; ns: string; id: string; rev: number;
  cid: string; entry_hash: string; prev_hash: string;
}

export interface AppendInput {
  ns: string; id: string; data: unknown; meta?: unknown; refs?: Ref[];
  causationId: string;
}

export interface AppendResult { rev: number; cid: string; seq: number }

/** Current chain head (last entry's entry_hash; genesis if empty). */
export function chainHead(db: Database): string {
  const row = db.query("SELECT entry_hash FROM changelog ORDER BY seq DESC LIMIT 1").get() as { entry_hash: string } | null;
  return row ? row.entry_hash : GENESIS_HASH;
}

export function changelogCount(db: Database): number {
  return (db.query("SELECT COUNT(*) AS n FROM changelog").get() as { n: number }).n;
}

/** Insert one changelog link, reading the head inside the caller's transaction. */
export function appendChangelogEntry(db: Database, e: { causationId: string; ns: string; id: string; rev: number; cid: string }): { seq: number; entryHash: string } {
  const prevHash = chainHead(db);
  const seq = (db.query("SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM changelog").get() as { s: number }).s;
  const hash = entryHash(seq, e.causationId, e.ns, e.id, e.rev, e.cid, prevHash);
  db.query(
    "INSERT INTO changelog (seq, causationId, ns, id, rev, cid, entry_hash, prev_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(seq, e.causationId, e.ns, e.id, e.rev, e.cid, hash, prevHash);
  return { seq, entryHash: hash };
}

/**
 * Full append. MUST run inside enqueueWrite (callers route through runAppend).
 * CAS write happens before the transaction: a failed transaction leaves an orphan
 * blob at most — content-addressed, inert, never read as wrong data.
 */
export function appendObject(v: VaultDB, input: AppendInput): AppendResult {
  const cid = casPut(v.dataDir, input.data);
  const db = v.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    const rev = (db.query("SELECT COALESCE(MAX(rev), 0) + 1 AS r FROM changelog WHERE ns = ? AND id = ?").get(input.ns, input.id) as { r: number }).r;
    db.query("INSERT INTO objects (ns, id, rev, cid, meta) VALUES (?, ?, ?, ?, ?)")
      .run(input.ns, input.id, rev, cid, envelopeOf(input.meta, input.refs ?? []));
    ftsUpsert(db, input.ns, input.id, rev, bodyText(input.data));
    const { seq } = appendChangelogEntry(db, { causationId: input.causationId, ns: input.ns, id: input.id, rev, cid });
    db.exec("COMMIT");
    return { rev, cid, seq };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw err;
  }
}
