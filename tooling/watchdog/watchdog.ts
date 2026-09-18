// tooling/watchdog — the D-360 consumption watchdog (D-321's specified follow-up:
// "the watchdog, when built, goes through the Decision Contract as its own row").
//
// Lives OUTSIDE host/src by design (D-329 placement law: the host stays transport;
// policy is out-of-tree, like the daemon pool). It polls the ROUTER's active
// compartments, probes each raw worker directly (shim answers `probe` with
// `probeStat` — a compartment whose event loop is wedged CANNOT answer, which is
// itself the CPU-starvation signal), and terminates violators through the
// sanctioned host surface (host.compartment.terminate@1 as root — inflight calls
// fail DEGRADED, state flips, the decision journals).
//
// Enforcement is two-signal, per compartment, both cheap:
//   · UNRESPONSIVE  missStreak — probes that got no probeStat before the next
//     sample (catches sync infinite loops / wedged event loops — the worst case),
//   · MEMORY        overStreak — consecutive ANSWERED samples reporting heapUsed
//     over the compartment's declared budget (catches responsive bombers).
// Budgets come from the manifest's declared runtime.budget (memMB) — thresholds
// are policy data, not plumbing. A compartment the manifest leaves undeclared
// gets defaultMemMB.
//
// Honest bounds (D-321 unchanged, D-366 hardened): detection is bounded by interval × N; a
// compartment may still allocate several hundred MB or pin one core WITHIN a
// detection window, and termination frees what the OS can free (worker death).
// This layer is containment, not a security boundary — see D-360.
// D-366 SPOOF NOTE: heapUsed is SELF-REPORTED via the compartment's own probeStat.
// A malicious compartment can lie about heap (report low while growing). Only the
// UNRESPONSIVE signal (wedged loop cannot answer at all) is non-spoofable. Treat
// memory eviction as cooperative advisory, unresponsive eviction as reliable.
// D-366 KILL PATHS: unresponsive → fast kill (no 2500ms graceful wait, shutdown
// message would never be processed); memory → graceful terminate (responsive,
// may still flush). Both go through the sanctioned host op with {fast} flag.
import type { PortRouter } from "@vivim/omega-host";
import { HOST_OPS } from "@vivim/omega-contracts";

export interface WatchdogBudget { memMB?: number; missLimit?: number; overLimit?: number; intervalMs?: number }
export interface WatchdogOptions {
  intervalMs?: number;        // sample cadence (default 250) — the GLOBAL default, unchanged by D-388
  missLimit?: number;         // consecutive unanswered samples → evict (default 3)
  overLimit?: number;         // consecutive over-budget heap samples → evict (default 2)
  defaultMemMB?: number;      // budget when the manifest declares none (default 256)
  budgets?: Map<string, WatchdogBudget>; // per-compartment policy (from manifests)
  requireBudget?: boolean;    // D-366: when true, compartments with no declared budget journal a warning (fail-closed intent — prefer declared budgets)
  onEvict?: (id: string, reason: string) => void;
  onDefaultBudget?: (id: string, defaultMemMB: number) => void; // D-366: observed when a compartment falls back to default (auditable)
}
export interface Eviction { id: string; reason: string; at: number }
export interface Watchdog { stop(): void; evictions(): Eviction[] }
export interface Sample { answered: boolean; heapUsed?: number; rss?: number; cpuUs?: number }

/** Pure policy: do the current streaks warrant eviction? Unit-tested directly;
 *  the boot-based falsifiers (adversarial 13/14) cover the wiring.
 *  D-366: verdict reason names the kill path (fast for unresponsive, graceful for memory). */
export function classify(budget: WatchdogBudget, missStreak: number, overStreak: number, lastHeapUsed: number | undefined, opts: { missLimit: number; overLimit: number }): { verdict: "ok" | "evict"; reason: string; fast: boolean } {
  if (missStreak >= opts.missLimit) {
    return { verdict: "evict", fast: true, reason: `watchdog: unresponsive — ${missStreak} consecutive probes unanswered (limit ${opts.missLimit}) [fast kill]` };
  }
  if (budget.memMB !== undefined && overStreak >= opts.overLimit) {
    return { verdict: "evict", fast: false, reason: `watchdog: heap over budget — ${((lastHeapUsed ?? 0) / 1048576).toFixed(0)}MB > ${budget.memMB}MB for ${overStreak} consecutive samples [graceful]` };
  }
  return { verdict: "ok", fast: false, reason: "" };
}

/** D-366: declared-vs-default budget status (auditable — prefer declared). */
export function budgetStatus(id: string, budgets: Map<string, WatchdogBudget>, defaultMemMB: number): { memMB: number; declared: boolean } {
  const b = budgets.get(id);
  if (b?.memMB !== undefined) return { memMB: b.memMB, declared: true };
  return { memMB: defaultMemMB, declared: false };
}

/** D-388 pure policy: is compartment `id` due for a probe at `now`?
 *  A budget-declared intervalMs (the interim L-1 measure: a latency-sensitive
 *  compartment buys a shorter detection window with a small steady-state CPU
 *  cost) overrides the global cadence for THAT compartment only; the global
 *  default is never changed by a declaration. */
export function dueForSample(budget: WatchdogBudget | undefined, globalIntervalMs: number, lastSampledAt: number | undefined, now: number): boolean {
  const declared = budget?.intervalMs;
  const interval = typeof declared === "number" && declared > 0 ? declared : globalIntervalMs;
  if (lastSampledAt === undefined) return true;
  return now - lastSampledAt >= interval;
}

