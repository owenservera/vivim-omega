// vivim.run — pool.ts: the bounded executor (Ω3).
// At most `capacity` tasks run concurrently; every task carries its own deadline
// from SUBMISSION (queue wait counts against the budget). Execution is a
// `ctx.port.call(op, payload, {deadlineMs: remaining})` — delegated authority:
// the composition grants run the `port:<op>` capabilities it may schedule.
import type { Freshness, PortResult } from "@vivim/omega-contracts";
import {
  PriorityTaskQueue,
  clampDeadline,
  normalizePriority,
  type Priority,
  type QueuedTask,
  type SaturationRejection,
  type TaskRequest,
} from "./queue.ts";

export type TaskStatus = "ok" | "timeout" | "error";

/** What `run.submit@1` resolves to for an admitted task. */
export interface TaskResult {
  accepted: true;
  taskId: string;
  op: string;
  priority: Priority;
  status: TaskStatus;
  freshness: Freshness;
  result: PortResult;
  deadlineMs: number;
  queuedMs: number;
  execMs: number;
  totalMs: number;
}

export type SubmitOutcome = TaskResult | SaturationRejection;

export interface PoolStats {
  capacity: number;
  queued: number;
  running: number;
  completed: number;
  ok: number;
  timeouts: number;
  errors: number;
  rejected: number;
}

/** The port surface the pool needs (satisfied by `ctx.port` and by fakes in tests). */
export interface PortCaller {
  call(op: string, payload: unknown, opts?: { deadlineMs?: number }): Promise<PortResult>;
}

export interface PoolOptions {
  capacity: number;
  caller: PortCaller;
  log?: (msg: string) => void;
}

/**
 * Freshness contract (Ω3): remaining budget vs the task deadline.
 *   remaining > 50% → CURRENT · > 0 → LAGGING · exceeded/timeout → STALE.
 */
export function freshnessFor(deadlineMs: number, elapsedMs: number): Freshness {
  const remaining = deadlineMs - elapsedMs;
  if (remaining > deadlineMs / 2) return "CURRENT";
  if (remaining > 0) return "LAGGING";
  return "STALE";
}

/** Map a PortResult onto the task status register. */
function statusFor(result: PortResult): TaskStatus {
  if (result.ok) return "ok";
  return result.error === "BUDGET" ? "timeout" : "error";
}

export class TaskPool {
  private queue: PriorityTaskQueue;
  private resolvers = new Map<string, (r: TaskResult) => void>();
  private counts = { completed: 0, ok: 0, timeouts: 0, errors: 0, rejected: 0 };

  constructor(private opts: PoolOptions) {
    this.queue = new PriorityTaskQueue(opts.capacity);
  }

  stats(): PoolStats {
    return {
      capacity: this.opts.capacity,
      queued: this.queue.queued,
      running: this.queue.running,
      completed: this.counts.completed,
      ok: this.counts.ok,
      timeouts: this.counts.timeouts,
      errors: this.counts.errors,
      rejected: this.counts.rejected,
    };
  }

  /**
   * Submit a task; resolves with the task's full result (or the explicit
   * saturation rejection). The deadline is measured from submission, so a task
   * that expires while queued reports timeout/STALE without a wasted port call.
   */
  submit(req: unknown): Promise<SubmitOutcome> {
    const r = (req ?? {}) as TaskRequest;
    if (typeof r.op !== "string" || r.op.length === 0) {
      // structured refusal — never a throw, never silent
      const bad: TaskResult = {
        accepted: true,
        taskId: "invalid",
        op: String(r.op ?? ""),
        priority: normalizePriority(r.priority),
        status: "error",
        freshness: "STALE",
        result: { ok: false, error: "REFUSED", detail: "run.submit: 'op' must be a non-empty string" },
        deadlineMs: 0,
        queuedMs: 0,
        execMs: 0,
        totalMs: 0,
      };
      return Promise.resolve(bad);
    }
    const outcome = this.queue.submit({
      op: r.op,
      payload: r.payload,
      priority: r.priority,
      deadlineMs: clampDeadline(r.deadlineMs),
    });
    if (!outcome.accepted) {
      this.counts.rejected += 1;
      this.opts.log?.(`submit rejected (saturated): op=${r.op} queued=${outcome.queued} running=${outcome.running}`);
      return Promise.resolve(outcome);
    }
    const task = outcome.task;
    let settle!: (r: TaskResult) => void;
    const promise = new Promise<TaskResult>((resolve) => { settle = resolve; });
    this.resolvers.set(task.id, settle);
    this.pump();
    return promise;
  }

  /** Start as many queued tasks as free slots allow (priority first). */
  private pump(): void {
    while (this.queue.running < this.opts.capacity) {
      const task = this.queue.take();
      if (!task) break;
      void this.execute(task);
    }
  }

  private async execute(task: QueuedTask): Promise<void> {
    const dequeueAt = Date.now();
    const queuedMs = dequeueAt - task.submittedAt;
    const remaining = task.deadlineMs - queuedMs;
    const start = Date.now();
    let result: PortResult;
    if (remaining <= 0) {
      // the budget burned while queued — attributable, structured, no wasted hop
      result = {
        ok: false,
        error: "BUDGET",
        detail: `run: task deadline ${task.deadlineMs}ms expired while queued (waited ${queuedMs}ms)`,
      };
    } else {
      try {
        result = await this.opts.caller.call(task.op, task.payload, { deadlineMs: remaining });
      } catch (e) {
        result = { ok: false, error: "DEGRADED", detail: `run: port call threw for ${task.op}: ${String(e)}` };
      }
    }
    const execMs = Date.now() - start;
    const totalMs = Date.now() - task.submittedAt;
    const status = statusFor(result);
    const freshness = freshnessFor(task.deadlineMs, totalMs);
    this.counts.completed += 1;
    if (status === "ok") this.counts.ok += 1;
    else if (status === "timeout") this.counts.timeouts += 1;
    else this.counts.errors += 1;
    this.queue.finish();
    const resolve = this.resolvers.get(task.id);
    this.resolvers.delete(task.id);
    resolve?.({
      accepted: true,
      taskId: task.id,
      op: task.op,
      priority: task.priority,
      status,
      freshness,
      result,
      deadlineMs: task.deadlineMs,
      queuedMs,
      execMs,
      totalMs,
    });
    this.pump();
  }
}
