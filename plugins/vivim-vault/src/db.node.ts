// vivim.vault — db.node.ts (D-373)
// The NODE-lane seam entry: the ONE module a Node build points at instead of
// db.ts (the D-361 "swap one module" promise, now a real file). Exports the
// identical surface as db.ts — every vault module can be re-targeted by a
// single import rewrite at the build boundary, never per call site.
//
// This file and ./drivers/node-sqlite.ts are loaded ONLY under Node
// (Bun 1.3.14 cannot resolve `node:sqlite` — that is the two-lane split).
// Proven by the conformance parity suite under real Node:
//   node tooling/ci/driver-parity.mjs
import { openSqlite as nodeOpenSqlite, DRIVER_INFO as NODE_DRIVER_INFO } from "./drivers/node-sqlite.ts";
import { bindDriverLane, openVaultWith, dbPath, type VaultDB, type Database } from "./sql.ts";

// D-373: importing THIS module binds the Node lane for the whole process.
bindDriverLane(nodeOpenSqlite, NODE_DRIVER_INFO.id);

export type { Database, VaultDB, Ref, MetaEnvelope, ObjectRecord, QueryFilter } from "./sql.ts";
export {
  DDL,
  dbPath,
  openVaultWith,
  openVault,
  openDatabase,
  boundDriverId,
  ftsInsert,
  ftsDelete,
  envelopeOf,
  parseEnvelope,
  liveRefs,
  readObject,
  queryObjects,
  searchObjects,
} from "./sql.ts";

/** The declared driver of THIS lane. */
export const DRIVER_INFO = NODE_DRIVER_INFO;
