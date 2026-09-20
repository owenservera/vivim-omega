// tooling/gates/process.ts — D-423 (Path 1): the process self-model.
//
// The gap this closes: `vivim.mind` (Ω10, D-215) derives a WorldModel from
// EVIDENCE THE BOOTED SYSTEM PRODUCED (law.registry@1, vault rows) — it is
// falsifiable because a compartment can only ever see what a port hands it.
// The development genome (docs/decisions/*.md, build/status.json, the board,
// docscan findings, the ledger) is a DIFFERENT evidence class: repo-filesystem
// and git facts, readable only by something with host filesystem + git access.
// A compartment structurally cannot see it (import-surface, B-2) — so this is
// NOT a mind op and never will be under the current composition boundary.
// D-424 names the seam that would change that (a signed vault write); this
// record does not cross it.
//
// What THIS is: the toolchain's own self-description, consolidated into one
// derivation used by every reading tool that already exists (entry.ts,
// brief.ts) instead of each hand-rolling its own summary of "where does the
// program stand". One pure function, one shape, one place that goes stale.
//
// deriveProcessModel(root) reads, ALL through existing parsers (never a
// second parser to drift from the first):
//   - docs/decisions/*.md + docs/BUILD-DECISIONS.md  (decisions.ts: listOpenQuestions, boardFreshness, parseIndexRows)
//   - build/status.json                               (gate color + staleness vs HEAD)
//   - docscan findings                                 (docscan.ts: scanDocs, report-only per D-422)
//   - the ledger home + last bundle                    (round-close.ts: resolveLedgerDir)
//
// REPORT-ONLY as a gate stage (the D-415/D-368 adopt-observe-enforce
// pattern): a stale status.json or an open board is a FACT this stage
// reports, never a gate failure — that judgment stays with the ratify/
// round-close ceremony that already owns it (AGENTS.md). Only mechanical
// breakage (an unreadable/malformed input) fails, same discipline as
// invariants-freshness.ts. This stage does not create a new authority; it
// consolidates reads of authorities that already exist.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { boardFreshness, listOpenQuestions, parseIndexRows, type OpenQuestion } from "./decisions.ts";
import { scanDocs } from "./docscan.ts";
import { resolveLedgerDir } from "./round-close.ts";
import { verifySessions } from "./session.ts";

function sh(cmd: string[], cwd: string): { code: number; out: string } {
  const p = nodeSpawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "buffer" });
  return { code: p.status ?? 1, out: `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}` };
}

// ---- status.json (gate color + staleness) ----

export interface StatusSummary {
  present: boolean;
  ok: boolean | null;        // null when unreadable/missing — never guessed
  head: string | null;       // the sha status.json was generated at
  headMatchesTip: boolean | null; // null when either side is unknown
  generatedAt: string | null;
  failingChecks: string[];   // check names where ok === false
}

/** Pure given (statusText, tipSha). A malformed file is reported, not thrown —
 *  status.json is data the process model READS; a bad file is a fact about
 *  the tree, not a reason to crash the derivation that is reporting it. */
export function summarizeStatus(statusText: string | null, tipSha: string | null): StatusSummary {
  if (statusText === null) {
    return { present: false, ok: null, head: null, headMatchesTip: null, generatedAt: null, failingChecks: [] };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(statusText) as Record<string, unknown>;
  } catch {
    return { present: true, ok: false, head: null, headMatchesTip: null, generatedAt: null, failingChecks: ["(unparseable status.json)"] };
  }
  const head = typeof parsed["head"] === "string" ? parsed["head"] as string : null;
  const gate = parsed["gate"];
  const checks = gate !== null && typeof gate === "object" ? (gate as Record<string, unknown>)["checks"] : undefined;
  const failingChecks: string[] = [];
  let ok = true;
  if (checks !== null && typeof checks === "object") {
    for (const [name, v] of Object.entries(checks as Record<string, unknown>)) {
      const c = v as Record<string, unknown>;
      if (c["ok"] === false) { ok = false; failingChecks.push(name); }
    }
  } else {
    ok = false; // no readable checks map — cannot claim green
    failingChecks.push("(no gate.checks map)");
  }
  const headMatchesTip = head !== null && tipSha !== null ? head === tipSha || tipSha.startsWith(head) : null;
  const generatedAt = typeof parsed["generatedAt"] === "string" ? parsed["generatedAt"] as string : null;
  return { present: true, ok, head, headMatchesTip, generatedAt, failingChecks };
}

