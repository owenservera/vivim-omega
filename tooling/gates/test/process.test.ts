// tooling/gates/test/process.test.ts — D-423: the process self-model, tested
// pure-first plus live locks against the REAL tree (the invariants-freshness /
// docscan.test.ts pattern).
//  F-1 summarizeStatus — present/absent/unparseable/all-green/one-failing/head-mismatch (pure)
//  F-2 assembleProcessModel — determinism, correct counts/grouping, a `Blocks: none` row never blocks
//  F-3 the gate stage is REPORT-ONLY: the live checkProcess() is ok regardless of board/gate
//      content; mechanical breakage (nonexistent root) FAILS named
//  F-4 the live lock — deriveProcessModel runs clean on the real tree; proposedIds and
//      board.open name the identical set; ratifiedCount is the index-row count
//  F-5 renderProcessReport surfaces every field — no silent drop (D-422's "a brief that
//      silently truncates is worse than no brief")
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleProcessModel, checkProcess, deriveProcessModel, renderProcessReport, summarizeStatus,
  type ProcessModel,
} from "../process.ts";
import { parseIndexRows, type OpenQuestion } from "../decisions.ts";

const REAL_ROOT = join(import.meta.dir, "../../..");
const TIP = "c6845440000000000000000000000000000000aa";

const greenStatus = (head: string) => JSON.stringify({
  head, generatedAt: "2026-09-20T14:21:10Z",
  gate: { checks: { decisions: { ok: true }, tests: { ok: true } } },
});

const q = (n: number, blocks = "none", hasTbd = false): OpenQuestion => ({
  n, file: `docs/decisions/D-${n}-x.md`, title: `D-${n} — t`, recommended: "(a)", hasTbd, awaiting: "owner", blocks,
});

const INDEX = [
  "| **D-1** | a | **RATIFIED** · evidence | r |",
  "| **D-2** | b | **RATIFIED** · evidence | r |",
  "| **D-3** | c | **PROPOSED** · evidence | r |",
  "| **D-4** | d | **SUPERSEDED** · evidence | r |",
].join("\n");

function assemble(over: Partial<Parameters<typeof assembleProcessModel>[0]> = {}): ProcessModel {
  return assembleProcessModel({
    at: "2026-09-20T00:00:00.000Z", branch: "b", tip: TIP,
    statusText: greenStatus(TIP.slice(0, 7)), indexText: INDEX,
    open: [q(3)], boardFreshness: { state: "fresh" },
    docscanFindings: [], ledger: { resolved: true, dir: "/l", source: "env" },
    session: { homePresent: false, open: null, closedCount: 0, verifyIssues: [] },
    ...over,
  });
}

describe("F-1 summarizeStatus", () => {
  test("absent file → present:false, nothing guessed", () => {
    const s = summarizeStatus(null, TIP);
    expect(s).toMatchObject({ present: false, ok: null, head: null, headMatchesTip: null });
  });
  test("unparseable → present, NOT ok, reported not thrown", () => {
    const s = summarizeStatus("{nope", TIP);
    expect(s.present).toBe(true);
    expect(s.ok).toBe(false);
    expect(s.failingChecks).toEqual(["(unparseable status.json)"]);
  });
  test("all-green checks → ok, head matches tip by prefix", () => {
    const s = summarizeStatus(greenStatus(TIP.slice(0, 7)), TIP);
    expect(s.ok).toBe(true);
    expect(s.headMatchesTip).toBe(true);
    expect(s.failingChecks).toEqual([]);
  });
  test("one failing check → not ok, named", () => {
    const t = JSON.stringify({ head: "abc1234", gate: { checks: { decisions: { ok: true }, tests: { ok: false } } } });
    const s = summarizeStatus(t, TIP);
    expect(s.ok).toBe(false);
    expect(s.failingChecks).toEqual(["tests"]);
  });
  test("head mismatch → headMatchesTip false; unknown tip → null", () => {
    expect(summarizeStatus(greenStatus("deadbee"), TIP).headMatchesTip).toBe(false);
    expect(summarizeStatus(greenStatus("deadbee"), null).headMatchesTip).toBeNull();
  });
  test("no gate.checks map → cannot claim green", () => {
    const s = summarizeStatus(JSON.stringify({ head: "abc" }), TIP);
    expect(s.ok).toBe(false);
    expect(s.failingChecks).toEqual(["(no gate.checks map)"]);
  });
});

