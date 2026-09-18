// D-329 — warm isolate pool: unit tables plus the ADVERSARIAL state-bleed
// suite (the ship-blocker: a recycled pool slot must never leak tenant state
// across checkouts — globalThis, timers, closures, module caches) plus the
// entry-per-assignment proof and checkout-latency numbers for BENCHMARKS.md.
//
// Design under test: pool slots turn over, isolates never do (terminate on
// consume + background refill). There is no recycled worker to bleed — this
// suite proves the negative across every channel a sloppy tenant could reach.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { IsolatePool } from "../src/pool.ts";
import { startDaemon, type DaemonHandle } from "../src/daemon.ts";
import { callDaemon, readDaemonInfo, type DaemonInfo } from "@vivim/daemon-client";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const ECHO_SPEC = join(OMEGA_ROOT, "surfaces/cli/test/fixtures/echo.json");
const ECHO_ENTRY = join(OMEGA_ROOT, "examples/plugin-echo/src/index.ts");
const FIX = join(import.meta.dir, "fixtures");
const POLLUTE_ENTRY = join(FIX, "tenant-pollute.ts");
const INSPECTOR_ENTRY = join(FIX, "tenant-inspector.ts");

const handles: DaemonHandle[] = [];
const vaultDirs: string[] = [];
const workers: Worker[] = [];
// Termination has ONE owner (this hook): awaiting Bun's Worker.terminate()
// twice on the same worker never settles the second call, so tests must never
// terminate directly — release() below untracks + terminates exactly once.
afterAll(async () => {
  for (const w of workers.splice(0)) await w.terminate().catch(() => {});
  for (const h of handles) await h.close().catch(() => {});
  for (const d of vaultDirs) rmSync(d, { recursive: true, force: true });
}, 120_000);

/** Ordered release (mirrors host release-termination): untrack + terminate once. */
async function release(w: Worker): Promise<void> {
  const i = workers.indexOf(w);
  if (i >= 0) workers.splice(i, 1);
  await w.terminate().catch(() => {});
}

