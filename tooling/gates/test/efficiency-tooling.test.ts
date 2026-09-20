// tooling/gates/test/efficiency-tooling.test.ts — D-422 (A13–A17): the
// operational-efficiency tooling round's falsifiers, green in the record's
// tree BEFORE the flip (D-364). Each F maps to the audit
// (docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md §4):
//   F-1 (A13 record brief)  — ≤40 lines, decision payload only, clean refusals
//   F-2 (A13 doc section)   — §/row targeting with path:line prefixes
//   F-3 (A13 --since)       — bundle/rev resolution + status-move parsing
//   F-4 (A14 renderer)      — the injected-bold desync renders as ONE line
//                             naming its STAGE_DOCS rule; filter parsing
//   F-5 (A14 gate flags)    — e2e: --failures-only + --stage targeted run
//                             skips attest and writes NO status
//   F-6 (A15 docscan)       — live lock (0 findings on the fixed tree) +
//                             injected fixtures for S1/S2/S4/S5
//   F-7 (A16 entry)         — pure classification + e2e read-only report
//   F-8 (A17 ledger home)   — resolver order, searched paths, row-contiguity
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { omegaTmp } from "@vivim/omega-platform";
import { briefDocSection, briefRecord, briefSince, findSection, listHeadings, parseRecordRef, resolveSinceTip } from "../brief.ts";
import { parseStageFilter, renderFailureLine, renderFailureLines, ruleFor } from "../failures.ts";
import { docFiles, knownDecisionIds, renderDocscanReport, scanDocs } from "../docscan.ts";
import { classifyDirty, nextCommands, worklogPath } from "../entry.ts";
import { ledgerContiguity, resolveLedgerDir } from "../round-close.ts";

const ROOT = join(import.meta.dir, "../../..");
const OMEGA = process.execPath;

// ---- F-1 — the record brief: the whole point is bounded transport ----

describe("F-1 — A13 the record brief (≤40 lines, decision payload only)", () => {
  test("the largest generated-era record briefs under the cap with the payload present", () => {
    const lines = briefRecord(ROOT, "D-418");
    expect(lines.length).toBeLessThanOrEqual(40);
    const text = lines.join("\n");
    expect(text).toContain("D-418");
    expect(text).toMatch(/status: (PROPOSED|RATIFIED)/);
    expect(text).toContain("class: directive");
    expect(text).toContain("summary:");
    expect(text).toContain("falsifiers: tooling/gates/test/v1-substrate-sweep.test.ts");
    // the brief is NOT the record: the full Options matrix prose never ships
    expect(text).not.toContain("Append-only doctrine");
  });
  test("a ratified hand-era record briefs cleanly (no Index meta)", () => {
    const lines = briefRecord(ROOT, "D-414");
    const text = lines.join("\n");
    expect(text).toContain("status: RATIFIED");
    expect(text).toContain("class: evidence");
  });
  test("refusals are named, never vague", () => {
    expect(() => briefRecord(ROOT, "D-99999")).toThrow(/no record file for D-99999/);
    expect(() => briefRecord(ROOT, "not-a-ref")).toThrow(/not a record ref/);
    expect(parseRecordRef("418")).toBe(418);
    expect(parseRecordRef("D-418")).toBe(418);
    expect(parseRecordRef("D-4xx")).toBeNull();
  });
});

// ---- F-2 — the doc section brief ----

describe("F-2 — A13 the doc section brief (§/row targeting, path:line)", () => {
  const VISION = "docs/forge/OMEGA-ENDSTATE-VISION.md";
  test("the vision doc's 100x table resolves; row 3 names the D-418 substrate call", () => {
    const lines = briefDocSection(ROOT, VISION, "28", 3);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^docs\/forge\/OMEGA-ENDSTATE-VISION\.md:\d+: /);
    expect(lines[0]).toContain("Chrome master/slave");
    expect(lines[0]).not.toContain("Ollama pilots the spine");
  });
  test("section mode prints a bounded range with line numbers", () => {
    const lines = briefDocSection(ROOT, VISION, "0 · The one sentence", undefined, 10);
    expect(lines[0]).toMatch(/The one sentence$/);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[1]).toMatch(/^\s*\d+\| /);
    expect(lines[lines.length - 1]).toMatch(/more lines/); // honest tail, never silent truncation
  });
  test("missing section/row/doc refuse by name; --headings lists escapes", () => {
    expect(() => briefDocSection(ROOT, VISION, "no-such-section-xyz")).toThrow(/no heading matching/);
    expect(() => briefDocSection(ROOT, VISION, "28", 99)).toThrow(/--row 99 out of range/);
    expect(() => briefDocSection(ROOT, "docs/nope.md", "x")).toThrow(/doc not found/);
    const headings = listHeadings(ROOT, VISION);
    expect(headings.some((h) => h.includes("The one sentence"))).toBe(true);
  });
  test("findSection bounds a section at the next same-or-higher heading", () => {
    const lines = ["## a", "x", "### a.b", "y", "## c", "z"].map((t) => `${t}`);
    const hit = findSection(lines, "a");
    expect(hit).not.toBeNull();
    expect(lines[hit!.startLine - 1]).toBe("## a");
    expect(lines[hit!.endLine - 1]).toBe("## c");
  });
});

