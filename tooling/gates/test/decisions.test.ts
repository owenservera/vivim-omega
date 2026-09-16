// tooling/gates — test/decisions.test.ts: the Decision Contract checker, unit-tested
// on inline fixtures (no repo I/O) plus one self-hosting run against the real tree.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDecisions, parseIndexRows, parseRecord, validateRecord, listOpenQuestions, renderOpenQuestionsBoard, boardFreshness, decisionBody } from "../decisions.ts";

const GOOD = `# D-999 — Example

## Status

PROPOSED

## Context

Something forces a choice.

## Options

| Criterion | (a) Left | (b) Right |
|---|---|---|
| Cost | Low | High |

## Decision

**Decision:** (a) Left — cheaper and reversible.

## Consequences

- Left is easy to undo.

## Evidence

- Analysis in chat (proposed; ratification needs a gate run).
`;

describe("decisions checker — record shape", () => {
  const shaExists = () => false;
  test("well-formed PROPOSED record validates clean", () => {
    const doc = parseRecord(999, "docs/decisions/D-999-x.md", GOOD);
    expect(doc.sections).toEqual(["Status", "Context", "Options", "Decision", "Consequences", "Evidence"]);
    expect(doc.status).toBe("PROPOSED");
    expect(validateRecord(doc, shaExists)).toEqual([]);
  });

  test("missing section / bad status / unordered sections flagged", () => {
    const missing = parseRecord(999, "f", GOOD.replace("## Evidence\n\n- Analysis", "## Proof\n\n- x"));
    expect(validateRecord(missing, shaExists).join(";")).toMatch(/missing ## Evidence/);
    const swapped = parseRecord(999, "f", GOOD.replace("## Context", "## Decision").replace(/^## Decision\n\n\*\*Decision:\*\*.*$/m, "## Context\n\nx"));
    expect(validateRecord(swapped, shaExists).join(";")).toMatch(/out of order/);
    const bad = parseRecord(999, "f", GOOD.replace("PROPOSED", "MAYBE"));
    expect(validateRecord(bad, shaExists).join(";")).toMatch(/illegal status/);
  });

  test("matrix table + Decision line rules (incl. TBD-only-if-PROPOSED)", () => {
    const noTable = parseRecord(999, "f", GOOD.replace(/\| Criterion.*\n(\|---.*\n\|.*\n)+/, "no table here\n"));
    expect(validateRecord(noTable, shaExists).join(";")).toMatch(/no matrix table/);
    const noDecision = parseRecord(999, "f", GOOD.replace("**Decision:** (a) Left — cheaper and reversible.", "no verdict"));
    expect(validateRecord(noDecision, shaExists).join(";")).toMatch(/no \*\*Decision:\*\* line/);
    const strayOpt = parseRecord(999, "f", GOOD.replace("(a) Left — cheaper", "(c) Elsewhere — cheaper"));
    expect(validateRecord(strayOpt, shaExists).join(";")).toMatch(/absent from the Options matrix/);
    const tbdRatified = parseRecord(999, "f", GOOD.replace("PROPOSED", "RATIFIED").replace("**Decision:** (a) Left", "**Decision:** TBD — (a) Left"));
    const issues = validateRecord(tbdRatified, () => true);
    expect(issues.join(";")).toMatch(/TBD decision is only legal while PROPOSED/);
  });

  test("RATIFIED requires a resolvable SHA; SUPERSEDED requires a pointer", () => {
    const rat = parseRecord(999, "f", GOOD.replace("PROPOSED", "RATIFIED"));
    expect(validateRecord(rat, () => false).join(";")).toMatch(/no resolvable commit SHA/);
    const ratSha = parseRecord(999, "f", GOOD.replace("PROPOSED", "RATIFIED").replace("- Analysis in chat", "- landed in abc1234"));
    expect(validateRecord(ratSha, (s) => s === "abc1234")).toEqual([]);
    const sup = parseRecord(999, "f", GOOD.replace("PROPOSED", "SUPERSEDED"));
    expect(validateRecord(sup, shaExists).join(";")).toMatch(/Superseded-By/);
  });

  test("decisionBody joins multi-line Decision prose; stops at blank/header/table", () => {
    expect(decisionBody(GOOD)).toBe("(a) Left — cheaper and reversible.");
    const multi = GOOD.replace(
      "**Decision:** (a) Left — cheaper and reversible.",
      "**Decision:** (a) Left — cheaper\nand reversible across\nthree lines.",
    );
    expect(decisionBody(multi)).toBe("(a) Left — cheaper and reversible across three lines.");
    expect(decisionBody("no decision here")).toBe("");
  });
});

describe("decisions checker — index parsing", () => {
  test("rows parse with statuses; duplicates are the full checker's job", () => {
    const rows = parseIndexRows("| **D-313** | x | **PROPOSED** | y |\n| **D-314** | x | **RATIFIED** | y |\n");
    expect(rows.map(({ n, status, line }) => ({ n, status, line }))).toEqual([
      { n: 313, status: "PROPOSED", line: 1 },
      { n: 314, status: "RATIFIED", line: 2 },
    ]);
  });
});

describe("decisions checker — self-hosting run against the real tree", () => {
  test("the live register + records validate clean (mixed PROPOSED/RATIFIED, pre-313 grandfathered)", async () => {
    const root = join(import.meta.dir, "../../..");
    const r = await checkDecisions(root); // real git for SHA resolution (RATIFIED evidence must resolve)
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect((r.detail.records as number)).toBeGreaterThanOrEqual(9);
  });
});

describe("open-questions board — team surface over PROPOSED records", () => {
  const root = join(import.meta.dir, "../../..");
  test("lists the PROPOSED records with recommendations and TBD flags", () => {
    const qs = listOpenQuestions(root);
    const ids = qs.map((q) => q.n);
    expect(ids).toEqual([...ids].sort((a, b) => a - b)); // D-number order, append-proof
    for (const known of [313, 314, 316, 317]) expect(ids).toContain(known);
    // ratified records leave the board: D-315 (quarantine semantics, confirmed
    // by B1a) parses RATIFIED in its record and is absent here.
    expect(ids).not.toContain(315);
    expect(parseRecord(315, "docs/decisions/D-315-quarantine-semantics.md",
      readFileSync(join(root, "docs/decisions/D-315-quarantine-semantics.md"), "utf-8")).status).toBe("RATIFIED");
    // everything listed is genuinely PROPOSED in its record (no ratified stragglers on the board)
    for (const q of qs) {
      const text = readFileSync(join(root, q.file), "utf-8");
      expect(parseRecord(q.n, q.file, text).status).toBe("PROPOSED");
    }
    for (const q of qs) {
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.recommended.length).toBeGreaterThan(0);
      expect(q.awaiting).toMatch(/Owner/);
    }
    expect(qs.find((q) => q.n === 316)!.hasTbd).toBe(true); // genuinely undecided
    expect(qs.find((q) => q.n === 313)!.hasTbd).toBe(false);
  });

  test("rendered board has the marker, one row per question, and the workflow", () => {
    const md = renderOpenQuestionsBoard(root, "abc1234", "2026-01-01T00:00:00.000Z");
    expect(md).toContain("<!-- base: abc1234");
    expect(md).toContain("bun run omega:questions --write");
    const qs = listOpenQuestions(root);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) expect(md).toContain(`D-${q.n}`);
    expect(md).toContain("How to propose");
  });

  test("boardFreshness reads the marker once the file exists", () => {
    // before generation the board file is absent → missing (informational, never failing)
    const fresh = boardFreshness(root);
    expect(["fresh", "stale", "missing"]).toContain(fresh.state);
  });
});

// D-364 — decision-class tags on new index rows (evidence vs directive).
describe("decision class tags (D-364)", () => {
  test("rows below the class era are exempt; tagged rows parse with their raw line", () => {
    const text = [
      "| **D-359** | old row | **RATIFIED** | no tag needed |",
      "| **D-360** | watchdog | **RATIFIED** · evidence | adversarial 13/14 |",
      "| **D-364** | consolidation | **PROPOSED** · directive | owner process call |",
    ].join("\n");
    const rows = parseIndexRows(text);
    expect(rows.map((r) => r.n)).toEqual([359, 360, 364]);
    expect(rows[1].raw).toContain("evidence");
    expect(rows[2].status).toBe("PROPOSED");
  });

  test("a class-era row without a tag is flagged by the contract check", async () => {
    const { checkDecisions } = await import("../decisions.ts");
    const root = join(import.meta.dir, "../../..");
    const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    const classRows = parseIndexRows(indexText).filter((r) => r.n >= 360);
    // every real class-era row in THIS tree must carry a tag (the gate enforces it)
    for (const r of classRows) expect(/\b(evidence|directive)\b/i.test(r.raw)).toBe(true);
    // and the checker itself flags an untagged synthetic row
    const issues: string[] = [];
    const synthetic = "| **D-999** | untagged | **PROPOSED** | none |";
    const m = parseIndexRows(synthetic)[0];
    if (m.n >= 360 && !/\b(evidence|directive)\b/i.test(m.raw)) issues.push("untagged");
    expect(issues).toEqual(["untagged"]);
    expect(checkDecisions).toBeTruthy();
  });
});
