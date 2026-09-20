// tooling/gates/test/f-session.test.ts — the F-SESSION falsifier (D-430, Ω-DEV.6).
// Generated as a RED stub by `omega:loop --stub D-430`, then implemented.
//  F-SESSION.1 single-open — begin is refused while a session is open, naming it; after close a new begin opens a distinct session
//  F-SESSION.2 append-only-witness — the chain detects edits, deletions, and tampered envelopes; broken chains refuse extension; no logging after close
//  F-SESSION.3 time-stamped-events — every event carries ISO at + non-negative tMs; regress refused; timestamps are inside the witness
//  F-SESSION.4 publish-gate — round-close refuses an open session and a broken store by name; green only with none open + verify green
//  F-SESSION.5 structured-retrospective — zero lessons refuses and seals nothing; lessons graduate to the dev-vault idempotently, cited in the envelope
//  F-SESSION.6 bottleneck-report — a pure fold: wall, kind counts/durations, top silence gaps, slowest ops; degenerate inputs degrade honestly
import { describe, test, expect } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import {
  appendSessionEvent, beginSession, bottleneckReport, canonicalEventBytes, closeSession,
  importGatesLog, parseEvent, renderBottleneckReport, serializeEvent, verifySessions,
  type SessionEvent,
} from "../session.ts";
import { loadDevEntries, recordDevEntry, type DevEntry } from "../devvault.ts";
import { preflightVerdict } from "../round-close.ts";

function freshRoot(): string {
  const root = omegaTmp("omega-session-test", `${Date.now()}-${process.pid}`);
  mkdirSync(root, { recursive: true });
  return root;
}

