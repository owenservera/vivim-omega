// tooling/gates/decisions.ts — the Decision Contract checker (docs/decisions/README.md).
// Validates index ↔ record consistency and record shape. Pure functions below are
// unit-tested (tooling/gates/test/decisions.test.ts); checkDecisions() is the gate
// entry (wired as the `decisions` stage of omega:gate) and the standalone runner
// (`bun run omega:decisions`). Fast: file reads + regex + git cat-file only.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { join } from "node:path";

/** D-361: node:child_process with a Bun-spawnSync-shaped result — the checker is
 *  runtime-neutral (the node --test canary story), not tied to one toolchain. */
function spawnSync(cmd: string[], opts: { cwd: string }): { exitCode: number; stdout: Buffer; stderr: Buffer } {
  const p = nodeSpawnSync(cmd[0], cmd.slice(1), { cwd: opts.cwd, encoding: "buffer" });
  return { exitCode: p.status ?? 1, stdout: p.stdout as Buffer, stderr: p.stderr as Buffer };
}

export const GRANDFATHER_BELOW = 313; // index rows below this are the index-only era (exempt from file rules)
export const DECISION_CLASS_FROM = 360; // rows from here on declare a class tag: evidence (probe/test-backed) or directive (owner call)
/** D-413 (A1): the generated-row era. Records from here on carry an `## Index`
 *  section (summary/rationale/class) and their BUILD-DECISIONS row is GENERATED
 *  from it — `omega:new-decision` appends it at scaffold time, `omega:questions
 *  --write` regenerates it, and the checker requires byte-equality. The
 *  hand-typed-row trap class (the D-410 first-word bite) becomes unexpressible.
 *  Rows below stay as they are: < D-313 the index-only era, D-313..D-412 the
 *  hand-typed era — append-only, untouched (RATIFIED rows never edited). */
export const GENERATED_FROM = 413;
/** D-413 (A4): the Blocks-line vocabulary — what an open decision may block.
 *  Sources: the ROADMAP wave ids (W2..W7 → Wave 2..7, Wave 1 the mine wave) +
 *  D-410's post-core sequence (Core Phase, parallel work). Checker-validated. */
export const BLOCKS_VOCAB: string[] = [
  "none", "Core Phase", "Wave 1", "Wave 2", "Wave 3", "Wave 4", "Wave 5", "Wave 6", "Wave 7", "parallel work",
];
/** D-413 (A7): known cross-track id collisions (the akb/Consolidated-Core
 *  D-389 vs omega D-389 collision, de-collided as OD-9). Mirrored in
 *  docs/decisions/CROSS-TRACK-REGISTRY.md — the test suite locks the two
 *  together (the D-403 doc-drift class, caught by construction). Bare
 *  citations of these ids warn (report-only) from the generated era on. */
export const KNOWN_TRACK_COLLISIONS: Record<string, number[]> = { akb: [389] };
export const LEGAL_CLASSES: string[] = ["evidence", "directive"];
const REQUIRED_SECTIONS = ["Status", "Context", "Options", "Decision", "Consequences", "Evidence"];
const LEGAL_STATUSES = ["PROPOSED", "RATIFIED", "SUPERSEDED", "REJECTED"];
/** Case-insensitive on purpose: the index-row status parser uppercases the
 *  whole line, so lowercase status words trap just as hard (the D-410 bite). */
export const STATUS_WORD_RE = /\b(PROPOSED|RATIFIED|SUPERSEDED|REJECTED)\b/i;

export interface IndexRow { n: number; status: string; line: number; raw: string }
/** D-413 (A1): the `## Index` section — the generated row's single source. */
export interface IndexMeta { summary: string; rationale: string; class: string }
export interface RecordDoc {
  n: number; file: string; sections: string[]; status: string;
  optionsText: string; decisionLine: string; evidenceText: string; raw: string;
  indexMeta: IndexMeta | null; // the ## Index section, when present
  blocks: string | null;       // the `Blocks:` line, when present (A4)
}

/** Parse `| **D-NNN** | … | STATUS | … |` rows from BUILD-DECISIONS.md. */
export function parseIndexRows(text: string): IndexRow[] {
  const out: IndexRow[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const m = /\|\s*\*\*D-(\d+)\*\*/.exec(line);
    if (!m) return;
    // word match, not exact cell: old rows carry notes ("RATIFIED (owner directive, …)")
    const s = /\b(PROPOSED|RATIFIED|SUPERSEDED|REJECTED)\b/.exec(line.toUpperCase());
    out.push({ n: Number(m[1]), status: s ? s[1] : "", line: i + 1, raw: line });
  });
  return out;
}

