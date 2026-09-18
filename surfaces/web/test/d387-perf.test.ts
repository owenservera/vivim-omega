// surfaces/web — D-387 falsifiers (2026-09-18 external performance review):
//   #1 · startWorldPoll — the poll is GATED on connected sockets (zero watchers →
//        zero vault reads), version-checks through the BODILESS snapshot, and only
//        pays for the full payload when the version actually changed
//   #5 · journalHistory — bounded backward read: correct last-N out of a huge
//        journal, boundary-safe (no trailing newline, partial first line, empty)
//   #6 · startJournalTail — async pump still emits appended lines and survives
//        truncation (offset reset)
// The service here is a FAKED ConsoleService (counting stub) — the real console
// composition is exercised by web.test.ts; this file pins the STREAM LOGIC.
import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import { createLiveStreams, journalHistory } from "../src/events.ts";

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

describe("D-387 #5 · bounded journalHistory (backward read)", () => {
  test("returns exactly the LAST maxLines parsed events out of a large journal", () => {
    const dir = tmp("jh-large");
    const jp = join(dir, "law-journal.jsonl");
    const N = 5000;
    for (let i = 0; i < N; i++) appendFileSync(jp, JSON.stringify({ ts: i, op: "t", seq: i }) + "\n");
    const got = journalHistory(dir, 60);
    expect(got).toHaveLength(60);
    expect((got[0] as { seq: number }).seq).toBe(N - 60);
    expect((got[59] as { seq: number }).seq).toBe(N - 1);
  });

  test("boundary safety: no trailing newline (partial last line still parses), fewer lines than the window, empty, missing", () => {
    const dir = tmp("jh-edge");
    // no trailing newline
    const jp = join(dir, "law-journal.jsonl");
    writeFileSync(jp, JSON.stringify({ ts: 1, a: 1 }) + "\n" + JSON.stringify({ ts: 2, b: 2 })); // no \n at EOF
    expect(journalHistory(dir, 60)).toEqual([{ ts: 1, a: 1 }, { ts: 2, b: 2 }]);
    // fewer complete lines than maxLines → all of them
    rmSync(jp, { force: true });
    writeFileSync(jp, JSON.stringify({ ts: 1 }) + "\n");
    expect(journalHistory(dir, 60)).toEqual([{ ts: 1 }]);
    // empty file
    rmSync(jp, { force: true });
    writeFileSync(jp, "");
    expect(journalHistory(dir, 60)).toEqual([]);
    // missing file
    expect(journalHistory(tmp("jh-absent"), 60)).toEqual([]);
  });

  test("a huge single line spanning many chunks does not corrupt its neighbors", () => {
    const dir = tmp("jh-huge");
    const jp = join(dir, "law-journal.jsonl");
    const big = "z".repeat(60_000); // > 3 chunks — forces multi-chunk backward assembly
    writeFileSync(jp, JSON.stringify({ ts: 0, big }) + "\n" + JSON.stringify({ ts: 1, tail: "last" }) + "\n");
    const got = journalHistory(dir, 60);
    expect(got).toHaveLength(2);
    expect((got[0] as { big: string }).big).toHaveLength(60_000);
    expect((got[1] as { tail: string }).tail).toBe("last");
  });
});

describe("D-387 #6 · async journal tail pump", () => {
  test("appended lines are emitted within a tick window; truncation resets the offset", async () => {
    const dir = tmp("tail");
    const jp = join(dir, "law-journal.jsonl");
    writeFileSync(jp, JSON.stringify({ ts: 0, boot: true }) + "\n");
    const io = fakeIo(0);
    const streams = createLiveStreams();
    const stop = streams.startJournalTail(io as never, dir);
    await sleep(400); // initial pump + a couple of async ticks
    expect(io.emitted.filter((e) => e.event === "journal").length).toBeGreaterThan(0);
    // append → the async pump must pick it up
    const before = io.emitted.length;
    appendFileSync(jp, JSON.stringify({ ts: 1, live: true }) + "\n");
    await sleep(600);
    expect(io.emitted.length).toBeGreaterThan(before);
    const flat = io.emitted.filter((e) => e.event === "journal").flatMap((e) => (e.payload as { events: { live?: boolean }[] }).events);
    expect(flat.some((e) => e.live === true)).toBe(true);
    // truncation (size < offset) → offset resets, tail continues from the new head
    rmSync(jp, { force: true });
    writeFileSync(jp, JSON.stringify({ ts: 2, fresh: true }) + "\n");
    await sleep(600);
    const flat2 = io.emitted.filter((e) => e.event === "journal").flatMap((e) => (e.payload as { events: { fresh?: boolean }[] }).events);
    expect(flat2.some((e) => e.fresh === true)).toBe(true);
    stop();
    expect(existsSync(jp)).toBe(true);
  });
});
