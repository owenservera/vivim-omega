// tooling/gates/session.ts — D-430 (Ω-DEV.6): the session ledger.
//
// The gap this closes: the program is developed 100% by AI agents, and
// every session evaporates on exit. The WORK survives (commits, records)
// but the STREAM does not — what was attempted, in what order, how long
// each phase took, what was red before green. The dev-vault (D-428) holds
// curated lessons; nothing holds the raw session, and nothing forces the
// curation to happen at the moment the memory is richest (close).
//
// The owner's directives (2026-09-22), translated:
//   "keep a full session copy of the stream log"
//     → sessions/stream.jsonl, append-only, one chain-witnessed line per
//       event, sealed into sessions/closed/<id>.json at close.
//   "before closing the session and publishing the bundle … structured and
//    ideally automated lessons learned that boost development speed and
//    accuracy"
//     → close REFUSES without ≥1 evidence-cited lesson, and each lesson
//       graduates to the dev-vault through the existing recordDevEntry;
//       round-close REFUSES while a session is open. No retrospective,
//       no bundle.
//   "we need timestamps so we can identify bottlenecks"
//     → every event carries at (ISO wall clock) + tMs (ms since begin,
//       regress refused); ops may carry data.durationMs; gates.log rows
//       auto-import; close derives the bottleneck report (kind shares,
//       top silence gaps, slowest ops) — the lessons are written against
//       MEASURED friction, not vibes.
//
// Same constitutional boundary as D-428: LAW IS COMMITTED, MEMORY IS
// LOCAL. sessions/ is gitignored tooling state — never committed, never a
// substitute for a record, never a runtime seam (the D-423/D-424 class
// line). Tamper-EVIDENT, not tamper-PROOF: whoever owns the box can
// rewrite; verify re-derives every digest and names the lie.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { recordDevEntry, loadDevEntries, type DevEntry } from "./devvault.ts";

export const SESSION_KINDS = ["plan", "code", "test", "gate-run", "decision", "repair", "note", "block", "unblock"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface SessionEvent {
  at: string;                       // ISO wall clock — reading + ordering
  tMs: number;                      // ms since the session's beganAtMs — duration math
  kind: SessionKind;
  note: string;                     // one honest line (the stream is the record)
  data?: Record<string, unknown>;   // optional — e.g. {ok, tests, durationMs}
}

export interface OpenSession {
  id: string;                       // <yyyymmdd>-<hhmmss>-<slug>
  mission: string;
  agent: string;
  beganAt: string;                  // ISO
  beganAtMs: number;                // epoch ms — tMs's anchor
}

export interface StreamLink { line: number; sha256: string; prev: string }
export interface StreamChain { chain: StreamLink[]; head: string }

export interface LessonInput {
  statement: string;
  evidence: string[];               // ≥1 — the dev-vault's own law applies
  appliesTo: string[];
  type?: DevEntry["type"];
}

export interface BottleneckReport {
  wallMs: number;                   // last event's tMs (0 for a single event)
  eventCount: number;
  kindCounts: Record<string, number>;
  kindDurationMs: Record<string, number>;  // Σ data.durationMs per kind (explicit only)
  topGaps: Array<{ gapMs: number; afterNote: string; beforeNote: string; afterAt: string }>;
  slowOps: Array<{ at: string; kind: string; note: string; durationMs: number }>;
}

export interface ClosedEnvelope {
  id: string;
  mission: string;
  agent: string;
  beganAt: string;
  closedAt: string;
  wallMs: number;
  events: SessionEvent[];
  chain: StreamChain;
  streamSha256: string;             // digest of the canonical event bytes — verify recomputes
  bottleneck: BottleneckReport;
  lessons: Array<{ vaultId: string; statement: string; evidence: string[]; appliesTo: string[] }>;
}

export interface ClosedIndexRow {
  id: string; mission: string; beganAt: string; closedAt: string;
  events: number; wallMs: number; lessons: number; streamSha256: string;
}

const GENESIS = "genesis";
export const MIN_GAP_MS = 60_000;  // gaps below one minute are noise, not friction

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// ---- paths (all under <root>/sessions — gitignored, environment-local) ----

function home(root: string): string { return join(root, "sessions"); }
function openPath(root: string): string { return join(home(root), "open.json"); }
function streamPath(root: string): string { return join(home(root), "stream.jsonl"); }
function chainPath(root: string): string { return join(home(root), "stream.chain.json"); }
function closedDir(root: string): string { return join(home(root), "closed"); }
function closedIndexPath(root: string): string { return join(closedDir(root), "index.json"); }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "session";
}

