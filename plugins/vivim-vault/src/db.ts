// vivim.vault — db.ts (Ω2)
// canonical.sqlite: WAL · synchronous=NORMAL · FTS5.
//
//   objects(ns, id, rev, cid, meta, PRIMARY KEY(ns,id,rev))   — hot revisions
//   cold_objects(+ moved_at)                                   — compacted superseded revisions
//   changelog(seq, causationId, ns, id, rev, cid, entry_hash, prev_hash)  — Merkle chain
//   fts_index(FTS5: ns, id, rev, body)                         — full-text over object bodies
//
// The `meta` column stores a canonical-JSON envelope { meta, refs }: `meta` is the
// caller-visible metadata, `refs` the provenance edge list that compaction must honor.
// fts_index rows are linked to objects by (ns, id, rev) — ns/id/rev are UNINDEXED
// identity carriers, `body` is the indexed text (data if string, else canonical JSON).
//
// Single-writer law: every mutation op goes through enqueueWrite() — an in-worker
// promise queue, so concurrent op deliveries serialize multi-statement transactions.
// Reads run directly on the connection and are never queued behind writes
// (single-threaded worker: writes are synchronous blocks, reads execute between them).

// D-361 ADAPTER: this file is the ONLY bun:sqlite importer in the production tree
// (gate-enforced). A Node build swaps exactly this module (`node:sqlite` in recent
// Node, or better-sqlite3) — no other call site changes.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { casGet } from "./cas.ts";

export type { Database }; // the type every vault module shares, from the adapter
export const openDatabase = (path: string): Database => new Database(path); // the only constructor call site

export interface Ref { ns: string; id: string; rev: number }
export interface MetaEnvelope { meta: unknown; refs: Ref[] }

export const DDL = `
CREATE TABLE IF NOT EXISTS objects (
  ns TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  cid TEXT NOT NULL,
  meta TEXT NOT NULL,
  PRIMARY KEY (ns, id, rev)
);
CREATE TABLE IF NOT EXISTS cold_objects (
  ns TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  cid TEXT NOT NULL,
  meta TEXT NOT NULL,
  moved_at INTEGER NOT NULL,
  PRIMARY KEY (ns, id, rev)
);
CREATE TABLE IF NOT EXISTS changelog (
  seq INTEGER PRIMARY KEY,
  causationId TEXT NOT NULL,
  ns TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  cid TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(ns UNINDEXED, id UNINDEXED, rev UNINDEXED, body);
`;

export interface VaultDB {
  readonly dataDir: string;
  readonly path: string;
  readonly db: Database;
  /** Single-writer serialization: mutations queue here; failures propagate to the caller. */
  enqueueWrite<T>(fn: () => T): Promise<T>;
  /** Graceful close (checkpoint happens per SQLite semantics; WAL survives abrupt close). */
  close(): void;
}

export function dbPath(dataDir: string): string {
  return join(dataDir, "canonical.sqlite");
}

export function openVault(dataDir: string): VaultDB {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, "cas"), { recursive: true });
  const db = openDatabase(dbPath(dataDir));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(DDL);
  let tail: Promise<unknown> = Promise.resolve();
  return {
    dataDir,
    path: dbPath(dataDir),
    db,
    enqueueWrite<T>(fn: () => T): Promise<T> {
      const run = tail.then(fn, fn);
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
    close() { db.close(); },
  };
}

// ---- FTS maintenance ----

export function ftsUpsert(db: Database, ns: string, id: string, rev: number, body: string): void {
  db.query("DELETE FROM fts_index WHERE ns = ? AND id = ? AND CAST(rev AS INTEGER) = ?").run(ns, id, rev);
  db.query("INSERT INTO fts_index (ns, id, rev, body) VALUES (?, ?, ?, ?)").run(ns, id, rev, body);
}

export function ftsDelete(db: Database, ns: string, id: string, rev: number): void {
  db.query("DELETE FROM fts_index WHERE ns = ? AND id = ? AND CAST(rev AS INTEGER) = ?").run(ns, id, rev);
}

// ---- meta envelope ----

export function envelopeOf(meta: unknown, refs: Ref[]): string {
  return JSON.stringify({ meta: meta ?? null, refs });
}

export function parseEnvelope(text: string | null | undefined): MetaEnvelope {
  if (text == null) return { meta: null, refs: [] };
  const env = JSON.parse(text) as { meta?: unknown; refs?: unknown };
  const refs: Ref[] = Array.isArray(env.refs)
    ? env.refs.map((r) => {
        const ref = r as Partial<Ref>;
        if (typeof ref?.ns !== "string" || typeof ref?.id !== "string" || typeof ref?.rev !== "number" || !Number.isInteger(ref.rev)) {
          throw new Error(`vault: malformed refs entry in stored envelope: ${JSON.stringify(r)}`);
        }
        return { ns: ref.ns, id: ref.id, rev: ref.rev };
      })
    : [];
  return { meta: env.meta ?? null, refs };
}