describe("F-2 assembleProcessModel", () => {
  test("deterministic: same evidence twice ⇒ byte-identical", () => {
    expect(JSON.stringify(assemble())).toBe(JSON.stringify(assemble()));
  });
  test("counts and grouping are correct", () => {
    const m = assemble({
      open: [q(9, "D-5"), q(3, "none", true)],
      docscanFindings: [{ rule: "S4" }, { rule: "S4" }, { rule: "S6" }],
    });
    expect(m.ratifiedCount).toBe(2);           // index rows only; PROPOSED/SUPERSEDED excluded
    expect(m.board.openCount).toBe(2);
    expect(m.board.blockingCount).toBe(1);
    expect(m.board.open.find((r) => r.n === 3)?.hasTbd).toBe(true);
    expect(m.docscan).toEqual({ findingCount: 3, byRule: { S4: 2, S6: 1 } });
    expect(m.proposedIds).toEqual([3, 9]);      // sorted by id
  });
  test("the session field rides through untouched (D-430)", () => {
    const open = { id: "20260922-120000-x", mission: "m", beganAt: "2026-09-22T12:00:00Z", events: 7 };
    const m = assemble({ session: { homePresent: true, open, closedCount: 2, verifyIssues: [] } });
    expect(m.session).toEqual({ homePresent: true, open, closedCount: 2, verifyIssues: [] });
  });
  test("a `Blocks: none` row never counts as blocking", () => {
    expect(assemble({ open: [q(3, "none"), q(4, "none")] }).board.blockingCount).toBe(0);
  });
});

describe("F-3 the gate stage is report-only", () => {
  test("live tree: checkProcess is ok:true and reports facts in the detail", () => {
    const r = checkProcess(REAL_ROOT);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(String(r.detail["policy"])).toMatch(/report-only/);
    for (const k of ["gateGreen", "gateStale", "boardOpen", "boardBlocking", "boardFreshness", "docscanFindings", "ledgerResolved", "ratifiedCount"]) {
      expect(k in r.detail).toBe(true);
    }
  });
  test("mechanical breakage (nonexistent root) FAILS, named", () => {
    const r = checkProcess(join(REAL_ROOT, "nowhere-at-all"));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatch(/process model derivation failed/);
  });
});

describe("F-4 the live lock", () => {
  test("deriveProcessModel runs clean on the real tree; proposedIds ≡ board.open ids", () => {
    const m = deriveProcessModel(REAL_ROOT, "2026-09-20T00:00:00.000Z");
    expect(m.tip).toMatch(/^[0-9a-f]{40}$/);
    expect(m.board.open.map((r) => r.n).sort((a, b) => a - b)).toEqual(m.proposedIds);
  });
  test("ratifiedCount is exactly the RATIFIED index-row count (not record files)", () => {
    const m = deriveProcessModel(REAL_ROOT);
    const rows = parseIndexRows(readFileSync(join(REAL_ROOT, "docs/BUILD-DECISIONS.md"), "utf-8"));
    expect(m.ratifiedCount).toBe(rows.filter((r) => r.status === "RATIFIED").length);
  });
});

describe("F-5 renderProcessReport surfaces every field", () => {
  test("no silent drop: gate, stale flag, board rows + blocks/TBD, docscan by-rule, ledger, ratified", () => {
    const m = assemble({
      statusText: greenStatus("deadbee"),
      open: [q(9, "D-5", true)],
      boardFreshness: { state: "stale" },
      docscanFindings: [{ rule: "S4" }, { rule: "S6" }],
      ledger: { resolved: false, dir: null, source: null },
    });
    const out = renderProcessReport(m).join("\n");
    expect(out).toMatch(/gate: GREEN/);
    expect(out).toMatch(/STALE/);
    expect(out).toMatch(/board: 1 open \(1 blocking\) — stale/);
    expect(out).toMatch(/D-9: .*\[blocks: D-5\].*\(TBD\)/);
    expect(out).toMatch(/docscan: 2 finding\(s\) — S4:1, S6:1/);
    expect(out).toMatch(/ledger: \(unresolved\)/);
    expect(out).toMatch(/ratified: 2/);
  });
  test("red gate names the failing checks; absent status.json says so", () => {
    const red = assemble({ statusText: JSON.stringify({ head: "x", gate: { checks: { tests: { ok: false } } } }) });
    expect(renderProcessReport(red).join("\n")).toMatch(/RED \(tests\)/);
    expect(renderProcessReport(assemble({ statusText: null })).join("\n")).toMatch(/\(no status\.json\)/);
  });
});