/** Serialize one event to its canonical line bytes (fixed key order — the
 *  objects are always constructed here, and JSON.parse preserves order). */
export function serializeEvent(e: SessionEvent): string {
  return JSON.stringify(e);
}

/** Parse + validate one stream line. Pure. */
export function parseEvent(line: string): { event: SessionEvent | null; issues: string[] } {
  const issues: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { return { event: null, issues: ["not valid JSON"] }; }
  const e = raw as Partial<SessionEvent>;
  if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) issues.push(`at "${e.at}" must be a parseable ISO timestamp`);
  if (typeof e.tMs !== "number" || !Number.isFinite(e.tMs) || e.tMs < 0) issues.push(`tMs ${String(e.tMs)} must be a non-negative finite number`);
  if (!SESSION_KINDS.includes(e.kind as SessionKind)) issues.push(`kind "${e.kind}" illegal (${SESSION_KINDS.join(" | ")})`);
  if (!e.note || !e.note.trim()) issues.push("note is required and must be non-empty");
  if (e.data !== undefined && (typeof e.data !== "object" || e.data === null || Array.isArray(e.data))) issues.push("data must be a JSON object when present");
  if (issues.length > 0) return { event: null, issues };
  return { event: e as SessionEvent, issues: [] };
}

function readOpen(root: string): OpenSession | null {
  if (!existsSync(openPath(root))) return null;
  try {
    const o = JSON.parse(readFileSync(openPath(root), "utf-8")) as OpenSession;
    if (!o.id || !o.mission || !o.beganAt || typeof o.beganAtMs !== "number") {
      throw new Error("shape");
    }
    return o;
  } catch {
    throw new Error("SESSION_STORE_UNREADABLE: sessions/open.json is malformed — repair it by hand (the store is local state; verify names the damage before any op touches it)");
  }
}

function readChain(root: string): StreamChain {
  if (!existsSync(chainPath(root))) return { chain: [], head: GENESIS };
  try {
    const c = JSON.parse(readFileSync(chainPath(root), "utf-8")) as StreamChain;
    return { chain: Array.isArray(c.chain) ? c.chain : [], head: typeof c.head === "string" ? c.head : GENESIS };
  } catch {
    throw new Error("SESSION_STORE_UNREADABLE: sessions/stream.chain.json is malformed — repair before any op");
  }
}

function readLines(root: string): string[] {
  if (!existsSync(streamPath(root))) return [];
  const text = readFileSync(streamPath(root), "utf-8");
  return text === "" ? [] : text.split("\n").filter((l) => l.trim().length > 0);
}

// ---- verify: the witness walk (open stream + every closed envelope) ----

/** Recompute the chain over raw lines; name every lie. Pure. */
export function verifyChain(lines: string[], chain: StreamChain): string[] {
  const issues: string[] = [];
  if (chain.chain.length > lines.length) {
    issues.push(`SESSION_CHAIN_BROKEN: chain links ${lines.length + 1}..${chain.chain.length} have no line — event line(s) ${lines.length + 1}..${chain.chain.length} were deleted after chaining`);
  } else if (lines.length > chain.chain.length) {
    issues.push(`SESSION_CHAIN_BROKEN: line(s) ${chain.chain.length + 1}..${lines.length} are unchained — added outside the ledger`);
  }
  let prev = GENESIS;
  const n = Math.min(chain.chain.length, lines.length);
  for (let i = 0; i < n; i++) {
    const link = chain.chain[i];
    const actual = sha256(lines[i]);
    if (link.line !== i + 1) issues.push(`SESSION_CHAIN_BROKEN: link ${i + 1} claims line ${link.line}`);
    if (actual !== link.sha256) issues.push(`SESSION_CHAIN_BROKEN: line ${i + 1} hash mismatch — recorded ${link.sha256.slice(0, 8)}…, actual ${actual.slice(0, 8)}… (edited or corrupted after chaining)`);
    if (link.prev !== prev) issues.push(`SESSION_CHAIN_BROKEN: line ${i + 1} prev ${link.prev.slice(0, 8)}… does not continue the chain`);
    prev = link.sha256;
  }
  if (n > 0 && chain.head !== prev) issues.push(`SESSION_CHAIN_BROKEN: chain head ${chain.head.slice(0, 8)}… ≠ recomputed ${prev.slice(0, 8)}…`);
  lines.forEach((l, i) => {
    const { event, issues: evIssues } = parseEvent(l);
    if (!event) issues.push(`SESSION_EVENT_INVALID: line ${i + 1}: ${evIssues.join("; ")}`);
  });
  return issues;
}