/** Every provenance edge declared by any live (hot) object, as "ns|id|rev" keys. */
export function liveRefs(db: Database): Set<string> {
  const out = new Set<string>();
  for (const row of db.query("SELECT meta FROM objects").all() as { meta: string }[]) {
    for (const r of parseEnvelope(row.meta).refs) out.add(`${r.ns}|${r.id}|${r.rev}`);
  }
  return out;
}

// ---- read ops (production paths, exercised by unit tests and the index.ts handlers) ----

export interface ObjectRecord { rev: number; cid: string; data: unknown; meta: unknown; refs: Ref[] }

interface RowShape { rev: number; cid: string; meta: string }

/** Latest or specific revision; hot first, cold_objects fallback (compact moves, never deletes). */
export function readObject(v: VaultDB, ns: string, id: string, rev: number | null): ObjectRecord {
  const db = v.db;
  const hot: RowShape | null = rev !== null
    ? (db.query("SELECT rev, cid, meta FROM objects WHERE ns = ? AND id = ? AND rev = ?").get(ns, id, rev) as RowShape | null)
    : (db.query("SELECT rev, cid, meta FROM objects WHERE ns = ? AND id = ? ORDER BY rev DESC LIMIT 1").get(ns, id) as RowShape | null);
  const row: RowShape | null = hot
    ?? (rev !== null
      ? (db.query("SELECT rev, cid, meta FROM cold_objects WHERE ns = ? AND id = ? AND rev = ?").get(ns, id, rev) as RowShape | null)
      : (db.query("SELECT rev, cid, meta FROM cold_objects WHERE ns = ? AND id = ? ORDER BY rev DESC LIMIT 1").get(ns, id) as RowShape | null));
  if (!row) throw new Error(`vault.get@1: no object ${ns}/${id}${rev !== null ? `@${rev}` : " (latest)"} (not found)`);
  const env = parseEnvelope(row.meta);
  return { rev: row.rev, cid: row.cid, data: casGet(v.dataDir, row.cid), meta: env.meta, refs: env.refs };
}

export interface QueryFilter { idPrefix?: string | null; minRev?: number | null }

/** Latest hot revision per id in a ns, filtered by idPrefix (escaped LIKE prefix) and minRev. */
export function queryObjects(v: VaultDB, ns: string, filter: QueryFilter): { id: string; rev: number; cid: string }[] {
  let sql = `
    SELECT o.id AS id, o.rev AS rev, o.cid AS cid
    FROM objects o
    JOIN (SELECT id, MAX(rev) AS mrev FROM objects WHERE ns = ? GROUP BY id) latest
      ON latest.id = o.id AND latest.mrev = o.rev
    WHERE o.ns = ?`;
  const params: unknown[] = [ns, ns];
  if (filter.idPrefix != null) {
    sql += " AND o.id LIKE ? ESCAPE '\\'";
    params.push(`${filter.idPrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (filter.minRev != null) { sql += " AND o.rev >= ?"; params.push(filter.minRev); }
  sql += " ORDER BY o.id ASC";
  return dbRows(v.db.query(sql).all(...params));
}

function dbRows(rows: unknown): { id: string; rev: number; cid: string }[] {
  return (rows as { id: string; rev: number; cid: string }[]).map((r) => ({ id: r.id, rev: r.rev, cid: r.cid }));
}

/** FTS5 MATCH over indexed bodies within a ns, rank-ordered, capped at 200. */
export function searchObjects(v: VaultDB, ns: string, q: string): { id: string; rev: number; cid: string | null; rank: number }[] {
  const phrase = `"${q.replace(/"/g, '""')}"`; // phrase-quote: arbitrary text can never break MATCH syntax
  const rows = v.db.query(`
    SELECT fts_index.id AS id, CAST(fts_index.rev AS INTEGER) AS rev, fts_index.rank AS rank, o.cid AS cid
    FROM fts_index
    LEFT JOIN objects o
      ON o.ns = fts_index.ns AND o.id = fts_index.id AND o.rev = CAST(fts_index.rev AS INTEGER)
    WHERE fts_index MATCH ? AND fts_index.ns = ?
    ORDER BY fts_index.rank
    LIMIT 200
  `).all(phrase, ns) as { id: string; rev: number; rank: number; cid: string | null }[];
  return rows.map((r) => ({ id: r.id, rev: r.rev, cid: r.cid ?? null, rank: r.rank }));
}