// ---- F-3 — --since ----

describe("F-3 — A13 --since (bundle/rev resolution + status moves)", () => {
  test("a git rev resolves; garbage refuses", () => {
    const { tip, source } = resolveSinceTip(ROOT, "HEAD");
    expect(/^[0-9a-f]{7,64}$/.test(tip)).toBe(true);
    expect(source).toBe("git rev");
    expect(() => resolveSinceTip(ROOT, "definitely-not-a-rev-xyz")).toThrow(/neither a bundle file nor a git commit/);
  });
  test("briefSince on HEAD renders the bounded shape (0 commits since HEAD)", () => {
    const lines = briefSince(ROOT, "HEAD");
    expect(lines[0]).toMatch(/^since git rev \(tip [0-9a-f]{7}\):$/);
    expect(lines).toContain("  commits: 0");
    expect(lines.length).toBeLessThanOrEqual(40);
  });
});

// ---- F-4 — the failure renderer ----

describe("F-4 — A14 the failure renderer (one line, rule pointed)", () => {
  test("the _11 missing-bold desync renders as ONE line with the sweep rule pointer", () => {
    const line = renderFailureLine(
      "tests",
      `0 pass / 1 fail — failing: ["D-418 · F-1a — the vision doc's amended passages (line-level sweep) > the header amendment line names this record"]`,
    );
    expect(line.startsWith("✗ tests: ")).toBe(true);
    expect(line).toContain("rule:");
    expect(line.length).toBeLessThan(400);
  });
  test("undocumented stages render without a rule pointer; passes render nothing", () => {
    expect(ruleFor("host-loc")).toContain("gate.ts");
    expect(ruleFor("not-a-stage")).toBe("");
    expect(renderFailureLine("not-a-stage", "boom")).not.toContain("rule:");
    const lines = renderFailureLines({
      "host-loc": { ok: true, detail: {} },
      "fresh-tree": { ok: true, skipped: true, detail: {} },
      "tests": { ok: false, detail: "0 pass / 1 fail" },
    });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("✗ tests");
  });
  test("parseStageFilter refuses the vacuous-green shapes", () => {
    expect(parseStageFilter("v1-substrate-sweep, decisions")).toEqual(["v1-substrate-sweep", "decisions"]);
    expect(() => parseStageFilter(undefined)).toThrow(/needs a comma-separated list/);
    expect(() => parseStageFilter("")).toThrow(/needs a comma-separated list/);
    expect(() => parseStageFilter(" , ,")).toThrow(/at least one non-empty token/);
  });
});

// ---- F-5 — the gate flags, end-to-end ----

