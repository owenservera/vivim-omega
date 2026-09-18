// tooling/harvest — triage-split.ts (W1 task 4: the triage splitter tool)
//
// Subsystem row → capability-boundary rows: the mechanical splitter that
// turns ONE triage ledger subsystem row (a file inventory + the FACT-BASE §6
// harvest class) into PROPOSED ledger patch rows at ONE-OP-ONE-SURFACE
// granularity (W1 spec task 4).
//
// Discipline (the whole point):
//   * the tool is MECHANICAL: boundaries come from the caller's descriptor
//     (files × landing zone per the HARVEST-PATTERN shape guide); the tool
//     enforces completeness (every file lands in exactly one row), the
//     one-op-one-surface shape (each row names exactly one capability
//     boundary = one op), and deterministic output (same descriptor →
//     byte-identical patch);
//   * the output is a LEDGER PATCH (markdown rows under a PROPOSED header),
//     NEVER a verdict change — verdicts change only when a reviewer applies
//     the patch with a reason a reviewer can check (TRIAGE-LEDGER.md rule);
//   * the tool never writes the ledger file itself.
import { readFileSync } from "node:fs";
import { canonicalJson } from "./fixture-import.ts";

// ---- descriptor --------------------------------------------------------------

export interface SubsystemDescriptor {
  tNumber: string;            // "T-06" — the ledger row the patch proposes against
  subsystem: string;          // human label, e.g. "Browser primitives + CDP proxy"
  mine: string;               // pinned mine, e.g. "vivim-final-program@4a5eb84"
  wave: string;               // the wave the harvested boundaries land in
  boundaries: BoundaryDescriptor[];
}

export interface BoundaryDescriptor {
  op: string;                 // the ONE capability boundary: one op name, e.g. "cdp.attach"
  files: string[];            // mine files that realize this boundary (paths in the pinned tree)
  landing: string;            // omega landing zone per the shape guide, e.g. "provider-browser sessions-by-reference"
  harvestClass: "DATA" | "ALGORITHM" | "SPLIT" | "SELECTIVE" | "PATTERN" | "SHAPED" | "CONTRACT" | "REMOVE";
  note?: string;              // one-line reviewer-checkable reason
}

// ---- validation (fail-closed) --------------------------------------------------

function validate(d: SubsystemDescriptor): string[] {
  const problems: string[] = [];
  if (!/^T-\d+$/.test(d.tNumber)) problems.push(`tNumber ${JSON.stringify(d.tNumber)} must be a ledger row id (T-<n>)`);
  if (d.subsystem.trim().length === 0) problems.push("subsystem must be a non-empty label");
  if (!d.mine.includes("@")) problems.push(`mine ${JSON.stringify(d.mine)} must be <repo>@<pinned-sha> (W0-9a pins the mines)`);
  if (d.wave.trim().length === 0) problems.push("wave must be named (the patch must be assignable)");
  if (!Array.isArray(d.boundaries) || d.boundaries.length === 0) problems.push("boundaries must be a non-empty array (one descriptor per capability boundary)");
  const seenFiles = new Map<string, string>();
  d.boundaries.forEach((b, i) => {
    const tag = `boundaries[${i}]`;
    if (!/^[a-z][a-z0-9.:-]*$/.test(b.op)) problems.push(`${tag}.op ${JSON.stringify(b.op)} must be one bare op-ish token (lowercase, dots/colons/dashes)`);
    if (!Array.isArray(b.files) || b.files.length === 0) problems.push(`${tag}.files must list at least one mine file (a boundary with no files is a guess, not a harvest)`);
    for (const f of b.files ?? []) {
      const owner = seenFiles.get(f);
      if (owner !== undefined) problems.push(`${tag}: file ${f} already claimed by boundary ${JSON.stringify(owner)} — a file lands in exactly ONE boundary (one op = one surface)`);
      seenFiles.set(f, b.op);
    }
    if (b.landing.trim().length === 0) problems.push(`${tag}.landing must name the omega landing zone (the shape guide)`);
    const classes = ["DATA", "ALGORITHM", "SPLIT", "SELECTIVE", "PATTERN", "SHAPED", "CONTRACT", "REMOVE"];
    if (!(classes as string[]).includes(b.harvestClass)) problems.push(`${tag}.harvestClass ${JSON.stringify(b.harvestClass)} must be one of ${classes.join("|")} (FACT-BASE §6 classes)`);
  });
  return problems;
}

// ---- the splitter ----------------------------------------------------------------

export interface SplitRow {
  rowId: string;      // "T-06.1" — the proposed sub-row
  op: string;
  files: string[];
  landing: string;
  harvestClass: string;
  wave: string;
  note?: string;
}

/** Split a subsystem descriptor into proposed capability-boundary rows.
 *  Throws (fail-closed) on any descriptor problem; deterministic ordering:
 *  rows in descriptor order, files sorted within a row. */
export function splitSubsystem(d: SubsystemDescriptor): SplitRow[] {
  const problems = validate(d);
  if (problems.length > 0) {
    throw new Error(`triage-split: descriptor for ${d.tNumber} refused —\n  ` + problems.join("\n  "));
  }
  return d.boundaries.map((b, i) => ({
    rowId: `${d.tNumber}.${i + 1}`,
    op: b.op,
    files: [...b.files].sort(),
    landing: b.landing,
    harvestClass: b.harvestClass,
    wave: d.wave,
    note: b.note,
  }));
}

/** Render the LEDGER PATCH: markdown rows under a PROPOSED header, ready for
 *  a reviewer to apply to 30-TRIAGE/TRIAGE-LEDGER.md with reasons. Never
 *  writes anything — the caller (or the CLI) shows it. */
export function renderPatch(d: SubsystemDescriptor): string {
  const rows = splitSubsystem(d);
  const lines: string[] = [];
  lines.push(`<!-- PROPOSED ledger patch — generated by tooling/harvest triage-split (mechanical; apply with a reviewer-checkable reason or discard) -->`);
  lines.push(`<!-- descriptor: ${canonicalJson(d).trimEnd().replace(/\n/g, " ")} -->`);
  lines.push(``);
  lines.push(`### ${d.tNumber} split — ${d.subsystem} (mine ${d.mine})`);
  lines.push(``);
  lines.push(`| # | Capability boundary (one op = one surface) | Mine files (pinned ${d.mine.split("@")[1] ?? ""}) | Omega landing | Class | Wave |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    const files = r.files.length > 0 ? r.files.join(", ") : "—";
    lines.push(`| ${r.rowId} | \`${r.op}\` | ${files} | ${r.landing} | ${r.harvestClass} | ${r.wave} |`);
  }
  if (rows.some((r) => r.note)) {
    lines.push(``);
    lines.push(`Notes (reviewer-checkable):`);
    for (const r of rows) if (r.note) lines.push(`- ${r.rowId}: ${r.note}`);
  }
  lines.push(``);
  return lines.join("\n");
}

// ---- CLI -------------------------------------------------------------------------

function main(argv: string[]): number {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file || argv.includes("--help")) {
    console.error("usage: bun run omega:triage:split -- <descriptor.json>   (stdout = the PROPOSED ledger patch)");
    return file ? 0 : 2;
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (e) {
    console.error(`triage-split: cannot read descriptor: ${String(e)}`);
    return 1;
  }
  try {
    const d = JSON.parse(raw) as SubsystemDescriptor;
    process.stdout.write(renderPatch(d));
    return 0;
  } catch (e) {
    console.error(String(e));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