/** D-388 pure policy: the timer cadence that can serve every declared cadence —
 *  min(global default, tightest declared interval). Compartments WITHOUT a
 *  declared interval still sample at the global default (the faster timer just
 *  skips them), so no compartment's cadence changes unless it declares one. */
export function watchdogTickInterval(opts: { intervalMs?: number }, budgets: Map<string, WatchdogBudget>): number {
  let min = opts.intervalMs ?? 250;
  for (const b of budgets.values()) {
    if (typeof b.intervalMs === "number" && b.intervalMs > 0 && b.intervalMs < min) min = b.intervalMs;
  }
  return min;
}

interface Track { pending: boolean; missStreak: number; overStreak: number; samples: Sample[] }

export function startWatchdog(router: PortRouter, opts: WatchdogOptions = {}): Watchdog {
  const intervalMs = opts.intervalMs ?? 250;
  const missLimit = opts.missLimit ?? 3;
  const overLimit = opts.overLimit ?? 2;
  const defaultMemMB = opts.defaultMemMB ?? 256;
  const budgets = opts.budgets ?? new Map();
  const evictions: Eviction[] = [];
  const tracks = new Map<string, Track>();
  const listening = new Set<string>();
  const lastSampledAt = new Map<string, number>(); // D-388: per-compartment cadence
  const listeners = new Map<string, (m: { type?: string; heapUsed?: number; rss?: number; cpuUs?: number }) => void>();
  let stopped = false;

  const onMessage = (id: string) => (m: { type?: string; heapUsed?: number; rss?: number; cpuUs?: number }) => {
    if (m?.type !== "probeStat") return;
    const t = tracks.get(id);
    if (!t) return;
    t.pending = false;
    t.missStreak = 0;
    const budget = budgets.get(id) ?? { memMB: defaultMemMB };
    if (budget.memMB !== undefined && m.heapUsed !== undefined && m.heapUsed > budget.memMB * 1024 * 1024) t.overStreak++;
    else t.overStreak = 0;
    t.samples.push({ answered: true, heapUsed: m.heapUsed, rss: m.rss, cpuUs: m.cpuUs });
    if (t.samples.length > 10) t.samples.splice(0, t.samples.length - 10);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const now = Date.now(); // D-388: one clock for the per-compartment cadence
    const st = router.status().compartments as Record<string, { state?: string }>;
    for (const [id, c] of Object.entries(st)) {
      if (c.state !== "active" || evictions.some((e) => e.id === id)) continue;
      // D-388: skip compartments whose personal cadence has not elapsed — a
      // declared intervalMs samples tighter, an undeclared one keeps the
      // global default (the faster timer never tightens anyone by side effect)
      if (!dueForSample(budgets.get(id), intervalMs, lastSampledAt.get(id), now)) continue;
      lastSampledAt.set(id, now);
      const w = router.compartmentWorker(id);
      if (!w) continue;
      if (!listening.has(id)) {
        listening.add(id);
        const listener = onMessage(id);
        listeners.set(id, listener);
        w.on("message", listener);
      }
      const t = tracks.get(id) ?? { pending: false, missStreak: 0, overStreak: 0, samples: [] };
      tracks.set(id, t);
      if (t.pending) t.missStreak++; // last sample never answered
      w.postMessage({ type: "probe" });
      t.pending = true;
      const budget = budgets.get(id) ?? { memMB: defaultMemMB };
      const verdict = classify(budget, t.missStreak, t.overStreak, t.samples.at(-1)?.heapUsed, { missLimit, overLimit });
      if (verdict.verdict === "evict") {
        evictions.push({ id, reason: verdict.reason, at: Date.now() });
        try { router.journal({ principal: "watchdog", op: "host.compartment.terminate", decision: "allow", reason: verdict.reason, scope: id, fast: verdict.fast }); } catch { /* journal best-effort */ }
        await router.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: id, ...(verdict.fast ? { fast: true } : {}) }).catch(() => {});
        // E-2: drop the dead worker's listener + track — a long-lived daemon
        // would otherwise accumulate one entry per evicted compartment forever.
        // Best-effort (a dead worker's `off` must never break the eviction path).
        try {
          const listener = listeners.get(id);
          if (listener) w.off("message", listener);
        } catch { /* already dead */ }
        listeners.delete(id);
        listening.delete(id);
        tracks.delete(id);
        lastSampledAt.delete(id); // D-388: no stale cadence state for a dead compartment
        opts.onEvict?.(id, verdict.reason);
      } else if (opts.requireBudget || opts.onDefaultBudget) {
        const st2 = budgetStatus(id, budgets, defaultMemMB);
        if (!st2.declared) {
          opts.onDefaultBudget?.(id, st2.memMB);
          if (opts.requireBudget) {
            try { router.journal({ principal: "watchdog", op: "watchdog.budget-default", decision: "allow", reason: `compartment ${id} has no declared runtime.budget.memMB — using default ${st2.memMB}MB (declare it fail-closed)`, scope: id }); } catch { /* best-effort */ }
          }
        }
      }
    }
  };

  const timer: ReturnType<typeof setInterval> = setInterval(() => { void tick(); }, watchdogTickInterval(opts, budgets)); // D-388: fast enough for the tightest declared cadence
  (timer as { unref?: () => void }).unref?.();
  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
    evictions: () => [...evictions],
  };
}