/** Parse the `## Index` section body (D-413): `summary:` / `rationale:` /
 *  `class:` lines. Null when the section is absent; empty strings when a line
 *  is missing (the validator names it). */
export function parseIndexMeta(body: string | undefined): IndexMeta | null {
  if (body === undefined) return null;
  return {
    summary: /^summary:\s*(.+?)\s*$/m.exec(body)?.[1] ?? "",
    rationale: /^rationale:\s*(.+?)\s*$/m.exec(body)?.[1] ?? "",
    class: (/^class:\s*(.+?)\s*$/m.exec(body)?.[1] ?? "").trim().toLowerCase(),
  };
}

/** D-413 (A1): the one true spelling of a generated-era index row. The checker
 *  requires byte-equality, the writer regenerates it, the scaffold appends it —
 *  one derivation, N surfaces (MAC-05). */
export function generateIndexRow(n: number, status: string, meta: IndexMeta, file: string): string {
  return `| **D-${n}** | ${meta.summary} Detail: docs/decisions/${file} | **${status}** · ${meta.class} | ${meta.rationale} |`;
}

/** Split a record into its ## sections (order-sensitive, first occurrence wins). */
export function parseRecord(n: number, file: string, text: string): RecordDoc {
  const sections: string[] = [];
  const bodies = new Map<string, string>();
  const re = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  const bounds: Array<{ name: string; start: number }> = [];
  while ((m = re.exec(text)) !== null) bounds.push({ name: m[1].trim(), start: m.index + m[0].length });
  bounds.forEach((b, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1].start : text.length;
    // cut the next header line itself off the end
    const rawBody = text.slice(b.start, end).replace(/^##\s+.+?$/m, "").trim();
    if (!sections.includes(b.name)) {
      sections.push(b.name);
      bodies.set(b.name, rawBody);
    }
  });
  const statusBody = (bodies.get("Status") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    n, file, sections,
    status: (statusBody[0] ?? "").replace(/\*/g, "").trim().toUpperCase(),
    optionsText: bodies.get("Options") ?? "",
    decisionLine: (bodies.get("Decision") ?? "").split("\n").map((l) => l.trim()).find((l) => l.startsWith("**Decision:**")) ?? "",
    evidenceText: bodies.get("Evidence") ?? "",
    raw: text,
    indexMeta: parseIndexMeta(bodies.get("Index")),
    blocks: /^Blocks:\s*(.+?)\s*$/m.exec(text)?.[1] ?? null,
  };
}

