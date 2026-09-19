// vivim.vault — drivers/conformance.ts (D-373)
// THE DRIVER CONFORMANCE WORKLOAD: one fixed, deterministic append → read →
// verify → search → roundtrip → compaction sequence over the REAL spine
// modules (changelog/verify/roundtrip/compaction — all driver-neutral since
// the sql.ts split), producing a canonical digest. The digest is the
// byte-identity contract between drivers:
//
//   bun-sqlite (under Bun) and node-sqlite (under Node 24) MUST produce the
//   SAME digest for the SAME workload. Digest contents are strings and
//   integers only — no floats (bm25 rank values are build-dependent and
//   deliberately excluded; multi-hit search ordering is normalized by
//   sorting), no timestamps, no paths.
//
// Loads under ANY runtime: no `bun:` import, no `node:sqlite` import — the
// caller (test under Bun / driver-parity.mjs under Node) binds the lane by
// importing db.ts or db.node.ts BEFORE calling runWorkload().
import { mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { omegaTmp } from "@vivim/omega-platform"; // D-372: scratch through the seam (Node-safe: node:fs/os/path only)
import { canonicalJson, entryHash, GENESIS_HASH } from "../canon.ts";
import { casGet, casHas } from "../cas.ts";
import { appendObject, chainHead, changelogCount } from "../changelog.ts";
import { compact } from "../compaction.ts";
import { openVault, searchObjects, type VaultDB } from "../sql.ts";
import { roundtrip } from "../roundtrip.ts";
import { isValidStorageDriverId, type StorageDriverId } from "@vivim/omega-contracts"; // D-373: driver ids are contract grammar
import { verify } from "../verify.ts";

export interface ConformanceDigest {
  appended: string[];            // cids in append order (content addresses — deterministic)
  revs: Record<string, number>;  // "ns/id" → latest rev after the workload
  reads: Record<string, string>; // "ns/id@rev" → canonicalJson of the blob data
  chainHead: string;             // Merkle chain head after all appends
  chainCount: number;
  entryHashes: string[];         // per-entry hashes in seq order
  searchSingle: string[];        // "id@rev" for the single-hit query
  searchMulti: string[];         // sorted "id@rev" for the multi-hit query (rank-order normalized)
  queryAll: string[];            // queryObjects output for the ns, "id@rev" in id order
  hotAfterCompact: string[];     // ns|id|rev surviving in objects (sorted)
  coldAfterCompact: string[];    // ns|id|rev moved to cold_objects (sorted)
  verifyOk: boolean;
  verifyHead: string;
  roundtripOk: boolean;
  refsSurvive: boolean;          // the cited ref revision still readable after compaction
}

function append(v: VaultDB, ns: string, id: string, data: unknown, meta: unknown, refs: { ns: string; id: string; rev: number }[], causationId: string) {
  return v.enqueueWrite(() => appendObject(v, { ns, id, data, meta, refs, causationId }));
}

/** Deterministic workload digest. Caller MUST have bound a lane (db.ts / db.node.ts). */
export async function runWorkload(runId: string): Promise<ConformanceDigest> {
  const dataDir = omegaTmp("omega-vault-driver-conformance", `${runId}`);
  rmSync(dataDir, { recursive: true, force: true }); // scratch law: force:true (AGENTS.md)
  mkdirSync(dataDir, { recursive: true });
  const v = openVault(dataDir);
  const driverId: StorageDriverId = v.driverId; // D-373: the lane's driver id carries the contract grammar
  if (!isValidStorageDriverId(driverId)) throw new Error(`conformance: driver id grammar violated: ${JSON.stringify(v.driverId)}`);

  // 1 · appends across two ns with refs + meta (the full append path: CAS + objects + FTS + Merkle link)
  const a1 = await append(v, "parity", "alpha", { k: 1, text: "the quick brown fox" }, { author: "conformance" }, [], "conf_c_1");
  const a2 = await append(v, "parity", "alpha", { k: 2, text: "the quick brown fox jumps" }, { author: "conformance" }, [], "conf_c_2");
  const a3 = await append(v, "parity", "alpha", { k: 3, text: "quick brown foxes jump" }, { author: "conformance" }, [], "conf_c_3");
  const b1 = await append(v, "parity", "beta", { k: 10, text: "a lazy dog" }, null, [{ ns: "parity", id: "alpha", rev: a2.rev }], "conf_c_4");
  const g1 = await append(v, "gamma", "sol", { k: 99, text: "quick" }, null, [], "conf_c_5");
  const appended = [a1, a2, a3, b1, g1].map((r) => r.cid);

  // 2 · reads — latest and specific rev, blob content round-trips byte-identically
  const latestAlpha = casGet(dataDir, a3.cid) as { k: number };
  const rev1Alpha = casGet(dataDir, a1.cid) as { k: number };
  const betaData = casGet(dataDir, b1.cid) as { k: number };

  // 3 · changelog — full Merkle walk captured in the digest
  const db = v.db;
  const entryRows = db.query("SELECT seq, causationId, ns, id, rev, cid, entry_hash, prev_hash FROM changelog ORDER BY seq ASC").all() as {
    seq: number; causationId: string; ns: string; id: string; rev: number; cid: string; entry_hash: string; prev_hash: string;
  }[];
  const entryHashes = entryRows.map((r) => r.entry_hash);
  // re-derive the chain locally (driver-independent math, same formula as changelog.ts)
  let prev = GENESIS_HASH;
  for (const r of entryRows) {
    const derived = entryHash(r.seq, r.causationId, r.ns, r.id, r.rev, r.cid, prev);
    if (derived !== r.entry_hash) throw new Error(`conformance: chain mismatch at seq ${r.seq} (${derived} != ${r.entry_hash})`);
    if (r.prev_hash !== prev) throw new Error(`conformance: prev_hash mismatch at seq ${r.seq}`);
    prev = r.entry_hash;
  }
  const head = chainHead(db);
  if (head !== prev || changelogCount(db) !== entryRows.length) throw new Error("conformance: chain head/count mismatch");

  // 4 · FTS search — single-hit (order trivial) + multi-hit (sorted: bm25 rank is build-dependent)
  const single = searchObjects(v, "parity", "lazy dog").map((r) => `${r.id}@${r.rev}`);
  const multi = searchObjects(v, "parity", "quick").map((r) => `${r.id}@${r.rev}`).sort();

  // 5 · queryObjects — the id-ordered latest-rev scan
  const q = dbRowsSafe(v);

  // 6 · verify — Merkle walk + CAS resolution over every row
  const ver = verify(v);

  // 7 · roundtrip — full copy + head equality on a fresh target
  const targetDir = `${dataDir}-roundtrip`;
  rmSync(targetDir, { recursive: true, force: true });
  const rt = roundtrip(v, targetDir);

  // 8 · compaction — keep=1; the ref cited by beta (alpha@2) MUST survive (refs-honored)
  const comp = await v.enqueueWrite(() => compact(v, "parity", 1));
  if (comp.moved + comp.kept + comp.protected <= 0) throw new Error("conformance: compaction moved nothing");
  const hot = (db.query("SELECT ns, id, rev FROM objects ORDER BY ns, id, rev").all() as { ns: string; id: string; rev: number }[])
    .map((r) => `${r.ns}|${r.id}|${r.rev}`).sort();
  const cold = (db.query("SELECT ns, id, rev FROM cold_objects ORDER BY ns, id, rev").all() as { ns: string; id: string; rev: number }[])
    .map((r) => `${r.ns}|${r.id}|${r.rev}`).sort();
  // the cited revision survives compaction and stays readable (compaction-honors-refs)
  const citedStillReadable = (db.query("SELECT cid FROM objects WHERE ns = ? AND id = ? AND rev = ?").get("parity", "alpha", a2.rev) as { cid: string } | null) !== null
    && casHas(dataDir, a2.cid);

  const digest: ConformanceDigest = {
    appended,
    revs: { "parity/alpha": a3.rev, "parity/beta": b1.rev, "gamma/sol": g1.rev },
    reads: {
      "parity/alpha@latest": canonicalJson(latestAlpha),
      "parity/alpha@1": canonicalJson(rev1Alpha),
      "parity/beta@1": canonicalJson(betaData),
    },
    chainHead: head,
    chainCount: entryRows.length,
    entryHashes,
    searchSingle: single,
    searchMulti: multi,
    queryAll: q,
    hotAfterCompact: hot,
    coldAfterCompact: cold,
    verifyOk: ver.ok === true,
    verifyHead: ver.headHash,
    roundtripOk: rt.ok === true && rt.headHash === ver.headHash,
    refsSurvive: citedStillReadable === true,
  };
  v.close();
  rmRetry(dataDir);
  rmRetry(targetDir);
  return digest;
}

/** Scratch cleanup is best-effort (the ownerOnly doctrine: never throw). Windows
 *  holds sqlite locks past close (EBUSY — AV/indexer scans, not our handles),
 *  so retry bounded (~5s, same precedent as retryOsLock on the rename
 *  boundary), then leave the unique scratch dir for the OS temp sweeper rather
 *  than red-ing a green workload digest. Sync sleep via Atomics.wait keeps this
 *  runtime-neutral (no timers, works under Node). */
function rmRetry(dir: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (attempt >= 19) {
        if (code === "EBUSY" || code === "EPERM") return;
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

function dbRowsSafe(v: VaultDB): string[] {
  const rows = v.db.query(
    "SELECT o.id AS id, o.rev AS rev FROM objects o JOIN (SELECT id, MAX(rev) AS mrev FROM objects WHERE ns = 'parity' GROUP BY id) latest ON latest.id = o.id AND latest.mrev = o.rev WHERE o.ns = 'parity' ORDER BY o.id ASC",
  ).all() as { id: string; rev: number }[];
  return rows.map((r) => `${r.id}@${r.rev}`);
}

/** Canonical digest string — sha256 over the stable JSON projection (ints + strings only). */
export function digestOf(d: ConformanceDigest): string {
  const projection = {
    appended: d.appended,
    revs: d.revs,
    reads: d.reads,
    chainHead: d.chainHead,
    chainCount: d.chainCount,
    entryHashes: d.entryHashes,
    searchSingle: d.searchSingle,
    searchMulti: d.searchMulti,
    queryAll: d.queryAll,
    hotAfterCompact: d.hotAfterCompact,
    coldAfterCompact: d.coldAfterCompact,
    verifyOk: d.verifyOk,
    verifyHead: d.verifyHead,
    roundtripOk: d.roundtripOk,
    refsSurvive: d.refsSurvive,
  };
  return createHash("sha256").update(canonicalJson(projection)).digest("hex");
}

/** Sanity invariants every driver must satisfy BEFORE digests are compared. */
export function assertInvariants(d: ConformanceDigest): void {
  if (d.chainCount !== 5) throw new Error(`conformance: expected 5 changelog entries, got ${d.chainCount}`);
  if (d.appended.length !== 5 || new Set(d.appended).size !== 5) throw new Error("conformance: expected 5 distinct cids");
  if (!d.verifyOk || !d.roundtripOk) throw new Error("conformance: verify/roundtrip failed");
  if (d.verifyHead !== d.chainHead) throw new Error("conformance: verify head != chain head");
  if (!d.refsSurvive) throw new Error("conformance: cited ref did not survive compaction");
  if (d.searchSingle.length !== 1 || !d.searchSingle[0].startsWith("beta@")) throw new Error("conformance: single-hit search shape unexpected");
  if (d.searchMulti.length < 2) throw new Error("conformance: multi-hit search shape unexpected");
  if (d.revs["parity/alpha"] !== 3) throw new Error("conformance: rev allocation unexpected");
}