// ---- the assembled model ----

export interface ProcessModel {
  at: string;                 // ISO — the one clock, supplied by the caller
  branch: string;
  tip: string;
  gate: StatusSummary;
  board: {
    openCount: number;
    blockingCount: number;    // rows with a Blocks: line other than "none"
    freshness: "fresh" | "stale" | "missing";
    open: Array<{ n: number; title: string; blocks: string; hasTbd: boolean }>;
  };
  docscan: {
    findingCount: number;
    byRule: Record<string, number>;
  };
  ledger: {
    resolved: boolean;
    dir: string | null;
    source: string | null;    // which candidate resolved it (round-close.ts's own label)
  };
  session: {
    homePresent: boolean;
    open: { id: string; mission: string; beganAt: string; events: number } | null;
    closedCount: number;
    verifyIssues: string[];   // mechanical breakage only — an open session is a fact, not a failure
  };
  ratifiedCount: number;      // RATIFIED INDEX ROWS (the whole program, incl. grandfathered hand-era rows) — NOT record files: decisions.ts counts only record files (fewer), a different, also-correct number
  proposedIds: number[];      // D-numbers currently PROPOSED (mirrors the board 1:1, by id)
}

/** Pure assembly given already-fetched evidence — the same discipline as
 *  buildPortrait: THIS function has no I/O, so it is unit-testable byte-for-
 *  byte without a repo on disk. The impure edges (readFileSync, git, ledger
 *  resolution) live only in deriveProcessModel below. */
export function assembleProcessModel(evidence: {
  at: string;
  branch: string;
  tip: string;
  statusText: string | null;
  indexText: string;
  open: OpenQuestion[];
  boardFreshness: { state: "fresh" | "stale" | "missing" };
  docscanFindings: Array<{ rule: string }>;
  ledger: { resolved: boolean; dir: string | null; source: string | null };
  session: ProcessModel["session"];
}): ProcessModel {
  const gate = summarizeStatus(evidence.statusText, evidence.tip);
  const rows = parseIndexRows(evidence.indexText);
  const ratifiedCount = rows.filter((r) => r.status === "RATIFIED").length;
  const byRule: Record<string, number> = {};
  for (const f of evidence.docscanFindings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  return {
    at: evidence.at,
    branch: evidence.branch,
    tip: evidence.tip,
    gate,
    board: {
      openCount: evidence.open.length,
      blockingCount: evidence.open.filter((q) => q.blocks !== "none").length,
      freshness: evidence.boardFreshness.state,
      open: evidence.open.map((q) => ({ n: q.n, title: q.title, blocks: q.blocks, hasTbd: q.hasTbd })),
    },
    docscan: { findingCount: evidence.docscanFindings.length, byRule },
    ledger: evidence.ledger,
    session: evidence.session,
    ratifiedCount,
    proposedIds: evidence.open.map((q) => q.n).sort((a, b) => a - b),
  };
}

/** The impure edge: gather real evidence from the repo root, then hand it to
 *  the pure assembler. This is the ONLY function in this file that touches
 *  the filesystem or git — everything it calls is an existing, already-tested
 *  reader (decisions.ts, docscan.ts, round-close.ts); no second parser. */
export function deriveProcessModel(root: string, at: string = new Date().toISOString()): ProcessModel {
  const branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], root).out.trim() || "(unknown)";
  const tip = sh(["git", "rev-parse", "HEAD"], root).out.trim() || "(unknown)";
  const statusPath = join(root, "build/status.json");
  const statusText = existsSync(statusPath) ? readFileSync(statusPath, "utf-8") : null;
  const indexText = readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8");
  const open = listOpenQuestions(root);
  const bf = boardFreshness(root);
  const { findings } = scanDocs(root);
  // resolveLedgerDir never throws — it returns the highest-priority candidate
  // whether or not it exists (entry.ts's own pattern: check existsSync after).
  const resolved = resolveLedgerDir(root);
  const ledger = { resolved: existsSync(resolved.dir), dir: resolved.dir, source: resolved.source };
  // D-430: the session state, collected through the session ledger's own
  // verify (never a second parser). An open session is a REPORTED fact; only
  // mechanical breakage (verify issues) fails the stage.
  let session: ProcessModel["session"] = { homePresent: false, open: null, closedCount: 0, verifyIssues: [] };
  try {
    const sv = verifySessions(root);
    session = {
      homePresent: true,
      open: sv.open ? { id: sv.open.id, mission: sv.open.mission, beganAt: sv.open.beganAt, events: sv.openEvents } : null,
      closedCount: sv.closedCount,
      verifyIssues: sv.issues,
    };
  } catch (e) {
    session = { homePresent: true, open: null, closedCount: 0, verifyIssues: [String(e instanceof Error ? e.message : e).slice(0, 160)] };
  }
  return assembleProcessModel({
    at, branch, tip, statusText, indexText, open, boardFreshness: bf,
    docscanFindings: findings.map((f) => ({ rule: f.rule })),
    ledger,
    session,
  });
}