/** The canonical event bytes a closed envelope digests — same order, same
 *  serialization as the live stream. Pure. */
export function canonicalEventBytes(events: SessionEvent[]): string {
  return events.map((e) => serializeEvent(e)).join("\n") + (events.length > 0 ? "\n" : "");
}

export interface SessionVerifyResult {
  ok: boolean;
  issues: string[];
  open: OpenSession | null;
  openEvents: number;
  closedCount: number;
}

/** Verify the WHOLE store: the open stream's chain (if any) and every
 *  closed envelope against its index pin. Collecting — never throws on
 *  data lies (they are reported); only unreadable shapes throw upstream. */
export function verifySessions(root: string): SessionVerifyResult {
  const issues: string[] = [];
  let open: OpenSession | null = null;
  let openEvents = 0;
  try { open = readOpen(root); } catch (e) { return { ok: false, issues: [String(e instanceof Error ? e.message : e)], open: null, openEvents: 0, closedCount: 0 }; }
  if (open) {
    const lines = readLines(root);
    openEvents = lines.length;
    issues.push(...verifyChain(lines, readChain(root)));
  } else if (existsSync(streamPath(root)) && readLines(root).length > 0) {
    issues.push(`SESSION_ORPHAN: stream.jsonl has ${readLines(root).length} lines but no open session — seal or clear it (an unowned stream is unverifiable)`);
  }
  let closedCount = 0;
  if (existsSync(closedIndexPath(root))) {
    let rows: ClosedIndexRow[];
    try {
      rows = JSON.parse(readFileSync(closedIndexPath(root), "utf-8")) as ClosedIndexRow[];
      if (!Array.isArray(rows)) throw new Error("shape");
    } catch {
      return { ok: false, issues: [...issues, "SESSION_STORE_UNREADABLE: sessions/closed/index.json is malformed — repair before any op"], open, openEvents, closedCount };
    }
    closedCount = rows.length;
    const onDisk = new Set(existsSync(closedDir(root)) ? readdirSync(closedDir(root)).filter((f) => f.endsWith(".json") && f !== "index.json") : []);
    for (const row of rows) {
      const p = join(closedDir(root), `${row.id}.json`);
      if (!existsSync(p)) { issues.push(`SESSION_ENVELOPE_MISSING: closed/${row.id}.json is pinned by the index but absent`); continue; }
      onDisk.delete(`${row.id}.json`);
      let env: ClosedEnvelope;
      try {
        env = JSON.parse(readFileSync(p, "utf-8")) as ClosedEnvelope;
      } catch {
        issues.push(`SESSION_ENVELOPE_TAMPERED: closed/${row.id}.json is not parseable JSON`);
        continue;
      }
      const digest = sha256(canonicalEventBytes(env.events ?? []));
      if (digest !== env.streamSha256 || digest !== row.streamSha256) {
        issues.push(`SESSION_ENVELOPE_TAMPERED: closed/${row.id}.json — recomputed stream digest ${digest.slice(0, 8)}… ≠ envelope ${String(env.streamSha256).slice(0, 8)}…/index ${row.streamSha256.slice(0, 8)}… (events edited after the seal)`);
      }
      if ((env.events?.length ?? 0) !== row.events) {
        issues.push(`SESSION_ENVELOPE_TAMPERED: closed/${row.id}.json — ${env.events?.length ?? 0} events ≠ index row's ${row.events}`);
      }
    }
    for (const f of onDisk) issues.push(`SESSION_ORPHAN: closed/${f} exists but no index row pins it (an unpinned envelope is unverifiable)`);
  } else if (existsSync(closedDir(root))) {
    for (const f of readdirSync(closedDir(root)).filter((x) => x.endsWith(".json") && x !== "index.json")) {
      issues.push(`SESSION_ORPHAN: closed/${f} exists but no index row pins it`);
    }
  }
  return { ok: issues.length === 0, issues, open, openEvents, closedCount };
}

