// tooling/gates/brief.ts — D-422 (A13): the record/doc brief tool.
// The reader's transport, bounded by construction — the efficiency audit
// (docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md §2) measured ~418 KB of
// full-file reads for ~6 KB of decision payload (B12); this tool is the fix.
//
//   omega:brief D-418                      → a ≤40-line record brief: status,
//                                            class, blocks, supersession
//                                            pointers, the generated Index
//                                            meta, falsifier file pointers,
//                                            option letters, the decision line
//   omega:brief --doc <path> --section "28" [--row 3] [--max-lines N]
//                                          → the named section of any doc
//                                            (heading substring match), or its
//                                            Nth table row — every line
//                                            prefixed path:line so the agent
//                                            can jump
//   omega:brief --since <bundle|rev>       → what changed since a bundle cut:
//                                            the commits, files grouped, and
//                                            every record whose Status moved
//
// Read-only by construction: no write path exists in this file. Output is
// line-capped with an honest tail (narrow the ask) — a brief that silently
// truncates a decision would be worse than no brief.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { parseRecord } from "./decisions.ts";

const ROOT = join(import.meta.dir, "../..");
const RECORD_LINE_CAP = 40;
const SECTION_DEFAULT_MAX = 60;

function sh(cmd: string[], cwd = ROOT): { code: number; out: string } {
  const p = nodeSpawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "buffer" });
  return { code: p.status ?? 1, out: `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}` };
}

function clip(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
}

/** The repo-relative spelling of a path (briefs cite repo-relative, always). */
function rel(p: string): string {
  return isAbsolute(p) ? relative(ROOT, p) : p;
}

// ---- A13 · the record brief ----

export function findRecordFile(root: string, n: number): string | null {
  const dir = join(root, "docs/decisions");
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => new RegExp(`^D-${n}-.+\\.md$`).test(f));
  return hit ? join(dir, hit) : null;
}

export function parseRecordRef(ref: string): number | null {
  const m = /^D-(\d+)$/i.exec(ref.trim()) ?? /^(\d+)$/.exec(ref.trim());
  return m ? Number(m[1]) : null;
}

