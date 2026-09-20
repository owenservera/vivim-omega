// tooling/gates — test/decisions.test.ts: the Decision Contract checker, unit-tested
// on inline fixtures (no repo I/O) plus one self-hosting run against the real tree.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDecisions, parseIndexRows, parseRecord, validateRecord, listOpenQuestions, renderOpenQuestionsBoard, boardFreshness, decisionBody, BLOCKS_VOCAB, KNOWN_TRACK_COLLISIONS, computeOpenQuestions, generateIndexRow, parseIndexMeta, regenerateIndexRows, scanTrackCollisions } from "../decisions.ts";

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

describe("decisions checker — record shape (hand-era fixture: D-312, pre-generated-era)", () => {
  const shaExists = () => false;
  test("well-formed PROPOSED record validates clean", () => {
    const doc = parseRecord(312, "docs/decisions/D-999-x.md", GOOD);
    expect(doc.sections).toEqual(["Status", "Context", "Options", "Decision", "Consequences", "Evidence"]);
    expect(doc.status).toBe("PROPOSED");
    expect(validateRecord(doc, shaExists)).toEqual([]);
  });

  test("missing section / bad status / unordered sections flagged", () => {
    const missing = parseRecord(312, "f", GOOD.replace("## Evidence\n\n- Analysis", "## Proof\n\n- x"));
    expect(validateRecord(missing, shaExists).join(";")).toMatch(/missing ## Evidence/);
    const swapped = parseRecord(312, "f", GOOD.replace("## Context", "## Decision").replace(/^## Decision\n\n\*\*Decision:\*\*.*$/m, "## Context\n\nx"));
    expect(validateRecord(swapped, shaExists).join(";")).toMatch(/out of order/);
    const bad = parseRecord(312, "f", GOOD.replace("PROPOSED", "MAYBE"));
    expect(validateRecord(bad, shaExists).join(";")).toMatch(/illegal status/);
  });

  test("matrix table + Decision line rules (incl. TBD-only-if-PROPOSED)", () => {
    const noTable = parseRecord(312, "f", GOOD.replace(/\| Criterion.*\n(\|---.*\n\|.*\n)+/, "no table here\n"));
    expect(validateRecord(noTable, shaExists).join(";")).toMatch(/no matrix table/);
    const noDecision = parseRecord(312, "f", GOOD.replace("**Decision:** (a) Left — cheaper and reversible.", "no verdict"));
    expect(validateRecord(noDecision, shaExists).join(";")).toMatch(/no \*\*Decision:\*\* line/);
    const strayOpt = parseRecord(312, "f", GOOD.replace("(a) Left — cheaper", "(c) Elsewhere — cheaper"));
    expect(validateRecord(strayOpt, shaExists).join(";")).toMatch(/absent from the Options matrix/);
    const tbdRatified = parseRecord(312, "f", GOOD.replace("PROPOSED", "RATIFIED").replace("**Decision:** (a) Left", "**Decision:** TBD — (a) Left"));
    const issues = validateRecord(tbdRatified, () => true);
    expect(issues.join(";")).toMatch(/TBD decision is only legal while PROPOSED/);
  });

  test("RATIFIED requires a resolvable SHA; SUPERSEDED requires a pointer", () => {
    const rat = parseRecord(312, "f", GOOD.replace("PROPOSED", "RATIFIED"));
    expect(validateRecord(rat, () => false).join(";")).toMatch(/no resolvable commit SHA/);
    const ratSha = parseRecord(312, "f", GOOD.replace("PROPOSED", "RATIFIED").replace("- Analysis in chat", "- landed in abc1234"));
    expect(validateRecord(ratSha, (s) => s === "abc1234")).toEqual([]);
    const sup = parseRecord(312, "f", GOOD.replace("PROPOSED", "SUPERSEDED"));
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
    // D-413 (A4) board law: BLOCKING-first, then D-number — records carrying a
    // non-none Blocks value sort ahead of none-records, ascending within each
    // band. (Test-led correction 2026-09-20: the naive D-number assertion
    // predated the first Blocks-carrying PROPOSED record — D-421 — and
    // contradicted the comparator's own law comment.)
    const blocking = qs.filter((q) => q.blocks !== "none").map((q) => q.n);
    const unblocked = qs.filter((q) => q.blocks === "none").map((q) => q.n);
    expect(blocking).toEqual([...blocking].sort((a, b) => a - b));
    expect(unblocked).toEqual([...unblocked].sort((a, b) => a - b));
    expect(ids).toEqual([...blocking, ...unblocked]);
    // Ratification history cleared the board: foundation wave (96a58f4) cleared
    // D-313/314/317 + D-366/372/373/374/375; the W0 close-out cleared D-376..D-383;
    // W1 cleared D-385. D-316 closed 2026-09-18 — its own revisit trigger met (the
    // D-376 net shipped and reported; independent recommendation §6 concurred),
    // bringing the board to zero. (2026-09-18 test-led correction: this test
    // previously pinned D-316 as the open board with hasTbd — the state moved.)
    for (const ratified of [313, 314, 315, 316, 317, 366, 372, 373, 374, 375]) expect(ids).not.toContain(ratified);
    // ratified records leave the board: D-315 (quarantine semantics, confirmed
    // by B1a) parses RATIFIED in its record and is absent here.
    expect(parseRecord(315, "docs/decisions/D-315-quarantine-semantics.md",
      readFileSync(join(root, "docs/decisions/D-315-quarantine-semantics.md"), "utf-8")).status).toBe("RATIFIED");
    // everything listed is genuinely PROPOSED in its record (no ratified stragglers on the board)
    for (const q of qs) {
      const text = readFileSync(join(root, q.file), "utf-8");
      expect(parseRecord(q.n, q.file, text).status).toBe("PROPOSED");
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.recommended.length).toBeGreaterThan(0);
      expect(q.awaiting).toMatch(/Owner/);
    }
  });

  test("rendered board has the marker, one row per question, and the workflow", () => {
    const md = renderOpenQuestionsBoard(root, "abc1234", "2026-01-01T00:00:00.000Z");
    expect(md).toContain("<!-- base: abc1234");
    expect(md).toContain("bun run omega:questions --write");
    expect(md).toContain("How to propose");
    // D-413 (A4): the board carries the Blocks column, blocking-first order.
    expect(md).toContain("| ID | Question | Recommended position | Blocks | Awaiting | Record |");
    const qs = listOpenQuestions(root);
    for (const q of qs) expect(md).toContain(`D-${q.n}`);
    // zero-open is a legal, healthy state (D-316 closure, 2026-09-18) — the
    // renderer must say so explicitly rather than render an empty table.
    if (qs.length === 0) expect(md).toContain("No open questions");
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

// D-413 — the generated-row era (A1), the Blocks field (A4), the cross-track
// lint (A7). Falsifiers F-1..F-5 of the tooling round live here and in
// new-decision.test.ts; the record's Evidence section names them.
const GOOD_GEN = `# D-999 — Generated-era example

## Status

PROPOSED

## Context

Something forces a choice.

Blocks: Wave 1

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

## Index

summary: The left path, taken for cost
rationale: cost rules this fork; reversibility second
class: evidence
`;

describe("generated-row era (D-413, A1) — record shape", () => {
  const shaExists = () => false;
  test("a generated-era record with ## Index + Blocks validates clean; meta parses", () => {
    const doc = parseRecord(999, "docs/decisions/D-999-x.md", GOOD_GEN);
    expect(doc.sections).toEqual(["Status", "Context", "Options", "Decision", "Consequences", "Evidence", "Index"]);
    expect(doc.indexMeta).toEqual({ summary: "The left path, taken for cost", rationale: "cost rules this fork; reversibility second", class: "evidence" });
    expect(doc.blocks).toBe("Wave 1");
    expect(validateRecord(doc, shaExists)).toEqual([]);
    expect(parseIndexMeta(undefined)).toBeNull();
  });

  test("records from the generated era REQUIRE ## Index (missing → named issue)", () => {
    const noIndex = parseRecord(999, "f", GOOD_GEN.slice(0, GOOD_GEN.indexOf("## Index")));
    expect(noIndex.indexMeta).toBeNull();
    expect(validateRecord(noIndex, shaExists).join(";")).toMatch(/missing ## Index section/);
  });

  test("## Index rules bite: empty lines, illegal class, status words, pipes", () => {
    const empty = parseRecord(999, "f", GOOD_GEN.replace("summary: The left path, taken for cost\n", ""));
    expect(validateRecord(empty, shaExists).join(";")).toMatch(/needs non-empty summary: and rationale:/);
    const badClass = parseRecord(999, "f", GOOD_GEN.replace("class: evidence", "class: maybe"));
    expect(validateRecord(badClass, shaExists).join(";")).toMatch(/## Index class "maybe" illegal/);
    const trap = parseRecord(999, "f", GOOD_GEN.replace("summary: The left path, taken for cost", "summary: The rejected left path"));
    expect(validateRecord(trap, shaExists).join(";")).toMatch(/must not contain status words/);
    const pipe = parseRecord(999, "f", GOOD_GEN.replace("rationale: cost rules this fork; reversibility second", "rationale: cost|rules"));
    expect(validateRecord(pipe, shaExists).join(";")).toMatch(/must not contain "\|"/);
  });

  test("hand-era records (below D-413) need no ## Index — grandfathered", () => {
    const doc = parseRecord(312, "f", GOOD);
    expect(doc.indexMeta).toBeNull();
    expect(doc.blocks).toBeNull();
    expect(validateRecord(doc, shaExists)).toEqual([]);
  });

  test("generateIndexRow is the one true spelling of a generated-era row", () => {
    const row = generateIndexRow(999, "PROPOSED", { summary: "S", rationale: "R", class: "evidence" }, "D-999-x.md");
    expect(row).toBe("| **D-999** | S Detail: docs/decisions/D-999-x.md | **PROPOSED** · evidence | R |");
    // the full-checker equality rule that hangs off it is exercised end-to-end
    // on a scratch tree in new-decision.test.ts (F-1/F-2)
  });
});

describe("Blocks field + board order (D-413, A4)", () => {
  test("Blocks vocabulary enforced; none and wave ids pass", () => {
    const bad = parseRecord(999, "f", GOOD_GEN.replace("Blocks: Wave 1", "Blocks: Wave 9"));
    expect(validateRecord(bad, () => false).join(";")).toMatch(/outside the vocabulary/);
    const core = parseRecord(999, "f", GOOD_GEN.replace("Blocks: Wave 1", "Blocks: Core Phase"));
    expect(validateRecord(core, () => false)).toEqual([]);
    const none = parseRecord(999, "f", GOOD_GEN.replace("Blocks: Wave 1", "Blocks: none"));
    expect(validateRecord(none, () => false)).toEqual([]);
    expect(BLOCKS_VOCAB).toContain("parallel work");
  });

  test("board sorts blocking-first then D-number; absent Blocks reads none", () => {
    const mk = (n: number, blocks: string) => GOOD_GEN
      .replace(/D-999/g, `D-${n}`)
      .replace("Blocks: Wave 1", blocks ? `Blocks: ${blocks}` : "(no Blocks line)");
    const qs = computeOpenQuestions([
      { n: 501, file: "docs/decisions/D-501-a.md", text: mk(501, "") },
      { n: 502, file: "docs/decisions/D-502-b.md", text: mk(502, "Wave 1") },
      { n: 503, file: "docs/decisions/D-503-c.md", text: mk(503, "Core Phase") },
    ]);
    expect(qs.map((q) => q.n)).toEqual([502, 503, 501]);
    expect(qs.map((q) => q.blocks)).toEqual(["Wave 1", "Core Phase", "none"]);
  });
});

describe("cross-track collision lint (D-413, A7)", () => {
  test("bare collision citations warn from the generated era on; qualified and hand-era stay silent", () => {
    const bare = parseRecord(999, "f", GOOD_GEN.replace("Something forces a choice.", "Something forces a choice; see D-389 for the collision."));
    expect(scanTrackCollisions(bare)).toHaveLength(1);
    expect(scanTrackCollisions(bare)[0]).toMatch(/collides with akb:D-389/);
    const qualified = parseRecord(999, "f", GOOD_GEN.replace("Something forces a choice.", "Something forces a choice; see akb:D-389 and omega:D-389, both unambiguous."));
    expect(scanTrackCollisions(qualified)).toEqual([]);
    const hand = parseRecord(312, "f", GOOD.replace("Something forces a choice.", "Something forces a choice; bare D-389 grandfathered here."));
    expect(scanTrackCollisions(hand)).toEqual([]);
    expect(KNOWN_TRACK_COLLISIONS.akb).toEqual([389]);
  });

  test("the registry page and the checker constant agree (doc-drift lock, the D-403 class)", () => {
    const root = join(import.meta.dir, "../../..");
    const page = readFileSync(join(root, "docs/decisions/CROSS-TRACK-REGISTRY.md"), "utf-8");
    const pageAkb = [...page.matchAll(/\bakb:D-(\d+)\b/g)].map((m) => Number(m[1]));
    expect([...new Set(pageAkb)].sort((a, b) => a - b)).toEqual(KNOWN_TRACK_COLLISIONS.akb);
  });
});

describe("index-row regeneration (D-413, A1) — F-3 byte-stability", () => {
  test("drifted generated rows are replaced byte-exact; hand rows untouched; idempotent", () => {
    const doc = parseRecord(999, "D-999-x.md", GOOD_GEN);
    const handRow = "| **D-350** | old hand row | **RATIFIED** | kept verbatim |";
    const good = generateIndexRow(999, "PROPOSED", doc.indexMeta!, "D-999-x.md");
    const text = `# header\n\n| ID | Decision | Status | Rationale |\n|---|---|---|---|\n${handRow}\n${good}\n`;
    const drifted = text.replace(good, `${good.slice(0, -2)}XX |`);
    const r1 = regenerateIndexRows(drifted, [{ n: 999, file: "D-999-x.md", doc }]);
    expect(r1.changed).toBe(1);
    expect(r1.text).toBe(text); // restored byte-exact
    expect(r1.text).toContain(handRow);
    const r2 = regenerateIndexRows(r1.text, [{ n: 999, file: "D-999-x.md", doc }]);
    expect(r2).toEqual({ text: r1.text, changed: 0, appended: 0 }); // byte-stable
  });

  test("missing generated rows are appended in D-order after the last row", () => {
    const doc = parseRecord(999, "D-999-x.md", GOOD_GEN);
    const text = `# header\n\n| ID | Decision | Status | Rationale |\n|---|---|---|---|\n| **D-350** | old | **RATIFIED** | x |\n`;
    const r = regenerateIndexRows(text, [{ n: 999, file: "D-999-x.md", doc }]);
    expect(r.appended).toBe(1);
    expect(r.text.endsWith(`| **D-350** | old | **RATIFIED** | x |\n${generateIndexRow(999, "PROPOSED", doc.indexMeta!, "D-999-x.md")}\n`)).toBe(true);
  });
});