/** Shape rules for one record. shaExists is injected (git in prod, stub in tests). */
export function validateRecord(doc: RecordDoc, shaExists: (sha: string) => boolean): string[] {
  const issues: string[] = [];
  const at = `${doc.file}`;
  for (const s of REQUIRED_SECTIONS) {
    if (!doc.sections.includes(s)) issues.push(`${at}: missing ## ${s} section`);
  }
  const order = doc.sections.filter((s) => REQUIRED_SECTIONS.includes(s));
  if (JSON.stringify(order) !== JSON.stringify(REQUIRED_SECTIONS)) {
    issues.push(`${at}: sections out of order (want ${REQUIRED_SECTIONS.join(" → ")}, got ${order.join(" → ") || "none"})`);
  }
  if (!LEGAL_STATUSES.includes(doc.status)) {
    issues.push(`${at}: illegal status "${doc.status}" (want one of ${LEGAL_STATUSES.join("|")})`);
    return issues;
  }
  if (!/^\s*\|/m.test(doc.optionsText)) issues.push(`${at}: ## Options has no matrix table (| … |)`);
  if (doc.decisionLine.length === 0) {
    issues.push(`${at}: ## Decision has no **Decision:** line`);
  } else {
    const body = doc.decisionLine.replace(/^\*\*Decision:\*\*/, "").trim();
    if (body.length === 0) issues.push(`${at}: **Decision:** names nothing`);
    if (/\bTBD\b/.test(body) && doc.status !== "PROPOSED") {
      issues.push(`${at}: TBD decision is only legal while PROPOSED`);
    }
    for (const opt of body.match(/\(([A-Za-z0-9]+)\)/g) ?? []) {
      const token = opt.slice(1, -1);
      if (!doc.optionsText.includes(`(${token})`)) {
        issues.push(`${at}: Decision names option "(${token})" absent from the Options matrix`);
      }
    }
  }
  if (doc.status === "SUPERSEDED" && !/superseded-by|supersedes/i.test(doc.raw)) {
    issues.push(`${at}: SUPERSEDED requires a Superseded-By/Supersedes pointer`);
  }
  if (doc.evidenceText.trim().length === 0) issues.push(`${at}: ## Evidence is empty`);
  // D-413 (A1) — the generated-row era: ## Index is the row's single source.
  if (doc.n >= GENERATED_FROM) {
    if (!doc.indexMeta) {
      issues.push(`${at}: missing ## Index section (required from D-${GENERATED_FROM}: summary:/rationale:/class: lines — omega:new-decision emits it)`);
    } else {
      if (!doc.indexMeta.summary || !doc.indexMeta.rationale) {
        issues.push(`${at}: ## Index needs non-empty summary: and rationale: lines (the row's Decision and Rationale cells)`);
      }
      if (!LEGAL_CLASSES.includes(doc.indexMeta.class)) {
        issues.push(`${at}: ## Index class "${doc.indexMeta.class}" illegal (want ${LEGAL_CLASSES.join(" | ")})`);
      }
      const flat = `${doc.indexMeta.summary} ${doc.indexMeta.rationale}`;
      if (STATUS_WORD_RE.test(flat)) {
        issues.push(`${at}: ## Index summary/rationale must not contain status words (${LEGAL_STATUSES.join("|")}) — the index first-word trap class (the D-410 bite)`);
      }
      if (flat.includes("|")) {
        issues.push(`${at}: ## Index summary/rationale must not contain "|" — it would break the generated row`);
      }
    }
  }
  // D-413 (A4) — the Blocks line, vocabulary-checked when present.
  if (doc.blocks !== null && !BLOCKS_VOCAB.includes(doc.blocks)) {
    issues.push(`${at}: Blocks "${doc.blocks}" outside the vocabulary (${BLOCKS_VOCAB.join(" | ")})`);
  }
  if (doc.status === "RATIFIED") {
    const shas = doc.evidenceText.match(/\b[0-9a-f]{7,40}\b/g) ?? [];
    if (!shas.some((s) => { try { return shaExists(s); } catch { return false; } })) {
      issues.push(`${at}: RATIFIED with no resolvable commit SHA in ## Evidence`);
    }
  }
  return issues;
}

/** D-413 (A7): report-only — bare citations of ids in the known collision set
 *  must be track-qualified from the generated era on. Grandfathered before;
 *  never fails the gate (warnings, not issues). The lookbehind excludes the
 *  qualified spellings (akb:D-389, omega:D-389) — only bare D-389 bites. */
