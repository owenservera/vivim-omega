// vivim.run — health.ts: compartment health loop + crash-loop quarantine (Ω3).
// The µhost owns TRANSPORT; this is the policy side: every 500ms we pull
// `host.compartment.stats@1` (capability-gated, granted to run by the recipe)
// and watch each compartment's crash counter.
//
// Detection (over the last 3 consecutive polls per compartment):
//  - rule "crash-loop": the crash count rose by >= 2 inside the window
//    (>= two increases — the classic crash/respawn cycle; matches the Ω3 spec).
//  - rule "crash-persistence": the crash count rose AND the compartment is
//    stuck "degraded" (v1 hosts have no respawn, so a crashed compartment is a
//    standing crash loop until a recipe reboot — the observable equivalent).
//
// Quarantine decision: mark `quarantined: {pluginId, at, reason}`, fire
// `host.compartment.terminate@1` (fire-and-forget; the mark is immediate),
// then suppress that compartment for 2^n polls (exponential backoff) before
// monitoring re-arms. All observations land in an in-memory ring (last 200).
import type { PortResult } from "@vivim/omega-contracts";
import { HOST_OPS } from "@vivim/omega-contracts";
import { clearInterval, setInterval } from "node:timers";

export interface CompartmentStats {
  state: string;
  delivered: number;
  calls: number;
  errors: number;
  crashes: number;
  inflight?: number;
  bootedAt: number;
  lastError?: string;
}

export type HealthEventType =
  | "start"
  | "stats-error"
  | "crash-increment"
  | "quarantine"
  | "terminate"
  | "rearm";

export interface HealthEvent {
  at: number;
  type: HealthEventType;
  pluginId?: string;
  detail: string;
}

export interface QuarantineRecord {
  pluginId: string;
  at: number;
  reason: string;
}

export interface HealthSnapshot {
  at: number;
  polls: number;
  compartments: Record<string, CompartmentStats> | null;
  quarantined: QuarantineRecord[];
  events: HealthEvent[];
}

export interface HealthOptions {
  caller: { call(op: string, payload: unknown, opts?: { deadlineMs?: number }): Promise<PortResult> };
  intervalMs?: number;
  selfId?: string;
  log?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 500;
const WINDOW_POLLS = 3;      // consecutive polls inspected for crash-loop detection
const RING_MAX = 200;        // events retained
const STATS_DEADLINE_MS = 2_000;
const TERMINATE_DEADLINE_MS = 4_000; // terminate of an already-dead worker can take ~2.6s in v1

export class HealthMonitor {
  private events: HealthEvent[] = [];
  private lastSnapshot: Record<string, CompartmentStats> | null = null;
  private quarantined: QuarantineRecord[] = [];
  private crashWindows = new Map<string, number[]>();   // last 3 crash counts
  private stateWindows = new Map<string, string[]>();   // last 3 states
  private quarantineCount = new Map<string, number>();
  private suppress = new Map<string, number>();         // polls left before re-arm
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private polls = 0;
  private intervalMs: number;
  private selfId: string;

  constructor(private opts: HealthOptions) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.selfId = opts.selfId ?? "vivim.run";
  }

