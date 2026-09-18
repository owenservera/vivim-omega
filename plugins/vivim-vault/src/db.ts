// vivim.vault — db.ts (Ω2, D-373 seam)
// The BUN-lane seam module. Every vault module and test imports from here and
// sees the exact same surface as before D-373 — only the constructor moved.
//
//   BEFORE (D-361): this file was the ONLY bun:sqlite importer; a Node build
//   "swaps this module" by hand and on trust.
//   AFTER (D-373): the driver-neutral layer lives in ./sql.ts; the concrete
//   driver lives in ./drivers/bun-sqlite.ts (this lane) or
//   ./drivers/node-sqlite.ts (Node lane, ./db.node.ts entry — loaded ONLY
//   under Node, never by Bun-lane code). The conformance parity suite
//   (test/driver-conformance.test.ts + tooling/ci/driver-parity.mjs) proves
//   both drivers byte-identical on the same workload. The gate's bun-surface
//   allowlist now covers the driver lane (drivers/), still nowhere else.
//
// The bun:sqlite import below is the D-373 allowlisted lane (gate-enforced):
// zero Bun-API calls anywhere, `bun:sqlite` only inside drivers/bun-sqlite.ts.
import { openSqlite as bunOpenSqlite, DRIVER_INFO as BUN_DRIVER_INFO } from "./drivers/bun-sqlite.ts";
import { bindDriverLane, openVaultWith, dbPath, type VaultDB, type Database } from "./sql.ts";

// D-373: importing THIS module binds the Bun lane for the whole process.
bindDriverLane(bunOpenSqlite, BUN_DRIVER_INFO.id);

export type { Database, VaultDB, Ref, MetaEnvelope, ObjectRecord, ObjectGetRowFound, ObjectGetRowMissing, QueryFilter } from "./sql.ts";
export {
  DDL,
  dbPath,
  openVaultWith,
  openVault,
  openDatabase,
  boundDriverId,
  ftsInsert,
  ftsDelete,
  ftsDeleteMany,
  envelopeOf,
  parseEnvelope,
  liveRefs,
  readObject,
  readObjects,
  GET_MANY_BOUND,
  queryObjects,
  searchObjects,
} from "./sql.ts";

/** The declared driver of THIS lane (D-373: journaled at boot, parity-proven in CI). */
export const DRIVER_INFO = BUN_DRIVER_INFO;