export function scanTrackCollisions(doc: RecordDoc): string[] {
  if (doc.n < GENERATED_FROM) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of doc.raw.matchAll(/(?<!:)\bD-(\d+)\b/g)) {
    const cited = Number(m[1]);
    for (const [track, ids] of Object.entries(KNOWN_TRACK_COLLISIONS)) {
      if (!ids.includes(cited)) continue;
      const key = `${track}:${cited}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`D-${doc.n}: bare citation "D-${cited}" collides with ${track}:D-${cited} — track-qualify it (omega:D-${cited} or ${track}:D-${cited}); registry: docs/decisions/CROSS-TRACK-REGISTRY.md`);
    }
  }
  return out;
}

export interface DecisionsResult { ok: boolean; detail: Record<string, unknown>; issues: string[]; warnings: string[] }

function defaultShaExists(root: string): (sha: string) => boolean {
  return (sha: string) => {
    const p = spawnSync(["git", "cat-file", "-t", sha], { cwd: root });
    return p.exitCode === 0 && p.stdout.toString().trim() === "commit";
  };
}

/** Full contract check over a repo root. */
export async function checkDecisions(
  root: string,
  opts: { shaExists?: (sha: string) => boolean } = {},
): Promise<DecisionsResult> {
  const issues: string[] = [];
  const shaExists = opts.shaExists ?? defaultShaExists(root);
  const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
  const rows = parseIndexRows(indexText);
  const seen = new Map<number, number>();
  for (const r of rows) {
    if (seen.has(r.n)) issues.push(`BUILD-DECISIONS.md: duplicate D-${r.n} (lines ${seen.get(r.n)} and ${r.line})`);
    else seen.set(r.n, r.line);
    if (r.status === "") issues.push(`BUILD-DECISIONS.md:${r.line}: D-${r.n} has no recognizable status`);
    // D-364: new rows declare their class — evidence (backed by a probe/test falsifier)
    // or directive (owner call). Makes "how many RATIFIED rows survive a falsifier" auditable at a glance.
    if (r.n >= DECISION_CLASS_FROM && !/\b(evidence|directive)\b/i.test(r.raw)) {
      issues.push(`BUILD-DECISIONS.md:${r.line}: D-${r.n} carries no class tag (want "· evidence" or "· directive" in the status cell)`);
    }
  }
  const dir = join(root, "docs/decisions");
  const files = readdirSync(dir).filter((f) => /^D-\d+-.+\.md$/.test(f) && f !== "README.md");
  const byId = new Map<number, string[]>();
  for (const f of files) {
    const n = Number(/^D-(\d+)-/.exec(f)![1]);
    if (n < GRANDFATHER_BELOW) {
      issues.push(`docs/decisions/${f}: detail files below D-${GRANDFATHER_BELOW} are outside the contract (index-only era)`);
      continue;
    }
    byId.set(n, [...(byId.get(n) ?? []), f]);
  }
  let ratified = 0;
  const warnings: string[] = [];
  for (const [n, fs] of byId) {
    if (fs.length > 1) issues.push(`D-${n}: ${fs.length} record files (${fs.join(", ")}) — exactly one per decision`);
    const doc = parseRecord(n, `docs/decisions/${fs[0]}`, readFileSync(join(dir, fs[0]), "utf-8"));
    issues.push(...validateRecord(doc, shaExists));
    const row = rows.find((r) => r.n === n);
    if (!row) {
      issues.push(`D-${n}: record file with no BUILD-DECISIONS.md index row`);
    } else {
      if (row.status !== doc.status) issues.push(`D-${n}: status mismatch (index ${row.status || "?"}, record ${doc.status})`);
      // D-413 (A1): generated-era rows are byte-exact derivations of the record.
      if (n >= GENERATED_FROM && doc.indexMeta && row.raw !== generateIndexRow(n, doc.status, doc.indexMeta, fs[0])) {
        issues.push(`D-${n}: index row is not the generated row — regenerate (bun run omega:questions --write); hand-editing generated-era rows is unexpressible by design`);
      }
    }
    if (doc.status === "RATIFIED") ratified++;
    warnings.push(...scanTrackCollisions(doc));
  }
  for (const r of rows) {
    if (r.n >= GRANDFATHER_BELOW && !byId.has(r.n)) {
      issues.push(`D-${r.n}: index row with no docs/decisions/D-${r.n}-*.md record file`);
    }
  }
  const detail: Record<string, unknown> = { rows: rows.length, records: byId.size, ratified, grandfatherBelow: GRANDFATHER_BELOW, generatedFrom: GENERATED_FROM, trackWarnings: warnings.length };
  try {
    detail.openQuestions = summarizeOpenQuestions(root);
  } catch { /* board summary is informational — never fails the contract check */ }
  return { ok: issues.length === 0, detail, issues, warnings };
}

// ---- open-questions board (team surface over PROPOSED records) ----

/** The Decision body, joined across continuation lines: the first `**Decision:**`
 *  line plus following prose lines (stops at blank / header / table / list /
 *  code-fence). Single-line decisions (the common case) are unaffected — this
 *  only repairs multi-line bodies (e.g. D-372) that the board used to truncate. */
export function decisionBody(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim().startsWith("**Decision:**"));
  if (at === -1) return "";
  const first = lines[at].trim().replace(/^\*\*Decision:\*\*/, "").trim();
  const rest: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#") || t.startsWith("|") || t.startsWith("-") || t.startsWith("```") || t.startsWith(">")) break;
    rest.push(t);
  }
  return [first, ...rest].join(" ").replace(/\s+/g, " ").trim();
}

export interface OpenQuestion {
  n: number;
  file: string;        // repo-relative record path
  title: string;       // record `#` heading
  recommended: string; // Decision-line body (may contain TBD)
  hasTbd: boolean;     // semantically open, not just unconfirmed
  awaiting: string;    // who acts next
  blocks: string;      // the Blocks: line, "none" when absent (D-413, A4)
}

/** Pure core of the board (D-413): PROPOSED records → open questions, sorted
 *  blocking-first then D-number — the program's true serialization (owner
 *  attention on blockers) sorts to the top. */
