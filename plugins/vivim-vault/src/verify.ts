// vivim.vault — verify.ts (Ω2)
// The proof walk: changelog head→tail recomputing every entry_hash, plus CAS
// resolution for every object revision (hot AND cold — CAS is never pruned, so a
// missing blob is corruption, and every changelog link must resolve to a stored
// revision). First divergence is reported as corruptAt (the seq row that is wrong).
//
// Returns { ok, headHash, entries, corruptAt? } — headHash is the RECOMPUTED head
// (what the chain says it must be, not what a possibly-tampered row claims).

import type { VaultDB } from "./sql.ts";
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
  // D-387 (perf review #4): one set-based probe replaces the per-row loop that
  // issued up to two SELECTs per changelog entry. NOT EXISTS over the two PKs
  // is an index seek per row — O(n log n) in one statement, identical verdict:
  // the lowest seq with no stored revision is the first divergence reported.
  if (corruptAt === undefined) {
    const missing = db.query(`
      SELECT c.seq AS seq, c.ns AS ns, c.id AS id, c.rev AS rev
      FROM changelog c
      WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.ns = c.ns AND o.id = c.id AND o.rev = c.rev)
        AND NOT EXISTS (SELECT 1 FROM cold_objects k WHERE k.ns = c.ns AND k.id = c.id AND k.rev = c.rev)
      ORDER BY c.seq ASC
      LIMIT 1
    `).get() as { seq: number; ns: string; id: string; rev: number } | null;
    if (missing) {
      corruptAt = missing.seq;
      detail = `changelog seq ${missing.seq} (${missing.ns}/${missing.id}@${missing.rev}) has no stored revision — history rewritten`;
    }
  }

  // 3 · every stored revision's cid resolves in CAS (hot + cold; CAS is append-only)
  // D-387 (perf review #4): DISTINCT cids in one statement, then one existsSync
  // per DISTINCT blob (repeated references cost one stat, not one per row).
  let missingCas = 0;
  const distinct = db.query("SELECT DISTINCT cid FROM objects UNION SELECT DISTINCT cid FROM cold_objects").all() as unknown as { cid: string }[];
  for (const { cid } of distinct) {
    if (casHas(v.dataDir, cid)) continue;
    missingCas++;
    if (corruptAt === undefined) {
      // rare corruption path: resolve the lowest changelog seq that references this blob
      const carrier = db.query("SELECT ns, id, rev FROM objects WHERE cid = ? UNION ALL SELECT ns, id, rev FROM cold_objects WHERE cid = ? LIMIT 1").get(cid, cid) as { ns: string; id: string; rev: number } | null;
      if (carrier) {
        const link = db.query("SELECT seq FROM changelog WHERE ns = ? AND id = ? AND rev = ? ORDER BY seq LIMIT 1").get(carrier.ns, carrier.id, carrier.rev) as { seq: number } | null;
        if (link) { corruptAt = link.seq; detail = `CAS blob ${cid} for ${carrier.ns}/${carrier.id}@${carrier.rev} (changelog seq ${link.seq}) is missing`; }
      }
    }
  }
  if (missingCas > 0 && detail === undefined) detail = `${missingCas} stored revision(s) have missing CAS blobs`;

  const ok = corruptAt === undefined && missingCas === 0;
  return { ok, headHash: head, entries: rows.length, ...(corruptAt !== undefined ? { corruptAt } : {}), ...(detail !== undefined ? { detail } : {}) };
}