const T0 = new Date("2026-09-22T10:00:00.000Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

function openSession(root: string, mission = "the fixture mission"): void {
  beginSession(root, { mission, agent: "test", now: T0 });
}

describe("F-SESSION.1 single-open", () => {
  test("a second begin is refused, naming the open session; after close a new begin opens a distinct session", () => {
    const root = freshRoot();
    const first = beginSession(root, { mission: "land the ledger", agent: "test", now: T0 });
    expect(() => beginSession(root, { mission: "something else", agent: "test", now: at(5) }))
      .toThrow(/SESSION_OPEN_EXISTS.*land the ledger/);
    appendSessionEvent(root, { kind: "code", note: "the work" }, at(10));
    closeSession(root, [{ statement: "the fixture lesson", evidence: ["D-430"], appliesTo: ["Ω-DEV.6"] }], at(20));
    const second = beginSession(root, { mission: "the next round", agent: "test", now: at(30) });
    expect(second.id).not.toBe(first.id);
    const v = verifySessions(root);
    expect(v.ok).toBe(true);
    expect(v.open?.id).toBe(second.id);
    expect(v.closedCount).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
  test("begin on a broken store is refused — never open new work over a lie", () => {
    const root = freshRoot();
    openSession(root);
    appendSessionEvent(root, { kind: "note", note: "one" }, at(1));
    // simulate the broken half-sealed state: corrupt the chain AND lose the open pin
    writeFileSync(join(root, "sessions/stream.chain.json"), "{not json");
    rmSync(join(root, "sessions/open.json"), { force: true });
    expect(() => beginSession(root, { mission: "over the ruins", agent: "test", now: at(5) })).toThrow(/SESSION_STORE_RED|SESSION_STORE_UNREADABLE/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-SESSION.2 append-only-witness", () => {
  test("an EDITED line, a DELETED line, and a tampered envelope are each detected and named; broken chains refuse extension", () => {
    const root = freshRoot();
    openSession(root);
    appendSessionEvent(root, { kind: "plan", note: "alpha" }, at(1));
    appendSessionEvent(root, { kind: "code", note: "beta" }, at(2));
    expect(verifySessions(root).ok).toBe(true);
    // EDIT line 2 — the chain must witness it
    const streamPath = join(root, "sessions/stream.jsonl");
    const lines = readFileSync(streamPath, "utf-8").split("\n").filter(Boolean);
    const edited = JSON.parse(lines[1]) as SessionEvent;
    edited.note = "rewritten history";
    lines[1] = serializeEvent(edited);
    writeFileSync(streamPath, lines.join("\n") + "\n");
    const v1 = verifySessions(root);
    expect(v1.ok).toBe(false);
    expect(v1.issues.some((i) => i.startsWith("SESSION_CHAIN_BROKEN") && i.includes("line 2"))).toBe(true);
    // extending a broken chain is REFUSED
    expect(() => appendSessionEvent(root, { kind: "note", note: "never" }, at(3))).toThrow(/SESSION_CHAIN_BROKEN/);
    // DELETED line — restore, then remove
    const good = readFileSync(streamPath, "utf-8").split("\n").filter(Boolean);
    writeFileSync(streamPath, good[0] + "\n");
    const v2 = verifySessions(root);
    expect(v2.ok).toBe(false);
    expect(v2.issues.some((i) => i.startsWith("SESSION_CHAIN_BROKEN") && /line\(s\) 2/.test(i))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
  test("a tampered CLOSED envelope is detected against its index pin; logging after close is refused", () => {
    const root = freshRoot();
    openSession(root);
    appendSessionEvent(root, { kind: "code", note: "the work" }, at(5));
    closeSession(root, [{ statement: "sealed lesson", evidence: ["D-430"], appliesTo: ["Ω-DEV.6"] }], at(10));
    // tamper: rewrite an event note inside the sealed envelope
    const envPath = join(root, "sessions/closed");
    const idx = JSON.parse(readFileSync(join(envPath, "index.json"), "utf-8")) as Array<{ id: string }>;
    const envFile = join(envPath, `${idx[0].id}.json`);
    const env = JSON.parse(readFileSync(envFile, "utf-8")) as { events: SessionEvent[] };
    env.events[0].note = "history was different";
    writeFileSync(envFile, JSON.stringify(env, null, 2) + "\n");
    const v = verifySessions(root);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.startsWith("SESSION_ENVELOPE_TAMPERED"))).toBe(true);
    // no session is open — logging is refused
    expect(() => appendSessionEvent(root, { kind: "note", note: "ghost" }, at(15))).toThrow(/SESSION_NONE_OPEN/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-SESSION.3 time-stamped-events", () => {
  test("every event carries a parseable ISO at and non-negative tMs; a regressed tMs is refused", () => {
    const root = freshRoot();
    openSession(root);
    const r1 = appendSessionEvent(root, { kind: "code", note: "first" }, at(10));
    expect(r1.tMs).toBe(600_000);
    const ev = parseEvent(readFileSync(join(root, "sessions/stream.jsonl"), "utf-8").split("\n")[0]);
    expect(ev.event).not.toBeNull();
    expect(Number.isNaN(Date.parse(ev.event!.at))).toBe(false);
    expect(ev.event!.tMs).toBeGreaterThanOrEqual(0);
    // wall clock steps BACK past the last event — refused, surfaced, never absorbed
    expect(() => appendSessionEvent(root, { kind: "code", note: "time traveler" }, at(5))).toThrow(/SESSION_TIME_REGRESS/);
    // shape enforcement
    expect(parseEvent(JSON.stringify({ at: "not-a-date", tMs: 1, kind: "note", note: "x" })).issues.join(" ")).toContain("at");
    expect(parseEvent(JSON.stringify({ at: "2026-09-22T10:00:00Z", tMs: -5, kind: "note", note: "x" })).issues.join(" ")).toContain("tMs");
    expect(parseEvent(JSON.stringify({ at: "2026-09-22T10:00:00Z", tMs: 1, kind: "vibe", note: "x" })).issues.join(" ")).toContain("kind");
    rmSync(root, { recursive: true, force: true });
  });
  test("editing ONLY an event's at breaks the chain — timestamps are inside the witness", () => {
    const root = freshRoot();
    openSession(root);
    appendSessionEvent(root, { kind: "code", note: "honest" }, at(10));
    const p = join(root, "sessions/stream.jsonl");
    const raw = readFileSync(p, "utf-8").split("\n")[0];
    const ev = JSON.parse(raw) as SessionEvent;
    ev.at = "2020-01-01T00:00:00.000Z"; // backdate only the timestamp
    writeFileSync(p, serializeEvent(ev) + "\n");
    const v = verifySessions(root);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.startsWith("SESSION_CHAIN_BROKEN"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-SESSION.4 publish-gate", () => {
  test("the preflight refuses an open session and a broken store by name; green with none open; a store absent is tolerated", () => {
    const GREEN: Parameters<typeof preflightVerdict>[0] = {
      cleanTree: true, treeDetail: "", quickGreen: true, quickDetail: "ok",
      decisionsGreen: true, decisionsDetail: "ok", boardFresh: true, boardDetail: "fresh",
      statusCarried: true, statusDetail: "ok", ledgerOk: true, ledgerDetail: "ok",
      tipAdvanced: true, tipDetail: "ok", sessionOk: true, sessionDetail: "none open",
    };
    expect(preflightVerdict(GREEN)).toEqual({ ok: true, refusals: [] });
    const openV = preflightVerdict({ ...GREEN, sessionOk: false, sessionDetail: 'session 20260922-100000-x ("land") open since 2026-09-22T10:00:00Z with 12 event(s)' });
    expect(openV.ok).toBe(false);
    expect(openV.refusals[0]).toMatch(/session not closed: session 20260922-100000-x .* — the retrospective is part of the publish ceremony; run omega:session close \(D-430\)/);
    const brokenV = preflightVerdict({ ...GREEN, sessionOk: false, sessionDetail: "sessions store RED — SESSION_CHAIN_BROKEN: line 2 hash mismatch" });
    expect(brokenV.ok).toBe(false);
    expect(brokenV.refusals[0]).toMatch(/session not closed: sessions store RED/);
  });
  test("the real store drives the fact: open → not ok; closed → ok; absent → ok (the fresh-clone world)", () => {
    const root = freshRoot();
    // absent store
    const absent = verifySessions(root);
    expect(absent.ok).toBe(true);
    expect(absent.open).toBeNull();
    // open store
    openSession(root);
    appendSessionEvent(root, { kind: "code", note: "mid-flight" }, at(3));
    const openState = verifySessions(root);
    expect(openState.ok).toBe(true);
    expect(openState.open?.mission).toBe("the fixture mission");
    expect(openState.openEvents).toBe(1);
    // closed store
    closeSession(root, [{ statement: "the fixture lesson", evidence: ["D-430"], appliesTo: ["Ω-DEV.6"] }], at(9));
    const closedState = verifySessions(root);
    expect(closedState.ok).toBe(true);
    expect(closedState.open).toBeNull();
    expect(closedState.closedCount).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-SESSION.5 structured-retrospective", () => {
  test("close with zero lessons is refused and NOTHING is sealed; the session stays open", () => {
    const root = freshRoot();
    openSession(root);
    appendSessionEvent(root, { kind: "code", note: "the work" }, at(5));
    expect(() => closeSession(root, [], at(10))).toThrow(/SESSION_RETROSPECTIVE_REQUIRED/);
    expect(existsSync(join(root, "sessions/closed"))).toBe(false);
    expect(verifySessions(root).open).not.toBeNull();
    rmSync(root, { recursive: true, force: true });
  });
  test("an empty stream cannot claim a retrospective", () => {
    const root = freshRoot();
    openSession(root);
    expect(() => closeSession(root, [{ statement: "nothing happened, trust me", evidence: ["D-430"], appliesTo: ["Ω-DEV.6"] }], at(5))).toThrow(/SESSION_EMPTY_STREAM/);
    rmSync(root, { recursive: true, force: true });
  });
  test("lessons graduate to the dev-vault, idempotently, and the envelope cites the vault ids", () => {
    const root = freshRoot();
    // pre-existing identical statement in the vault — close must REUSE it, not duplicate
    const pre: DevEntry = {
      id: "20260922-pre-existing-lesson", type: "lesson", at: "2026-09-22T09:00:00.000Z", agent: "test",
      context: "an earlier session", statement: "the recurring lesson", evidence: ["D-428"], appliesTo: ["Ω-DEV.4"], retention: "dev-vault-permanent",
    };
    recordDevEntry(root, pre);
    openSession(root);
    appendSessionEvent(root, { kind: "code", note: "the work" }, at(5));
    appendSessionEvent(root, { kind: "test", note: "green" }, at(8));
    const r = closeSession(root, [
      { statement: "the recurring lesson", evidence: ["D-428", "sessions/closed/…"], appliesTo: ["Ω-DEV.4"] },
      { statement: "the new lesson", evidence: ["D-430"], appliesTo: ["Ω-DEV.6"] },
    ], at(12));
    expect(r.vaultIds).toEqual(["20260922-pre-existing-lesson", "20260922-the-new-lesson"]);
    const vault = loadDevEntries(root);
    expect(vault.filter((e) => e.statement === "the recurring lesson").length).toBe(1); // no duplicate
    expect(vault.some((e) => e.statement === "the new lesson" && e.context.includes("session 20260922-1000"))).toBe(true);
    // the envelope cites the vault ids and the events byte-exactly
    const env = JSON.parse(readFileSync(join(root, r.envelope), "utf-8")) as { lessons: Array<{ vaultId: string }>; events: SessionEvent[]; streamSha256: string };
    expect(env.lessons.map((l) => l.vaultId)).toEqual(r.vaultIds);
    expect(env.streamSha256.length).toBe(64);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-SESSION.6 bottleneck-report", () => {
  const ev = (tMs: number, kind: SessionEvent["kind"], note: string, durationMs?: number): SessionEvent => ({
    at: new Date(T0.getTime() + tMs).toISOString(), tMs, kind, note,
    ...(durationMs !== undefined ? { data: { durationMs } } : {}),
  });
  test("the report folds the timings: wall, kind counts, cumulative durations, top gaps with notes, slowest ops", () => {
    const events = [
      ev(0, "plan", "read the tree"),
      ev(30_000, "code", "scaffold", 300_000),
      ev(30_000 + 41 * 60_000, "test", "RED stubs proven", 60_000),   // 41m gap — the rework friction
      ev(30_000 + 41 * 60_000 + 45_000, "gate-run", "full gate green", 612_000),   // 45s gap — below threshold
      ev(30_000 + 41 * 60_000 + 75_000, "decision", "ratified"),                   // 30s gap — below threshold
    ];
    const r = bottleneckReport(events);
    expect(r.eventCount).toBe(5);
    expect(r.wallMs).toBe(events[events.length - 1].tMs);
    expect(r.kindCounts["code"]).toBe(1);
    expect(r.kindDurationMs["code"]).toBe(300_000);
    expect(r.kindDurationMs["gate-run"]).toBe(612_000);
    expect(r.topGaps.length).toBe(1);                                  // only the 41m gap clears MIN_GAP_MS
    expect(r.topGaps[0].gapMs).toBe(41 * 60_000);
    expect(r.topGaps[0].afterNote).toBe("scaffold");
    expect(r.topGaps[0].beforeNote).toBe("RED stubs proven");
    expect(r.slowOps[0]).toMatchObject({ kind: "gate-run", durationMs: 612_000 });
    const lines = renderBottleneckReport(r).join("\n");
    expect(lines).toContain("bottleneck report");
    expect(lines).toContain("top silence gaps");
    expect(lines).toContain("scaffold");
    expect(lines).toContain("full gate green");
  });
  test("degenerate inputs degrade honestly — same fold, byte-identical; a single event never crashes", () => {
    const single = [ev(0, "note", "alone")];
    const r = bottleneckReport(single);
    expect(r.wallMs).toBe(0);
    expect(r.topGaps).toEqual([]);
    expect(r.slowOps).toEqual([]);
    expect(renderBottleneckReport(r).join("\n")).toContain("a single event");
    const events = [ev(0, "code", "a", 1_000), ev(120_000, "code", "b", 2_000)];
    expect(JSON.stringify(bottleneckReport(events))).toBe(JSON.stringify(bottleneckReport([...events])));
    expect(bottleneckReport([])).toMatchObject({ wallMs: 0, eventCount: 0, topGaps: [], slowOps: [] });
  });
  test("gates.log rows inside the window import as gate-run events, idempotently", () => {
    const root = freshRoot();
    mkdirSync(join(root, "build"), { recursive: true });
    writeFileSync(join(root, "build/gates.log"), [
      JSON.stringify({ ok: true, tests: { pass: 1232, fail: 0 }, at: at(4).toISOString() }),
      JSON.stringify({ ok: false, tests: { pass: 1231, fail: 1 }, at: at(6).toISOString() }),
      JSON.stringify({ ok: true, tests: { pass: 1190, fail: 0 }, at: "2026-09-20T22:24:15.029Z" }), // before begin — skipped
    ].join("\n") + "\n");
    openSession(root);
    const r1 = importGatesLog(root, at(10));
    expect(r1.imported).toBe(2);
    const r2 = importGatesLog(root, at(11));
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(2);
    const events = readFileSync(join(root, "sessions/stream.jsonl"), "utf-8").split("\n").filter(Boolean).map((l) => parseEvent(l).event!);
    expect(events.every((e) => e.kind === "gate-run")).toBe(true);
    expect(events[0].data?.["ok"]).toBe(true);
    expect(events[0].tMs).toBe(4 * 60_000);   // tMs derived from the ROW's at, not import time
    rmSync(root, { recursive: true, force: true });
  });
});