describe("F-5 — A14 the gate flags (e2e, hermetic)", () => {
  test("--quick --failures-only on a green tree: zero pass lines, summary JSON", () => {
    const p = spawnSync(OMEGA, ["tooling/gates/gate.ts", "--quick", "--failures-only"], { cwd: ROOT, encoding: "buffer", timeout: 120_000 });
    const out = `${p.stdout.toString()}${p.stderr.toString()}`;
    expect(p.status).toBe(0);
    expect(out).not.toContain("✓ host-loc");
    expect(out).toContain('"ok": true');
  });
  test("--stage targets the tests stage, skips attest, writes NO status.json", () => {
    const before = readFileSync(join(ROOT, "build/status.json"), "utf-8");
    const p = spawnSync(OMEGA, ["tooling/gates/gate.ts", "--stage", "v1-substrate-sweep", "--failures-only"], { cwd: ROOT, encoding: "buffer", timeout: 300_000 });
    const out = `${p.stdout.toString()}${p.stderr.toString()}`;
    expect(p.status).toBe(0);
    expect(out).toContain('"statusWritten": false');
    expect(out).toContain('"targeted": [\n    "v1-substrate-sweep"\n  ]');
    expect(readFileSync(join(ROOT, "build/status.json"), "utf-8")).toBe(before);
  });
  test("--stage without a value refuses loudly (no vacuous green)", () => {
    const p = spawnSync(OMEGA, ["tooling/gates/gate.ts", "--quick", "--stage"], { cwd: ROOT, encoding: "buffer", timeout: 60_000 });
    expect(p.status).not.toBe(0);
    expect(`${p.stdout.toString()}${p.stderr.toString()}`).toContain("refused: --stage needs");
  });
});

// ---- F-6 — the docscan ----

