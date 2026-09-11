// @vivim/omega-shim — the compartment runtime. This is the ONLY import a plugin sees
// besides its own code (B2: ports-only; no ambient Node builtins are used here).
// v1 transport: postMessage over worker_threads. The shape is WIT-ready: when the
// transport becomes WASM, this file changes, plugin code does not.
import { parentPort } from "node:worker_threads";
import type { PortResult, PluginManifest } from "@vivim/omega-contracts";

export interface CallMeta { causationId: string; deadlineMs: number; from: string }
export interface PluginContext {
  manifest: PluginManifest;
  capabilities: string[];
  config: Record<string, unknown>; // data passthrough from the composition entry (never authority)
  port: {
    call(op: string, payload?: unknown, opts?: { deadlineMs?: number }): Promise<PortResult>;
  };
  log(...args: unknown[]): void;
}
export type OpHandler = (payload: any, ctx: PluginContext, meta: CallMeta) => Promise<unknown> | unknown;
export interface PluginDef {
  ops?: Record<string, OpHandler>; // keyed by op, e.g. "echo.ping@1"
  onInit?(ctx: PluginContext): Promise<void> | void;
  onShutdown?(): Promise<void> | void;
}
export function definePlugin(def: PluginDef): PluginDef { return def; }

type InitMsg = { type: "init"; manifest: PluginManifest; tokens: Record<string, string>; capabilities: string[] };
type ToHost = { type: "ready" } | { type: "call"; callId: string; capabilityToken: string; op: string; payload: unknown; deadlineMs: number } | { type: "return"; causationId: string; result: PortResult } | { type: "log"; level: string; args: unknown[] };

export function startPlugin(def: PluginDef): void {
  const port = parentPort;
  if (!port) throw new Error("shim: not running inside a worker compartment");
  const send = (m: ToHost) => port.postMessage(m);
  let ctx: PluginContext | null = null;

  port.on("message", (m: any) => {
    if (m?.type === "init") {
      const init = m as InitMsg;
      ctx = {
        manifest: init.manifest,
        capabilities: init.capabilities,
        config: (init as { config?: Record<string, unknown> }).config ?? {},
        port: {
          call: (op, payload, opts) => {
            const deadlineMs = opts?.deadlineMs ?? 5000;
            const token = init.tokens[`port:${op}`] ?? "";
            if (!token) {
              return Promise.resolve({ ok: false, error: "REFUSED", detail: `no capability token for ${op}` } satisfies PortResult);
            }
            const callId = `w_${Math.random().toString(36).slice(2, 10)}`;
            return new Promise<PortResult>((resolve) => {
              const timer = setTimeout(() => resolve({ ok: false, error: "BUDGET", detail: `local deadline ${deadlineMs}ms exceeded (${op})` }), deadlineMs);
              const onMsg = (r: any) => {
                if (r?.type === "result" && r.callId === callId) {
                  clearTimeout(timer); port.off("message", onMsg); resolve(r.result as PortResult);
                }
              };
              port.on("message", onMsg);
              send({ type: "call", callId, capabilityToken: token, op, payload, deadlineMs });
            });
          },
        },
        log: (...args) => send({ type: "log", level: "info", args }),
      };
      Promise.resolve(def.onInit?.(ctx)).then(() => send({ type: "ready" })).catch((e) => {
        console.error(`[shim ${init.manifest.id}] onInit failed: ${String(e)}`);
        send({ type: "ready" }); // degraded-but-alive; law/health machinery observes failures later
      });
      return;
    }
    if (m?.type === "deliver") {
      const { causationId, op, payload, deadlineMs, from } = m;
      const handler = def.ops?.[op];
      if (!handler) { send({ type: "return", causationId, result: { ok: false, error: "REFUSED", detail: `no handler for ${op}` } }); return; }
      Promise.resolve()
        .then(() => handler(payload, ctx!, { causationId, deadlineMs, from }))
        .then((value) => send({ type: "return", causationId, result: { ok: true, value: value ?? null, freshness: "CURRENT" } satisfies PortResult }))
        .catch((e) => send({ type: "return", causationId, result: { ok: false, error: "DEGRADED", detail: `handler ${op} threw: ${String(e)}` } satisfies PortResult }));
      return;
    }
    if (m?.type === "shutdown") {
      Promise.resolve(def.onShutdown?.()).catch(() => {}).then(() => process.exit(0));
    }
  });
}
