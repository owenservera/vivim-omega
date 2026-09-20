// tooling/gates/docscan.ts — D-422 (A15): the internal doc-logic scan as a
// tool (A8-lite, pulled forward by the efficiency audit). The hand-held grep
// the course-correction turn ran (and judged by hand) becomes one command.
//
// REPORT-ONLY by design (the D-415/D-368 adopt-observe-enforce pattern):
// findings are named, path:line-cited, and never fail — the flip to a failing
// gate stage is a future record's call after one green wave of reports.
// Mechanical breakage (an unreadable doc) throws — a broken scanner is worse
// than no scanner. The session-entry brief (A16) surfaces the finding count
// so the report is seen routinely without a gate stage.
//
// Rules — repo-self-contained facts only (corpus-line verification stays
// post-Wave-1 with full A8, per the audit's restraint register):
//   S1 supersede-target-exists — every "Superseded by / Supersedes / amended
//      by D-NNN" names an id that exists (index rows ∪ record files)
//   S2 supersede bold-shape drift — the same id spelled BOTH bolded and bare
//      within one file (the exact byte-shape bite the D-418 sweep caught in
//      _11's wake, now caught tree-wide instead of in one pinned test)
//   S3 §-pointer resolution — "§N" in program docs resolves to a heading in
//      the vision doc of record carrying N
//   S4 citation existence — bare "D-NNN" citations resolve to real ids;
//      track-qualified spellings (akb:D-NNN) are excluded per A7's law
//   S5 annex parity — every annex/*.md has a README row and every README row
//      has a file (the annex is the working set's home; drift there strands
//      material outside the tree's own index)
//   S6 banner coverage — a doc whose header claims supersession names a
//      D-id somewhere in its body
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GRANDFATHER_BELOW, GENERATED_FROM } from "./decisions.ts";

export interface Finding { rule: string; file: string; line: number; msg: string }

/** All .md files under docs/ (recursive), repo-relative. */
export function docFiles(root: string): string[] {
  const docsDir = join(root, "docs");
  const abs: string[] = [];
  const rec = (d: string) => {
    for (const f of readdirSync(d)) {
      if (f === "node_modules") continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) rec(p);
      else if (f.endsWith(".md")) abs.push(p);
    }
  };
  rec(docsDir);
  return abs.map((p) => p.slice(root.length + 1));
}

export function knownDecisionIds(root: string): Set<number> {
  const ids = new Set<number>();
  try {
    const idx = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    for (const m of idx.matchAll(/\|\s*\*\*D-(\d+)\*\*/g)) ids.add(Number(m[1]));
  } catch { /* the index is the primary source; its absence is everyone's problem elsewhere */ }
  const dir = join(root, "docs/decisions");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^D-(\d+)-.+\.md$/.exec(f);
      if (m) ids.add(Number(m[1]));
    }
  }
  return ids;
}

/** Vision-doc heading numbers (for S3): a heading "## 28 · The 100x table"
 *  carries 28. Only headings at the doc's top two levels count — deep
 *  headings would make every number resolve vacuously. */
export function visionHeadingNumbers(root: string): Set<number> {
  const out = new Set<number>();
  const p = join(root, "docs/forge/OMEGA-ENDSTATE-VISION.md");
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const m = /^#{1,2}\s+(.*)$/.exec(line);
    if (!m) continue;
    for (const n of m[1].matchAll(/\b(\d+)\b/g)) out.add(Number(n[1]));
  }
  return out;
}

const SUPERSEDE_RE = /(?:Superseded\s+by|Supersedes|superseded-by|amended\s+by)\s*\*{0,2}D-(\d+)/gi;
const BARE_DID_RE = /(?<![a-zA-Z:])\bD-(\d+)\b/g;

/** D-422 (A15): the S4 grandfather, mirroring the checker's own law (D-413:
 *  "hand-era records are grandfathered silent" — A7's ratified consequence).
 *  Hand-era record files (D-313..D-412) and hand-era index rows cite ids the
 *  generated-era laws never obligated them to keep resolvable — including the
 *  RESET-NOTE retired range (D-340–D-349, retired wholesale by the second
 *  sandbox reset; the records say so in place). Generated-era records, the
 *  annex, runbooks, and every non-record doc stay STRICT. */
