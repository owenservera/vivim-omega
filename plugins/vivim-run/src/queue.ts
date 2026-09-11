// vivim.run — queue.ts: the priority task queue (Ω3).
// Three levels (high > normal > low), FIFO within a level, a deadline per task,
// and saturation that is ALWAYS an explicit structured rejection — a submitted
// task is never silently dropped. This module is pure scheduling data: no ports,
// no timers; the pool drives it.

export type Priority = "high" | "normal" | "low";
export const PRIORITIES: readonly Priority[] = ["high", "normal", "low"];

export const DEFAULT_PRIORITY: Priority = "normal";
export const DEFAULT_DEADLINE_MS = 5_000;
export const MIN_DEADLINE_MS = 1;
export const MAX_DEADLINE_MS = 60_000;
/** Saturation law: pending + running at/above capacity*4 → explicit Rejected. */
export const SATURATION_FACTOR = 4;

/** What a caller submits to `run.submit@1`. */
export interface TaskRequest {
  op: string;
  payload?: unknown;
  priority?: Priority;
  deadlineMs?: number;
}

/** A validated, admitted task waiting for a pool slot. */
export interface QueuedTask {
  id: string;
  op: string;
  payload: unknown;
  priority: Priority;
  deadlineMs: number;
  submittedAt: number;
}

/** Saturation rejection — the ONLY way a submit is refused, and always visible. */
export interface SaturationRejection {
  accepted: false;
  reason: "saturated";
  queued: number;
  running: number;
  capacity: number;
}

export type EnqueueOutcome =
  | { accepted: true; task: QueuedTask }
  | SaturationRejection;

/** Clamp an unknown deadline hint into [MIN, MAX]; non-numbers fall back to the default. */
export function clampDeadline(ms: unknown): number {
  if (typeof ms === "number" && !Number.isNaN(ms)) {
    return Math.min(MAX_DEADLINE_MS, Math.max(MIN_DEADLINE_MS, Math.floor(ms)));
  }
  return DEFAULT_DEADLINE_MS;
}

/** Unknown priority hints degrade to "normal" (never throw, never silently reorder). */
export function normalizePriority(p: unknown): Priority {
  return p === "high" || p === "low" ? p : "normal";
}

const bootNonce = Math.random().toString(36).slice(2, 8);

/**
 * Priority queue with explicit running-slot accounting.
 *
 * Invariants:
 *  - `take()` pops strictly by priority level, FIFO within a level, and takes
 *    ownership of a running slot (the caller MUST eventually call `finish()`).
 *  - `submit()` rejects iff queued + running >= capacity * SATURATION_FACTOR,
 *    returning the full saturation telemetry — never a silent drop.
 */
export class PriorityTaskQueue {
  private levels: [QueuedTask[], QueuedTask[], QueuedTask[]];
  private runningSlots = 0;
  private seq = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`queue: capacity must be a positive integer (got ${capacity})`);
    }
    this.levels = [[], [], []];
  }

  get queued(): number {
    return this.levels[0].length + this.levels[1].length + this.levels[2].length;
  }

  get running(): number {
    return this.runningSlots;
  }

  get saturationLimit(): number {
    return this.capacity * SATURATION_FACTOR;
  }

  submit(req: TaskRequest): EnqueueOutcome {
    const total = this.queued + this.runningSlots;
    if (total >= this.saturationLimit) {
      return {
        accepted: false,
        reason: "saturated",
        queued: this.queued,
        running: this.runningSlots,
        capacity: this.capacity,
      };
    }
    this.seq += 1;
    const task: QueuedTask = {
      id: `${bootNonce}-${this.seq}`,
      op: req.op,
      payload: req.payload,
      priority: normalizePriority(req.priority),
      deadlineMs: clampDeadline(req.deadlineMs),
      submittedAt: Date.now(),
    };
    this.levels[PRIORITIES.indexOf(task.priority)].push(task);
    return { accepted: true, task };
  }

  /** Pop the next task by priority (FIFO within level); claims a running slot. */
  take(): QueuedTask | null {
    for (const level of this.levels) {
      const task = level.shift();
      if (task) {
        this.runningSlots += 1;
        return task;
      }
    }
    return null;
  }

  /** Release a running slot claimed by `take()`. */
  finish(): void {
    if (this.runningSlots > 0) this.runningSlots -= 1;
  }
}
