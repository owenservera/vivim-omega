// tooling/gates/test/round-close.test.ts — D-414 (A2+A12): the round-close
// automator, tested pure-first (the repo's forge-surface pattern) with one
// scratch-repo integration leg for the bundle mechanics.
//  F-1 preflight refusals — every refusal named, nothing written
//  F-2 row generation — the ledger's exact byte shape, hashes 8…7, cells validated
//  F-3 bundle mechanics — real git bundle create/verify + sha256 + row append on a scratch repo
//  F-4 the next-round entry block — derived from BACKLOG + board, never hard-coded prose
//  F-5 the toolchain pin (A12) — recorded shape, report-only compare
import { describe, test, expect } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { omegaTmp } from "@vivim/omega-platform";
import {
  appendLedgerRow, nextRoundEntryBlock, parseBacklogSignals, preflightVerdict,
  renderLedgerRow, scanBundles, shortHash, validateCell,
} from "../round-close.ts";
import { compareToolchain, toolchainPin } from "../status.ts";

const GREEN: import("../round-close.ts").PreflightFacts = {
  cleanTree: true, treeDetail: "",
  quickGreen: true, quickDetail: "ok",
  decisionsGreen: true, decisionsDetail: "413 records",
  boardFresh: true, boardDetail: "state=fresh",
  statusCarried: true, statusDetail: "carried",
  ledgerOk: true, ledgerDetail: "ok",
  tipAdvanced: true, tipDetail: "advanced",
  sessionOk: true, sessionDetail: "no open session",
};

describe("F-1 — the preflight refuses, loudly and by name", () => {
  test("all green passes with zero refusals", () => {
    expect(preflightVerdict(GREEN)).toEqual({ ok: true, refusals: [] });
  });
  test("each failed fact produces its named refusal", () => {
    const detailKey: Record<string, string> = {
      cleanTree: "treeDetail", quickGreen: "quickDetail", decisionsGreen: "decisionsDetail",
      boardFresh: "boardDetail", statusCarried: "statusDetail", ledgerOk: "ledgerDetail", tipAdvanced: "tipDetail",
      sessionOk: "sessionDetail",
    };
    const cases: Array<[keyof typeof GREEN, string, RegExp]> = [
      ["cleanTree", "M docs/x.md", /dirty tree: M docs\/x\.md/],
      ["quickGreen", "exit 1", /quick gate red: exit 1/],
      ["decisionsGreen", "D-999: missing ## Status", /decisions contract red: D-999/],
      ["boardFresh", "state=stale", /board not fresh: state=stale/],
      ["statusCarried", "head abc1234 is not an ancestor", /status\.json not carried\+green: head abc1234/],
      ["ledgerOk", "gap", /ledger not ready: gap/],
      ["tipAdvanced", "same", /tip unchanged since the last bundle/],
      ["sessionOk", "session 20260922-… open since … with 12 event(s)", /session not closed: session 20260922-… open since … with 12 event\(s\) — the retrospective is part of the publish ceremony/],
    ];
    for (const [k, detail, re] of cases) {
      const v = preflightVerdict({ ...GREEN, [k]: false, [detailKey[String(k)]]: detail } as typeof GREEN);
      expect(v.ok).toBe(false);
      expect(v.refusals.join(";")).toMatch(re);
    }
  });
  test("cells validate: pipes, newlines, emptiness refused", () => {
    expect(() => validateCell("note", "a|b")).toThrow(/one line without "\|"/);
    expect(() => validateCell("evidence", "line\nbreak")).toThrow(/one line without "\|"/);
    expect(() => validateCell("note", "")).toThrow(/non-empty/);
    expect(() => validateCell("note", "   ")).toThrow(/non-empty/);
    expect(() => validateCell("note", "clean text")).not.toThrow();
  });
  test("bundle numbering: contiguous passes, gaps refuse", () => {
    expect(scanBundles(["vivim-omega-wave0-omega-forge_1.bundle", "vivim-omega-wave0-omega-forge_2.bundle"]).issues).toEqual([]);
    expect(scanBundles(["vivim-omega-wave0-omega-forge_1.bundle", "vivim-omega-wave0-omega-forge_3.bundle"]).issues[0]).toMatch(/not contiguous/);
    expect(scanBundles(["README.md", "vivim-vision"])).toEqual({ ns: [], issues: [] });
  });
});

