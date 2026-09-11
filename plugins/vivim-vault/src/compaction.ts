// vivim.vault — compaction.ts (Ω2)
// Moves superseded revisions older than the newest `keep` per id into cold_objects —
// but NEVER a revision referenced by any live object's refs (provenance-required
// revisions survive). CAS blobs are never deleted (append-only), FTS rows of moved
// revisions are dropped (search covers live objects), and changelog is untouched
// (history is immutable — verify() still passes after compaction).
//
// Reads are never blocked: this runs inside the single-writer queue as synchronous
// SQLite work; live read ops execute between statements on the same connection.

import type { VaultDB } from "./db.ts";
import { ftsDelete, liveRefs } from "./db.ts";

export interface CompactResult { moved: number; kept: number; protected: number }

export function compact(v: VaultDB, ns: string, keep: number): CompactResult {
  if (typeof ns !== "string" || ns.length === 0) throw new Error("vault.compact@1: ns must be a non-empty string");
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`vault.compact@1: keep must be an integer >= 1 (got ${String(keep)})`);
  const db = v.db;
  const protectedRefs = liveRefs(db); // provenance edges from ALL live objects, any namespace
  const rows = db.query("SELECT id, rev FROM objects WHERE ns = ? ORDER BY id ASC, rev ASC").all(ns) as unknown as { id: string; rev: number }[];

  const byId = new Map<string, number[]>();
  for (const row of rows) {
    const list = byId.get(row.id) ?? [];
    list.push(row.rev);
    byId.set(row.id, list);
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    let moved = 0;
    let kept = 0;
    let protectedCount = 0;
    const now = Date.now();
    for (const [id, revs] of byId) {
      const hot = revs.slice(-keep);           // newest `keep` stay hot
      const candidates = revs.slice(0, Math.max(0, revs.length - keep)); // superseded
      kept += hot.length;
      for (const rev of candidates) {
        if (protectedRefs.has(`${ns}|${id}|${rev}`)) { kept++; protectedCount++; continue; } // provenance survives
        db.query(
          "INSERT INTO cold_objects (ns, id, rev, cid, meta, moved_at) SELECT ns, id, rev, cid, meta, ? FROM objects WHERE ns = ? AND id = ? AND rev = ?",
        ).run(now, ns, id, rev);
        ftsDelete(db, ns, id, rev);
        db.query("DELETE FROM objects WHERE ns = ? AND id = ? AND rev = ?").run(ns, id, rev);
        moved++;
      }
    }
    db.exec("COMMIT");
    return { moved, kept, protected: protectedCount };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw err;
  }
}
