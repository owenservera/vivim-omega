// vivim.vault — verify.ts (Ω2)
// The proof walk: changelog head→tail recomputing every entry_hash, plus CAS
// resolution for every object revision (hot AND cold — CAS is never pruned, so a
// missing blob is corruption, and every changelog link must resolve to a stored
// revision). First divergence is reported as corruptAt (the seq row that is wrong).
//
// Returns { ok, headHash, entries, corruptAt? } — headHash is the RECOMPUTED head
// (what the chain says it must be, not what a possibly-tampered row claims).

import type { VaultDB } from "./db.ts";
import { entryHash, GENESIS_HASH } from "./canon.ts";
import { casHas } from "./cas.ts";

export interface VerifyResult {
  ok: boolean;
  headHash: string;       // recomputed chain head (genesis if empty)
  entries: number;        // changelog length
  corruptAt?: number;     // first seq whose row is wrong (hash mismatch, gap, dangling link, or CAS-missing)
  detail?: string;
}

interface StoredRow { seq: number; causationId: string; ns: string; id: string; rev: number; cid: string; entry_hash: string; prev_hash: string }

export function verify(v: VaultDB): VerifyResult {
  const db = v.db;
  const rows = db.query(
    "SELECT seq, causationId, ns, id, rev, cid, entry_hash, prev_hash FROM changelog ORDER BY seq ASC",
  ).all() as unknown as StoredRow[];

  let prev = GENESIS_HASH;
  let head = GENESIS_HASH;
  let corruptAt: number | undefined;
  let detail: string | undefined;

  // 1 · walk the chain: contiguity, prev-hash linkage, entry-hash recomputation
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.seq !== i + 1) {
      corruptAt = row.seq; detail = `changelog seq gap before ${row.seq} (expected ${i + 1}) — entries deleted`;
      break;
    }
    const computed = entryHash(row.seq, row.causationId, row.ns, row.id, row.rev, row.cid, prev);
    if (row.prev_hash !== prev) {
      corruptAt = row.seq; detail = `prev_hash mismatch at seq ${row.seq}: stored ${row.prev_hash} != chain ${prev}`;
      break;
    }
    if (row.entry_hash !== computed) {
      corruptAt = row.seq; detail = `entry_hash mismatch at seq ${row.seq}: stored ${row.entry_hash} != recomputed ${computed}`;
      break;
    }
    prev = computed;
    head = computed;
  }

  // 2 · every changelog link resolves to a stored revision (hot or cold)
  if (corruptAt === undefined) {
    for (const row of rows) {
      const hot = db.query("SELECT 1 FROM objects WHERE ns = ? AND id = ? AND rev = ?").get(row.ns, row.id, row.rev);
      const cold = hot ?? db.query("SELECT 1 FROM cold_objects WHERE ns = ? AND id = ? AND rev = ?").get(row.ns, row.id, row.rev);
      if (!cold) {
        corruptAt = row.seq; detail = `changelog seq ${row.seq} (${row.ns}/${row.id}@${row.rev}) has no stored revision — history rewritten`;
        break;
      }
    }
  }

  // 3 · every stored revision's cid resolves in CAS (hot + cold; CAS is append-only)
  let missingCas = 0;
  const checkRows = (table: string): void => {
    for (const row of db.query(`SELECT ns, id, rev, cid FROM ${table}`).all() as unknown as { ns: string; id: string; rev: number; cid: string }[]) {
      if (!casHas(v.dataDir, row.cid)) {
        missingCas++;
        if (corruptAt === undefined) {
          const link = db.query("SELECT seq FROM changelog WHERE ns = ? AND id = ? AND rev = ? ORDER BY seq LIMIT 1").get(row.ns, row.id, row.rev) as { seq: number } | null;
          if (link) { corruptAt = link.seq; detail = `CAS blob ${row.cid} for ${row.ns}/${row.id}@${row.rev} (changelog seq ${link.seq}) is missing`; }
        }
      }
    }
  };
  checkRows("objects");
  checkRows("cold_objects");
  if (missingCas > 0 && detail === undefined) detail = `${missingCas} stored revision(s) have missing CAS blobs`;

  const ok = corruptAt === undefined && missingCas === 0;
  return { ok, headHash: head, entries: rows.length, ...(corruptAt !== undefined ? { corruptAt } : {}), ...(detail !== undefined ? { detail } : {}) };
}