export function briefRecord(root: string, ref: string, cap = RECORD_LINE_CAP): string[] {
  const n = parseRecordRef(ref);
  if (n === null) throw new Error(`refused: "${ref}" is not a record ref (want D-418 or 418)`);
  const file = findRecordFile(root, n);
  if (!file) throw new Error(`refused: no record file for D-${n} (docs/decisions/D-${n}-*.md absent)`);
  const raw = readFileSync(file, "utf-8");
  const doc = parseRecord(n, `docs/decisions/${file.split("/").pop()}`, raw);
  const title = (raw.split("\n").find((l) => l.startsWith("# ")) ?? `# D-${n}`).replace(/^#\s*/, "");
  const lines: string[] = [];
  lines.push(title);
  lines.push(`  file: ${rel(file)} (${raw.split("\n").length} lines)`);
  lines.push(`  status: ${doc.status} · class: ${doc.indexMeta?.class ?? "(hand-era)"} · blocks: ${doc.blocks ?? "(absent)"}`);
  const sup = [...new Set([...raw.matchAll(/(?:Superseded\s+by|Supersedes|amended\s+by|amends)\s+\*{0,2}(D-\d+)/gi)].map((m) => m[1].toUpperCase()))].slice(0, 6);
  lines.push(`  supersedes/amends: ${sup.length ? sup.join(", ") : "(none stated)"}`);
  if (doc.indexMeta) {
    lines.push(`  summary: ${clip(doc.indexMeta.summary, 300)}`);
    lines.push(`  rationale: ${clip(doc.indexMeta.rationale, 300)}`);
  }
  const opts = [...new Set([...doc.optionsText.matchAll(/\(([a-d])\)/g)].map((m) => `(${m[1]}`))].map((s) => `${s})`);
  if (opts.length) lines.push(`  options: ${opts.join(" ")}`);
  if (doc.decisionLine) lines.push(`  decision: ${clip(doc.decisionLine.replace(/^\*\*Decision:\*\*/, ""), 240)}`);
  const falsifiers = [...new Set([...doc.evidenceText.matchAll(/[\w\-./]+\b[\w-]*\.test\.ts/g)].map((m) => m[0]))].slice(0, 6);
  if (falsifiers.length) lines.push(`  falsifiers: ${falsifiers.join(", ")}`);
  if (lines.length > cap) {
    return [...lines.slice(0, cap), `  … (+${lines.length - cap} more — narrow the ask)`];
  }
  return lines;
}

// ---- A13 · the doc section brief ----

export interface SectionHit { startLine: number; endLine: number; heading: string; level: number }

/** startLine/endLine are 1-BASED; endLine is the next same-or-higher heading's
 *  own line (exclusive body bound), or lines.length + 1 when the section runs
 *  to EOF. The body is lines.slice(startLine, endLine - 1) — i.e. everything
 *  between the two heading lines. */
export function findSection(lines: string[], ref: string): SectionHit | null {
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (!m[2].toLowerCase().includes(ref.toLowerCase())) continue;
    const level = m[1].length;
    let end = lines.length + 1;
    for (let j = i + 1; j < lines.length; j++) {
      const nm = /^(#{1,6})\s+/.exec(lines[j]);
      if (nm && nm[1].length <= level) { end = j + 1; break; }
    }
    return { startLine: i + 1, endLine: end, heading: m[2], level };
  }
  return null;
}

export function briefDocSection(root: string, docPath: string, sectionRef: string, row?: number, maxLines = SECTION_DEFAULT_MAX): string[] {
  const abs = isAbsolute(docPath) ? docPath : join(root, docPath);
  if (!existsSync(abs)) throw new Error(`refused: doc not found: ${rel(abs)}`);
  const lines = readFileSync(abs, "utf-8").split("\n");
  const hit = findSection(lines, sectionRef);
  if (!hit) throw new Error(`refused: no heading matching "${sectionRef}" in ${rel(docPath)} — try omega:brief --doc ${rel(docPath)} --headings`);
  const body = lines.slice(hit.startLine, hit.endLine - 1);
  if (row !== undefined) {
    const pipeLines = body
      .map((text, i) => ({ text, line: hit.startLine + i + 1 }))
      .filter((r) => /^\s*\|/.test(r.text) && !/^\s*\|[\s:|-]+\|?\s*$/.test(r.text));
    // the doc's own row numbering counts DATA rows: the header row (the
    // non-separator pipe line immediately before the first separator) is
    // excluded — "§28 row 3" is the doc's row 3, not the table's 3rd pipe line
    const sepIdx = body.findIndex((t) => /^\s*\|[\s:|-]+\|?\s*$/.test(t));
    const dataRows = sepIdx > 0 ? pipeLines.filter((r) => r.line !== hit.startLine + sepIdx) : pipeLines;
    if (row < 1 || row > dataRows.length) {
      throw new Error(`refused: --row ${row} out of range (the section carries ${dataRows.length} data rows)`);
    }
    const r = dataRows[row - 1];
    return [`${rel(docPath)}:${r.line}: ${r.text.trim()}`];
  }
  const out: string[] = [`${rel(docPath)}:${hit.startLine}-${hit.endLine - 1} — ${hit.heading}`];
  const bodyLines = body.slice(0, maxLines).map((text, i) => `${String(hit.startLine + i + 1).padStart(5)}| ${text}`);
  out.push(...bodyLines);
  if (body.length > maxLines) out.push(`  … (+${body.length - maxLines} more lines — raise --max-lines or narrow the section)`);
  return out;
}

export function listHeadings(root: string, docPath: string): string[] {
  const abs = isAbsolute(docPath) ? docPath : join(root, docPath);
  if (!existsSync(abs)) throw new Error(`refused: doc not found: ${rel(abs)}`);
  return readFileSync(abs, "utf-8").split("\n")
    .map((text, i) => ({ text, line: i + 1 }))
    .filter((l) => /^#{1,3}\s+/.test(l.text))
    .map((l) => `${rel(docPath)}:${l.line}: ${l.text.trim()}`);
}

// ---- A13 · --since (what changed since a bundle cut) ----

const SINCE_CAP = 40;

export function resolveSinceTip(root: string, ref: string): { tip: string; source: string } {
  const abs = isAbsolute(ref) ? ref : join(root, ref);
  if (ref.endsWith(".bundle") && existsSync(abs)) {
    const heads = sh(["git", "bundle", "list-heads", abs]);
    if (heads.code !== 0) throw new Error(`refused: git bundle list-heads failed on ${rel(abs)}`);
    const tip = heads.out.split("\n").find((l) => l.trim().endsWith(" HEAD"))?.split(/\s+/)[0] ?? "";
    if (!/^[0-9a-f]{7,64}$/.test(tip)) throw new Error(`refused: no HEAD ref resolvable in ${rel(abs)}`);
    return { tip, source: `bundle ${rel(ref)}` };
  }
  const t = sh(["git", "cat-file", "-t", ref]);
  if (t.code !== 0 || t.out.trim() !== "commit") throw new Error(`refused: "${ref}" is neither a bundle file nor a git commit`);
  return { tip: sh(["git", "rev-parse", ref]).out.trim(), source: "git rev" };
}

export function briefSince(root: string, ref: string, cap = SINCE_CAP): string[] {
  const { tip, source } = resolveSinceTip(root, ref);
  const shortTip = tip.slice(0, 7);
  const lines: string[] = [`since ${source} (tip ${shortTip}):`];
  const log = sh(["git", "log", "--oneline", "--no-decorate", `${tip}..HEAD`]).out.trim();
  const commits = log ? log.split("\n") : [];
  lines.push(`  commits: ${commits.length}`);
  for (const c of commits.slice(0, 8)) lines.push(`    ${clip(c, 150)}`);
  if (commits.length > 8) lines.push(`    … (+${commits.length - 8} more)`);
  const diff = sh(["git", "diff", "--name-status", `${tip}..HEAD`]).out.trim();
  const files = diff ? diff.split("\n").filter(Boolean) : [];
  const groups: Record<string, string[]> = { records: [], docs: [], tooling: [], other: [] };
  for (const f of files) {
    const path = f.slice(2);
    if (path.startsWith("docs/decisions/")) groups.records.push(f);
    else if (path.startsWith("docs/")) groups.docs.push(f);
    else if (path.startsWith("tooling/")) groups.tooling.push(f);
    else groups.other.push(f);
  }
  for (const [g, fs] of Object.entries(groups)) {
    if (fs.length === 0) continue;
    lines.push(`  ${g}: ${fs.length}`);
    for (const f of fs.slice(0, 10)) lines.push(`    ${f}`);
    if (fs.length > 10) lines.push(`    … (+${fs.length - 10} more)`);
  }
  // status moves: every changed record, old Status vs worktree Status
  for (const f of groups.records) {
    const path = f.slice(2);
    const oldRaw = sh(["git", "show", `${tip}:${path}`]).out;
    const newRaw = existsSync(join(root, path)) ? readFileSync(join(root, path), "utf-8") : "";
    const st = (raw: string) => raw.split(/^##\s+Status\s*$/m)[1]?.split("\n").map((l) => l.trim()).filter(Boolean)[0]?.replace(/\*/g, "") ?? "?";
    const a = st(oldRaw);
    const b = st(newRaw);
    if (a !== b) lines.push(`  status move: ${path.split("/").pop()} ${a} → ${b}`);
  }
  if (lines.length > cap) return [...lines.slice(0, cap), `  … (+${lines.length - cap} more — narrow the ask)`];
  return lines;
}

// ---- CLI ----

function parseCli(argv: string[]) {
  const flags: Record<string, string> = {};
  const VALUELESS = new Set(["headings"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (VALUELESS.has(name) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) flags[name] = "";
      else { flags[name] = argv[i + 1]; i++; }
    }
  }
  return flags;
}

if (import.meta.main) {
  try {
    const flags = parseCli(process.argv.slice(2));
    if (flags["headings"] && flags["doc"]) {
      for (const l of listHeadings(ROOT, flags["doc"])) console.log(l);
      process.exit(0);
    }
    let lines: string[];
    if (flags["since"]) lines = briefSince(ROOT, flags["since"]);
    else if (flags["doc"]) {
      if (!flags["section"]) throw new Error('refused: --doc needs --section "<heading substring>" (or --headings to list them)');
      const row = flags["row"] !== undefined ? Number(flags["row"]) : undefined;
      if (row !== undefined && !Number.isInteger(row)) throw new Error("refused: --row must be an integer (1-based table row)");
      lines = briefDocSection(ROOT, flags["doc"], flags["section"], row, flags["max-lines"] ? Number(flags["max-lines"]) : SECTION_DEFAULT_MAX);
    } else {
      const ref = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== flags["doc"] && a !== flags["section"] && a !== flags["since"] && a !== flags["row"] && a !== flags["max-lines"]);
      if (!ref) throw new Error('refused: usage: omega:brief D-418 | --doc <path> --section <ref> [--row N] | --since <bundle|rev> | --doc <path> --headings');
      lines = briefRecord(ROOT, ref);
    }
    for (const l of lines) console.log(l);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