// ---- rendering (shared by the gate stage + `omega:process`) ----

export function renderProcessReport(m: ProcessModel): string[] {
  const lines: string[] = [];
  lines.push(`omega:process — ${m.branch} @ ${m.tip.slice(0, 7)} (${m.at})`);
  lines.push(
    `gate: ${m.gate.present ? (m.gate.ok ? "GREEN" : `RED (${m.gate.failingChecks.join(", ")})`) : "(no status.json)"}`
    + (m.gate.headMatchesTip === false ? " — STALE: status.json's head does not match the current tip" : ""),
  );
  lines.push(`board: ${m.board.openCount} open (${m.board.blockingCount} blocking) — ${m.board.freshness}`);
  for (const q of m.board.open) {
    lines.push(`  D-${q.n}: ${q.title}${q.blocks !== "none" ? ` [blocks: ${q.blocks}]` : ""}${q.hasTbd ? " (TBD)" : ""}`);
  }
  lines.push(`docscan: ${m.docscan.findingCount} finding(s)${m.docscan.findingCount > 0 ? ` — ${Object.entries(m.docscan.byRule).map(([r, n]) => `${r}:${n}`).join(", ")}` : ""}`);
  lines.push(`ledger: ${m.ledger.resolved ? `${m.ledger.dir} (${m.ledger.source ?? "?"})` : "(unresolved)"}`);
  lines.push(m.session.open
    ? `session: OPEN ${m.session.open.id} ("${m.session.open.mission}") since ${m.session.open.beganAt} — ${m.session.open.events} event(s); round-close will refuse until the retrospective closes it (D-430)`
    : `session: none open${m.session.homePresent ? ` · ${m.session.closedCount} envelope(s) sealed` : " (no sessions home)"}`);
  lines.push(`ratified: ${m.ratifiedCount} (index rows; record files are a subset — decisions.ts counts those)`);
  return lines;
}

// ---- the gate-stage entry point (mechanical ok vs. reported facts — the
// invariants-freshness.ts split) ----

export interface ProcessCheckResult {
  ok: boolean;                       // MECHANICAL only — a read/parse failure; never board/gate state
  detail: Record<string, unknown>;
  issues: string[];
}

export function checkProcess(root: string): ProcessCheckResult {
  let model: ProcessModel;
  try {
    model = deriveProcessModel(root);
  } catch (e) {
    return { ok: false, detail: {}, issues: [`process model derivation failed: ${String(e instanceof Error ? e.message : e)}`] };
  }
  // D-430: a broken sessions store is MECHANICAL breakage (the derivation
  // read it and it lied about its own shape); an open session stays reported.
  const sessionIssues = model.session.verifyIssues.map((i) => `sessions store: ${i}`);
  return {
    ok: sessionIssues.length === 0,
    detail: {
      policy: "report-only (D-423 — mirrors D-415/D-368; the flip to failing, if ever, is a future record's call)",
      gateGreen: model.gate.present ? model.gate.ok : null,
      gateStale: model.gate.headMatchesTip === false,
      boardOpen: model.board.openCount,
      boardBlocking: model.board.blockingCount,
      boardFreshness: model.board.freshness,
      docscanFindings: model.docscan.findingCount,
      ledgerResolved: model.ledger.resolved,
      sessionOpen: model.session.open !== null,
      sessionHomePresent: model.session.homePresent,
      sessionEvents: model.session.open?.events ?? 0,
      sessionClosedCount: model.session.closedCount,
      ratifiedCount: model.ratifiedCount,
    },
    issues: sessionIssues,
  };
}

// ---- CLI (`bun run omega:process` / `omega:process --json`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  const asJson = process.argv.includes("--json");
  const model = deriveProcessModel(ROOT);
  if (asJson) {
    console.log(JSON.stringify(model, null, 2));
  } else {
    for (const line of renderProcessReport(model)) console.log(line);
  }
}
