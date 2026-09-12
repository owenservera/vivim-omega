// tooling/gates/decisions.ts — the Decision Contract checker (docs/decisions/README.md).
// Validates index ↔ record consistency and record shape. Pure functions below are
// unit-tested (tooling/gates/test/decisions.test.ts); checkDecisions() is the gate
// entry (wired as the `decisions` stage of omega:gate) and the standalone runner
// (`bun run omega:decisions`). Fast: file reads + regex + git cat-file only.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const GRANDFATHER_BELOW = 313; // index rows below this are the index-only era (exempt from file rules)
const REQUIRED_SECTIONS = ["Status", "Context", "Options", "Decision", "Consequences", "Evidence"];
const LEGAL_STATUSES = ["PROPOSED", "RATIFIED", "SUPERSEDED", "REJECTED"];

export interface IndexRow { n: number; status: string; line: number }
export interface RecordDoc {
  n: number; file: string; sections: string[]; status: string;
  optionsText: string; decisionLine: string; evidenceText: string; raw: string;
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
    out.push({ n: Number(m[1]), status: s ? s[1] : "", line: i + 1 });
  });
  return out;
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
  if (doc.status === "RATIFIED") {
    const shas = doc.evidenceText.match(/\b[0-9a-f]{7,40}\b/g) ?? [];
    if (!shas.some((s) => { try { return shaExists(s); } catch { return false; } })) {
      issues.push(`${at}: RATIFIED with no resolvable commit SHA in ## Evidence`);
    }
  }
  return issues;
}

export interface DecisionsResult { ok: boolean; detail: Record<string, unknown>; issues: string[] }

function defaultShaExists(root: string): (sha: string) => boolean {
  return (sha: string) => {
    const p = Bun.spawnSync(["git", "cat-file", "-t", sha], { cwd: root });
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
  for (const [n, fs] of byId) {
    if (fs.length > 1) issues.push(`D-${n}: ${fs.length} record files (${fs.join(", ")}) — exactly one per decision`);
    const doc = parseRecord(n, `docs/decisions/${fs[0]}`, readFileSync(join(dir, fs[0]), "utf-8"));
    issues.push(...validateRecord(doc, shaExists));
    const row = rows.find((r) => r.n === n);
    if (!row) {
      issues.push(`D-${n}: record file with no BUILD-DECISIONS.md index row`);
    } else if (row.status !== doc.status) {
      issues.push(`D-${n}: status mismatch (index ${row.status || "?"}, record ${doc.status})`);
    }
    if (doc.status === "RATIFIED") ratified++;
  }
  for (const r of rows) {
    if (r.n >= GRANDFATHER_BELOW && !byId.has(r.n)) {
      issues.push(`D-${r.n}: index row with no docs/decisions/D-${r.n}-*.md record file`);
    }
  }
  const detail = { rows: rows.length, records: byId.size, ratified, grandfatherBelow: GRANDFATHER_BELOW };
  return { ok: issues.length === 0, detail, issues };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  checkDecisions(root).then((r) => {
    console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