  /** Start the poll loop (an immediate first poll seeds the snapshot). */
  start(): void {
    if (this.timer) return;
    this.record("start", null, `health loop: every ${this.intervalMs}ms via host.compartment.stats@1`);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One poll step — also the unit-test entry point (no timer involved). */
  async poll(): Promise<void> {
    if (this.busy) return; // a slow stats call never piles up overlapping polls
    this.busy = true;
    try {
      const r = await this.opts.caller.call(HOST_OPS.compartmentStats, {}, { deadlineMs: STATS_DEADLINE_MS });
      if (!r.ok) {
        this.record("stats-error", null, `host.compartment.stats@1 failed: ${r.error}${r.detail ? ` (${r.detail})` : ""}`);
        return;
      }
      this.polls += 1;
      this.lastSnapshot = (r.value ?? {}) as Record<string, CompartmentStats>;
      for (const [pluginId, s] of Object.entries(this.lastSnapshot)) {
        if (s && typeof s === "object") this.observe(pluginId, s);
      }
    } finally {
      this.busy = false;
    }
  }

  snapshot(eventLimit = 50): HealthSnapshot {
    return {
      at: Date.now(),
      polls: this.polls,
      compartments: this.lastSnapshot,
      quarantined: this.quarantined.map((q) => ({ ...q })),
      events: this.events.slice(-eventLimit).map((e) => ({ ...e })),
    };
  }

  get quarantineRecords(): QuarantineRecord[] {
    return this.quarantined.map((q) => ({ ...q }));
  }

  // ---- internals ----

  private observe(pluginId: string, s: CompartmentStats): void {
    if (pluginId === this.selfId) return; // run never quarantines itself

    // D-331 late-observer rule: lazy activation means this loop can start AFTER
    // crashes happened (counters are cumulative, transitions are not replayed).
    // A compartment observed for the FIRST time already stuck degraded with
    // recorded crashes IS crash-persistence by definition (v1 has no respawn:
    // degraded is sticky, so there is no "transiently degraded" to wait out).
    // Without this, a late observer would watch a standing crash loop forever
    // and call it healthy — the exact conflation lazy must not introduce.
    const seenBefore = this.crashWindows.has(pluginId) || this.stateWindows.has(pluginId);
    if (!seenBefore && s.state === "degraded" && s.crashes >= 1) {
      this.record("crash-increment", pluginId, `first sight: stuck degraded with ${s.crashes} recorded crashes (observer started late)`);
      this.quarantine(
        pluginId,
        `crash-persistence: stuck degraded with ${s.crashes} recorded crashes on first observation (v1 has no respawn: a crashed compartment is a standing crash loop until recipe reboot)`,
      );
      return;
    }
    // exponential backoff window: a quarantined compartment is muted for 2^n polls
    const muted = this.suppress.get(pluginId);
    if (muted !== undefined) {
      const next = muted - 1;
      if (next <= 0) {
        this.suppress.delete(pluginId);
        this.resetWindows(pluginId);
        this.record("rearm", pluginId, `monitoring re-armed after backoff of ${2 ** this.quarantineCount.get(pluginId)!} polls`);
      } else {
        this.suppress.set(pluginId, next);
      }
      return;
    }

    const win = this.crashWindows.get(pluginId) ?? [];
    const prev = win.length > 0 ? win[win.length - 1] : s.crashes;
    win.push(s.crashes);
    if (win.length > WINDOW_POLLS) win.splice(0, win.length - WINDOW_POLLS);
    this.crashWindows.set(pluginId, win);

    const states = this.stateWindows.get(pluginId) ?? [];
    states.push(s.state);
    if (states.length > WINDOW_POLLS) states.splice(0, states.length - WINDOW_POLLS);
    this.stateWindows.set(pluginId, states);

    const cur = win[win.length - 1];
    if (win.length >= 2 && cur > prev) {
      this.record("crash-increment", pluginId, `crashes ${prev} → ${cur} (state ${s.state})`);
    }

    if (win.length === WINDOW_POLLS) {
      const delta = win[2] - win[0];
      const stuckDegraded = states[states.length - 1] === "degraded";
      if (delta >= 2) {
        this.quarantine(pluginId, `crash-loop: crashes ${win[0]} → ${win[2]} (+${delta}) across ${WINDOW_POLLS} consecutive polls`);
      } else if (delta >= 1 && stuckDegraded) {
        this.quarantine(
          pluginId,
          `crash-persistence: crashes ${win[0]} → ${win[2]} and stuck degraded without recovery (v1 has no respawn: a crashed compartment is a standing crash loop until recipe reboot)`,
        );
      }
    }
  }

  private quarantine(pluginId: string, reason: string): void {
    const n = (this.quarantineCount.get(pluginId) ?? 0) + 1;
    this.quarantineCount.set(pluginId, n);
    this.suppress.set(pluginId, 2 ** n); // re-arms after 2^n polls
    this.quarantined.push({ pluginId, at: Date.now(), reason });
    this.resetWindows(pluginId);
    this.record("quarantine", pluginId, reason);
    this.opts.log?.(`quarantine #${n}: ${pluginId} — ${reason}`);
    // transport stays the host's; the decision is ours. Fire-and-forget: the
    // quarantine mark is immediate, the terminate reply is best-effort evidence.
    void this.opts.caller
      .call(HOST_OPS.compartmentTerminate, { pluginId }, { deadlineMs: TERMINATE_DEADLINE_MS })
      .then((r) => {
        this.record(
          "terminate",
          pluginId,
          r.ok
            ? `terminated (quarantine #${n})`
            : `terminate refused: ${r.error}${r.detail ? ` (${r.detail})` : ""}`,
        );
      })
      .catch((e) => this.record("terminate", pluginId, `terminate threw: ${String(e)}`));
  }

  private resetWindows(pluginId: string): void {
    this.crashWindows.delete(pluginId);
    this.stateWindows.delete(pluginId);
  }

  private record(type: HealthEventType, pluginId: string | null, detail: string): void {
    this.events.push(pluginId ? { at: Date.now(), type, pluginId, detail } : { at: Date.now(), type, detail });
    if (this.events.length > RING_MAX) this.events.splice(0, this.events.length - RING_MAX);
  }
}
