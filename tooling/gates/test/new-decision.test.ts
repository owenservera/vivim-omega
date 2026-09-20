// tooling/gates/test/new-decision.test.ts — D-413 (A1): the scaffold, tested
// end-to-end on a scratch tree. The record it emits passes checkDecisions
// clean BY CONSTRUCTION (F-1); the generated-row equality rule bites a hand
// edit (F-2); regeneration restores it byte-exact (F-3); refusals fail closed.
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import { checkDecisions, generateIndexRow, parseRecord, regenerateIndexRows } from "../decisions.ts";
import { nextDecisionId, recordTemplate, scaffoldDecision } from "../new-decision.ts";

const INDEX_HEADER = `# Ω Build Decisions (fixture)

Append-only register (fixture for the scaffold round-trip test).

| ID | Decision | Status | Rationale |
|---|---|---|---|
`;

const BASELINE = `# D-413 — Baseline fixture

## Status

PROPOSED

## Context

The scratch tree's one generated-era record.

Blocks: none

## Options

| Criterion | (a) Left | (b) Right |
|---|---|---|
| Cost | Low | High |

## Decision

**Decision:** (a) Left — cheaper.

## Consequences

- Left is easy to undo.

## Evidence

- Fixture only.

## Index

summary: The baseline record
rationale: holds the fixture's generated-era floor
class: evidence
`;

const ARGS = {
  slug: "scaffold-fixture",
  klass: "directive",
  title: "Scaffold fixture decision",
  summary: "The scaffolded decision, one line",
  rationale: "round-trip proof for the scaffold tooling",
};

describe("omega:new-decision — scaffold round-trip on a scratch tree", () => {
  let root: string;
  let baselineRow: string;

  beforeAll(() => {
    root = omegaTmp("omega-new-decision-test", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "docs/decisions"), { recursive: true });
    writeFileSync(join(root, "docs/decisions/D-413-baseline.md"), BASELINE);
    const doc = parseRecord(413, "D-413-baseline.md", BASELINE);
    baselineRow = generateIndexRow(413, "PROPOSED", doc.indexMeta!, "D-413-baseline.md");
    writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), `${INDEX_HEADER}${baselineRow}\n`);
  });

  test("F-1 — the scaffolded record + generated row pass the full contract by construction", async () => {
    // next id is computed from rows AND record files (both sources agree here)
    expect(nextDecisionId(`${INDEX_HEADER}${baselineRow}\n`, [413])).toBe(414);
    const { n, recordPath, row } = scaffoldDecision(root, ARGS);
    expect(n).toBe(414);
    expect(recordPath).toBe("docs/decisions/D-414-scaffold-fixture.md");
    const record = readFileSync(join(root, recordPath), "utf-8");
    expect(record).toContain("## Status\n\nPROPOSED");
    expect(record).toContain("Blocks: none");
    expect(record).toContain("class: directive");
    expect(recordTemplate(414, ARGS)).toBe(record); // the file is exactly the template
    const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    expect(indexText.endsWith(`${row}\n`)).toBe(true);
    expect(row).toBe("| **D-414** | The scaffolded decision, one line Detail: docs/decisions/D-414-scaffold-fixture.md | **PROPOSED** · directive | round-trip proof for the scaffold tooling |");
    // the whole scratch tree validates clean — the round-trip (F-1)
    const r = await checkDecisions(root, { shaExists: () => false });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.detail.generatedFrom).toBe(413);
  });

  test("F-2 — a hand-edited generated-era row goes red with the named issue", async () => {
    const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    const drifted = indexText.replace("| The scaffolded decision, one line Detail:", "| The scaffolded decision, hand-typed Detail:");
    writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), drifted);
    const r = await checkDecisions(root, { shaExists: () => false });
    expect(r.ok).toBe(false);
    expect(r.issues.join(";")).toMatch(/D-414: index row is not the generated row/);
  });

  test("F-3 — regeneration restores the row byte-exact and is idempotent", async () => {
    const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    const doc413 = parseRecord(413, "D-413-baseline.md", readFileSync(join(root, "docs/decisions/D-413-baseline.md"), "utf-8"));
    const doc414 = parseRecord(414, "D-414-scaffold-fixture.md", readFileSync(join(root, "docs/decisions/D-414-scaffold-fixture.md"), "utf-8"));
    const r1 = regenerateIndexRows(indexText, [
      { n: 413, file: "D-413-baseline.md", doc: doc413 },
      { n: 414, file: "D-414-scaffold-fixture.md", doc: doc414 },
    ]);
    expect(r1.changed).toBe(1);
    writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), r1.text);
    expect((await checkDecisions(root, { shaExists: () => false })).ok).toBe(true);
    // second pass: byte-stable, zero changes
    const r2 = regenerateIndexRows(r1.text, [
      { n: 413, file: "D-413-baseline.md", doc: doc413 },
      { n: 414, file: "D-414-scaffold-fixture.md", doc: doc414 },
    ]);
    expect(r2).toEqual({ text: r1.text, changed: 0, appended: 0 });
  });

  test("refusals fail closed: bad slug, illegal class, status words, pipes, missing one-liners", async () => {
    expect(() => scaffoldDecision(root, { ...ARGS, slug: "Bad_Slug" })).toThrow(/refused: slug/);
    expect(() => scaffoldDecision(root, { ...ARGS, slug: "x".repeat(65) })).toThrow(/refused: slug/);
    expect(() => scaffoldDecision(root, { ...ARGS, klass: "maybe" })).toThrow(/refused: class/);
    expect(() => scaffoldDecision(root, { ...ARGS, klass: "" })).toThrow(/refused: class/);
    expect(() => scaffoldDecision(root, { ...ARGS, summary: "The rejected path" })).toThrow(/status words/);
    expect(() => scaffoldDecision(root, { ...ARGS, rationale: "cost|rules" })).toThrow(/refused: --rationale/);
    expect(() => scaffoldDecision(root, { ...ARGS, summary: "" })).toThrow(/refused: --summary/);
    // the tree was not mutated by any refusal
    expect((await checkDecisions(root, { shaExists: () => false })).ok).toBe(true);
    expect(readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8").split("\n").filter((l) => l.startsWith("| **D-")).length).toBe(2);
  });
});
