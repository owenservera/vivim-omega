// vivim.vault — drivers/bun-sqlite.ts (D-373)
// The Bun-lane storage driver: the ONLY file in the vault that may import
// `bun:sqlite` (the D-373 rewrite of the D-361 one-importer rule — the
// allowlist moved from "one file anywhere" to "the vault driver lane").
// bun:sqlite's Database satisfies the SqliteDriver shape structurally;
// this module just names it, stamps the driverId, and applies the shared
// PRAGMA parity block before the caller's DDL.
import { Database } from "bun:sqlite";
import { VAULT_PRAGMAS, type SqliteDriver } from "./driver.ts";
import type { StorageDriverInfo } from "@vivim/omega-contracts"; // D-373: the driver self-description is contract vocabulary

export type { Database }; // re-exported so any Bun-lane tooling can name the native type

export const DRIVER_INFO: StorageDriverInfo = { id: "bun-sqlite", family: "sqlite", lazyLoaded: false };

export function openSqlite(path: string): SqliteDriver {
  const db = new Database(path);
  for (const pragma of VAULT_PRAGMAS) db.exec(pragma);
  const driver: SqliteDriver = {
    driverId: "bun-sqlite",
    exec: (sql) => db.exec(sql),
    query: (sql) => db.query(sql),
    close: () => db.close(),
  };
  return driver;
}
