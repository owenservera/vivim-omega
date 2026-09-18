// vivim.vault — drivers/node-sqlite.ts (D-373)
// The Node-lane storage driver (Node 24 `node:sqlite` — FTS5 included in the
// bundled build). LAZILY LOADED by design: Bun 1.3.14 cannot resolve
// `node:sqlite`, so this module is never imported by Bun-lane code — the seam
// (`../db.ts`) dynamic-imports it ONLY when the node driver is selected, and
// the conformance parity suite loads it under real Node
// (`node tooling/ci/driver-parity.mjs`). That lazy split IS the D-361
// "a Node build swaps one module" promise, mechanized.
//
// node:sqlite's DatabaseSync differs from bun:sqlite in two ways this wrapper
// absorbs: statements come from prepare() (cached per SQL string here), and
// no-row reads return undefined (the SQL layer's `| null` falsy checks treat
// null and undefined identically).
import { DatabaseSync } from "node:sqlite";
import { VAULT_PRAGMAS, type SqliteDriver, type SqliteStatement } from "./driver.ts";
import type { StorageDriverInfo } from "@vivim/omega-contracts"; // D-373: the driver self-description is contract vocabulary

export const DRIVER_INFO: StorageDriverInfo = { id: "node-sqlite", family: "sqlite", lazyLoaded: true };

export function openSqlite(path: string): SqliteDriver {
  const db = new DatabaseSync(path);
  for (const pragma of VAULT_PRAGMAS) db.exec(pragma);
  const cache = new Map<string, SqliteStatement>();
  const driver: SqliteDriver = {
    driverId: "node-sqlite",
    exec: (sql) => db.exec(sql),
    query: (sql) => {
      let stmt = cache.get(sql);
      if (!stmt) {
        stmt = db.prepare(sql) as unknown as SqliteStatement;
        cache.set(sql, stmt);
      }
      return stmt;
    },
    close: () => db.close(),
  };
  return driver;
}
