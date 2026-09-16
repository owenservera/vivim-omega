// Ω3 unit tests — queue / pool / health driven directly with a fake port.
// No compartments are spawned here; the integration suite boots the real thing.
import { describe, test, expect } from "bun:test";
import {
  PriorityTaskQueue,
  clampDeadline,
  normalizePriority,
  SATURATION_FACTOR,
} from "../src/queue.ts";
import { TaskPool, freshnessFor } from "../src/pool.ts";
import { HealthMonitor, type CompartmentStats } from "../src/health.ts";
import type { PortResult } from "@vivim/omega-contracts";
import { HOST_OPS } from "@vivim/omega-contracts";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("Ω3 queue", () => {
  test("FIFO within a priority level", () => {
    const q = new PriorityTaskQueue(4);
    for (const op of ["a", "b", "c"]) q.submit({ op, priority: "normal" });
    expect(q.take()?.op).toBe("a");
    expect(q.take()?.op).toBe("b");
    expect(q.take()?.op).toBe("c");
    expect(q.take()).toBeNull();
  });

  test("strict priority order across levels, FIFO inside each", () => {
    const q = new PriorityTaskQueue(8);
    q.submit({ op: "low.1", priority: "low" });
    q.submit({ op: "norm.1", priority: "normal" });
    q.submit({ op: "high.1", priority: "high" });
    q.submit({ op: "high.2", priority: "high" });
    q.submit({ op: "low.2", priority: "low" });
    expect([q.take()?.op, q.take()?.op, q.take()?.op, q.take()?.op, q.take()?.op]).toEqual([
      "high.1", "high.2", "norm.1", "low.1", "low.2",
    ]);
  });

  test("saturation at capacity*4 is an explicit structured rejection (never silent)", () => {
    const capacity = 2;
    const q = new PriorityTaskQueue(capacity);
    // two tasks claim running slots
    q.submit({ op: "r1" });
    q.submit({ op: "r2" });
    q.take();
    q.take();
    expect(q.running).toBe(2);
    // fill pending up to pending+running === capacity*4
    for (let i = 0; i < capacity * SATURATION_FACTOR - 2; i++) q.submit({ op: `p${i}` });
    expect(q.queued).toBe(capacity * SATURATION_FACTOR - 2);
    const rej = q.submit({ op: "overflow" });
    expect(rej).toEqual({
      accepted: false,
      reason: "saturated",
      queued: capacity * SATURATION_FACTOR - 2,
      running: 2,
      capacity,
    });
  });

  test("deadline + priority normalization is total (no input throws)", () => {
    expect(clampDeadline(undefined)).toBe(5_000);
    expect(clampDeadline(0)).toBe(1);
    expect(clampDeadline(-5)).toBe(1);
    expect(clampDeadline(Number.POSITIVE_INFINITY)).toBe(60_000);
    expect(clampDeadline(12.9)).toBe(12);
    expect(clampDeadline("nope")).toBe(5_000);
    expect(normalizePriority("high")).toBe("high");
    expect(normalizePriority("low")).toBe("low");
    expect(normalizePriority("junk")).toBe("normal");
    expect(normalizePriority(undefined)).toBe("normal");
  });

  test("tasks carry their own deadline and submission time", () => {
    const q = new PriorityTaskQueue(2);
    const out = q.submit({ op: "x", deadlineMs: 250 });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.task.deadlineMs).toBe(250);
      expect(out.task.submittedAt).toBeGreaterThan(0);
      expect(out.task.id).toBeTruthy();
    }
  });
});

