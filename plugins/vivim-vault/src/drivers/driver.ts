// vivim.vault — drivers/driver.ts (D-373)
// The structural seam every vault storage driver satisfies. Deliberately SHAPED
// like the surface this codebase already uses (bun:sqlite's `query(sql)` →
// `{run,get,all}` + `exec` + `close`): the whole SQL layer in ../db.ts (DDL,
// FTS maintenance, envelope reads, compaction queries) is driver-agnostic
// against this interface and stays untouched by driver choice.
//
// Drivers are dumb byte stores (DRAFT-002 arbitration item 12): they never
// decide what is live, never interpret `refs`, never prune the changelog —
// the spine (cas.ts / changelog.ts / compaction.ts) owns all discipline.
//
// bun:sqlite's Database satisfies this structurally as-is. node:sqlite's
// DatabaseSync is wrapped (prepare-cache) in ./node-sqlite.ts, which is
// LAZILY loaded — never imported by Bun-lane code (Bun 1.3.14 cannot resolve
// `node:sqlite`; that is the point of the two-lane split, D-373).

export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown;
}

export interface SqliteDriver {
  /** Stable driver id (D-373 grammar: lowercase alnum + dashes) — journaled at open, asserted in the conformance suite. */
  readonly driverId: "bun-sqlite" | "node-sqlite";
  exec(sql: string): void;
  query(sql: string): SqliteStatement;
  close(): void;
}

export type SqliteDriverFactory = (path: string) => SqliteDriver;

/** PRAGMAs every vault driver connection MUST apply before DDL (WAL + NORMAL + FK parity across drivers).
 *  cache_size (D-378 probe finding): the default ~2MB page cache thrashes once the DB outgrows
 *  it — append throughput degraded 3×+ across the 100K-row probe batch. 64MB keeps the hot
 *  B-trees resident (both drivers apply the identical block, so the parity workload is unchanged). */
export const VAULT_PRAGMAS = [
  "PRAGMA journal_mode = WAL;",
  "PRAGMA synchronous = NORMAL;",
  "PRAGMA foreign_keys = ON;",
  "PRAGMA cache_size = -65536;",
] as const;