export function computeOpenQuestions(items: Array<{ n: number; file: string; text: string }>): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  for (const it of items) {
    const doc = parseRecord(it.n, it.file, it.text);
    if (doc.status !== "PROPOSED") continue;
    const titleLine = it.text.split("\n").find((l) => l.startsWith("# ")) ?? `# D-${it.n}`;
    const recommended = decisionBody(it.text) || "(no Decision line — record invalid, see gate)";
    const hasTbd = /\bTBD\b/.test(recommended);
    out.push({
      n: it.n, file: it.file, title: titleLine.replace(/^#\s*/, ""), recommended, hasTbd,
      blocks: doc.blocks ?? "none",
      awaiting: hasTbd ? "Owner decision — TBD open" : "Owner confirmation",
    });
  }
  return out.sort((a, b) => (a.blocks === "none" ? 1 : 0) - (b.blocks === "none" ? 1 : 0) || a.n - b.n);
}

/** Every PROPOSED record is an open question by definition. Blocking-first, then D-number (D-413, A4). */
export function listOpenQuestions(root: string): OpenQuestion[] {
  const dir = join(root, "docs/decisions");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^D-\d+-.+\.md$/.test(f));
  } catch {
    return [];
  }
  const items: Array<{ n: number; file: string; text: string }> = [];
  for (const f of files) {
    const n = Number(/^D-(\d+)-/.exec(f)![1]);
    if (n < GRANDFATHER_BELOW) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, f), "utf-8");
    } catch {
      continue;
    }
    items.push({ n, file: `docs/decisions/${f}`, text });
  }
  return computeOpenQuestions(items);
}

function headSha(root: string): string {
  try {
    const p = spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
    const sha = p.exitCode === 0 ? p.stdout.toString().trim() : "";
    return /^[0-9a-f]{7,40}$/.test(sha) ? sha : "unknown";
  } catch {
    return "unknown";
  }
}

/** Board freshness vs HEAD: "fresh" | "stale" | "missing" (informational only).
 *  Fresh means the marker is an ancestor of HEAD AND no decision inputs changed
 *  since (board content would regenerate byte-identical modulo its header) —
 *  so committing the board itself never marks it stale. */
export function boardFreshness(root: string): { state: "fresh" | "stale" | "missing"; base: string; head: string } {
  const head = headSha(root);
  let base = "";
  try {
    const text = readFileSync(join(root, "docs/decisions/OPEN-QUESTIONS.md"), "utf-8");
    // the writer emits `<!-- base: <sha> generated: … -->` — the sha is the
    // anchored part; everything after it is presentation (the reader used to
    // demand `-->` immediately after the sha, which the writer never wrote).
    base = /<!--\s*base:\s*([0-9a-f]{7,40})/.exec(text)?.[1] ?? "";
  } catch {
    return { state: "missing", base: "", head };
  }
  if (base === "" || head === "unknown") return { state: "stale", base, head };
  try {
    const ancestor = spawnSync(["git", "merge-base", "--is-ancestor", base, "HEAD"], { cwd: root });
    if (ancestor.exitCode !== 0) return { state: "stale", base, head };
    const committed = spawnSync(
      ["git", "diff", "--quiet", `${base}..HEAD`, "--",
        "docs/decisions", "docs/BUILD-DECISIONS.md", ":(exclude)docs/decisions/OPEN-QUESTIONS.md"],
      { cwd: root },
    );
    if (committed.exitCode !== 0) return { state: "stale", base, head };
    // uncommitted worktree edits to decision inputs also stale the board
    const worktree = spawnSync(["git", "status", "--porcelain", "--", "docs/decisions", "docs/BUILD-DECISIONS.md"], { cwd: root });
    const dirty = worktree.exitCode === 0
      ? worktree.stdout.toString().split("\n").some((l) => l.trim() && !l.endsWith("OPEN-QUESTIONS.md"))
      : true;
    return { state: dirty ? "stale" : "fresh", base, head };
  } catch {
    return { state: "stale", base, head };
  }
}

function summarizeOpenQuestions(root: string): { count: number; ids: number[]; board: string } {
  const qs = listOpenQuestions(root);
  const fresh = boardFreshness(root);
  return { count: qs.length, ids: qs.map((q) => q.n), board: fresh.state };
}