describe("Ω3 pool", () => {
  function fakeCaller(scripts: Record<string, (payload: any, opts: { deadlineMs?: number }) => Promise<PortResult>>) {
    const state = { calls: [] as string[], concurrent: 0, maxConcurrent: 0, deadlines: [] as (number | undefined)[] };
    const caller = {
      state,
      call: (op: string, payload: unknown, opts?: { deadlineMs?: number }): Promise<PortResult> => {
        state.calls.push(op);
        state.deadlines.push(opts?.deadlineMs);
        state.concurrent += 1;
        state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
        const script = scripts[op] ?? (async () => ({ ok: true, value: { op } }) as PortResult);
        return script(payload, opts).finally(() => { state.concurrent -= 1; });
      },
    };
    return caller;
  }

  test("at most `capacity` tasks run concurrently", async () => {
    const caller = fakeCaller({
      slow: () => sleep(25).then(() => ({ ok: true, value: { ran: true } }) as PortResult),
    });
    const pool = new TaskPool({ capacity: 2, caller });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => pool.submit({ op: "slow", payload: { i } })),
    );
    expect(caller.state.maxConcurrent).toBeLessThanOrEqual(2);
    expect(caller.state.calls.length).toBe(6);
    expect(results.every((r) => "accepted" in r && r.accepted && r.status === "ok")).toBe(true);
    expect(pool.stats().running).toBe(0);
  });

  test("priority decides execution order when slots free up", async () => {
    const caller = fakeCaller({
      blocker: () => sleep(40).then(() => ({ ok: true, value: 1 }) as PortResult),
      "low.task": () => sleep(1).then(() => ({ ok: true, value: 1 }) as PortResult),
      "high.task": () => sleep(1).then(() => ({ ok: true, value: 1 }) as PortResult),
    });
    const pool = new TaskPool({ capacity: 1, caller });
    const all = [
      pool.submit({ op: "blocker" }),
      pool.submit({ op: "low.task", priority: "low" }),
      pool.submit({ op: "high.task", priority: "high" }),
    ];
    await Promise.all(all);
    expect(caller.state.calls).toEqual(["blocker", "high.task", "low.task"]);
  });

  test("freshness contract: >50% remaining → CURRENT, >0 → LAGGING, else STALE", () => {
    expect(freshnessFor(100, 5)).toBe("CURRENT");
    expect(freshnessFor(100, 49)).toBe("CURRENT");
    expect(freshnessFor(100, 51)).toBe("LAGGING");
    expect(freshnessFor(100, 99)).toBe("LAGGING");
    expect(freshnessFor(100, 100)).toBe("STALE");
    expect(freshnessFor(100, 150)).toBe("STALE");
  });

  test("single-settle pin (E-4): every admitted submit resolves exactly once, even racing the slow path", async () => {
    // The index-level watchdog (deadline + slack race) may abandon a submit
    // whose pool task settles late — the pool promise itself must still settle
    // exactly once (no double-resolve, no hang), and capacity must free.
    const caller = fakeCaller({
      slow: () => sleep(30).then(() => ({ ok: true, value: { ran: true } }) as PortResult),
    });
    const pool = new TaskPool({ capacity: 1, caller });
    let settlements = 0;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        pool.submit({ op: "slow", deadlineMs: 5_000 }).then((r) => {
          settlements++;
          return r;
        }),
      ),
    );
    expect(settlements).toBe(4);
    expect(results.every((r) => "accepted" in r && r.accepted && r.status === "ok")).toBe(true);
    expect(pool.stats().completed).toBe(4);
    expect(pool.stats().running).toBe(0);
    expect(pool.stats().queued).toBe(0);
  });

  test("timeout mapping: BUDGET result → status 'timeout', freshness STALE; ok fast → CURRENT", async () => {
    const caller = fakeCaller({
      quick: async () => ({ ok: true, value: 42 }) as PortResult,
      over: () => sleep(30).then(() => ({ ok: false, error: "BUDGET", detail: "deadline exceeded" }) as PortResult),
      broken: async () => ({ ok: false, error: "DEGRADED", detail: "impl gone" }) as PortResult,
    });
    const pool = new TaskPool({ capacity: 3, caller });
    const quick = (await pool.submit({ op: "quick", deadlineMs: 1_000 })) as any;
    expect(quick.status).toBe("ok");
    expect(quick.freshness).toBe("CURRENT");
    expect(quick.result.ok).toBe(true);
    const over = (await pool.submit({ op: "over", deadlineMs: 20 })) as any;
    expect(over.status).toBe("timeout");
    expect(over.freshness).toBe("STALE");
    const broken = (await pool.submit({ op: "broken", deadlineMs: 1_000 })) as any;
    expect(broken.status).toBe("error");
    expect(broken.freshness).toBe("CURRENT");
    const stats = pool.stats();
    expect(stats).toMatchObject({ completed: 3, ok: 1, timeouts: 1, errors: 1, rejected: 0 });
  });

  test("task that expires while queued: timeout/STALE with NO port call (attributable detail)", async () => {
    const caller = fakeCaller({
      blocker: () => sleep(50).then(() => ({ ok: true, value: 1 }) as PortResult),
      never: async () => ({ ok: true, value: 1 }) as PortResult,
    });
    const pool = new TaskPool({ capacity: 1, caller });
    const blocker = pool.submit({ op: "blocker", deadlineMs: 500 });
    const late = pool.submit({ op: "never", deadlineMs: 10 }); // expires behind the blocker
    const [b, l] = (await Promise.all([blocker, late])) as any[];
    expect(b.status).toBe("ok");
    expect(l.status).toBe("timeout");
    expect(l.freshness).toBe("STALE");
    expect(l.result.error).toBe("BUDGET");
    expect(l.result.detail).toContain("expired while queued");
    expect(caller.state.calls).not.toContain("never");
  });

  test("pool saturation: explicit rejections counted, no silent drops", async () => {
    const caller = fakeCaller({
      slow: () => sleep(20).then(() => ({ ok: true, value: 1 }) as PortResult),
    });
    const pool = new TaskPool({ capacity: 1, caller });
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => pool.submit({ op: "slow", payload: { i } })),
    );
    const rejected = outcomes.filter((o) => !o.accepted);
    const executed = outcomes.filter((o) => o.accepted);
    // capacity 1 → saturation at 4: 1 running + 3 queued accepted, the rest rejected
    expect(rejected.length).toBe(2);
    expect(rejected[0]).toMatchObject({ accepted: false, reason: "saturated", capacity: 1 });
    expect(executed.length).toBe(4);
    const stats = pool.stats();
    expect(stats.rejected).toBe(2);
    expect(stats.completed).toBe(4);
    expect(stats.queued).toBe(0);
    expect(stats.running).toBe(0);
  });

  test("malformed submits return structured errors, never throw", async () => {
    const caller = fakeCaller({});
    const pool = new TaskPool({ capacity: 1, caller });
    const bad = (await pool.submit({ op: "" })) as any;
    expect(bad.accepted).toBe(true);
    expect(bad.status).toBe("error");
    expect(bad.result.error).toBe("REFUSED");
    const worse = (await pool.submit(null)) as any;
    expect(worse.status).toBe("error");
    const nope = (await pool.submit({ op: "x", deadlineMs: "soon" })) as any;
    expect(nope.deadlineMs).toBe(5_000); // clamped, still executed
    expect(nope.status).toBe("ok");
  });

  test("port deadline passed to the caller is the REMAINING budget (queue wait counts)", async () => {
    const caller = fakeCaller({
      blocker: () => sleep(30).then(() => ({ ok: true, value: 1 }) as PortResult),
      probe: async () => ({ ok: true, value: 1 }) as PortResult,
    });
    const pool = new TaskPool({ capacity: 1, caller });
    const blocker = pool.submit({ op: "blocker", deadlineMs: 500 });
    const probe = pool.submit({ op: "probe", deadlineMs: 200 });
    await Promise.all([blocker, probe]);
    // the probe waited ~30ms behind the blocker, so its port deadline must be < 200
    const probeDeadline = caller.state.deadlines[caller.state.deadlines.length - 1];
    expect(typeof probeDeadline).toBe("number");
    expect(probeDeadline!).toBeLessThan(200);
    expect(probeDeadline!).toBeGreaterThan(0);
  });
});

