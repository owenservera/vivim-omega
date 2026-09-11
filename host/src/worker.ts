// µhost — worker.ts: one worker_threads compartment per plugin (B2: shared-nothing).
// The host owns TRANSPORT only; lifecycle policy belongs to vivim.run (via host.compartment.admin).
import { Worker } from "node:worker_threads";
import type { PortResult } from "@vivim/omega-contracts";
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
  | { type: "log"; level: string; args: unknown[] };

export interface CompartmentHandle {
  pluginId: string;
  state: "booting" | "active" | "degraded" | "stopped";
  stats: { delivered: number; calls: number; errors: number; crashes: number; bootedAt: number; lastError?: string };
  post(msg: ToWorker): void;
  onMessage(cb: (msg: FromWorker) => void): void;
  onCrash(cb: (err: string) => void): void;
  terminate(): Promise<void>;
}

export function spawnCompartment(pluginId: string, sourceDir: string, entry: string): CompartmentHandle {
  const worker = new Worker(join(sourceDir, entry));
  const handle: CompartmentHandle = {
    pluginId,
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
  };
  return handle;
}