describe("F-6 — A15 the docscan (live lock + injected fixtures)", () => {
  test("LIVE LOCK: the current tree scans clean (the D-418 fix holds tree-wide)", () => {
    const r = scanDocs(ROOT);
    const msg = renderDocscanReport(r).join("\n");
    expect(r.findings, msg).toEqual([]);
  });
  test("S1/S4: a citation to a nonexistent id is found by name", () => {
    const root = omegaTmp("omega-docscan-test", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs/lonely.md"), "Superseded by D-99999 and cites D-88888 for context.\n");
    const r = scanDocs(root);
    const rules = r.findings.map((f) => `${f.rule}:${f.msg.match(/D-\d+/)?.[0]}`);
    expect(rules).toContain("S1:D-99999");
    expect(rules).toContain("S4:D-88888");
    rmSync(root, { recursive: true, force: true });
  });
  test("S2: the bold/bare drift in one file is found (the _11 bite class)", () => {
    const root = omegaTmp("omega-docscan-shape", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs/drifty.md"), "Header says **Superseded by D-418** and later: superseded by D-418 again.\n");
    const r = scanDocs(root);
    expect(r.findings.some((f) => f.rule === "S2" && f.msg.includes("D-418"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
  test("S5: annex parity drift is found; qualified spellings stay silent (A7)", () => {
    const root = omegaTmp("omega-docscan-annex", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "docs/forge/annex"), { recursive: true });
    writeFileSync(join(root, "docs/forge/annex/ORPHAN.md"), "an unlisted annex file\n");
    writeFileSync(join(root, "docs/forge/annex/README.md"), "| `GHOST.md` | a row with no file |\n");
    const r = scanDocs(root);
    expect(r.findings.some((f) => f.rule === "S5" && f.msg.includes("ORPHAN.md"))).toBe(true);
    expect(r.findings.some((f) => f.rule === "S5" && f.msg.includes("GHOST.md"))).toBe(true);
    expect(r.findings.some((f) => f.rule === "S4" && f.msg.includes("akb"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
  test("the real tree's known-id set is the record count (sanity)", () => {
    expect(knownDecisionIds(ROOT).size).toBeGreaterThan(100);
    expect(docFiles(ROOT).length).toBeGreaterThan(50);
  });
});

// ---- F-7 — the entry brief ----

describe("F-7 — A16 the entry brief (pure classification + e2e read-only)", () => {
  test("dirty files classify with decision-input and gate-artifact calls", () => {
    const dirty = classifyDirty(
      [" M build/status.json", "A  docs/decisions/D-422-efficiency-tooling-round.md", " M tooling/gates/brief.ts", " M README.md", "?? notes.md", ""],
      ["5\t5\tbuild/status.json", "12\t0\tdocs/decisions/D-422-efficiency-tooling-round.md", "3\t1\ttooling/gates/brief.ts", "1\t1\tREADME.md"],
    );
    expect(dirty.length).toBe(5);
    expect(dirty[0].classification).toContain("gate-run artifact");
    expect(dirty[0].classification).toContain("+5/−5");
    expect(dirty[1].classification).toContain("decision input");
    expect(dirty[2].classification).toContain("tooling");
    expect(dirty[3].classification).toContain("+1/−1");
    expect(dirty[4].classification).toContain("(untracked)");
  });
  test("nextCommands derives the ratify path with PROPOSED open, the close path at 0", () => {
    const withOpen = nextCommands([418, 419, 420, 421, 422], 5).join("\n");
    expect(withOpen).toContain("full gate ×2");
    expect(withOpen).toContain("D-418, D-419, D-420, D-421, D-422");
    expect(withOpen).toContain("omega:round-close --note");
    const closed = nextCommands([], 0).join("\n");
    expect(closed).not.toContain("full gate ×2");
    expect(closed).toContain("omega:round-close");
  });
  test("e2e: the entry report is read-only, names the ledger source, the board, the worklog law", () => {
    const before = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "buffer" }).stdout.toString();
    const p = spawnSync(OMEGA, ["tooling/gates/entry.ts"], { cwd: ROOT, encoding: "buffer", timeout: 60_000 });
    const out = p.stdout.toString();
    expect(p.status).toBe(0);
    expect(out).toMatch(/omega:entry — .+ @ [0-9a-f]{7}/);
    expect(out).toMatch(/Ledger: .+ \(via .+\)/);
    expect(out).toMatch(/Board: \d+ open/);
    expect(out).toMatch(/Worklog: /);
    expect(out).toContain("omega:round-close");
    const after = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "buffer" }).stdout.toString();
    expect(after).toBe(before);
  });
  test("the worklog path honors the env override (portable default, harness law)", () => {
    expect(worklogPath()).toBe("/home/z/my-project/worklog.md");
    process.env.OMEGA_WORKLOG = "/tmp/not-used-in-prod/worklog.md";
    expect(worklogPath()).toBe("/tmp/not-used-in-prod/worklog.md");
    delete process.env.OMEGA_WORKLOG;
  });
});

// ---- F-8 — the ledger home ----

describe("F-8 — A17 the ledger home (resolver order, searched paths, row contiguity)", () => {
  test("flag > pin > default, and every candidate searched is named", () => {
    const r1 = resolveLedgerDir(ROOT, "/elsewhere/ledger");
    expect(r1.dir).toBe("/elsewhere/ledger");
    expect(r1.source).toBe("--ledger flag");
    const r2 = resolveLedgerDir(ROOT);
    expect([".ledger-path pin (D-422, A17)", "D-414 default"]).toContain(r2.source);
    expect(r2.searched.length).toBeGreaterThanOrEqual(1);
    expect(r2.searched.join("; ")).toMatch(/\(D-414 default\)/);
  });
  test("a .ledger-path pin is honored (scratch root)", () => {
    const root = omegaTmp("omega-ledger-pin", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, ".ledger-path"), join(root, "custom-ledger"));
    const r = resolveLedgerDir(root);
    expect(r.dir).toBe(join(root, "custom-ledger"));
    expect(r.source).toBe(".ledger-path pin (D-422, A17)");
    rmSync(root, { recursive: true, force: true });
  });
  test("row contiguity: gaps refuse, pruned-file re-establishment does not", () => {
    expect(ledgerContiguity([11, 12])).toEqual([]);
    expect(ledgerContiguity([11])).toEqual([]);
    expect(ledgerContiguity([10, 12])[0]).toMatch(/gap: _10 → _12/);
    expect(ledgerContiguity([])).toEqual([]);
  });
  test("the delivery-ledger shape end-to-end: pruned files, last-row bundle present, dry-run preflight path", () => {
    // The authoring environment's delivery folder carried the _11 bundle and
    // the ledger README; the resolver finds it via the pin or default without
    // hand-holding. The guard is the LEDGER README (a README carrying bundle
    // table rows), never any README.md — a fresh delivery folder with an
    // unrelated placeholder README is NOT an established ledger, and demanding
    // its last-row bundle there was a portable-environment false positive
    // (found in the Ω-DEV wave's first full gate, 2026-09-20; repaired
    // additively under the bb7a1b8 precedent — the tooling catching its own
    // program). When a real ledger README is present, A17's law holds exactly:
    // bundle FILES are demanded only for the LAST row (pruned history is
    // lawful; the table is the ledger of record).
    const r = resolveLedgerDir(ROOT);
    const readmePath = join(r.dir, "README.md");
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, "utf-8");
      const rows = [...readme.matchAll(/_(\d+)\.bundle/g)].map((m) => Number(m[1]));
      if (rows.length > 0) {
        const last = Math.max(...rows);
        expect(existsSync(join(r.dir, `vivim-omega-wave0-omega-forge_${last}.bundle`))).toBe(true);
      }
    }
  });
});