// ---- the pure bottleneck fold (D-430's timestamps → named friction) ----

/** The report every close embeds and every context surfaces. Pure — same
 *  events, byte-identical report data. Measures ONLY what the ledger
 *  holds (gaps between events, explicit durationMs, counts); it never
 *  guesses unlogged work — honest by construction. */
export function bottleneckReport(events: SessionEvent[]): BottleneckReport {
  const kindCounts: Record<string, number> = {};
  const kindDurationMs: Record<string, number> = {};
  for (const e of events) {
    kindCounts[e.kind] = (kindCounts[e.kind] ?? 0) + 1;
    const d = e.data?.["durationMs"];
    if (typeof d === "number" && Number.isFinite(d) && d > 0) kindDurationMs[e.kind] = (kindDurationMs[e.kind] ?? 0) + d;
  }
  const gaps: BottleneckReport["topGaps"] = [];
  for (let i = 1; i < events.length; i++) {
    const gapMs = events[i].tMs - events[i - 1].tMs;
    if (gapMs >= MIN_GAP_MS) gaps.push({ gapMs, afterNote: events[i - 1].note, beforeNote: events[i].note, afterAt: events[i - 1].at });
  }
  gaps.sort((a, b) => b.gapMs - a.gapMs);
  const slowOps = events
    .filter((e) => typeof e.data?.["durationMs"] === "number" && Number.isFinite(e.data["durationMs"] as number))
    .map((e) => ({ at: e.at, kind: e.kind, note: e.note, durationMs: e.data!["durationMs"] as number }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);
  return {
    wallMs: events.length > 0 ? Math.max(0, events[events.length - 1].tMs) : 0,
    eventCount: events.length,
    kindCounts,
    kindDurationMs,
    topGaps: gaps.slice(0, 5),
    slowOps,
  };
}

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
}

/** Render the report as the close/context lines. Pure. */
export function renderBottleneckReport(r: BottleneckReport): string[] {
  const lines: string[] = [];
  lines.push(`bottleneck report (D-430 — derived, never hand-edited): wall ${fmtMs(r.wallMs)} over ${r.eventCount} events`);
  const kinds = Object.keys(r.kindCounts).sort((a, b) => (r.kindDurationMs[b] ?? 0) - (r.kindDurationMs[a] ?? 0) || r.kindCounts[b] - r.kindCounts[a]);
  for (const k of kinds) {
    const d = r.kindDurationMs[k];
    lines.push(`  ${k}: ${r.kindCounts[k]} event(s)${d ? ` · ${fmtMs(d)} explicit (top friction by duration)` : ""}`);
  }
  if (r.topGaps.length > 0) {
    lines.push(`  top silence gaps (inter-event — the rework/thinking friction):`);
    for (const g of r.topGaps) lines.push(`    ${fmtMs(g.gapMs)} after "${g.afterNote.slice(0, 80)}" → before "${g.beforeNote.slice(0, 80)}"`);
  }
  if (r.slowOps.length > 0) {
    lines.push(`  slowest explicit ops (durationMs cited):`);
    for (const o of r.slowOps) lines.push(`    ${fmtMs(o.durationMs)} — ${o.kind}: ${o.note.slice(0, 80)} (${o.at})`);
  }
  if (r.eventCount <= 1) lines.push("  (a single event — the report measures the stream, and this stream is empty; log more, or the retrospective writes against nothing)");
  return lines;
}

// ---- ops (impure edges: begin / log / importGates / close) ----

