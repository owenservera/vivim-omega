// tooling/gates/failures.ts — D-422 (A14): the gate's failure transport.
// One line per failing check — name, truncated detail, and the STAGE_DOCS
// rule pointer (explain.ts already holds the rule map; this wires it into
// the failure line instead of leaving it behind --explain). Kills B11 from
// the efficiency audit: one expect-diff used to arrive embedded in ~86 KB of
// passing-suite noise; now it arrives as one line naming its rule.
//
// Separate module (not in gate.ts) so unit tests can import it without
// running the gate (gate.ts has no import guard — importing it executes).
// Pure: no fs, no git, no process — bytes in, bytes out.
import { STAGE_DOCS } from "./explain.ts";

/** The stage's rule pointer, or "" when the stage is undocumented. */
export function ruleFor(stage: string): string {
  return STAGE_DOCS[stage]?.rule ?? "";
}

/** One failure line: `✗ <name>: <detail ≤200> — rule: <pointer>`. The rule
 *  pointer is the next action's input (what the check scans, where the law
 *  lives) — the reader should never need a second tool to know why. */
export function renderFailureLine(name: string, detail: string): string {
  const rule = ruleFor(name);
  const d = detail.replace(/\s+/g, " ").trim().slice(0, 200);
  return `✗ ${name}: ${d}${rule ? ` — rule: ${rule}` : ""}`;
}

/** All failure lines over a checks map ({ [name]: { ok, detail } }), in
 *  insertion order — the --failures-only transport. Passes and skips render
 *  nothing: a green stage costs zero lines (B11's whole point). */
export function renderFailureLines(
  checks: Record<string, { ok?: boolean; detail?: unknown; skipped?: boolean }>,
): string[] {
  const out: string[] = [];
  for (const [name, c] of Object.entries(checks)) {
    if (c && c.ok === false) out.push(renderFailureLine(name, String(c.detail ?? "")));
  }
  return out;
}

/** The --stage value parser: comma-separated non-empty tokens (test-path
 *  substrings). Refuses empty/garbage loudly — a silent empty filter would
 *  run zero tests and report a vacuous green, the one failure mode this
 *  flag must never have. */
export function parseStageFilter(v: string | undefined): string[] {
  if (v === undefined || v.trim() === "") {
    throw new Error("refused: --stage needs a comma-separated list of test-path substrings (e.g. --stage v1-substrate-sweep,decisions)");
  }
  const toks = v.split(",").map((t) => t.trim()).filter(Boolean);
  if (toks.length === 0) throw new Error("refused: --stage needs at least one non-empty token");
  return toks;
}
