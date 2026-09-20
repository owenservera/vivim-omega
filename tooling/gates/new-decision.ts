// tooling/gates/new-decision.ts — D-413 (A1): the decision-record scaffold.
//
// `bun run omega:new-decision <slug> --class evidence|directive \
//    --title "..." --summary "..." --rationale "..."` scaffolds a record that
// passes the Decision Contract BY CONSTRUCTION — the six sections in order, a
// bare PROPOSED status, a seeded (a)/(b)/(c) options matrix, a TBD decision
// line, the `## Index` meta, a `Blocks: none` default — and appends the
// GENERATED index row to docs/BUILD-DECISIONS.md. New records never hand-type
// a row again; the hand-typed-row trap class (the D-410 first-word bite) is
// killed at the root.
//
// Fail-closed refusals: bad slug, illegal class (no default-riding, the D-351
// drift class), status words or pipes in the one-liners, id/file collisions.
// Zero host LOC; docs + tooling only.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCKS_VOCAB, LEGAL_CLASSES, STATUS_WORD_RE, generateIndexRow, parseIndexRows } from "./decisions.ts";

export interface ScaffoldArgs {
  slug: string;
  klass: string;
  title: string;
  summary: string;
  rationale: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Next open D-id: max(index rows, record files) + 1. Pure. */
export function nextDecisionId(indexText: string, recordIds: number[]): number {
  const rowIds = parseIndexRows(indexText).map((r) => r.n);
  return Math.max(0, ...rowIds, ...recordIds) + 1;
}

/** The scaffold template — passes validateRecord by construction (the
 *  round-trip test proves it: scaffold → checkDecisions clean on a scratch
 *  tree). Fill the placeholders; keep the shape. */
export function recordTemplate(n: number, a: ScaffoldArgs): string {
  return `# D-${n} — ${a.title}

## Status

PROPOSED

## Context

- <what forces the choice — links to code, not vibes; keep it ≤10 lines>

Blocks: none

## Options

| Criterion | (a) <option one> | (b) <option two> | (c) Defer |
|---|---|---|---|
| <criterion one> | | | |

## Decision

**Decision:** TBD — (a) <the recommended position and the one-line why; still the owner's call while TBD>.

## Consequences

- <what gets harder, what gets easier, what must be revisited>

## Evidence

- <falsifiers named here BEFORE ratification (D-364); analysis citations; measurements>

## Index

summary: ${a.summary}
rationale: ${a.rationale}
class: ${a.klass}
`;
}

/** Scaffold one decision into the repo at `root`: writes the record file and
 *  appends the generated index row. Refuses (throws) on every bad input. */
export function scaffoldDecision(root: string, a: ScaffoldArgs): { n: number; recordPath: string; row: string } {
  if (!SLUG_RE.test(a.slug) || a.slug.length > 64) {
    throw new Error(`refused: slug "${a.slug}" must be kebab-case (lowercase digits/dashes, ≤64 chars)`);
  }
  if (!LEGAL_CLASSES.includes(a.klass)) {
    throw new Error(`refused: class "${a.klass}" illegal (want ${LEGAL_CLASSES.join(" | ")}) — the class is explicit, never defaulted (the D-351 drift class)`);
  }
  for (const [field, v] of [["title", a.title], ["summary", a.summary], ["rationale", a.rationale]] as const) {
    if (!v || !v.trim()) throw new Error(`refused: --${field} is required and must be non-empty`);
    if (v.includes("|") || v.includes("\n")) {
      throw new Error(`refused: --${field} must be one line without "|" — it lands in the generated index row`);
    }
  }
  if (STATUS_WORD_RE.test(`${a.summary} ${a.rationale}`)) {
    throw new Error(`refused: summary/rationale must not contain status words (PROPOSED|RATIFIED|SUPERSEDED|REJECTED) — the index first-word trap (the D-410 bite)`);
  }
  const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
  const dir = join(root, "docs/decisions");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const recordIds = readdirSync(dir)
    .map((f) => /^D-(\d+)-/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  const n = nextDecisionId(indexText, recordIds);
  if (parseIndexRows(indexText).some((r) => r.n === n)) {
    throw new Error(`refused: next id D-${n} already has an index row — regenerate or fix the ledger first`);
  }
  const recordPath = `docs/decisions/D-${n}-${a.slug}.md`;
  if (existsSync(join(root, recordPath))) {
    throw new Error(`refused: ${recordPath} already exists`);
  }
  writeFileSync(join(root, recordPath), recordTemplate(n, a));
  const row = generateIndexRow(n, "PROPOSED", { summary: a.summary, rationale: a.rationale, class: a.klass }, `D-${n}-${a.slug}.md`);
  const nextText = indexText.endsWith("\n") ? `${indexText}${row}\n` : `${indexText}\n${row}\n`;
  writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), nextText);
  return { n, recordPath, row };
}

// ---- CLI ----

function parseCli(argv: string[]): ScaffoldArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error(`refused: ${arg} needs a value`);
      flags[arg.slice(2)] = val;
      i++;
    } else positional.push(arg);
  }
  const slug = positional[0] ?? flags["slug"];
  if (!slug) {
    throw new Error('refused: usage: bun run omega:new-decision <slug> --class evidence|directive --title "..." --summary "..." --rationale "..."');
  }
  return {
    slug,
    klass: flags["class"] ?? "",
    title: flags["title"] ?? slug,
    summary: flags["summary"] ?? "",
    rationale: flags["rationale"] ?? "",
  };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  try {
    const a = parseCli(process.argv.slice(2));
    const { n, recordPath, row } = scaffoldDecision(root, a);
    console.log(`scaffolded D-${n}: ${recordPath}`);
    console.log("appended the generated index row:");
    console.log(`  ${row}`);
    console.log("next: fill the six sections (Context/Options/Decision/Consequences/Evidence), keep ## Index and Blocks honest, then regenerate (bun run omega:questions --write) and run the gate.");
    console.log(`Blocks vocabulary: ${BLOCKS_VOCAB.join(" | ")}`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
