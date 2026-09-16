// vivim.vault — unit tests (Ω2): vault format v1 on-disk contract, exercised module-level
// with temp dirs. Integration (router + compartments) lives in integration.test.ts.
import { describe, test, expect } from "bun:test";
import { openDatabase } from "../src/db.ts"; // D-361: tests ride the adapter too
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { canonicalJson, cidOf, entryHash, GENESIS_HASH } from "../src/canon.ts";
import { casGet, casHas, casList, casPath, casPut } from "../src/cas.ts";
import { appendObject, changelogCount } from "../src/changelog.ts";
import { compact } from "../src/compaction.ts";
import { dbPath, openVault, queryObjects, readObject, searchObjects } from "../src/db.ts";
import { roundtrip } from "../src/roundtrip.ts";
import { verify } from "../src/verify.ts";
import { resolveDataDir } from "../src/validate.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

let seq = 0;
function tmp(name: string): string {
  // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
  const dir = omegaTmp("omega-vault-test/unit", `${name}-${Date.now()}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
function append(v: ReturnType<typeof openVault>, ns: string, id: string, data: unknown, opts: { meta?: unknown; refs?: { ns: string; id: string; rev: number }[] } = {}) {
  return v.enqueueWrite(() => appendObject(v, { ns, id, data, meta: opts.meta ?? null, refs: opts.refs ?? [], causationId: `unit_c_${++seq}` }));
}
function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

describe("Ω2 driver decision", () => {
  // Driver decision (recorded per the wave spec): FTS5 is BUNDLED with bun:sqlite's
  // SQLite build — MATCH, rank, phrase queries, unindexed identity columns and
  // CAST(rev AS INTEGER) joins all verified; the same probe was verified inside a
  // worker_threads compartment (the plugin's actual runtime) — see the worker probe
  // in the work log and the router-level search tests in integration.test.ts.
  test("bun:sqlite FTS5 confirmed — virtual table, MATCH, rank", () => {
    const db = openDatabase(":memory:");
    db.exec("CREATE VIRTUAL TABLE fts USING fts5(ns UNINDEXED, id UNINDEXED, rev UNINDEXED, body)");
    db.query("INSERT INTO fts (ns, id, rev, body) VALUES (?, ?, ?, ?)").run("a", "1", 1, "the quick brown fox");
    db.query("INSERT INTO fts (ns, id, rev, body) VALUES (?, ?, ?, ?)").run("a", "2", 1, "a lazy dog");
    const rows = db.query("SELECT id, CAST(rev AS INTEGER) AS rev, rank FROM fts WHERE fts MATCH ? AND fts.ns = ? ORDER BY rank").all('"quick"', "a") as { id: string; rev: number; rank: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("1");
    expect(rows[0].rev).toBe(1);
    expect(typeof rows[0].rank).toBe("number");
    db.close();
  });
});

describe("Ω2 config resolution (data sovereignty)", () => {
  test("resolveDataDir defaults to ./dev-vault/vault-data and passes through explicit dirs", () => {
    expect(resolveDataDir(undefined)).toBe("./dev-vault/vault-data");
    expect(resolveDataDir({})).toBe("./dev-vault/vault-data");
    expect(() => resolveDataDir({ dataDir: "" })).toThrow(/non-empty/);
    expect(() => resolveDataDir({ dataDir: 42 })).toThrow(/non-empty/);
  });

  test("D-372: portable + grandfathered spellings resolve on the consuming machine (one recipe, every OS)", async () => {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    expect(resolveDataDir({ dataDir: "${TMP}/omega-x/vault-data" })).toBe(join(tmpdir(), "omega-x", "vault-data"));
    expect(resolveDataDir({ dataDir: "/tmp/omega-x/vault-data" })).toBe(join(tmpdir(), "omega-x", "vault-data"));
    expect(resolveDataDir({ dataDir: "./dev-vault/vault-data" })).toBe("./dev-vault/vault-data");
  });

  test("D-372: resolved ${TMP} dir opens a real vault (consumer path end to end)", async () => {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = resolveDataDir({ dataDir: "${TMP}/omega-vault-test/d372-consumer" });
    expect(dir.startsWith(tmpdir())).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    const v = openVault(dir);
    expect(existsSync(join(dir, "canonical.sqlite"))).toBe(true);
    v.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Ω2 vault format v1 — canonical JSON, CAS, Merkle", () => {
  test("canonicalJson is key-order independent and matches the pinned host algorithm", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: true }] })).toBe('{"a":[2,{"c":true,"d":null}],"b":1}');
    expect(canonicalJson("s")).toBe('"s"');
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
  });

  test("CAS: put → sharded path, no .tmp remains, idempotent; leftovers ignored; malformed cids refused", async () => {
    const dir = tmp("cas");
    const data = { hello: "world", n: [1, 2] };
    const cid = casPut(dir, data);
    expect(cid).toBe(cidOf(data));
    expect(cid).toMatch(/^[0-9a-f]{64}$/);
    expect(casPath(dir, cid)).toBe(join(dir, "cas", cid.slice(0, 2), cid));
    // no .tmp files remain — the rename is the durability boundary
    expect(walkFiles(join(dir, "cas")).filter((p) => basename(p).includes(".tmp"))).toEqual([]);
    expect(walkFiles(join(dir, "cas"))).toHaveLength(1);

    // idempotence: same content → same address, no second blob
    const cid2 = casPut(dir, data);
    expect(cid2).toBe(cid);
    expect(walkFiles(join(dir, "cas"))).toHaveLength(1);
    expect(casGet(dir, cid)).toEqual(data);

    // distinct content → distinct blob
    casPut(dir, { other: true });
    expect(walkFiles(join(dir, "cas"))).toHaveLength(2);
    expect(casList(dir)).toHaveLength(2);

    // interrupted write simulation: a leftover .tmp file is inert
    const leftover = join(dir, "cas", cid.slice(0, 2), `.${cid}.tmp-9999-aborted`);
    writeFileSync(leftover, "partial garbage never renamed");
    expect(casGet(dir, cid)).toEqual(data); // real cids still resolve
    expect(casList(dir)).toHaveLength(2);   // leftover not part of the vault

    // malformed cid (tampered db row) can never path-traverse
    expect(casHas(dir, "../evil")).toBe(false);
    expect(() => casPath(dir, "../evil")).toThrow(/malformed/);
    expect(() => casPath(dir, "deadbeef")).toThrow(/malformed/);
  });

  test("Merkle chain: genesis linkage, hand-recomputed head, tamper → corruptAt, append-after-tamper still flags", async () => {
    const dir = tmp("merkle");
    const v = openVault(dir);
    await append(v, "m", "x", { v: 1 });
    await append(v, "m", "x", { v: 2 });
    await append(v, "m", "y", { v: 3 });

    const ok = verify(v);
    expect(ok.ok).toBe(true);
    expect(ok.entries).toBe(3);
    expect(ok.headHash).toMatch(/^[0-9a-f]{64}$/);

    // hand-recompute the chain straight from the stored rows
    const rows = v.db.query("SELECT seq, causationId, ns, id, rev, cid, entry_hash, prev_hash FROM changelog ORDER BY seq").all() as unknown as Record<string, string | number>[];
    expect((rows[0].prev_hash as string)).toBe(GENESIS_HASH);
    let prev = GENESIS_HASH;
    for (const r of rows) prev = entryHash(Number(r.seq), String(r.causationId), String(r.ns), String(r.id), Number(r.rev), String(r.cid), prev);
    expect(prev).toBe(ok.headHash);
    expect(prev).toBe(rows[rows.length - 1].entry_hash);

    // tamper with a second connection on the same file → verify reports the corrupt seq
    const attacker = openDatabase(dbPath(dir));
    attacker.exec("UPDATE changelog SET cid = 'tampered' WHERE seq = 2");
    attacker.close();
    const bad = verify(v);
    expect(bad.ok).toBe(false);
    expect(bad.corruptAt).toBe(2);
    expect(bad.detail).toContain("entry_hash mismatch at seq 2");

    // the chain grows from what is on disk; the tampered row stays flagged
    await append(v, "m", "y", { v: 4 });
    const still = verify(v);
    expect(still.ok).toBe(false);
    expect(still.corruptAt).toBe(2);
    v.close();
  });

  test("verify: missing CAS blob and deleted object row are both detected", async () => {
    const dir = tmp("verify-cas");
    const v = openVault(dir);
    const a1 = await append(v, "w", "o", { keep: "me" });
    await append(v, "w", "o", { keep: "me 2" });

    // delete the CAS blob of rev 1 → resolution failure, attributed to its changelog seq
    rmSync(casPath(dir, a1.cid));
    const miss = verify(v);
    expect(miss.ok).toBe(false);
    expect(miss.corruptAt).toBe(1);
    expect(miss.detail).toContain("missing");

    // restore blob, then delete the OBJECT row of rev 2 → dangling changelog link
    casPut(dir, { keep: "me" });
    v.db.query("DELETE FROM objects WHERE ns = ? AND id = ? AND rev = ?").run("w", "o", 2);
    const dangling = verify(v);
    expect(dangling.ok).toBe(false);
    expect(dangling.corruptAt).toBe(2);
    v.close();
  });
});

describe("Ω2 append / get / query / search", () => {
  test("append returns {rev, cid, seq}; get returns latest AND specific revisions with data, meta, refs", async () => {
    const dir = tmp("core");
    const v = openVault(dir);
    const data1 = { title: "Quantum Leap", body: "the quick brown fox" };
    const a1 = await append(v, "notes", "n1", data1, { meta: { author: "z" } });
    expect(a1).toEqual({ rev: 1, cid: cidOf(data1), seq: 1 });

    const data2 = { title: "Quantum Leap v2" };
    const a2 = await append(v, "notes", "n1", data2);
    expect(a2.rev).toBe(2);
    await append(v, "tasks", "t1", "buy milk, quantum-free");

    const latest = readObject(v, "notes", "n1", null);
    expect(latest.rev).toBe(2);
    expect(latest.cid).toBe(a2.cid);
    expect(latest.data).toEqual(data2);
    expect(latest.meta).toBeNull();
    expect(latest.refs).toEqual([]);

    const rev1 = readObject(v, "notes", "n1", 1);
    expect(rev1.rev).toBe(1);
    expect(rev1.data).toEqual(data1);
    expect(rev1.meta).toEqual({ author: "z" });
    // data is read back from CAS and is byte-identical
    expect(canonicalJson(rev1.data)).toBe(canonicalJson(data1));

    expect(() => readObject(v, "notes", "n1", 7)).toThrow(/not found/);
    expect(() => readObject(v, "notes", "missing", null)).toThrow(/not found/);
    v.close();
  });

  test("query: latest per id, ns-scoped, idPrefix and minRev filters", async () => {
    const dir = tmp("query");
    const v = openVault(dir);
    await append(v, "ns", "alpha-1", { n: 1 });
    await append(v, "ns", "alpha-1", { n: 2 });
    await append(v, "ns", "alpha-2", { n: 3 });
    await append(v, "ns", "beta-1", { n: 4 });
    await append(v, "other", "alpha-1", { n: 5 });

    const all = queryObjects(v, "ns", {});
    expect(all.map((r) => r.id)).toEqual(["alpha-1", "alpha-2", "beta-1"]);
    expect(all.find((r) => r.id === "alpha-1")?.rev).toBe(2);

    const prefixed = queryObjects(v, "ns", { idPrefix: "alpha-" });
    expect(prefixed.map((r) => r.id)).toEqual(["alpha-1", "alpha-2"]);

    const minRev = queryObjects(v, "ns", { minRev: 2 });
    expect(minRev.map((r) => r.id)).toEqual(["alpha-1"]);

    const none = queryObjects(v, "ns", { idPrefix: "zzz" });
    expect(none).toEqual([]);
    v.close();
  });

  test("search: FTS5 MATCH with rank, ns-scoped, multiple revisions indexed, phrase-safe", async () => {
    const dir = tmp("search");
    const v = openVault(dir);
    await append(v, "notes", "n1", { body: "the quick brown fox" });
    await append(v, "notes", "n1", { body: "a slow green turtle" });
    await append(v, "notes", "n2", "quantum entanglement for beginners");
    await append(v, "tasks", "n2", "quantum-free shopping list");

    const fox = searchObjects(v, "notes", "fox");
    expect(fox).toHaveLength(1);
    expect(fox[0]).toMatchObject({ id: "n1", rev: 1 });
    expect(typeof fox[0].rank).toBe("number");
    expect(fox[0].cid).toMatch(/^[0-9a-f]{64}$/);

    // both revisions of n1 are indexed (content-linked to objects rows, not just latest)
    const both = searchObjects(v, "notes", "turtle");
    expect(both.map((r) => r.rev)).toEqual([2]);

    // ns isolation: tasks/n2 not notes/n2
    const q = searchObjects(v, "notes", "quantum");
    expect(q.map((r) => r.id)).toEqual(["n2"]);
    const q2 = searchObjects(v, "tasks", "quantum");
    expect(q2.map((r) => r.id)).toEqual(["n2"]);

    // phrase quoting: quotes in the query can never break MATCH syntax
    const tricky = searchObjects(v, "notes", 'he said "hi"');
    expect(tricky).toEqual([]);
    v.close();
  });
});

describe("Ω2 single-writer law (WAL, queue, crash-sim)", () => {
  test("concurrent appends serialize: 50 queued writes → 50 clean entries, correct per-id revs, reads not blocked", async () => {
    const dir = tmp("single-writer");
    const v = openVault(dir);
    const pending: Promise<unknown>[] = [];
    for (let i = 0; i < 50; i++) {
      pending.push(append(v, "stress", `o${i % 5}`, { i }));
    }
    // a synchronous read DURING pending writes observes the pre-write state —
    // reads never queue behind the write chain (single-threaded worker semantics)
    const midRead = (v.db.query("SELECT COUNT(*) AS n FROM changelog").get() as { n: number }).n;
    expect(midRead).toBe(0);

    await Promise.all(pending);
    expect(changelogCount(v.db)).toBe(50);
    const latest = queryObjects(v, "stress", {});
    expect(latest).toHaveLength(5);
    for (const item of latest) expect(item.rev).toBe(10); // 50 appends / 5 ids, no lost updates

    const verdict = verify(v);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(50);
    v.close();
  });

  test("WAL: journal_mode is wal; a second connection sees committed data with NO checkpoint; reopen after close recovers", async () => {
    const dir = tmp("wal-crash");
    const v = openVault(dir);
    expect((v.db.query("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    await append(v, "crash", "x", { v: 1 });
    await append(v, "crash", "x", { v: 2 });

    // simulate a crashed/abandoned writer: a NEW Database on the same file while the
    // original connection is still open — the data lives in the WAL, uncheckpointed,
    // and SQLite recovers it for the new reader (crash-sim, WAL recovery)
    const second = openDatabase(dbPath(dir));
    const seen = (second.query("SELECT COUNT(*) AS n FROM changelog").get() as { n: number }).n;
    expect(seen).toBe(2);
    const obj = second.query("SELECT rev, cid, meta FROM objects WHERE ns = 'crash' AND id = 'x' ORDER BY rev").all();
    expect(obj).toHaveLength(2);
    second.close();

    // abrupt-close simulation: drop the connection without a manual checkpoint, reopen
    v.close();
    const reopened = openVault(dir);
    const verdict = verify(reopened);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(2);
    expect(readObject(reopened, "crash", "x", null).rev).toBe(2);
    reopened.close();
  });
});

describe("Ω2 compaction (provenance-honoring)", () => {
  test("keep=1: superseded revs go cold, ref-protected rev survives hot, query/get/search unaffected", async () => {
    const dir = tmp("compact");
    const v = openVault(dir);
    const NS = "docs";
    for (let r = 1; r <= 5; r++) await append(v, NS, "X", `alpha ${["one", "two", "three", "four", "five"][r - 1]}`);
    await append(v, NS, "Y", "bravo zulu", { refs: [{ ns: NS, id: "X", rev: 2 }] });

    const refsBack = readObject(v, NS, "Y", null).refs;
    expect(refsBack).toEqual([{ ns: NS, id: "X", rev: 2 }]);

    const result = v.enqueueWrite(() => compact(v, NS, 1));
    const r = await result;
    expect(r).toEqual({ moved: 3, kept: 3, protected: 1 }); // moved 1,3,4; hot: X@2 (refs), X@5 (keep), Y@1

    const cold = (v.db.query("SELECT rev FROM cold_objects WHERE ns = ? AND id = 'X' ORDER BY rev").all(NS) as { rev: number }[]).map((x) => x.rev);
    expect(cold).toEqual([1, 3, 4]);
    const hot = (v.db.query("SELECT rev FROM objects WHERE ns = ? AND id = 'X' ORDER BY rev").all(NS) as { rev: number }[]).map((x) => x.rev);
    expect(hot).toEqual([2, 5]);

    // referenced revision stays readable (hot)…
    expect(readObject(v, NS, "X", 2).data).toBe("alpha two");
    // …compacted revisions stay readable through the cold fallback…
    expect(readObject(v, NS, "X", 1).data).toBe("alpha one");
    expect(readObject(v, NS, "X", 3).data).toBe("alpha three");
    // …and the live latest is unchanged
    expect(readObject(v, NS, "X", null).data).toBe("alpha five");
    expect(queryObjects(v, NS, {}).map((q) => [q.id, q.rev])).toEqual([["X", 5], ["Y", 1]]);

    // FTS covers live objects: moved revisions drop out, kept ones stay searchable
    expect(searchObjects(v, NS, "three")).toEqual([]);
    expect(searchObjects(v, NS, "two").map((h) => h.rev)).toEqual([2]);
    expect(searchObjects(v, NS, "five").map((h) => h.rev)).toEqual([5]);
    expect(searchObjects(v, NS, "bravo").map((h) => h.id)).toEqual(["Y"]);

    // history is immutable: the changelog still verifies end-to-end after compaction
    const verdict = verify(v);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(6);

    // rev allocation reads the changelog, not objects → no collision with cold history
    const next = await append(v, NS, "X", "alpha six");
    expect(next.rev).toBe(6);
    v.close();
  });

  test("compaction validates: keep must be an integer >= 1", async () => {
    const dir = tmp("compact-invalid");
    const v = openVault(dir);
    await append(v, "ns", "a", "data");
    await expect(v.enqueueWrite(() => compact(v, "ns", 0 as unknown as number))).rejects.toThrow(/keep/);
    await expect(v.enqueueWrite(() => compact(v, "ns", 1.5 as unknown as number))).rejects.toThrow(/keep/);
    await expect(v.enqueueWrite(() => compact(v, "", 1))).rejects.toThrow(/ns/);
    v.close();
  });
});

describe("Ω2 roundtrip (swap-safety harness)", () => {
  test("copy → verify on copy → equal head hash; fresh open of targetDir verifies and searches", async () => {
    const dir = tmp("roundtrip");
    const target = tmp("roundtrip-copy");
    const v = openVault(dir);
    await append(v, "a", "one", { w: "hello world" });
    await append(v, "a", "one", { w: "hello again" });
    await append(v, "a", "two", "plain string body");
    await append(v, "b", "x", { n: 1 });
    // include a cold row + a protected ref so the copy exercises both tables
    await append(v, "b", "y", "rev one", { refs: [{ ns: "b", id: "x", rev: 1 }] });
    await append(v, "b", "x", "rev two");       // x@1 is ref-protected → stays hot
    await append(v, "b", "z", "z one");
    await append(v, "b", "z", "z two");        // z@1 is unprotected → goes cold
    await v.enqueueWrite(() => compact(v, "b", 1));
    expect((v.db.query("SELECT COUNT(*) AS n FROM cold_objects").get() as { n: number }).n).toBeGreaterThan(0);

    const src = verify(v);
    const copy = await v.enqueueWrite(() => roundtrip(v, target));
    expect(copy.ok).toBe(true);
    expect(copy.entries).toBe(src.entries);
    expect(copy.headHash).toBe(src.headHash);
    expect(copy.blobsCopied).toBeGreaterThan(0);

    // open the copy through the normal open path and prove it stands alone
    const reopened = openVault(target);
    const verdict = verify(reopened);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(src.entries);
    expect(verdict.headHash).toBe(src.headHash);
    expect(readObject(reopened, "a", "one", null).data).toEqual({ w: "hello again" });
    expect(readObject(reopened, "a", "one", 1).data).toEqual({ w: "hello world" });
    expect(searchObjects(reopened, "a", "world").map((h) => h.rev)).toEqual([1]);
    expect(readObject(reopened, "b", "z", 1).data).toBe("z one");      // cold row survived the copy
    expect(readObject(reopened, "b", "x", 1).data).toEqual({ n: 1 });  // protected ref survived
    expect((reopened.db.query("SELECT COUNT(*) AS n FROM cold_objects").get() as { n: number }).n).toBeGreaterThan(0);
    reopened.close();

    // target must be disjoint from the dataDir
    await expect(v.enqueueWrite(() => roundtrip(v, join(dir, "inside")))).rejects.toThrow(/disjoint/);
    await expect(v.enqueueWrite(() => roundtrip(v, dir))).rejects.toThrow(/disjoint/);
    await expect(v.enqueueWrite(() => roundtrip(v, "relative/path" as string))).rejects.toThrow(/absolute/);
    v.close();
  });
});
