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
// Honest bounds (D-321 unchanged): detection is bounded by interval × N; a
// compartment may still allocate several hundred MB or pin one core WITHIN a
// detection window, and termination frees what the OS can free (worker death).
// This layer is containment, not a security boundary — see D-360.
import type { PortRouter } from "@vivim/omega-host";
import { HOST_OPS } from "@vivim/omega-contracts";

export interface WatchdogBudget { memMB?: number; missLimit?: number; overLimit?: number }
export interface WatchdogOptions {
  intervalMs?: number;        // sample cadence (default 250)
  missLimit?: number;         // consecutive unanswered samples → evict (default 3)
  overLimit?: number;         // consecutive over-budget heap samples → evict (default 2)
  defaultMemMB?: number;      // budget when the manifest declares none (default 256)
  budgets?: Map<string, WatchdogBudget>; // per-compartment policy (from manifests)
  onEvict?: (id: string, reason: string) => void;
}
export interface Eviction { id: string; reason: string; at: number }
export interface Watchdog { stop(): void; evictions(): Eviction[] }
export interface Sample { answered: boolean; heapUsed?: number; rss?: number; cpuUs?: number }

/** Pure policy: do the current streaks warrant eviction? Unit-tested directly;
 *  the boot-based falsifiers (adversarial 13/14) cover the wiring. */
export function classify(budget: WatchdogBudget, missStreak: number, overStreak: number, lastHeapUsed: number | undefined, opts: { missLimit: number; overLimit: number }): { verdict: "ok" | "evict"; reason: string } {
  if (missStreak >= opts.missLimit) {
    return { verdict: "evict", reason: `watchdog: unresponsive — ${missStreak} consecutive probes unanswered (limit ${opts.missLimit})` };
  }
  if (budget.memMB !== undefined && overStreak >= opts.overLimit) {
    return { verdict: "evict", reason: `watchdog: heap over budget — ${((lastHeapUsed ?? 0) / 1048576).toFixed(0)}MB > ${budget.memMB}MB for ${overStreak} consecutive samples` };
  }
  return { verdict: "ok", reason: "" };
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
    const st = router.status().compartments as Record<string, { state?: string }>;
    for (const [id, c] of Object.entries(st)) {
      if (c.state !== "active" || evictions.some((e) => e.id === id)) continue;
      const w = router.compartmentWorker(id);
      if (!w) continue;
      if (!listening.has(id)) { listening.add(id); w.on("message", onMessage(id)); }
      const t = tracks.get(id) ?? { pending: false, missStreak: 0, overStreak: 0, samples: [] };
      tracks.set(id, t);
      if (t.pending) t.missStreak++; // last sample never answered
      w.postMessage({ type: "probe" });
      t.pending = true;
      const budget = budgets.get(id) ?? { memMB: defaultMemMB };
      const verdict = classify(budget, t.missStreak, t.overStreak, t.samples.at(-1)?.heapUsed, { missLimit, overLimit });
      if (verdict.verdict === "evict") {
        evictions.push({ id, reason: verdict.reason, at: Date.now() });
        try { router.journal({ principal: "watchdog", op: "host.compartment.terminate", decision: "allow", reason: verdict.reason, scope: id }); } catch { /* journal best-effort */ }
        await router.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: id }).catch(() => {});
        opts.onEvict?.(id, verdict.reason);
      }
    }
  };

  const timer: ReturnType<typeof setInterval> = setInterval(() => { void tick(); }, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
    evictions: () => [...evictions],
  };
}