describe("F-2 — the ledger row's byte shape", () => {
  test("shortHash: 8…8 for both hash shapes, garbage refused", () => {
    expect(shortHash("7f18fff46915400c841047c799f018411e53aee9")).toBe("7f18fff4…1e53aee9");
    expect(shortHash("e02c8b70" + "0".repeat(56))).toBe("e02c8b70…00000000");
    expect(shortHash("a".repeat(64)).endsWith("…" + "a".repeat(8))).toBe(true);
    expect(() => shortHash("xyz")).toThrow(/not a 40\/64-char hex hash/);
    expect(() => shortHash("a".repeat(39))).toThrow(/not a 40\/64-char hex hash/);
    expect(() => shortHash("a".repeat(65))).toThrow(/not a 40\/64-char hex hash/);
  });
  test("renderLedgerRow reproduces the _7 row's exact shape", () => {
    const row = renderLedgerRow({
      n: 7,
      note: "the round",
      tip: "bd08436",
      tree: "7f18fff46915400c841047c799f018411e53aee9",
      sha256: "e02c8b70".padEnd(64, "0"),
      evidence: "gate green",
    });
    expect(row).toBe("| `_7.bundle` | 7 — the round | `bd08436` | `7f18fff4…1e53aee9` | `e02c8b70…00000000` | gate green |");
  });
  test("appendLedgerRow inserts after the LAST table row and refuses table-less READMEs", () => {
    const readme = ["# L", "", "| Bundle | Round |", "|---|---|", "| `_1.bundle` | 1 — a |", "| `_2.bundle` | 2 — b |", "", "trailer text"].join("\n");
    const r = appendLedgerRow(readme, "| `_3.bundle` | 3 — c |");
    expect(r.issues).toEqual([]);
    expect(r.text.split("\n")).toEqual(["# L", "", "| Bundle | Round |", "|---|---|", "| `_1.bundle` | 1 — a |", "| `_2.bundle` | 2 — b |", "| `_3.bundle` | 3 — c |", "", "trailer text"]);
    const bad = appendLedgerRow("# no table here", "| `_1.bundle` | x |");
    expect(bad.text).toBe("# no table here");
    expect(bad.issues[0]).toMatch(/no bundle-table row/);
  });
});