describe("Ω3 health monitor", () => {
  function scriptedStats(script: Array<Record<string, Partial<CompartmentStats>>>) {
    const calls: Array<{ op: string; payload: unknown; opts?: { deadlineMs?: number } }> = [];
    let i = 0;
    const caller = {
      calls,
      call: async (op: string, payload: unknown, opts?: { deadlineMs?: number }): Promise<PortResult> => {
        calls.push({ op, payload, opts });
        if (op === HOST_OPS.compartmentStats) {
          const value = script[Math.min(i, script.length - 1)];
          i += 1;
          return { ok: true, value };
        }
        if (op === HOST_OPS.compartmentTerminate) return { ok: true, value: { terminated: (payload as any).pluginId } };
        return { ok: false, error: "REFUSED", detail: `unexpected op ${op}` };
      },
    };
    return caller;
  }

  const stats = (crashes: number, state = "active"): Record<string, CompartmentStats> => ({
    "omega.echo": { state, delivered: 0, calls: 0, errors: 0, crashes, inflight: 0, bootedAt: 0 },
  });

  test("crash-loop rule: +2 crashes across 3 consecutive polls → quarantine + terminate", async () => {
    const caller = scriptedStats([stats(0), stats(1), stats(2), stats(2), stats(2), stats(2)]);
    const m = new HealthMonitor({ caller, selfId: "vivim.run" });
    await m.poll(); // crashes 0
    await m.poll(); // crashes 1
    await m.poll(); // crashes 2 → window [0,1,2] → delta 2
    const snap = m.snapshot();
    expect(snap.quarantined.length).toBe(1);
    expect(snap.quarantined[0].pluginId).toBe("omega.echo");
    expect(snap.quarantined[0].reason).toMatch(/crash-loop/);
    const terminates = caller.calls.filter((c) => c.op === HOST_OPS.compartmentTerminate);
    expect(terminates.length).toBe(1);
    expect(terminates[0].payload).toEqual({ pluginId: "omega.echo" });
    const increments = snap.events.filter((e) => e.type === "crash-increment");
    expect(increments.length).toBe(2); // 0→1 and 1→2
    expect(snap.compartments).toBeTruthy();
  });

  test("crash-persistence rule: single crash stuck degraded → quarantine (v1: no respawn)", async () => {
    const caller = scriptedStats([stats(0, "active"), stats(1, "degraded"), stats(1, "degraded"), stats(1, "degraded")]);
    const m = new HealthMonitor({ caller });
    await m.poll();
    await m.poll();
    await m.poll(); // window [0,1,1], latest state degraded → rule B
    const snap = m.snapshot();
    expect(snap.quarantined.length).toBe(1);
    expect(snap.quarantined[0].reason).toMatch(/crash-persistence/);
    expect(snap.events.some((e) => e.type === "crash-increment")).toBe(true);
    expect(caller.calls.some((c) => c.op === HOST_OPS.compartmentTerminate)).toBe(true);
  });

  test("no false positives: healthy or recovering compartments are never quarantined", async () => {
    const caller = scriptedStats([stats(0), stats(0), stats(0), stats(0)]);
    const m = new HealthMonitor({ caller });
    for (let i = 0; i < 4; i++) await m.poll();
    expect(m.snapshot().quarantined.length).toBe(0);
    expect(caller.calls.some((c) => c.op === HOST_OPS.compartmentTerminate)).toBe(false);

    // a crash whose compartment is NOT stuck degraded (hypothetical respawn) is not yet a loop
    const respawn = scriptedStats([stats(0, "active"), stats(1, "degraded"), stats(1, "active"), stats(1, "active")]);
    const m2 = new HealthMonitor({ caller: respawn });
    for (let i = 0; i < 4; i++) await m2.poll();
    expect(m2.snapshot().quarantined.length).toBe(0);
  });

  test("D-331: dormant compartments (never started) are observed but never quarantined", async () => {
    // host.compartment.stats reports dormant ids with zero counters (ports.ts);
    // the loop must tell "never started" apart from "started and unwell".
    const dormant: Record<string, CompartmentStats> = {
      "omega.echo": { state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0, inflight: 0, bootedAt: 0 },
    };
    const caller = scriptedStats([dormant, dormant, dormant, dormant]);
    const m = new HealthMonitor({ caller });
    for (let i = 0; i < 4; i++) await m.poll();
    expect(m.snapshot().quarantined.length).toBe(0);
    expect(caller.calls.some((c) => c.op === HOST_OPS.compartmentTerminate)).toBe(false);
    expect(m.snapshot().compartments?.["omega.echo"]?.state).toBe("dormant");
  });

  test("D-331 late observer: first sight of stuck-degraded with crashes quarantines (crash-persistence)", async () => {
    // Lazy activation starts this loop after crashes happened: the counters
    // persist, the transitions do not. First-sight degraded + crashes ≥ 1 is
    // crash-persistence by definition (v1 degraded is sticky — no respawn).
    const caller = scriptedStats([stats(2, "degraded")]);
    const m = new HealthMonitor({ caller });
    await m.poll();
    const snap = m.snapshot();
    expect(snap.quarantined.length).toBe(1);
    expect(snap.quarantined[0].pluginId).toBe("omega.echo");
    expect(snap.quarantined[0].reason).toMatch(/crash-persistence/);
    // ...while first-sight dormant (never started, zero crashes) stays clean.
    const calm = scriptedStats([{
      "omega.echo": { state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0, inflight: 0, bootedAt: 0 },
    }]);
    const m2 = new HealthMonitor({ caller: calm });
    await m2.poll();
    await m2.poll();
    expect(m2.snapshot().quarantined.length).toBe(0);
  });

  test("exponential backoff: re-arm after 2^n polls, second quarantine mutes longer", async () => {
    // crash-loop → quarantine #1 (mute 2) → rearm → crash-loop again → quarantine #2 (mute 4) → rearm
    const script: Array<Record<string, Partial<CompartmentStats>>> = [
      stats(0), stats(1), stats(2), // q1 at poll 3
      stats(2), stats(2), // muted 2 polls
      stats(2), stats(3), stats(4), // re-armed: window [2,3,4] → q2
      stats(4), stats(4), stats(4), stats(4), // muted 4 polls
      stats(4), // re-arm #2
    ];
    const caller = scriptedStats(script);
    const m = new HealthMonitor({ caller });
    for (let i = 0; i < script.length; i++) await m.poll();
    const snap = m.snapshot();
    expect(snap.quarantined.length).toBe(2);
    const rearms = snap.events.filter((e) => e.type === "rearm");
    expect(rearms.length).toBe(2);
    expect(caller.calls.filter((c) => c.op === HOST_OPS.compartmentTerminate).length).toBe(2);
  });

  test("stats failure is an event, not a crash of the loop", async () => {
    const caller = {
      call: async (): Promise<PortResult> => ({ ok: false, error: "SCOPE", detail: "token table quirk" }),
    };
    const m = new HealthMonitor({ caller });
    await m.poll();
    await m.poll();
    const snap = m.snapshot();
    expect(snap.events.filter((e) => e.type === "stats-error").length).toBe(2);
    expect(snap.compartments).toBeNull();
    expect(snap.quarantined.length).toBe(0);
  });

  test("the monitor never quarantines itself", async () => {
    const selfStats = (crashes: number): Record<string, CompartmentStats> => ({
      "vivim.run": { state: crashes > 0 ? "degraded" : "active", delivered: 0, calls: 0, errors: 0, crashes, inflight: 0, bootedAt: 0 },
    });
    const caller = scriptedStats([selfStats(0), selfStats(3), selfStats(5), selfStats(6)]);
    const m = new HealthMonitor({ caller, selfId: "vivim.run" });
    for (let i = 0; i < 4; i++) await m.poll();
    expect(m.snapshot().quarantined.length).toBe(0);
  });

  test("event ring is bounded at 200 and snapshots cap at the requested limit", async () => {
    // 40 compartments, each taking a single +1 crash blip every 4th poll and
    // staying "active" (a recovering pattern): blips are recorded as events but
    // never trip a quarantine — so the ring fills far past 200 and must clip.
    const N = 40;
    const counters = new Array<number>(N).fill(0);
    const script: Array<Record<string, CompartmentStats>> = [];
    for (let poll = 0; poll < 160; poll++) {
      const snap: Record<string, CompartmentStats> = {};
      for (let c = 0; c < N; c++) {
        if (poll % 4 === c % 4) counters[c] += 1;
        snap[`p${c}`] = { state: "active", delivered: 0, calls: 0, errors: 0, crashes: counters[c], inflight: 0, bootedAt: 0 };
      }
      script.push(snap);
    }
    const caller = scriptedStats(script);
    const m = new HealthMonitor({ caller });
    for (let i = 0; i < script.length; i++) await m.poll();
    const snap = m.snapshot();
    expect(snap.quarantined.length).toBe(0); // recovering blips are not crash loops
    expect(snap.events.length).toBe(50); // snapshot limit
    expect((m as any).events.length).toBe(200); // ring bound
    expect(snap.polls).toBe(160);
  });
});