/** Render the team board. Generated file — do not hand-edit (see header). */
export function renderOpenQuestionsBoard(root: string, baseSha: string, generatedAt: string): string {
  const qs = listOpenQuestions(root);
  const rows = qs.map((q) => {
    const short = q.title.replace(/^D-\d+\s*[—–-]\s*/, ""); // ID has its own column
    return `| **D-${q.n}** | ${short} | ${q.recommended} | ${q.blocks} | ${q.awaiting} | [record](${q.file.split("/").pop()}) |`;
  });
  return `# Open Questions (decision backlog)

<!-- base: ${baseSha} generated: ${generatedAt} — generated by \`bun run omega:questions --write\`. Do not hand-edit; edit the records, regenerate. -->

${qs.length === 0
    ? "No open questions. Every decision record is RATIFIED, SUPERSEDED, or REJECTED."
    : `_${qs.length} PROPOSED decision${qs.length === 1 ? "" : "s"} awaiting owner calls. Each row links to its record — the matrix, criteria, and evidence live there, not here._`}

| ID | Question | Recommended position | Blocks | Awaiting | Record |
|---|---|---|---|---|---|
${rows.join("\n")}

## How to propose (team workflow)

1. Pick a row and read its record (Options matrix first — propose *against* the criteria, not past them).
2. To argue an option: reply in the PR/discussion citing the record's criteria by name. New evidence goes under the record's domain (vault refs, gate runs, benchmarks).
3. To change the matrix itself (new option, new criterion): edit the record file in a branch so the gate's decisions stage validates the shape, then regenerate this board (\`bun run omega:questions --write\`) in the same branch.
4. Ratification flips Status + index row together, with evidence (commit SHA) — the checker enforces it; no drive-by RATIFIEDs.
`;
}

/** D-413 (A1): the --write path for docs/BUILD-DECISIONS.md — regenerate every
 *  generated-era row from its record (replace drifted ones, append missing ones
 *  in D-order after the last row). Hand-era rows are returned byte-verbatim —
 *  the append-only discipline is preserved by construction. Pure:
 *  (indexText, docs) -> { text, changed, appended }; byte-stable when clean. */
export function regenerateIndexRows(
  indexText: string,
  docs: Array<{ n: number; file: string; doc: RecordDoc }>,
): { text: string; changed: number; appended: number } {
  const gen = docs
    .filter((d) => d.n >= GENERATED_FROM && d.doc.indexMeta)
    .sort((a, b) => a.n - b.n);
  if (gen.length === 0) return { text: indexText, changed: 0, appended: 0 };
  const rows = parseIndexRows(indexText);
  const lines = indexText.split("\n");
  let lastRowLine = rows.reduce((m, r) => Math.max(m, r.line), 0);
  let changed = 0;
  let appended = 0;
  for (const d of gen) {
    const generated = generateIndexRow(d.n, d.doc.status, d.doc.indexMeta!, d.file);
    const existing = rows.find((r) => r.n === d.n);
    if (existing) {
      if (lines[existing.line - 1] !== generated) {
        lines[existing.line - 1] = generated;
        changed++;
      }
    } else if (lastRowLine > 0) {
      lines.splice(lastRowLine, 0, generated); // right after the last row, D-order
      lastRowLine += 1;
      appended++;
    } else {
      lines.push(generated); // degenerate: an index with no rows at all
      appended++;
    }
  }
  if (changed === 0 && appended === 0) return { text: indexText, changed: 0, appended: 0 };
  return { text: lines.join("\n"), changed, appended };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  if (process.argv.includes("--write")) {
    const head = headSha(root);
    // D-413 (A1): regenerate the generated-era index rows from the records
    // first, then the board — one command, one derivation (MAC-05).
    const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
    const dir = join(root, "docs/decisions");
    const docs = readdirSync(dir)
      .filter((f) => /^D-\d+-.+\.md$/.test(f))
      .map((f) => {
        const n = Number(/^D-(\d+)-/.exec(f)![1]);
        return { n, file: f, doc: parseRecord(n, f, readFileSync(join(dir, f), "utf-8")) };
      });
    const regen = regenerateIndexRows(indexText, docs);
    if (regen.changed > 0 || regen.appended > 0) {
      writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), regen.text);
    }
    const md = renderOpenQuestionsBoard(root, head, new Date().toISOString());
    const dest = join(root, "docs/decisions/OPEN-QUESTIONS.md");
    writeFileSync(dest, md);
    const n = listOpenQuestions(root).length;
    console.log(`wrote docs/decisions/OPEN-QUESTIONS.md (${n} open, base ${head}); index rows: ${regen.changed} regenerated, ${regen.appended} appended`);
  } else {
    checkDecisions(root).then((r) => {
      if (r.warnings.length > 0) {
        console.log("warnings (report-only, D-413 A7 — cross-track citations):");
        for (const w of r.warnings) console.log(`  - ${w}`);
      }
      console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
      process.exit(r.ok ? 0 : 1);
    });
  }
}
