// vivim.run — index.ts: the Ω3 spine plugin.
// Scheduling policy only: the µhost owns transport (spawn/terminate/stats);
// we administer compartment lifecycle through capability-gated host ops.
// Ops contributed: run.submit@1 (bounded task execution), run.stats@1,
// run.health@1 (compartment snapshot + quarantine ledger + event ring).
import { cpus } from "node:os"; // capacity default reads machine shape — OS contact outside the os-surface fence BY DESIGN (the fence covers tmp/platform/chmod; cpus() is the named seventh touchpoint, grandfathered — see MERGED-MASTER ISS-020)
import { setTimeout as nodeSetTimeout } from "node:timers";
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import { TaskPool, type SubmitOutcome, type TaskResult } from "./pool.ts";
import { clampDeadline, normalizePriority, type TaskRequest } from "./queue.ts";
import { HealthMonitor } from "./health.ts";

/** run.submit never blocks the caller past deadline + this slack (Ω3 budget law). */
const SUBMIT_SLACK_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => nodeSetTimeout(r, ms));

function defaultCapacity(): number {
  return Math.max(2, Math.floor(cpus().length / 2));
}

let pool: TaskPool | null = null;
let health: HealthMonitor | null = null;

function watchdogOutcome(req: TaskRequest, deadlineMs: number): TaskResult {
  return {
    accepted: true,
    taskId: "watchdog",
    op: String(req.op ?? ""),
    priority: normalizePriority(req.priority),
    status: "error",
    freshness: "STALE",
    result: {
      ok: false,
      error: "BUDGET",
      detail: `run.submit watchdog: task did not settle within deadline ${deadlineMs}ms + ${SUBMIT_SLACK_MS}ms slack`,
    },
    deadlineMs,
    queuedMs: 0,
    execMs: 0,
    totalMs: deadlineMs + SUBMIT_SLACK_MS,
  };
}

startPlugin(
  definePlugin({
    onInit(ctx) {
      const raw = (ctx.config as { capacity?: unknown } ?? {}).capacity;
      const capacity =
        typeof raw === "number" && Number.isFinite(raw) && raw >= 1
          ? Math.floor(raw)
          : defaultCapacity();
      pool = new TaskPool({ capacity, caller: ctx.port, log: (m) => ctx.log(`[run] ${m}`) });
      health = new HealthMonitor({ caller: ctx.port, log: (m) => ctx.log(`[health] ${m}`) });
      health.start();
      ctx.log(`vivim.run booted: capacity=${capacity} (cpus=${cpus().length})`);
    },

    onShutdown() {
      health?.stop();
    },

    ops: {
      "run.submit@1": (payload: unknown): Promise<SubmitOutcome> => {
        const req = (payload ?? {}) as TaskRequest;
        const deadlineMs = clampDeadline(req.deadlineMs);
        // bounded by deadline + slack — a lost task can never hang a caller
        return Promise.race([
          pool!.submit(req),
          sleep(deadlineMs + SUBMIT_SLACK_MS).then(() => watchdogOutcome(req, deadlineMs)),
        ]);
      },

      "run.stats@1": () => pool!.stats(),

      "run.health@1": () => health!.snapshot(50),
    },
  }),
);
