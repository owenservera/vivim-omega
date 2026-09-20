// surfaces/web — D-387 falsifiers (2026-09-18 external performance review):
//   #1 · startWorldPoll — the poll is GATED on connected sockets (zero watchers →
//        zero vault reads), version-checks through the BODILESS snapshot, and only
//        pays for the full payload when the version actually changed
//   #5 · journalHistory — bounded read: the LAST maxLines rows out of a huge
//        vault journal, fetched with exactly ONE query + getmany of ONLY those
//        ids (cost tracks what is shown)
//   #6 · startJournalTail — the async pump emits new vault rows within a tick
//        window, never re-emits seen rows, and a transient vault failure skips
//        its tick without dropping anything (unseen ids retry)
// D-416 (S3, the fold) rewrote #5/#6 from the retired file tail to the vault
// readers (journalId family query + bounded getmany) — the D-387 invariants
// carry over unchanged; the falsifiers got STRONGER (the bounded property is
// now counted: the fake RootCall records every getmany id requested).
// The service here is a FAKED ConsoleService (counting stub) — the real console
// composition is exercised by web.test.ts; this file pins the STREAM LOGIC.
import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import { createLiveStreams, journalHistory, journalTail, type RootCall, type JournalLine } from "../src/events.ts";
import type { PortResult } from "@vivim/omega-contracts";

