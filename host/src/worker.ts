// µhost — worker.ts: one worker_threads compartment per plugin (B2: shared-nothing).
// The host owns TRANSPORT only; lifecycle policy belongs to vivim.run (via host.compartment.admin).
//
// ISOLATION HONESTY (verified 2026-09: a 32MB-capped worker grew to 217MB heap
// without error on Bun): worker_threads gives separate V8 isolates (no shared
// heap — accidental coupling is impossible), but memory/CPU EXHAUSTION by a
// compartment is NOT bounded on this runtime (`resourceLimits` are not enforced
// by Bun). So compartments are isolated against each other, not against starving
// the process. Do not rely on this layer against an actively adversarial plugin;
// the crash-loop quarantine in vivim.run covers crashes, not consumption.
// (D-360's watchdog — tooling/watchdog — bounds DETECTION time via probes; the
// resourceLimits decision record keeps the numbers and the re-verify protocol.)
import { Worker } from "node:worker_threads";
import type { PortResult, StreamChunk } from "@vivim/omega-contracts";
import { join } from "node:path";

export interface CompartmentInit {
  type: "init";
  manifest: unknown;
  tokens: Record<string, string>;   // capability -> opaque token (B3: checked host-side)
  capabilities: string[];
  config?: Record<string, unknown>; // data passthrough (never authority)
}

export interface DeliverMsg {
  type: "deliver";
  causationId: string;
  op: string;
  payload: unknown;
  deadlineMs: number;
  from: string;
}

export interface CallMsg {
  type: "call";
  callId: string;
  capabilityToken: string;
  op: string;
  payload: unknown;
  deadlineMs: number;
}

export type ToWorker =
  | CompartmentInit
  | DeliverMsg
  | { type: "shutdown" }
  | { type: "result"; callId: string; causationId: string; result: PortResult };

export type FromWorker =
  | { type: "ready" }
  | { type: "call"; callId: string; capabilityToken: string; op: string; payload: unknown; deadlineMs: number }
  | { type: "return"; causationId: string; result: PortResult }
  | { type: "chunk"; causationId: string; chunk: StreamChunk } // D-352: ordered partial (relay-or-drop — additive)
  | { type: "log"; level: string; args: unknown[] };

export interface CompartmentHandle {
  pluginId: string;
  /** Raw worker — host-side only (D-360: lets the out-of-tree watchdog probe without touching the Port Protocol). */
  worker: Worker;
  state: "booting" | "active" | "degraded" | "stopped";
  stats: { delivered: number; calls: number; errors: number; crashes: number; bootedAt: number; lastError?: string };
  post(msg: ToWorker): void;
  onMessage(cb: (msg: FromWorker) => void): void;
  onCrash(cb: (err: string) => void): void;
  terminate(): Promise<void>;
  /** D-366 fast kill: hard-terminate without the 2500ms graceful wait (unresponsive compartments never answer shutdown). */
  terminateFast(): Promise<void>;
}

export function wrapWorker(pluginId: string, worker: Worker): CompartmentHandle {
  const handle: CompartmentHandle = {
    pluginId,
    worker,
    state: "booting",
    stats: { delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: Date.now() },
    post: (msg) => worker.postMessage(msg),
    onMessage: (cb) => worker.on("message", (m: FromWorker) => {
      if (m?.type === "log") { console.log(`[${pluginId}]`, ...(m.args ?? []).map(String)); return; }
      if (m?.type === "call") handle.stats.calls++;
      cb(m);
    }),
    onCrash: (cb) => {
      worker.on("error", (err) => { handle.stats.crashes++; handle.state = "degraded"; handle.stats.lastError = String(err); cb(String(err)); });
      worker.on("exit", (code) => {
        if (handle.state !== "stopped" && code !== 0) {
          handle.stats.crashes++; handle.state = "degraded";
          handle.stats.lastError = `worker exit code ${code}`;
          cb(`worker exit code ${code}`);
        }
      });
    },
    terminate: async () => {
      handle.state = "stopped";
      await new Promise<void>((res) => {
        let settled = false;
        const settle = () => { if (!settled) { settled = true; clearTimeout(t); res(); } };
        const t = setTimeout(() => {
          try { const r = worker.terminate?.(); if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).then(settle, settle); else settle(); }
          catch { settle(); }
          setTimeout(settle, 100); // terminate() may never resolve on a dead worker — cap it
        }, 2500);
        worker.once("exit", () => settle());
        try { worker.postMessage({ type: "shutdown" } satisfies ToWorker); } catch { /* already dead */ }
      });
    },
    terminateFast: async () => {
      handle.state = "stopped";
      await new Promise<void>((res) => {
        let settled = false;
        const settle = () => { if (!settled) { settled = true; clearTimeout(t); res(); } };
        const t = setTimeout(settle, 500); // hard-kill cap — no graceful wait (D-366 unresponsive path)
        worker.once("exit", () => settle());
        try { const r = worker.terminate?.(); if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).then(settle, settle); else settle(); }
        catch { settle(); }
      });
    },
  };
  return handle;
}

export function spawnCompartment(pluginId: string, sourceDir: string, entry: string): CompartmentHandle {
  return wrapWorker(pluginId, new Worker(join(sourceDir, entry)));
}

/** Pool hook (D-329): the warm pool lives OUTSIDE host/src (the daemon surface
 *  owns it) — the host never imports surfaces, so the pool is INJECTED here.
 *  acquire() hands over a parked generic isolate assigned to entryAbs, or null
 *  (pool empty/shut down/assign failed) for cold fallback. Assignment is
 *  single-use: the host terminates assigned workers via the handle (never
 *  recycled), so pool slots turn over but isolates never do — B2 holds
 *  structurally, and correctness never depends on the pool. */
export interface WorkerPoolHook {
  acquire(entryAbs: string): Promise<Worker | null>;
}

let poolHook: WorkerPoolHook | null = null;

/** Install (or clear) the pool hook. Module-global by necessity: compartments
 *  spawn from boot paths with no shared owner. Daemon surfaces set it at
 *  startup and clear it on shutdown; tests set stub hooks per case. */
export function setPoolHook(hook: WorkerPoolHook | null): void {
  poolHook = hook;
}

/** Pool-aware checkout: a parked isolate when the pool has one (plugin code
 *  still loads per assignment — the isolate is pooled, never the code), cold
 *  spawn otherwise. Any hook failure degrades to cold, never to an error. */
export async function checkoutCompartment(pluginId: string, sourceDir: string, entry: string): Promise<CompartmentHandle> {
  if (poolHook) {
    const parked = await poolHook.acquire(join(sourceDir, entry)).catch(() => null);
    if (parked) return wrapWorker(pluginId, parked);
  }
  return spawnCompartment(pluginId, sourceDir, entry);
}