function tempVault(name: string): string {
  const v = omegaTmp("omega-pool-test", `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(v, { recursive: true, force: true });
  mkdirSync(v, { recursive: true });
  vaultDirs.push(v);
  return v;
}

function track(w: Worker): Worker {
  workers.push(w);
  return w;
}

async function rpc(info: DaemonInfo, op: string, payload?: unknown) {
  return callDaemon(info, op, payload, 15000);
}

/** Await one worker message matching pred (bounded — never hangs the suite). */
function nextMessage(w: Worker, pred: (m: unknown) => boolean, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      w.off("message", onMessage);
      reject(new Error("timed out waiting for worker message"));
    }, timeoutMs);
    const onMessage = (m: unknown) => {
      if (!pred(m)) return;
      clearTimeout(timer);
      w.off("message", onMessage);
      resolve(m);
    };
    w.on("message", onMessage);
  });
}

describe("D-329 pool mechanics — stock, fallback, entry-per-assignment", () => {
  test("size-0 pool and shut-down pool resolve null (cold fallback, never an error)", async () => {
    const zero = new IsolatePool(0);
    zero.start();
    expect(await zero.acquire(ECHO_ENTRY)).toBeNull();
    expect(zero.snapshot()).toMatchObject({ checkouts: 1, hits: 0, coldFallbacks: 1 });
    await zero.shutdown();
    const p = new IsolatePool(2);
    p.start();
    await p.shutdown();
    expect(await p.acquire(ECHO_ENTRY)).toBeNull();
    expect(p.snapshot().parked).toBe(0); // teardown proof: shutdown terminates parked stock
  });

  test("assign failure (missing entry) resolves null and refills stock", async () => {
    const p = new IsolatePool(1);
    p.start();
    expect(await p.acquire("/nonexistent/entry.ts")).toBeNull();
    const s = p.snapshot();
    expect(s).toMatchObject({ checkouts: 1, hits: 1, coldFallbacks: 0, assignFailures: 1 });
    expect(s.parked).toBe(1); // failed isolate terminated, stock refilled
    await p.shutdown();
  });

  test("entry loads per assignment: init after acquire answers ready (isolate pooled, code fresh)", async () => {
    const p = new IsolatePool(2);
    p.start();
    const w = track((await p.acquire(ECHO_ENTRY))!);
    expect(w).not.toBeNull();
    w.postMessage({ type: "init", manifest: { id: "omega.echo" }, tokens: {}, capabilities: [] });
    const ready = await nextMessage(w, (m) => (m as { type?: unknown })?.type === "ready");
    expect((ready as { type: string }).type).toBe("ready");
    await p.shutdown();
  });

  test("concurrent checkout soak: every assignment resolves with plugin code loaded", async () => {
    const p = new IsolatePool(2);
    p.start();
    const got = await Promise.all([0, 1, 2, 3, 4, 5].map(() => p.acquire(ECHO_ENTRY)));
    expect(got.every((w) => w !== null)).toBe(true);
    for (const w of got) track(w!);
    expect(p.snapshot()).toMatchObject({ checkouts: 6, hits: 6 });
    await p.shutdown();
  });

  test("D-388 §2.2 burst: N > size concurrent checkouts stay served (sync refill) — the cost is the inline spawn, and the stats stay consistent", async () => {
    const p = new IsolatePool(2);
    p.start();
    // 8 concurrent checkouts against 2 parked slots. MEASURED TRUTH (D-388
    // falsifier): refill() runs synchronously inside acquire(), so the stock
    // never starves — every consumer is served a parked worker and the burst
    // cost hides in per-checkout thread spawns (bench reports the wall).
    // coldFallbacks is the pool-could-not-construct-a-thread signal, not the
    // burst signal the review assumed.
    const t0 = performance.now();
    const got = await Promise.all(Array.from({ length: 8 }, () => p.acquire(ECHO_ENTRY)));
    const burstWallMs = performance.now() - t0;
    for (const w of got) if (w) track(w);
    const s = p.snapshot();
    expect(got.every((w) => w !== null)).toBe(true); // served, never errored, never hung
    // THE INVARIANT: checkouts = hits + coldFallbacks (assignFailures ⊆ hits)
    expect(s.checkouts).toBe(8);
    expect(s.checkouts).toBe(s.hits + s.coldFallbacks);
    expect(s.hits).toBe(8);
    expect(s.coldFallbacks).toBe(0);
    expect(s.assignFailures).toBe(0);
    expect(s.parked).toBeLessThanOrEqual(2); // the parked bound holds even mid-burst
    console.log(`[D-388] burst n=8 size=2: ${burstWallMs.toFixed(1)}ms wall (${(burstWallMs / 8).toFixed(1)}ms/checkout — inline spawn cost, cf. D-329 checkout p50 52–60ms)`);
    await p.shutdown();
  });

  test("D-388 §2.2 a post-burst serial checkout is served parked and the accounting stays monotonic", async () => {
    const p = new IsolatePool(1);
    p.start();
    const burst = await Promise.all(Array.from({ length: 5 }, () => p.acquire(ECHO_ENTRY)));
    for (const w of burst) if (w) track(w);
    const burstStats = p.snapshot();
    expect(burstStats).toMatchObject({ checkouts: 5, hits: 5, coldFallbacks: 0, assignFailures: 0 });
    const w = track((await p.acquire(ECHO_ENTRY))!);
    expect(w).not.toBeNull();
    const after = p.snapshot();
    expect(after.checkouts).toBe(6);
    expect(after.hits).toBe(6);
    expect(after.coldFallbacks).toBe(0); // accounting never inflates
    expect(after.parked).toBeLessThanOrEqual(1);
    await p.shutdown();
  });
});

describe("D-329 adversarial — no state bleeds across pool-slot reuse (ship-blocker)", () => {
  test("globalThis + timers + closures + module cache: inspector sees a pristine isolate", async () => {
    const p = new IsolatePool(1);
    p.start();
    // Tenant A pollutes, then its isolate is terminated (host release = terminate).
    const polluter = track((await p.acquire(POLLUTE_ENTRY))!);
    expect(polluter).not.toBeNull();
    await new Promise((r) => setTimeout(r, 100)); // let the 5ms interval tick several times
    const polluterTid = polluter.threadId;
    await release(polluter); // host release = terminate: the slot turns over, the isolate does not
    // Same pool slot serves tenant B next — a FRESH isolate by construction.
    const inspector = track((await p.acquire(INSPECTOR_ENTRY))!);
    expect(inspector).not.toBeNull();
    expect(inspector.threadId).not.toBe(polluterTid); // different isolate, not a recycled worker
    inspector.postMessage({ type: "inspect" });
    const found = (await nextMessage(inspector, (m) => (m as { type?: unknown })?.type === "inspection")) as {
      threadId: number; bleed: unknown; ticks: unknown; fn: string; sharedBox: unknown;
    };
    expect(found.threadId).toBe(inspector.threadId);
    expect(found.bleed).toBeNull(); // globalThis mutation did not cross
    expect(found.ticks).toBeNull(); // timer state did not cross (and the dead isolate ticks no more)
    expect(found.fn).toBe("undefined"); // closures did not cross (no shared heap, ever)
    expect(found.sharedBox).toBeNull(); // module-level cache did not cross (fresh registry per isolate)
    await p.shutdown();
  });
});

describe("D-329 checkout latency (BENCHMARKS.md falsifier input)", () => {
  test("pooled checkout p50 vs the 26.5ms cold-spawn record", async () => {
    const p = new IsolatePool(4);
    p.start();
    const samples: number[] = [];
    const held: Worker[] = [];
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      const w = await p.acquire(ECHO_ENTRY);
      samples.push(performance.now() - t0);
      expect(w).not.toBeNull();
      held.push(track(w!));
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[samples.length >> 1]!;
    console.log(`[D-329] pooled checkout n=12 min ${samples[0]!.toFixed(1)}ms p50 ${p50.toFixed(1)}ms max ${samples[samples.length - 1]!.toFixed(1)}ms (cold thread-spawn p50 26.5ms on record; checkout = thread + per-assignment import)`);
    await p.shutdown();
  }, 60_000);
});

describe("D-329 daemon integration — pool serves boot + first touch, status reports it", () => {
  test("pooled checkouts hit; pool stats ride the status endpoint; close clears the hook", async () => {
    const vaultDir = tempVault("pool");
    const handle = await startDaemon({ vaultDir, specPath: ECHO_SPEC, idleMs: 300_000, poolSize: 2 });
    handles.push(handle);
    const info = readDaemonInfo(vaultDir)!;
    const call = await rpc(info, "call", { op: "echo.ping@1", payload: { hello: "pool" } });
    expect(call.ok).toBe(true);
    const status = await rpc(info, "status", {});
    expect(status.ok).toBe(true);
    const pool = (status.value as { daemon: { pool: { size: number; hits: number; coldFallbacks: number } } }).daemon.pool;
    expect(pool.size).toBe(2);
    expect(pool.hits).toBeGreaterThanOrEqual(1); // eager law checkout and/or lazy first touch served parked
    await handle.close();
    // poolSize 0 disables: status reports the absence honestly.
    const vaultDir2 = tempVault("nopool");
    const plain = await startDaemon({ vaultDir: vaultDir2, specPath: ECHO_SPEC, idleMs: 300_000, poolSize: 0 });
    handles.push(plain);
    const info2 = readDaemonInfo(vaultDir2)!;
    const status2 = await rpc(info2, "status", {});
    expect(status2.ok).toBe(true);
    expect((status2.value as { daemon: { pool: unknown } }).daemon.pool).toEqual({ disabled: true });
    await plain.close();
  }, 90_000);
});
