// vivim.vault — sql.ts (D-373)
// The DRIVER-NEUTRAL vault SQL layer: everything db.ts historically held,
// parameterized by the SqliteDriver seam instead of a concrete import.
// Loads under ANY runtime (no bun: import, no node:sqlite import) so the
// conformance parity suite can run this identical workload on every driver
// (bun-sqlite under Bun, node-sqlite under Node 24) and compare digests.
//
// canonical.sqlite: WAL · synchronous=NORMAL · FTS5.
//
//   objects(ns, id, rev, cid, meta, PRIMARY KEY(ns,id,rev))   — hot revisions
//   cold_objects(+ moved_at)                                   — compacted superseded revisions
//   changelog(seq, causationId, ns, id, rev, cid, entry_hash, prev_hash)  — Merkle chain
//   fts_index(FTS5: ns, id, rev, body)                         — full-text over object bodies
//
// D-378 (W0 probe finding): the changelog_ns_id_rev index makes next-rev
// resolution an O(log n) seek instead of a full scan per append (measured 4.7
// → 33 ms/msg degradation between 1K and 10K rows before it). Existing vaults
// upgrade on next open (IF NOT EXISTS). Keep comments OUT of the DDL string
// itself: statement splitters do not parse them.
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
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { casGet } from "./cas.ts";
import { VAULT_PRAGMAS, type SqliteDriver, type SqliteDriverFactory } from "./drivers/driver.ts";

