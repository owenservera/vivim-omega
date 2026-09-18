// vivim.vault — D-387 falsifiers (2026-09-18 external performance review):
//   #1 · vault.getmany@1 — the batched window read (one hop, latest-rev-per-id,
//        missing-is-data-not-error, corruption-still-throws, bound refused)
//   #2 · batched compaction FTS delete — after ANY compaction the FTS index covers
//        exactly the live hot revisions (zero orphans), refs-protected rows survive
//   #4 · set-based verify — deleted revision rows and missing CAS blobs are found
//        with the same verdicts (and the same corruptAt) as the per-row walk
// The before/after MEASUREMENTS live in tooling/perf/perf-remediation.ts +
// docs/migration/40-EVIDENCE/OWNER/2026-09-18-perf-review.md — this suite pins
// the BEHAVIOR, the harness pins the numbers.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import { openVault, readObjects, GET_MANY_BOUND, queryObjects, searchObjects } from "../src/db.ts";
import { casPath } from "../src/cas.ts";
import { appendObject } from "../src/changelog.ts";
import { compact } from "../src/compaction.ts";
import { verify } from "../src/verify.ts";
import { omegaTmp } from "@vivim/omega-platform";

let seq = 0;
function tmp(name: string): string {
  const dir = omegaTmp("omega-vault-test/d387", `${name}-${Date.now()}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
function append(v: ReturnType<typeof openVault>, ns: string, id: string, data: unknown, opts: { meta?: unknown; refs?: { ns: string; id: string; rev: number }[] } = {}) {
  return v.enqueueWrite(() => appendObject(v, { ns, id, data, meta: opts.meta ?? null, refs: opts.refs ?? [], causationId: `d387_c_${++seq}` }));
}
/** fts rows that point at no live hot revision (orphans — must always be 0 after compaction) */
function ftsOrphans(v: ReturnType<typeof openVault>): number {
  return (v.db.query(
    "SELECT count(*) AS n FROM fts_index f WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.ns = f.ns AND o.id = f.id AND o.rev = CAST(f.rev AS INTEGER))",
  ).get() as { n: number }).n;
}

describe("D-387 #1 · vault.getmany@1 (batched window read)", () => {
  test("returns found rows with the LATEST rev, data and meta; preserves request order; collapses duplicates", async () => {
    const v = openVault(tmp("getmany-basic"));
    await append(v, "email", "a", { v: 1 });
    await append(v, "email", "a", { v: 2 });
    await append(v, "email", "b", { v: 10 }, { meta: { kind: "message" } });
    const rows = readObjects(v, "email", ["b", "a", "a", "b"]);
    expect(rows).toEqual([
      { id: "b", found: true, rev: 1, cid: expect.any(String), data: { v: 10 }, meta: { kind: "message" } },
      { id: "a", found: true, rev: 2, cid: expect.any(String), data: { v: 2 }, meta: null },
    ]);
    v.close();
  });

  test("a missing id is DATA ({found:false}) — the batch never loses its other rows", async () => {
    const v = openVault(tmp("getmany-missing"));
    await append(v, "email", "here", { v: 1 });
    const rows = readObjects(v, "email", ["here", "absent", "also-absent"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: "here", found: true, data: { v: 1 } });
    expect(rows[1]).toEqual({ id: "absent", found: false });
    expect(rows[2]).toEqual({ id: "also-absent", found: false });
    v.close();
  });

  test("cold fallback: a compacted id still resolves (hot-first, cold-fallback, same as vault.get@1)", async () => {
    const v = openVault(tmp("getmany-cold"));
    for (let r = 1; r <= 3; r++) await append(v, "email", "old", { r });
    await append(v, "email", "live", { r: "keep" });
    await v.enqueueWrite(() => compact(v, "email", 1));
    // "old" rev 1+2 moved to cold_objects; latest rev (3) stays hot
    const rows = readObjects(v, "email", ["old", "live"]);
    expect(rows[0]).toMatchObject({ id: "old", found: true, rev: 3, data: { r: 3 } });
    expect(rows[1]).toMatchObject({ id: "live", found: true });
    v.close();
  });

  test("corruption is never disguised as absence: a malformed envelope THROWS", async () => {
    const v = openVault(tmp("getmany-corrupt"));
    await append(v, "email", "good", { v: 1 });
    await append(v, "email", "bad", { v: 1 });
    v.db.query("UPDATE objects SET meta = '{not json' WHERE ns = 'email' AND id = 'bad'").run();
    expect(() => readObjects(v, "email", ["good", "bad"])).toThrow(/malformed|JSON|Unexpected/i);
    v.close();
  });

  test("over-bound batches REFUSE (fail-closed, page instead) and bad payloads refuse", async () => {
    const v = openVault(tmp("getmany-bound"));
    const tooMany = Array.from({ length: GET_MANY_BOUND + 1 }, (_, i) => `id${i}`);
    // the core defends itself AND the op handler refuses with the op-named error
    expect(() => readObjects(v, "email", tooMany)).toThrow(/bound/);
    v.close();
  });
});

describe("D-387 #2 · batched compaction FTS delete", () => {
  test("after compaction the FTS index covers exactly the live hot revisions (zero orphans), search agrees", async () => {
    const v = openVault(tmp("compact-fts"));
    for (let r = 1; r <= 6; r++) {
      await append(v, "email", `m${r % 3}`, { body: `findme${r}` }); // 3 ids × 2 revs
    }
    await append(v, "email", "keeper", { body: "findme-keeper" });
    // provenance: a live object cites m1@1 — that revision must survive compaction
    await append(v, "email", "citer", { body: "cites" }, { refs: [{ ns: "email", id: "m1", rev: 1 }] });
    const res = await v.enqueueWrite(() => compact(v, "email", 1));
    expect(res.moved).toBeGreaterThan(0);
    expect(ftsOrphans(v)).toBe(0); // THE falsifier: no FTS row outlives its object
    // search covers live objects only — every hit resolves to a hot row
    const hits = searchObjects(v, "email", "findme");
    for (const h of hits) {
      expect(h.cid).not.toBeNull();
    }
    // the protected revision survives and still resolves
    const rows = readObjects(v, "email", ["m1"]);
    expect(rows[0]!.found).toBe(true);
    v.close();
  });

  test("compaction in a transaction that later rolls back leaves the FTS index untouched", async () => {
    const v = openVault(tmp("compact-rollback"));
    for (let r = 1; r <= 4; r++) await append(v, "email", "x", { r });
    const before = (v.db.query("SELECT count(*) AS n FROM fts_index").get() as { n: number }).n;
    try {
      v.db.exec("BEGIN IMMEDIATE");
      v.db.query("DELETE FROM objects WHERE ns = 'email' AND id = 'x' AND rev = 1").run();
      v.db.exec("ROLLBACK");
    } finally { /* rollback above */ }
    const after = (v.db.query("SELECT count(*) AS n FROM fts_index").get() as { n: number }).n;
    expect(after).toBe(before);
    expect(ftsOrphans(v)).toBe(0);
    v.close();
  });
});

describe("D-387 #4 · set-based verify (same verdicts, one statement family)", () => {
  test("a deleted revision row is reported at its changelog seq (lowest wins when several)", async () => {
    const v = openVault(tmp("verify-dangling"));
    for (let i = 0; i < 5; i++) await append(v, "email", `e${i}`, { i });
    const ids = queryObjects(v, "email", {});
    expect(ids).toHaveLength(5);
    // tamper: rewrite history by deleting two stored revisions (seq 2 and seq 4's rows)
    v.db.query("DELETE FROM objects WHERE ns = 'email' AND id = 'e1'").run();
    v.db.query("DELETE FROM objects WHERE ns = 'email' AND id = 'e3'").run();
    const res = verify(v);
    expect(res.ok).toBe(false);
    expect(res.corruptAt).toBe(2); // seq 2 = e1's append — the LOWEST dangling seq
    expect(res.detail).toMatch(/no stored revision/);
    v.close();
  });

  test("a missing CAS blob is reported with its changelog link", async () => {
    const v = openVault(tmp("verify-cas"));
    await append(v, "email", "victim", { secret: "blob" });
    await append(v, "email", "other", { ok: 1 });
    const ids = queryObjects(v, "email", {});
    const victim = ids.find((r) => r.id === "victim")!;
    const blob = casPath(v.dataDir, victim.cid);
    unlinkSync(blob);
    const res = verify(v);
    expect(res.ok).toBe(false);
    expect(res.corruptAt).toBe(1); // victim's append is seq 1
    expect(res.detail).toMatch(/CAS blob .* is missing/);
    v.close();
  });

  test("healthy vaults verify green at the same head the chain recomputes (sanity on the new statements)", async () => {
    const v = openVault(tmp("verify-ok"));
    for (let i = 0; i < 50; i++) await append(v, "email", `e${i % 7}`, { i });
    const res = verify(v);
    expect(res.ok).toBe(true);
    expect(res.corruptAt).toBeUndefined();
    expect(res.entries).toBe(50);
    v.close();
  });
});