export function beginSession(root: string, a: { mission: string; agent: string; now?: Date }): { id: string } {
  const now = a.now ?? new Date();
  const existing = readOpen(root);
  if (existing) {
    throw new Error(`refused: SESSION_OPEN_EXISTS — session ${existing.id} ("${existing.mission}") has been open since ${existing.beganAt}; close it with the retrospective first (omega:session close — D-430: one environment, one open session)`);
  }
  const v = verifySessions(root);
  if (!v.ok) throw new Error(`refused: SESSION_STORE_RED — will not open a new session on a broken store (${v.issues[0]}); repair first, the chain is the witness`);
  const id = `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 19).replace(/:/g, "")}-${slugify(a.mission)}`;
  mkdirSync(home(root), { recursive: true });
  const open: OpenSession = { id, mission: a.mission, agent: a.agent, beganAt: now.toISOString(), beganAtMs: now.getTime() };
  writeFileSync(openPath(root), `${JSON.stringify(open, null, 2)}\n`);
  writeFileSync(streamPath(root), "");
  writeFileSync(chainPath(root), `${JSON.stringify({ chain: [], head: GENESIS }, null, 2)}\n`);
  return { id };
}

/** Append one event. Refusals: SESSION_NONE_OPEN, kind/note/data shape,
 *  SESSION_TIME_REGRESS (a wall-clock step is surfaced, never absorbed),
 *  SESSION_CHAIN_BROKEN (refuse to extend a broken chain). */
export function appendSessionEvent(
  root: string,
  e: { kind: string; note: string; data?: Record<string, unknown> },
  now: Date = new Date(),
): { line: number; tMs: number } {
  const open = readOpen(root);
  if (!open) throw new Error("refused: SESSION_NONE_OPEN — no session is open (omega:session begin --mission … first; D-430)");
  const { event, issues } = parseEvent(JSON.stringify({ at: now.toISOString(), tMs: 0, kind: e.kind, note: e.note, ...(e.data !== undefined ? { data: e.data } : {}) }));
  if (!event) throw new Error(`refused: ${issues.join("; ")}`);
  const lines = readLines(root);
  const chain = readChain(root);
  const broken = verifyChain(lines, chain);
  if (broken.length > 0) throw new Error(`refused: SESSION_CHAIN_BROKEN — will not extend a broken chain (${broken[0]}); repair first, the chain is the witness`);
  const tMs = now.getTime() - open.beganAtMs;
  const lastTMs = lines.length > 0 ? (parseEvent(lines[lines.length - 1]).event?.tMs ?? 0) : 0;
  if (lines.length > 0 && tMs < lastTMs) {
    throw new Error(`refused: SESSION_TIME_REGRESS — new event tMs ${tMs} < last event's ${lastTMs} (wall clock stepped back ${lastTMs - tMs}ms since begin); timestamps are ordering data — surface the step, close and re-begin if the skew is real`);
  }
  const ev: SessionEvent = { at: now.toISOString(), tMs, kind: event.kind, note: event.note, ...(event.data !== undefined ? { data: event.data } : {}) };
  const line = serializeEvent(ev);
  appendFileSync(streamPath(root), `${line}\n`);
  chain.chain.push({ line: lines.length + 1, sha256: sha256(line), prev: chain.head });
  chain.head = sha256(line);
  writeFileSync(chainPath(root), `${JSON.stringify(chain, null, 2)}\n`);
  return { line: lines.length + 1, tMs };
}

/** Import gates.log rows that fall inside the session window as gate-run
 *  events — the heaviest operation captured automatically. Idempotent on
 *  the row's `at` (re-import skips already-imported rows). */