export type Database = SqliteDriver; // the structural type every vault module shares (was: the bun:sqlite type, D-361 → D-373 seam)

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
CREATE INDEX IF NOT EXISTS changelog_ns_id_rev ON changelog(ns, id, rev);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(ns UNINDEXED, id UNINDEXED, rev UNINDEXED, body);
`;

export interface VaultDB {
  readonly dataDir: string;
  readonly path: string;
  readonly db: Database;
  /** Which driver is live (D-373: journaled by callers, asserted by the conformance suite). */
  readonly driverId: string;
  /** Single-writer serialization: mutations queue here; failures propagate to the caller. */
  enqueueWrite<T>(fn: () => T): Promise<T>;
  /** Graceful close (checkpoint happens per SQLite semantics; WAL survives abrupt close). */
  close(): void;
}

export function dbPath(dataDir: string): string {
  return join(dataDir, "canonical.sqlite");
}

/** Driver-neutral open: bind a factory, apply the shared PRAGMA parity block, run DDL. */
export function openVaultWith(dataDir: string, factory: SqliteDriverFactory, driverId: string): VaultDB {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, "cas"), { recursive: true });
  const db = factory(dbPath(dataDir));
  for (const pragma of VAULT_PRAGMAS) db.exec(pragma); // idempotent parity: the driver applied these too; re-asserting is free and test-visible
  db.exec(DDL);
  let tail: Promise<unknown> = Promise.resolve();
  return {
    dataDir,
    path: dbPath(dataDir),
    db,
    driverId,
    enqueueWrite<T>(fn: () => T): Promise<T> {
      const run = tail.then(fn, fn);
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
    close() { db.close(); },
  };
}

// ---- the driver lane (D-373) ----
// Exactly one lane is bound per process, by importing the lane module:
//   Bun lane  → ./db.ts      (binds drivers/bun-sqlite.ts)
//   Node lane → ./db.node.ts (binds drivers/node-sqlite.ts)
// Internal vault modules (changelog/compaction/roundtrip/verify) import from
// HERE and are therefore loadable under ANY runtime; the bound factory makes
// openVault/openDatabase work without the caller ever naming a driver.
let activeFactory: SqliteDriverFactory | null = null;
let activeDriverId = "";

/** Bind the process-wide driver lane. Called ONCE at lane-module load (db.ts / db.node.ts). */
export function bindDriverLane(factory: SqliteDriverFactory, driverId: string): void {
  activeFactory = factory;
  activeDriverId = driverId;
}

/** The live lane's driver id (fail-closed: empty string when unbound). */
export function boundDriverId(): string {
  return activeDriverId;
}

/** Open a vault on the BOUND lane — same signature as pre-D-373 openVault; callers never name a driver. */
export function openVault(dataDir: string): VaultDB {
  if (!activeFactory) throw new Error("vault: driver lane not bound — import the lane module (db.ts or db.node.ts) before openVault (D-373, fail-closed)");
  return openVaultWith(dataDir, activeFactory, activeDriverId);
}

/** Raw connection on the BOUND lane (tests/tools; the only constructor call sites). */
export function openDatabase(path: string): Database {
  if (!activeFactory) throw new Error("vault: driver lane not bound — import the lane module (db.ts or db.node.ts) before openDatabase (D-373, fail-closed)");
  return activeFactory(path);
}

// ---- FTS maintenance ----
// D-378 (W0 probe finding): appends must INSERT only. The old ftsUpsert's
// defensive DELETE scanned the whole FTS table on every append (unindexed
// columns) — measured 50× per-row cost (0.059 vs 3.0 ms/row) and the source
// of the append-latency degradation the probe caught. A committed (ns,id,rev)
// FTS row can never pre-exist on the append path: rev is minted as MAX+1
// inside the same transaction, and a duplicate objects row would violate the
// PK before the FTS insert runs.
//
// D-387 (2026-09-18 perf review #2): the SAME discipline applied to the
// delete path. ftsDelete per compacted row costs candidates × fts_size
// (one full scan PER row). ftsDeleteMany stages the
// (id, rev) triples into a temp table and removes them in ONE scan —
// same rows removed, same transaction; the measured delta is recorded in
// docs/migration/40-EVIDENCE/OWNER/ (D-387). ftsDelete remains for
// single-row callers (tests, tooling).

export function ftsInsert(db: Database, ns: string, id: string, rev: number, body: string): void {
  db.query("INSERT INTO fts_index (ns, id, rev, body) VALUES (?, ?, ?, ?)").run(ns, id, rev, body);
}

export function ftsDelete(db: Database, ns: string, id: string, rev: number): void {
  db.query("DELETE FROM fts_index WHERE ns = ? AND id = ? AND CAST(rev AS INTEGER) = ?").run(ns, id, rev);
}

/** Batched FTS delete for one compaction pass: one scan instead of one per row.
 *  Must run INSIDE the caller's transaction (staging table + delete are atomic
 *  with the move). The staging table is per-connection temp state, cleared per call. */
export function ftsDeleteMany(db: Database, ns: string, targets: Array<{ id: string; rev: number }>): void {
  if (targets.length === 0) return;
  db.exec("CREATE TEMP TABLE IF NOT EXISTS fts_delete_batch (id TEXT NOT NULL, rev INTEGER NOT NULL, PRIMARY KEY (id, rev))");
  db.exec("DELETE FROM fts_delete_batch");
  const ins = db.query("INSERT INTO fts_delete_batch (id, rev) VALUES (?, ?)");
  for (const t of targets) ins.run(t.id, t.rev);
  db.query(
    "DELETE FROM fts_index WHERE ns = ? AND EXISTS (SELECT 1 FROM fts_delete_batch b WHERE b.id = fts_index.id AND b.rev = CAST(fts_index.rev AS INTEGER))",
  ).run(ns);
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
          throw new Error(`vault.get@1: malformed refs entry in stored envelope: ${JSON.stringify(r)}`);
        }
        return { ns: ref.ns, id: ref.id, rev: ref.rev };
      })
    : [];
  return { meta: env.meta ?? null, refs };
}

/** Every provenance edge declared by any live (hot) object, as "ns|id|rev" keys.
 *  D-387 (perf review #3): a SQL json_extract prefilter was implemented and MEASURED
 *  — and it LOST to plain JS parsing (3.8-7.1 ms vs 3.2-3.9 ms per 5,000 objects:
 *  SQLite's per-row json_extract overhead exceeds V8's JSON.parse at these envelope
 *  sizes), so it was REVERTED per the repo's measured-not-assumed law. The scan stays
 *  as-is; the review's reverse-reference index remains a NAMED DEFERRAL in D-387
 *  (schema change to vault format v1 — needs its own evidence cycle). */
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

/** Bound for one vault.getmany@1 call (READ, latest-rev-per-id batch).
 *  2× QUERY_BOUND (the mind's per-namespace window) with headroom; anything
 *  larger must page through vault.query@1 + repeated batches. */
export const GET_MANY_BOUND = 512;

export interface ObjectGetRowFound { id: string; found: true; rev: number; cid: string; data: unknown; meta: unknown }
export interface ObjectGetRowMissing { id: string; found: false }

/** Batched latest-revision read: one port hop for many ids (D-387, perf review
 *  #1). Same resolution order as readObject — hot first, cold fallback, latest
 *  rev per id. A missing id is DATA ({found:false}), never an error: a batch
 *  must not lose its other rows. A malformed envelope still THROWS (corruption
 *  must not masquerade as absence) and a missing CAS blob still THROWS —
 *  identical fail-closed semantics to vault.get@1. Duplicates in `ids` are
 *  collapsed to one row per DISTINCT id. */
export function readObjects(v: VaultDB, ns: string, ids: string[]): Array<ObjectGetRowFound | ObjectGetRowMissing> {
  if (new Set(ids).size > GET_MANY_BOUND) {
    throw new Error(`readObjects: ${new Set(ids).size} distinct ids exceeds the ${GET_MANY_BOUND} bound (D-387)`);
  }
  const db = v.db;
  const out: Array<ObjectGetRowFound | ObjectGetRowMissing> = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = (db.query("SELECT rev, cid, meta FROM objects WHERE ns = ? AND id = ? ORDER BY rev DESC LIMIT 1").get(ns, id)
      ?? db.query("SELECT rev, cid, meta FROM cold_objects WHERE ns = ? AND id = ? ORDER BY rev DESC LIMIT 1").get(ns, id)) as RowShape | null;
    if (!row) { out.push({ id, found: false }); continue; }
    const env = parseEnvelope(row.meta); // malformed → throws (fail-closed, same as readObject)
    out.push({ id, found: true, rev: row.rev, cid: row.cid, data: casGet(v.dataDir, row.cid), meta: env.meta });
  }
  return out;
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

/** FTS5 MATCH over indexed bodies within a ns, rank-ordered, capped at 200.
 *  The query is phrase-quoted (arbitrary text can never break MATCH syntax):
 *  multi-word queries match the PHRASE, not an AND — documented, not accidental. */
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