describe("F-3 — bundle mechanics on a scratch repo (real git, real sha256)", () => {
  test("create → verify → list-heads → sha256 → row lands in a scratch ledger", () => {
    const root = omegaTmp("omega-round-close-test", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const g = (args: string[]) => spawnSync("git", args, { cwd: root, encoding: "buffer" });
    expect(g(["init", "-q"]).status).toBe(0);
    expect(g(["config", "user.email", "t@t"]).status).toBe(0);
    expect(g(["config", "user.name", "t"]).status).toBe(0);
    writeFileSync(join(root, "a.txt"), "round input\n");
    expect(g(["add", "."]).status).toBe(0);
    expect(g(["commit", "-qm", "r1"]).status).toBe(0);
    // scratch ledger with a README table
    const ledger = join(root, "ledger");
    mkdirSync(ledger);
    writeFileSync(join(ledger, "README.md"), "# L\n\n| Bundle | Round |\n|---|---|\n| `_1.bundle` | 1 — first |\n\ntrailer\n");
    // bundle _1 (the prior round, for the double-run shape)
    expect(spawnSync("git", ["bundle", "create", join(ledger, "vivim-omega-wave0-omega-forge_1.bundle"), "--all"], { cwd: root, encoding: "buffer" }).status).toBe(0);
    // a second commit = the new round's tip
    writeFileSync(join(root, "a.txt"), "round two\n");
    expect(g(["add", "."]).status).toBe(0);
    expect(g(["commit", "-qm", "r2"]).status).toBe(0);
    // the mechanics the automator performs
    const bundlePath = join(ledger, "vivim-omega-wave0-omega-forge_2.bundle");
    expect(g(["bundle", "create", bundlePath, "--all"]).status).toBe(0);
    expect(g(["bundle", "verify", bundlePath]).status).toBe(0);
    const heads = g(["bundle", "list-heads", bundlePath]);
    const headLine = heads.stdout.toString().split("\n").find((l) => l.trim().endsWith(" HEAD"));
    expect(headLine).toBeTruthy();
    const tip = g(["rev-parse", "--short", "HEAD"]).stdout.toString().trim();
    const tree = g(["rev-parse", "HEAD^{tree}"]).stdout.toString().trim();
    const sha256 = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
    expect(/^[0-9a-f]{64}$/.test(sha256)).toBe(true);
    // double-run guard: the bundle's HEAD tip equals the repo HEAD → would refuse
    expect(headLine!.split(/\s+/)[0]).toBe(g(["rev-parse", "HEAD"]).stdout.toString().trim());
    // the row appends after the last table row
    const row = renderLedgerRow({ n: 2, note: "second", tip, tree, sha256, evidence: "green" });
    const appended = appendLedgerRow(readFileSync(join(ledger, "README.md"), "utf-8"), row);
    expect(appended.issues).toEqual([]);
    expect(appended.text.split("\n")[5]).toBe(row);
    expect(existsSync(bundlePath)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-4 — the next-round entry block is derived, not typed", () => {
  const BACKLOG_FIXTURE = `# Backlog

## Core Phase (next — D-410)

- ~~**S1 · done thing**~~ — **DONE (D-411)**.
- **S3 · the evidence-store choicepoint** — **OPEN, the owner's call** (the last Core Phase item).
- **At core-omega-ready (after S3 lands)**: the plugin-identification pass.

## Parked until core-omega-ready (D-410 register)

### Wave 1 (the mine wave) — PARKED

- **Run forge.mine.capture@1** — parked.
`;
  test("open items and parked sections parse; struck rows excluded", () => {
    const s = parseBacklogSignals(BACKLOG_FIXTURE);
    expect(s.openItems.length).toBe(1);
    expect(s.openItems[0]).toMatch(/^S3 · the evidence-store choicepoint/);
    expect(s.parkedSections.length).toBe(1);
    expect(s.parkedSections[0]).toMatch(/Parked until core-omega-ready/);
  });
  test("the block carries baseline commands, board rows, backlog items, parked pointers", () => {
    const block = nextRoundEntryBlock(BACKLOG_FIXTURE, [
      { n: 414, title: "D-414 — a decision", blocks: "Core Phase" },
      { n: 415, title: "D-415 — another", blocks: "none" },
    ]);
    expect(block).toContain("self-host.test.ts");
    expect(block).toContain("bun run omega:quick");
    expect(block).toContain("D-414 · D-414 — a decision [Blocks: Core Phase]");
    expect(block).toContain("S3 · the evidence-store choicepoint");
    expect(block).toContain("Parked until core-omega-ready");
    expect(block).toContain("HANDOFF-ROUND-");
    expect(block).toContain("Session discipline FIRST ACTION (D-430)");
    expect(block).toContain("omega:session begin");
    expect(block).toContain("omega:session context");
  });
  test("empty board and no OPEN items degrade honestly", () => {
    const block = nextRoundEntryBlock("# Backlog\n\n- ~~**done**~~ — DONE.\n", []);
    expect(block).toContain("(none — 0 open)");
    expect(block).toContain("(no OPEN-marked bullet parsed");
  });
});

describe("F-5 — the toolchain pin (A12): recorded, report-only", () => {
  test("toolchainPin records the running shape", () => {
    const t = toolchainPin();
    expect(typeof t.node).toBe("string");
    expect(t.node.length).toBeGreaterThan(0);
    expect(t.os.length).toBeGreaterThan(0);
    expect(["x64", "arm64", "aarch64"]).toContain(t.arch);
    // under bun (the gate's runner) the bun version is pinned; non-bun stays null
    if (typeof (process.versions as Record<string, string | undefined>).bun === "string") {
      expect(t.bun).toMatch(/^\d+\.\d+/);
    } else {
      expect(t.bun).toBeNull();
    }
  });
  test("compareToolchain: same pins, drift reports without failing", () => {
    const a = toolchainPin();
    expect(compareToolchain(a, a).same).toBe(true);
    expect(compareToolchain(a, a).line).toMatch(/toolchain pinned/);
    const b = { ...a, node: "99.0.0", os: "other 1.0" };
    const d = compareToolchain(a, b);
    expect(d.same).toBe(false);
    expect(d.line).toMatch(/toolchain drift — recorded, not failing/);
    expect(d.line).toContain("99.0.0");
    // the compare carries no failure semantics at all — it is a line + a flag
    expect(typeof d.same).toBe("boolean");
  });
});