export function importGatesLog(root: string, now: Date = new Date()): { imported: number; skipped: number } {
  const open = readOpen(root);
  if (!open) throw new Error("refused: SESSION_NONE_OPEN — no session is open (omega:session begin first; D-430)");
  const logPath = join(root, "build", "gates.log");
  if (!existsSync(logPath)) return { imported: 0, skipped: 0 };
  const existingAts = new Set(readLines(root).map((l) => parseEvent(l).event?.at).filter(Boolean));
  let imported = 0;
  let skipped = 0;
  for (const line of readFileSync(logPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    const at = typeof row["at"] === "string" ? row["at"] : null;
    if (!at) continue;
    const t = Date.parse(at);
    if (Number.isNaN(t) || t < open.beganAtMs || t > now.getTime()) continue;
    if (existingAts.has(at)) { skipped++; continue; }
    const when = new Date(t);
    appendSessionEvent(root, {
      kind: "gate-run",
      note: `full gate ${row["ok"] === true ? "GREEN" : "RED"} — tests ${String(((row["tests"] as Record<string, unknown>) ?? {})["pass"] ?? "?")} pass / ${String(((row["tests"] as Record<string, unknown>) ?? {})["fail"] ?? "?")} fail (imported from build/gates.log)`,
      data: { ok: row["ok"] === true, tests: row["tests"] ?? null, source: "build/gates.log" },
    }, when);
    existingAts.add(at);
    imported++;
  }
  return { imported, skipped };
}

/** The structured retrospective + the seal. Refusals: SESSION_NONE_OPEN,
 *  SESSION_EMPTY_STREAM, SESSION_RETROSPECTIVE_REQUIRED (zero lessons),
 *  SESSION_CHAIN_BROKEN. Lessons graduate to the dev-vault IDEMPOTENTLY (a
 *  pre-existing identical statement reuses its vault id — a failed close is
 *  retriable without duplicate entries). On success the open state is
 *  REMOVED and the envelope is digest-pinned in the index. */
export function closeSession(
  root: string,
  lessons: LessonInput[],
  now: Date = new Date(),
): { envelope: string; report: BottleneckReport; vaultIds: string[] } {
  const open = readOpen(root);
  if (!open) throw new Error("refused: SESSION_NONE_OPEN — no session is open (nothing to close)");
  const lines = readLines(root);
  if (lines.length === 0) throw new Error("refused: SESSION_EMPTY_STREAM — a session with zero events cannot claim a retrospective; log the work (omega:session log / import --gates)");
  if (lessons.length === 0) throw new Error("refused: SESSION_RETROSPECTIVE_REQUIRED — the close IS the retrospective: pass ≥1 lesson (--lesson \"…\" --evidence a,b --applies x), each cited, graduating to the dev-vault; no retrospective, no publish (D-430)");
  const chain = readChain(root);
  const broken = verifyChain(lines, chain);
  if (broken.length > 0) throw new Error(`refused: SESSION_CHAIN_BROKEN — will not seal a broken chain (${broken[0]}); repair first, the chain is the witness`);
  const events = lines.map((l) => parseEvent(l).event!).filter(Boolean);
  const report = bottleneckReport(events);
  // graduation — idempotent on identical statements (dev-vault ids are date+slug)
  const vaultIds: string[] = [];
  const existing = loadDevEntries(root);
  for (const l of lessons) {
    if (!l.statement?.trim() || !Array.isArray(l.evidence) || l.evidence.length === 0 || l.evidence.some((c) => !String(c).trim())) {
      throw new Error("refused: SESSION_LESSON_SHAPE — each lesson needs a non-empty statement and ≥1 non-empty evidence citation (an uncited lesson is an opinion — the dev-vault's own law, D-428)");
    }
    const prior = existing.find((e) => e.statement === l.statement);
    if (prior) { vaultIds.push(prior.id); continue; }
    const id = `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${slugify(l.statement)}`;
    const r = recordDevEntry(root, {
      id,
      type: l.type ?? "lesson",
      at: now.toISOString(),
      agent: open.agent,
      context: `session ${open.id}: ${open.mission} (D-430 close — graduated from the session retrospective)`,
      statement: l.statement,
      evidence: l.evidence,
      appliesTo: l.appliesTo.length > 0 ? l.appliesTo : ["Ω-DEV.6"],
      retention: "dev-vault-permanent",
    });
    vaultIds.push(id);
    existing.push({ id, type: l.type ?? "lesson", at: now.toISOString(), agent: open.agent, context: "graduated", statement: l.statement, evidence: l.evidence, appliesTo: l.appliesTo, retention: "dev-vault-permanent" });
  }
  const envelope: ClosedEnvelope = {
    id: open.id, mission: open.mission, agent: open.agent,
    beganAt: open.beganAt, closedAt: now.toISOString(),
    wallMs: report.wallMs, events, chain,
    streamSha256: sha256(canonicalEventBytes(events)),
    bottleneck: report,
    lessons: lessons.map((l, i) => ({ vaultId: vaultIds[i], statement: l.statement, evidence: l.evidence, appliesTo: l.appliesTo })),
  };
  mkdirSync(closedDir(root), { recursive: true });
  writeFileSync(join(closedDir(root), `${envelope.id}.json`), `${JSON.stringify(envelope, null, 2)}\n`);
  const rows: ClosedIndexRow[] = existsSync(closedIndexPath(root))
    ? (JSON.parse(readFileSync(closedIndexPath(root), "utf-8")) as ClosedIndexRow[])
    : [];
  rows.push({
    id: envelope.id, mission: envelope.mission, beganAt: envelope.beganAt, closedAt: envelope.closedAt,
    events: events.length, wallMs: report.wallMs, lessons: lessons.length, streamSha256: envelope.streamSha256,
  });
  writeFileSync(closedIndexPath(root), `${JSON.stringify(rows, null, 2)}\n`);
  rmSync(openPath(root), { force: true });
  rmSync(streamPath(root), { force: true });
  rmSync(chainPath(root), { force: true });
  return { envelope: `sessions/closed/${envelope.id}.json`, report, vaultIds };
}

/** The next session's onboarding digest: the last closed envelope (mission,
 *  wall, top friction, lesson ids) — so the stream's wisdom loads BEFORE
 *  the work starts. Pure given the collected facts. */
export function renderSessionContext(v: SessionVerifyResult, lastClosed: ClosedEnvelope | null): string[] {
  const lines: string[] = [];
  if (v.open) {
    lines.push(`session: OPEN ${v.open.id} ("${v.open.mission}") since ${v.open.beganAt} — ${v.openEvents} event(s) streamed; close with the retrospective before round-close (D-430)`);
  } else {
    lines.push("session: none open");
  }
  if (lastClosed) {
    lines.push(`last session: ${lastClosed.id} ("${lastClosed.mission}") — wall ${fmtMs(lastClosed.wallMs)}, ${lastClosed.events.length} events, ${lastClosed.lessons.length} lesson(s): ${lastClosed.lessons.map((l) => l.vaultId).join(", ")}`);
    lines.push(...renderBottleneckReport(lastClosed.bottleneck).map((l) => `  ${l}`));
  } else {
    lines.push("last session: (none closed yet — this store has no envelopes)");
  }
  return lines;
}

/** Collect the last closed envelope (the context source). */
export function lastClosedEnvelope(root: string): ClosedEnvelope | null {
  if (!existsSync(closedIndexPath(root))) return null;
  let rows: ClosedIndexRow[];
  try { rows = JSON.parse(readFileSync(closedIndexPath(root), "utf-8")) as ClosedIndexRow[]; } catch { return null; }
  const last = rows[rows.length - 1];
  if (!last) return null;
  const p = join(closedDir(root), `${last.id}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")) as ClosedEnvelope; } catch { return null; }
}

// ---- CLI (`omega:session begin|log|import|report|close|verify|status|context`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  const [cmd, ...rest] = process.argv.slice(2);
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--gates") { flags["gates"] = ["1"]; continue; }
    if (rest[i].startsWith("--")) {
      const val = rest[i + 1];
      if (val === undefined) throw new Error(`refused: ${rest[i]} needs a value`);
      (flags[rest[i].slice(2)] ??= []).push(val);
      i++;
    } else positional.push(rest[i]);
  }
  const one = (k: string): string | undefined => flags[k]?.[flags[k].length - 1];
  try {
    if (cmd === "begin") {
      const mission = one("mission");
      if (!mission) throw new Error('refused: usage: omega:session begin --mission "what this session is for" --agent "who"');
      const r = beginSession(ROOT, { mission, agent: one("agent") ?? "omega-continuation-agent" });
      console.log(`session open: ${r.id} — stream events with omega:session log; the retrospective closes it (D-430)`);
    } else if (cmd === "log") {
      const kind = one("kind");
      const note = positional.join(" ").trim() || one("note");
      if (!kind || !note) throw new Error('refused: usage: omega:session log --kind plan|code|test|gate-run|decision|repair|note|block|unblock "the note" [--data-json \'{"durationMs":612000}\']');
      let data: Record<string, unknown> | undefined;
      const dj = one("data-json");
      if (dj !== undefined) {
        try { data = JSON.parse(dj) as Record<string, unknown>; } catch { throw new Error("refused: --data-json must be a JSON object"); }
      }
      const r = appendSessionEvent(ROOT, { kind, note, data });
      console.log(`logged: line ${r.line} (${kind}, t+${Math.round(r.tMs / 1000)}s)`);
    } else if (cmd === "import") {
      if (!flags["gates"]) throw new Error("refused: usage: omega:session import --gates  (build/gates.log rows inside the session window → gate-run events; idempotent on the row's at)");
      const r = importGatesLog(ROOT);
      console.log(`imported: ${r.imported} gate-run event(s) from build/gates.log (${r.skipped} already present)`);
    } else if (cmd === "report") {
      const open = readOpen(ROOT);
      if (!open) throw new Error("refused: SESSION_NONE_OPEN — no session open");
      const events = readLines(ROOT).map((l) => parseEvent(l).event!).filter(Boolean);
      for (const l of renderBottleneckReport(bottleneckReport(events))) console.log(l);
    } else if (cmd === "close") {
      const stmts = flags["lesson"] ?? [];
      if (stmts.length === 0) {
        const open = readOpen(ROOT);
        console.error(open ? `session ${open.id} ("${open.mission}") — ${readLines(ROOT).length} event(s) streamed.` : "no session open");
        for (const l of renderBottleneckReport(bottleneckReport(readLines(ROOT).map((x) => parseEvent(x).event!).filter(Boolean)))) console.error(`  ${l}`);
        throw new Error('refused: SESSION_RETROSPECTIVE_REQUIRED — pass ≥1 lesson: --lesson "the lesson" --evidence "cite,paths" --applies "layer-ids" (repeatable; each graduates to the dev-vault)');
      }
      const evs = flags["evidence"] ?? [];
      const app = flags["applies"] ?? [];
      const types = flags["type"] ?? [];
      const lessons: LessonInput[] = stmts.map((s, i) => ({
        statement: s,
        evidence: (evs[i] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
        appliesTo: (app[i] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
        type: types[i] as LessonInput["type"] | undefined,
      }));
      const r = closeSession(ROOT, lessons);
      console.log(`sealed: ${r.envelope}`);
      console.log(`lessons graduated to the dev-vault: ${r.vaultIds.join(", ")}`);
      for (const l of renderBottleneckReport(r.report)) console.log(l);
      console.log("the publish gate is open: omega:round-close may now cut the bundle (D-430)");
    } else if (cmd === "verify") {
      const v = verifySessions(ROOT);
      for (const i of v.issues) console.error(`✗ ${i}`);
      console.log(v.ok
        ? `sessions: GREEN — ${v.open ? `OPEN ${v.open.id} (${v.openEvents} events, chain intact)` : "no open session"}, ${v.closedCount} envelope(s) pinned`
        : "sessions: RED — the chain and the pins are the witness; repair before any op");
      process.exit(v.ok ? 0 : 1);
    } else if (cmd === "status") {
      const v = verifySessions(ROOT);
      if (v.open) {
        const events = readLines(ROOT).map((l) => parseEvent(l).event!).filter(Boolean);
        console.log(`open: ${v.open.id} ("${v.open.mission}") · agent ${v.open.agent} · began ${v.open.beganAt} · ${events.length} event(s)`);
        for (const e of events.slice(-5)) console.log(`  t+${Math.round(e.tMs / 1000)}s [${e.kind}] ${e.note.slice(0, 100)}`);
      } else {
        console.log(`open: none · closed: ${v.closedCount} envelope(s)`);
      }
      for (const i of v.issues) console.error(`✗ ${i}`);
      process.exit(v.ok ? 0 : 1);
    } else if (cmd === "context") {
      for (const l of renderSessionContext(verifySessions(ROOT), lastClosedEnvelope(ROOT))) console.log(l);
    } else {
      console.log("usage: omega:session begin --mission \"…\" [--agent \"…\"] | log --kind <plan|code|test|gate-run|decision|repair|note|block|unblock> \"note\" [--data-json '{…}'] | import --gates | report | close --lesson \"…\" --evidence \"a,b\" --applies \"x,y\" [--type lesson|pattern|mistake|note] (repeatable) | verify | status | context");
    }
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
