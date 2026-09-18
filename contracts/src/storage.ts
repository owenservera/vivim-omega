// @vivim/omega-contracts — storage.ts (D-373)
// The DB-agnostic storage vocabulary (W0-10 / FOUNDATION-DRAFT-002): the vault
// spine owns CAS hashing, Merkle changelog, compaction-ref discipline; drivers
// are dumb byte stores behind ONE capability. Zero runtime — types and one
// grammar helper only.
//
// The `(ns, key, rev)` triple is LOAD-BEARING: drivers never decide what is
// live, they store/retrieve bytes by revision; `refs` on a write is the
// provenance edge list compaction must honor (DRAFT-002 arbitration item 12 —
// refs keys are (ns, key, rev) → hash, never hash-only).

export type StorageKey = string;
export type StorageTable = string;

/** Driver identifiers are lowercase alnum + dashes, version-free (the driver plugin carries the version). */
export type StorageDriverId = string;

export interface StorageOp {
  type: "put" | "get" | "del" | "scan";
  ns: string;                    // vault namespace — required, never optional
  table: StorageTable;
  key?: StorageKey;
  rev?: number;                  // omitted = latest
  value?: Uint8Array;            // put only
  refs?: string[];               // content-hash refs this write cites (compaction input)
  prefix?: string;               // scan only
  limit?: number;                // scan only
}

export interface StorageResult {
  value?: Uint8Array;
  rev?: number;
  entries?: Array<{ key: string; rev: number; value: Uint8Array }>;
}

/** What every storage driver must answer (DRAFT-003 §1 `health()` adopted: the spine's future router probes without timing out). */
export interface StorageDriverContract {
  execute(batch: StorageOp[]): Promise<StorageResult[]>;
  health(): Promise<{ ok: boolean; latencyMs?: number }>;
}

/** Driver self-description — journaled at boot, asserted in the conformance suite. */
export interface StorageDriverInfo {
  id: StorageDriverId;           // "bun-sqlite" | "node-sqlite" | (step 2) "postgres"
  family: "sqlite" | "postgres" | (string & {});
  lazyLoaded: boolean;           // true when the driver module is not statically imported by the seam
}

/** Grammar for pool/driver ids used by signed composition config (D-374 shares the shape). */
export function isValidStorageDriverId(id: unknown): id is StorageDriverId {
  return typeof id === "string" && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id);
}
