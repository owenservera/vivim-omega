// tooling/portrait/posture.ts — the pure PRINCIPLES.md §1 posture parser (D-350).
//
// The posture slice of the self-portrait reads docs/PRINCIPLES.md §1 LIVE (never
// a cached copy): every invariant row the owner's law claims, with the status
// and note exactly as written. A missing file parses to [] — the honest empty
// state, never invented rows (the hub renders the absence; the record's
// provenance says where the posture came from).
//
// Pure functions: import-safe outside any worker, unit-tested directly.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One posture row, exactly as the doc states it. */
export interface PostureRow {
  id: string;
  name?: string;
  status?: string;
  note?: string;
}

/**
 * Parse the §1 posture table out of a PRINCIPLES.md text. Rows look like:
 *
 *   | I1 | Self-describing | Built | violation: any behavior described only in prose |
 *   | I7 | Single-user core, shared spaces | Deferred | (T2) — sharing machinery unbuilt |
 *
 * The parser is deliberately tolerant: cells may be empty, qualifiers like
 * "(T2)" may precede an em-dash inside a status cell, and rows outside §1 that
 * still carry an I<n> id are included (the invariant register IS the posture).
 * Anything that does not match `| I<n> | … |` is ignored.
 */
export function parsePosture(text: string): PostureRow[] {
  const rows: PostureRow[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*\|\s*I(\d+)\s*\|(.*)$/.exec(line);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    // drop the trailing cell produced by the closing pipe
    if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 1) continue;
    const row: PostureRow = { id: `I${m[1]}` };
    if (cells.length >= 1 && cells[0].length > 0) row.name = cells[0];
    if (cells.length >= 2 && cells[1].length > 0) row.status = cells[1];
    if (cells.length >= 3 && cells[2].length > 0) row.note = cells[2];
    rows.push(row);
  }
  // deterministic order: by invariant number ascending
  rows.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return rows;
}

/**
 * Read + parse the repo's docs/PRINCIPLES.md. Missing file → [] (the honest
 * empty state: this lineage has not re-created PRINCIPLES.md yet — the standing
 * request is recorded in prep/CAPABILITY-MAP.md, and the portrait says so
 * through its provenance, never through invented rows).
 */
export function readPosture(root: string): PostureRow[] {
  const path = join(root, "docs", "PRINCIPLES.md");
  if (!existsSync(path)) return [];
  try {
    return parsePosture(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}