function s4Grandfathered(rel: string, lineNo: number, lines: string[]): boolean {
  const rec = /^docs\/decisions\/D-(\d+)-/.exec(rel);
  if (rec) return Number(rec[1]) < GENERATED_FROM;
  if (rel === "docs/BUILD-DECISIONS.md") {
    const rowId = Number(/\|\s*\*\*D-(\d+)\*\*/.exec(lines[lineNo - 1] ?? "")?.[1] ?? Number.NaN);
    return Number.isInteger(rowId) && rowId < GENERATED_FROM;
  }
  return false;
}

export function scanDocs(root: string): { findings: Finding[]; checked: { files: number; knownIds: number } } {
  const findings: Finding[] = [];
  const files = docFiles(root).filter((f) => !f.startsWith("docs/migration/"));
  // docs/migration/** is the frozen historical corpus (the D-418 discipline:
  // legacy material is history, never design input) — scanned never, edited
  // never; its pre-index citations are grandfathered by being out of scope.
  const ids = knownDecisionIds(root);
  const visionNums = visionHeadingNumbers(root);
  const stripFences = (text: string) => text
    .replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, " "))
    // inline code spans + double-quoted spans are MENTIONS, not assertions —
    // the efficiency audit and the D-418-amended docs legitimately quote both
    // marker shapes; stripping them keeps S1/S2/S4 on the assertions
    .replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/"[^"\n]*"/g, (m) => m.replace(/[^\n]/g, " "));

  for (const rel of files) {
    let raw: string;
    try { raw = readFileSync(join(root, rel), "utf-8"); } catch (e) {
      throw new Error(`docscan mechanical breakage: cannot read ${rel}: ${String(e instanceof Error ? e.message : e)}`);
    }
    const text = stripFences(raw);
    const lines = text.split("\n");
    const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;

    // S1 + S2 — supersede markers. S2 is SPAN-AWARE per line: a `**...Superseded
    // by D-N...**` span is bold EVEN when the span carries a parenthetical
    // (`**Superseded by D-418 (kept for the record):**`); a mention outside any
    // ** span is bare. A file (or one line) carrying both shapes for one id is
    // the missing-bold bite class. Quoted/backticked mentions never reach here
    // (stripped above) — quoting both shapes is legitimate (the audit does).
    const shapesById = new Map<number, Set<"bold" | "bare">>();
    const noteShape = (id: number, shape: "bold" | "bare") => {
      if (!shapesById.has(id)) shapesById.set(id, new Set());
      shapesById.get(id)!.add(shape);
    };
    for (const lineText of lines) {
      const boldSpans = [...lineText.matchAll(/\*\*[^*]*Superseded\s+by\s+D-(\d+)[^*]*\*\*/gi)].map((m) => Number(m[1]));
      const rest = lineText.replace(/\*\*[^*]*\*\*/g, " ");
      const bareIds = [...rest.matchAll(/Superseded\s+by\s+D-(\d+)/gi)].map((m) => Number(m[1]));
      for (const id of boldSpans) noteShape(id, "bold");
      for (const id of bareIds) noteShape(id, "bare");
    }
    for (const m of text.matchAll(SUPERSEDE_RE)) {
      const id = Number(m[1]);
      if (!ids.has(id)) findings.push({ rule: "S1", file: rel, line: lineOf(m.index ?? 0), msg: `supersede marker names D-${id}, which does not exist (no index row, no record file)` });
    }
    for (const [id, shapes] of shapesById) {
      if (shapes.size > 1) findings.push({ rule: "S2", file: rel, line: lineOf(0), msg: `supersede marker for D-${id} spelled both bolded and bare in this file — pick the file's convention (the _11 missing-bold bite class)` });
    }

    // S3 — §-pointers resolve against the vision doc of record
    if (rel !== "docs/forge/OMEGA-ENDSTATE-VISION.md") {
      for (const m of text.matchAll(/§(\d+)/g)) {
        const n = Number(m[1]);
        if (visionNums.size > 0 && !visionNums.has(n)) {
          findings.push({ rule: "S3", file: rel, line: lineOf(m.index ?? 0), msg: `§${n} has no matching heading in the vision doc of record (OMEGA-ENDSTATE-VISION.md)` });
        }
      }
    }

    // S4 — bare D-id citations resolve (qualified spellings excluded by the regex).
    // Grandfathers: ids < GRANDFATHER_BELOW (the index-only era, the checker's
    // own law) and the hand-era files/rows (see s4Grandfathered).
    for (const m of text.matchAll(BARE_DID_RE)) {
      const id = Number(m[1]);
      if (ids.has(id) || id < GRANDFATHER_BELOW) continue;
      const line = lineOf(m.index ?? 0);
      if (s4Grandfathered(rel, line, lines)) continue;
      findings.push({ rule: "S4", file: rel, line, msg: `citation D-${id} does not resolve (no index row, no record file)` });
    }

    // S6 — banner coverage: a doc claiming supersession in its header names a
    // D-id. GENERATED files are out of scope (the board's "SUPERSEDED" is the
    // status vocabulary, not a claim — and at 0 open it carries no D-ids at all).
    if (rel !== "docs/decisions/OPEN-QUESTIONS.md") {
      const header = lines.slice(0, 30).join("\n");
      if (/supersed/i.test(header) && !/\bD-\d+\b/.test(text)) {
        findings.push({ rule: "S6", file: rel, line: 1, msg: "header claims supersession but no D-id is named anywhere in the doc" });
      }
    }
  }

  // S5 — annex parity (README rows ↔ files)
  const annexDir = join(root, "docs/forge/annex");
  if (existsSync(annexDir)) {
    const filesInAnnex = readdirSync(annexDir).filter((f) => f.endsWith(".md") && f !== "README.md");
    const readmePath = join(annexDir, "README.md");
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, "utf-8");
      const rowFiles = new Set([...readme.matchAll(/\|\s*`([^`]+\.md)`\s*\|/g)].map((m) => m[1]));
      for (const f of filesInAnnex) {
        if (!rowFiles.has(f)) findings.push({ rule: "S5", file: `docs/forge/annex/README.md`, line: 0, msg: `annex file ${f} has no README row` });
      }
      for (const f of rowFiles) {
        if (!existsSync(join(annexDir, f))) findings.push({ rule: "S5", file: `docs/forge/annex/README.md`, line: 0, msg: `README row names ${f}, which does not exist` });
      }
    } else {
      findings.push({ rule: "S5", file: "docs/forge/annex/README.md", line: 0, msg: "annex exists but has no README.md" });
    }
  }

  return { findings, checked: { files: files.length, knownIds: ids.size } };
}

export function renderDocscanReport(r: { findings: Finding[]; checked: { files: number; knownIds: number } }, cap = 60): string[] {
  const lines: string[] = [];
  lines.push(`docscan (A15, D-422 — report-only): ${r.checked.files} docs scanned, ${r.checked.knownIds} known decision ids`);
  if (r.findings.length === 0) {
    lines.push("0 findings — the tree's doc-logic is clean (supersede targets, bold shapes, §-pointers, citations, annex parity, banner coverage)");
    return lines;
  }
  const byRule = new Map<string, number>();
  for (const f of r.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  lines.push(`${r.findings.length} finding(s): ${[...byRule.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  for (const f of r.findings.slice(0, cap)) lines.push(`  ${f.rule} ${f.file}:${f.line}: ${f.msg}`);
  if (r.findings.length > cap) lines.push(`  … (+${r.findings.length - cap} more)`);
  lines.push("report-only (D-415 pattern): findings do not fail anything; the flip to a failing gate stage is a future record's call.");
  return lines;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  const r = scanDocs(root);
  for (const l of renderDocscanReport(r)) console.log(l);
  process.exit(0); // report-only: always green (mechanical breakage throws above)
}