function tmp(name: string): string {
  const dir = omegaTmp("omega-web-test/d387", `${name}-${Date.now()}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

interface FakeIo {
  sockets: { sockets: Map<string, unknown> };
  emitted: Array<{ event: string; payload: unknown }>;
  emit(event: string, payload?: unknown): void;
}
function fakeIo(watchers = 0): FakeIo {
  const sockets = new Map<string, unknown>();
  for (let i = 0; i < watchers; i++) sockets.set(`s${i}`, {});
  return { sockets: { sockets }, emitted: [], emit(event, payload) { this.emitted.push({ event, payload }); } };
}
interface CountingService {
  lightCalls: number;
  fullCalls: number;
  v: number; // mutable — tests flip it to simulate a world change
  world(): Promise<{ v: number }>;
  worldLight(): Promise<{ v: number }>;
}
function countingService(v0: number): CountingService {
  return {
    lightCalls: 0,
    fullCalls: 0,
    v: v0,
    async world() { this.fullCalls++; return { v: this.v }; },
    async worldLight() { this.lightCalls++; return { v: this.v }; },
  };
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => { /* timers are stopped by each test's stop() */ });

// ---- D-416 (S3/F-6): the fake vault — an in-memory ns-law store behind a
// RootCall, counting every query and every getmany id (the bounded property is
// OBSERVED, not assumed). Journal ids use the fold's real shape so ordering
// behaves exactly as production (padded boot-seq: lexicographic == chronological).
interface FakeVault {
  rows: Map<string, JournalLine>;
  queryCalls: number;
  getmanyIds: string[]; // every id ever requested, flattened
  failNext: boolean; // one-shot: the next query fails (the transient-tick test)
}
function fakeVault(): FakeVault {
  return { rows: new Map(), queryCalls: 0, getmanyIds: [], failNext: false };
}
function jid(seq: number): string {
  return `journal:${"000000001"}-${seq.toString(36).padStart(9, "0")}`;
}
function fakeRootCall(v: FakeVault): RootCall {
  return async (op: string, payload?: unknown): Promise<PortResult> => {
    if (op === "vault.query@1") {
      v.queryCalls++;
      if (v.failNext) { v.failNext = false; return { ok: false, error: "DEGRADED", detail: "simulated transient vault failure" }; }
      const p = (payload ?? {}) as { filter?: { idPrefix?: string } };
      const prefix = p.filter?.idPrefix ?? "";
      const ids = [...v.rows.keys()].filter((id) => id.startsWith(prefix)).sort();
      return { ok: true, value: ids.map((id) => ({ id, rev: 1, cid: `cid:${id}` })) };
    }
    if (op === "vault.getmany@1") {
      const p = (payload ?? {}) as { ids?: string[] };
      const ids = p.ids ?? [];
      v.getmanyIds.push(...ids);
      return { ok: true, value: ids.map((id) => ({ id, found: v.rows.has(id), ...(v.rows.has(id) ? { rev: 1, cid: `cid:${id}`, data: v.rows.get(id) } : {}) })) };
    }
    return { ok: false, error: "REFUSED", detail: `no fake for ${op}` };
  };
}

describe("D-387 #1 · socket-gated world poll", () => {
  test("zero connected sockets → ZERO vault reads (the old poll read forever)", async () => {
    const io = fakeIo(0);
    const svc = countingService([7]);
    const stop = createLiveStreams().startWorldPoll(io as never, svc as never, 15);
    await sleep(120); // ~8 ticks
    stop();
    expect(svc.lightCalls).toBe(0);
    expect(svc.fullCalls).toBe(0);
    expect(io.emitted).toHaveLength(0);
  });

  test("watcher present, version UNCHANGED → light checks only (no full payloads, no baseline fetch)", async () => {
    const io = fakeIo(1);
    const svc = countingService(7);
    const stop = createLiveStreams().startWorldPoll(io as never, svc as never, 15);
    await sleep(120);
    stop();
    expect(svc.lightCalls).toBeGreaterThan(0);
    expect(svc.fullCalls).toBe(0); // even the baseline observation rides the light call
    expect(io.emitted.filter((e) => e.event === "world")).toHaveLength(0);
  });

  test("version CHANGES under a watcher → one full fetch + one world emit; baseline stays silent", async () => {
    const io = fakeIo(1);
    const svc = countingService(7);
    const stop = createLiveStreams().startWorldPoll(io as never, svc as never, 15);
    await sleep(80); // baseline: light only, lastV = 7, nothing emitted
    expect(io.emitted.filter((e) => e.event === "world")).toHaveLength(0);
    svc.v = 9; // the world changes under the watcher
    await sleep(150);
    stop();
    expect(svc.lightCalls).toBeGreaterThan(1);
    expect(svc.fullCalls).toBe(1);
    const worlds = io.emitted.filter((e) => e.event === "world");
    expect(worlds).toHaveLength(1);
    expect((worlds[0]!.payload as { world: { v: number } }).world.v).toBe(9);
  });

  test("watcher arrives mid-test → baseline is light; the next bump emits exactly once", async () => {
    const io = fakeIo(0);
    const svc = countingService(3);
    const stop = createLiveStreams().startWorldPoll(io as never, svc as never, 15);
    await sleep(60); // gated: no reads at all while nobody watches
    expect(svc.lightCalls).toBe(0);
    io.sockets.sockets.set("s0", {}); // a browser opens the console
    await sleep(80); // baseline light observation (v3, silent)
    svc.v = 5; // the bump
    await sleep(150);
    stop();
    const worlds = io.emitted.filter((e) => e.event === "world");
    expect(worlds).toHaveLength(1);
    expect((worlds[0]!.payload as { world: { v: number } }).world.v).toBe(5);
  });
});

describe("D-387 #5 (D-416 rewrite) · bounded journalHistory (vault read)", () => {
  test("returns exactly the LAST maxLines rows out of a huge vault journal — ONE query, getmany of ONLY those ids", async () => {
    const v = fakeVault();
    const call = fakeRootCall(v);
    const N = 5000;
    for (let i = 0; i < N; i++) v.rows.set(jid(i), { ts: i, op: "t", seq: i });
    const got = await journalHistory(call, 60);
    expect(got).toHaveLength(60);
    expect((got[0] as { seq: number }).seq).toBe(N - 60); // chronological head of the window
    expect((got[59] as { seq: number }).seq).toBe(N - 1); // the newest row
    // the D-387 invariant, COUNTED: cost tracks what is shown — exactly one
    // query for the id family, and getmany for ONLY the last 60 ids (never
    // the journal's lifetime bytes). OLD CODE FAILS HERE: the file tail had no
    // vault read path at all.
    expect(v.queryCalls).toBe(1);
    expect(v.getmanyIds).toHaveLength(60);
    expect(v.getmanyIds).toEqual(Array.from({ length: 60 }, (_, k) => jid(N - 60 + k)));
  });

  test("boundary safety: fewer rows than the window, empty store, non-journal rows invisible", async () => {
    const v = fakeVault();
    const call = fakeRootCall(v);
    // empty → []
    expect(await journalHistory(call, 60)).toEqual([]);
    // one row → all of it
    v.rows.set(jid(0), { ts: 1, only: true });
    expect(await journalHistory(call, 60)).toEqual([{ ts: 1, only: true }]);
    // non-journal ns-law rows (the forbidden overlay) are invisible to the family query
    v.rows.set("forbidden:omega.risky", { principal: "omega.risky", ops: ["risky.op@1"] });
    const got = await journalHistory(call, 60);
    expect(got).toHaveLength(1);
    expect((got[0] as { only?: boolean }).only).toBe(true);
  });

  test("a huge row body is one getmany body, not a chunk-walk (no size-dependent read machinery)", async () => {
    const v = fakeVault();
    const call = fakeRootCall(v);
    const big = "z".repeat(60_000);
    v.rows.set(jid(0), { ts: 0, big });
    v.rows.set(jid(1), { ts: 1, tail: "last" });
    const got = await journalHistory(call, 60);
    expect(got).toHaveLength(2);
    expect((got[0] as { big?: string }).big).toHaveLength(60_000);
    expect((got[1] as { tail?: string }).tail).toBe("last");
  });
});

describe("D-387 #6 (D-416 rewrite) · async vault journal tail pump", () => {
  test("new rows are emitted within a tick window; seen rows never re-emit; a transient failure skips its tick and drops nothing", async () => {
    const v = fakeVault();
    const call = fakeRootCall(v);
    v.rows.set(jid(0), { ts: 0, boot: true });
    const io = fakeIo(0);
    const streams = createLiveStreams();
    const service = {
      journalTail: (seen: Set<string>): Promise<JournalLine[]> => journalTail(call, seen),
    };
    const stop = streams.startJournalTail(io as never, service as never);
    await sleep(400); // initial pump + a couple of async ticks
    expect(io.emitted.filter((e) => e.event === "journal").length).toBeGreaterThan(0);

    // append → the async pump must pick it up
    const before = io.emitted.length;
    v.rows.set(jid(1), { ts: 1, live: true });
    await sleep(600);
    expect(io.emitted.length).toBeGreaterThan(before);
    const flat = io.emitted.filter((e) => e.event === "journal").flatMap((e) => (e.payload as { events: { live?: boolean }[] }).events);
    expect(flat.some((e) => e.live === true)).toBe(true);

    // seen rows never re-emit (the id diff — the tail's whole correctness)
    await sleep(600);
    const journalEmits = io.emitted.filter((e) => e.event === "journal").length;
    await sleep(600);
    expect(io.emitted.filter((e) => e.event === "journal").length).toBe(journalEmits); // idle → silent

    // a transient vault failure skips its tick WITHOUT dropping anything: the
    // row appended during the outage still arrives on a later tick
    v.failNext = true;
    v.rows.set(jid(2), { ts: 2, outage: true });
    await sleep(900); // the failed tick + recovery ticks
    const flat2 = io.emitted.filter((e) => e.event === "journal").flatMap((e) => (e.payload as { events: { outage?: boolean }[] }).events);
    expect(flat2.some((e) => e.outage === true)).toBe(true); // retried, never dropped
    stop();
  });
});
