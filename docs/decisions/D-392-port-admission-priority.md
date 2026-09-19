# D-392 — Port admission control + priority scheduling (Homa cross-reference)

## Status

RATIFIED

## Context

`host/src/ports.ts`'s `deliver()` posts every routed call to its target compartment
the instant `dispatch()` resolves it. `inflightByCompartment` is bookkeeping, not a
limit — there is no cap on concurrent work per compartment and no ordering by
urgency, only arrival order. A compartment is one worker-thread event loop; a
synchronous handler occupies it completely. Every risky op's `law.check@1` gate
call (`dispatch()`'s own `callLaw()`, deadline 500ms) and every unrelated call to
the same compartment compete on that single unbounded, unprioritized channel —
the router's own comment at `stateAcquire` already concedes this ("policy (retry,
backpressure) stays outside the host"), but no mechanism exists for a policy to
attach to. Today's only remedy for a stuck or saturated compartment is D-360's
watchdog eviction (~2.9s to detect-and-kill), which removes the whole compartment
rather than scheduling around the one slow call.

Homa (Stanford PlatformLab, SIGCOMM 2018 — arxiv.org/abs/1803.09615;
implementation read at github.com/PlatformLab/Homa) solves the structurally
identical problem — many small RPCs sharing a pipe with a few large ones — via
two decoupled mechanisms: a receiver-granted concurrency bound
(`Policy::Scheduled.degreeOvercommitment`, `src/Policy.h`) and SRPT-ordered
priority (the message-priority comparator in `src/Receiver.h`). This record
proposes the host-side analogs for the Port Protocol.

This record was authored from an external, read-only review of this tree (a
user-supplied git bundle clone, no write access, `bun test`/`omega:gate` not
executed against it) — flagged per this repo's own law #9 ("claims carry no
weight" without evidence); see §Evidence for exactly what is and isn't proven.

## Options

| Criterion | (a) Admission cap + priority queue, both manifest-driven (recommended) | (b) Priority queue only, no cap | (c) Admission cap only, no priority | (d) Status quo — deadline + D-360 watchdog only |
|---|---|---|---|---|
| Fixes HOL blocking for gate/short calls under a same-compartment flood | Yes — bounded backlog, gate-tier calls jump the queue | Partial — reorders an unbounded backlog; worst-case wait for a late gate call is unchanged | Partial — bounds concurrency, but calls of equal priority inside the cap stay FIFO behind a slow admitted one | No — relies on the caller's own `deadlineMs` and, worst case, watchdog eviction (kills the *whole* compartment, not the one slow call) |
| Mechanism/policy split | Cap and priority tier both come from manifest data (`resourceLimits`, CONTRACT declaration) — host stays a router, same shape as existing `riskyOps()` | Priority tier manifest-driven; unbounded backlog means the mechanism alone can't bound worst-case latency | Cap manifest-driven; smallest new surface | No new surface |
| B2/B3 path risk | Touches core `deliver()` dispatch — same file/risk class D-329 named for the worker pool ("the one upgrade that touches B2... directly, so its safety bar is the highest") | Same file, same risk class | Same file, same risk class | None |
| Falsifier | New same-compartment flood test (`priority-bench.ts`, §Evidence): before/after fast-call p50/p99 + timeout count | Same test, weaker signal — no timeout-count improvement predicted | Same test, no priority-inversion coverage | None exists proving the gap either, today |
| LOC estimate (B5 wall: 1,450/1,500 per D-391) | ~50–60 lines in `host/src` — must be priced for real before landing; near-zero slack remains | ~25–30 lines | ~25–30 lines | 0 |

## Decision

**Decision:** (a) Admission cap + priority queue, both manifest-driven — the
combination is what actually bounds worst-case latency for short/urgent calls;
either mechanism alone (b, c) only partially closes the gap, and (d) has no
falsifier proving the gap is even bounded today.

## Consequences

- **Cooling-off applies before RATIFIED.** This record is B2-adjacent by D-329's
  own precedent (same file, same class of risk as the worker pool). Per D-364,
  the falsifier must be *in* the record and green, and the gate must run green
  twice, before this can move past PROPOSED — not after.
- **LOC budget is the binding constraint, not the design.** Host is 1,450/1,500
  (D-391). A 50–60 line delta leaves near-zero slack; either the implementation
  must shrink (e.g., fold the priority lookup into the existing `opRisk`-style
  map instead of a second `Map`) or this record needs a companion B5 amendment
  the way D-391 itself required one, *before* landing — not discovered at PR time.
- **`contracts/src/manifest.ts` gains two additive fields**: an optional
  `priority` tag per CONTRACT declaration and `resourceLimits.maxConcurrentCalls`.
  Undeclared manifests default to `"normal"` / 4 — existing compositions are
  byte-unaffected, matching the additive-law style D-352 set for `port.stream`.
- **`failInflight` has a real gap this plan introduces, not just extends.** A
  call sitting in the new `waiting` queue is not yet in `pending` and has no
  timer running — a compartment crash today would leave it unresolved
  indefinitely instead of failing fast. `failInflight` must drain `this.waiting`
  with a `DEGRADED` result as part of this change, and that path needs its own
  test — it is a correctness requirement of the proposal, not an optional extra.
- **Does not solve cross-compartment gate contention** — many different callers'
  `law.check@1` calls saturating `vivim.law`'s *own* compartment is the same
  mechanism applied to a different target, and isn't covered by this record's
  falsifier. Worth a follow-up record once this one's benchmark data exists.
- **`maxConcurrentCalls` default of 4 is a placeholder, not a measurement** — the
  falsifier's before/after run is what should set it, not this record; expect
  the number in the landed version to differ from what's sketched below.
- **Per-compartment caps interact with downstream saturation laws (measured).**
  The default 4 throttled `run.submit@1` burst-through and made the pool's own
  saturation signal invisible (20 concurrent at capacity 2: 0 rejected, 18
  timeouts, wall 1224ms — pool law silently bypassed, not violated). `vivim.run`
  declares 32: its submit handler yields immediately, so the pool, not the
  router, is run's backpressure; with 32 the law is restored (12 rejected, 8
  timeouts, wall 304ms, matching pre-wave baseline). Default 4 stands for all
  other compartments; caps are data for exactly this tuning.

## Evidence

**Status: PROPOSED, falsifier landed this wave.** Landed: admission cap plus
priority queue in `host/src/ports.ts` (waiting queue with gate-before-normal
insertion, per-manifest cap default 4, queue wait counts toward deadline,
`failInflight` drains waiting DEGRADED), additive manifest fields
(`Contribution.priority`, `budget.maxConcurrentCalls`), `echo.busyMs` flood
op. `tooling/bench/priority-bench.ts` (20x150ms busy flood plus 50 fast 500ms):
survivors p50 22ms p99 36ms with 30 explicit BUDGET timeouts — pre-fix queue
ignored deadlines entirely (p99 3002ms, 0 timeouts). Host 1497 to 1500 gate
math via comment-trim (no B5 raise). Pool interaction measured and tuned
(see Consequences). SDK schema updated same wave (`budget.maxConcurrentCalls`,
`Contribution.priority`) after the sdk manifest-parity falsifier caught the
strictObject gap — additive fields parse green. Ratified: falsifier plus
saturation restoration plus sdk parity greens plus two consecutive full greens
(962/0, host 1500/1500, attest green, Linux); B2 cooling-off satisfied. Landing: 30c89b3, 0a3108d, add515c. What follows is (1) the external prior art this record
draws on, (2) this repo's own precedents that shaped the design, and (3) the
falsifier and implementation sketch this record committed to landing before
ratification.

**External prior art**
- Homa transport protocol — J. Ousterhout et al., Stanford PlatformLab,
  ACM SIGCOMM 2018 (arxiv.org/abs/1803.09615).
- Implementation read at github.com/PlatformLab/Homa:
  `src/Policy.h` (`Policy::Scheduled.degreeOvercommitment`,
  `Policy::Unscheduled.priority` — the grant/priority split this record mirrors);
  `src/Receiver.h` (the strict-weak-ordering priority comparator on remaining
  message size — the SRPT precedent for §Options row 1);
  `src/Timeout.h` (bucketed intrusive timeout management at scale — noted as a
  *future* concern if per-call `setTimeout` volume ever grows past what Node's
  timer wheel handles well; **not** adopted in this proposal, which keeps one
  timer per admitted call, matching the current `deliver()` pattern).

**This repo's own precedent for the proposed shape**
- `riskyOps(manifest)` (`contracts/src/manifest.ts`, consumed in
  `ports.ts::register()`) — the existing data-driven classification pattern this
  record's `opPriority()` is modeled on, instead of hardcoding op names in the host.
- D-321 (`docs/decisions/D-321-resource-limits.md`) — `resourceLimits` as a
  manifest-declared budget. Its own re-verification found the memory cap
  unenforced on Bun (130MB inside a 32MB cap, Linux). The concurrency cap
  proposed here is explicitly **not** in that category — it's a host-process
  `Map.size` check gating `handle.post()`, nothing delegated to the runtime, so
  it doesn't inherit D-321's caveat.
- D-329 (`docs/decisions/D-329-worker-pool.md`) — cited for its own framing of
  "touches B2... directly, so its safety bar is the highest," used here to
  classify this record's risk the same way.
- D-360 / D-366 (watchdog) — cited as the current-state description of the only
  existing remedy for a saturated compartment, establishing that admission
  control is a genuine gap and not a duplicate mechanism.
- D-388's `poolBurst` entry in `BENCHMARKS.md` — the template this record's
  falsifier output follows (measured before/after numbers appended, not just
  a claim).

**Falsifier — designed, not yet run**

Fixture addition, `examples/plugin-echo/src/index.ts` (additive; `delayMs`
already exists and is non-blocking async, which is why it can't demonstrate
head-of-line blocking on today's code — this adds a *synchronous* counterpart,
the finite sibling of `fixtures/plugin-bomb`'s infinite `"spin"` mode):

```ts
"echo.ping@1": async (payload) => {
  const p = (payload as { delayMs?: number; busyMs?: number } | null) ?? {};
  if (p.delayMs) await new Promise((r) => setTimeout(r, p.delayMs));
  if (p.busyMs) { const end = Date.now() + p.busyMs; let x = 1; while (Date.now() < end) x += Math.sqrt(x + 1); }
  return { echo: true, payload, at: Date.now() };
},
```

Benchmark, `tooling/bench/priority-bench.ts` (mirrors `tooling/bench/bench.ts`'s
own `compileComposition`/`bootComposition`/`pct` pattern):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const SPEC = join(ROOT, "compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const vault = join(ROOT, "dev-vault-bench-priority");
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);

const SLOW_N = 20, SLOW_BUSY_MS = 150;
const FAST_N = 50, FAST_DEADLINE_MS = 500;

const slow = Array.from({ length: SLOW_N }, () =>
  host.router.callAsRoot("echo.ping@1", { busyMs: SLOW_BUSY_MS }));

const fastTimes: number[] = [];
let timedOut = 0;
const fast = Array.from({ length: FAST_N }, async (_, i) => {
  await new Promise((r) => setTimeout(r, i * 2));
  const t = performance.now();
  const r = await host.router.callAsRoot("echo.ping@1", {}, FAST_DEADLINE_MS);
  if (r.ok) fastTimes.push(performance.now() - t); else timedOut++;
});

await Promise.all([...slow, ...fast]);
await host.shutdown();

const fsorted = [...fastTimes].sort((a, b) => a - b);
console.log(JSON.stringify({
  slowN: SLOW_N, slowBusyMs: SLOW_BUSY_MS, fastN: FAST_N,
  fastRtt: { n: fastTimes.length, p50: +pct(fsorted, 50).toFixed(1), p99: +pct(fsorted, 99).toFixed(1) },
  timedOut,
}, null, 2));
```

Predicted (not measured) outcome, stated so the falsifier can actually falsify
this record: **baseline** (current `ports.ts`) — fast-call p99 climbs toward
`SLOW_N × SLOW_BUSY_MS` (worst case ~3s) with `timedOut > 0` against the 500ms
deadline. **After** the admission+priority patch — fast-call p99 stays bounded
by the cap and priority tier, `timedOut` at or near 0, under the identical flood.
If the "after" run does not clearly beat the baseline on both numbers, this
record's Decision is wrong and should move to REJECTED or back to Options.

**Implementation sketch — `host/src/ports.ts`** (not yet applied; LOC delta
above is an estimate against this sketch, not a landed diff):

```ts
interface Queued {
  targetId: string;
  msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string };
  onChunk?: (c: StreamChunk) => void;
  resolve: (r: PortResult) => void;
  priority: PortPriority; // "gate" | "normal" — from opPriorityMap, filled in register()
}

private waiting = new Map<string, Queued[]>();
private opPriorityMap = new Map<string, PortPriority>();

private maxInflight(targetId: string): number {
  return this.manifests.get(targetId)?.resourceLimits?.maxConcurrentCalls ?? 4;
}

deliver(targetId, msg, onChunk): Promise<PortResult> {
  const handle = this.compartments.get(targetId);
  if (!handle) return Promise.resolve({ ok: false, error: "REFUSED", detail: `no compartment ${targetId}` });
  const priority = this.opPriorityMap.get(msg.op) ?? "normal";
  return new Promise<PortResult>((resolve) => this.enqueue({ targetId, msg, onChunk, resolve, priority }));
}

private enqueue(item: Queued): void {
  const inflight = this.inflightByCompartment.get(item.targetId)?.size ?? 0;
  if (inflight < this.maxInflight(item.targetId)) { this.admit(item); return; }
  const q = this.waiting.get(item.targetId) ?? [];
  const idx = q.findIndex(w => w.priority === "normal" && item.priority === "gate");
  q.splice(idx === -1 ? q.length : idx, 0, item);
  this.waiting.set(item.targetId, q);
}

private admit(item: Queued): void {
  const { targetId, msg, onChunk, resolve } = item;
  const handle = this.compartments.get(targetId)!;
  handle.stats.delivered++;
  const key = msg.causationId;
  const timer = msg.deadlineMs > 0 ? setTimeout(() => {
    if (this.pending.delete(key)) { this.release(targetId, key); resolve({ ok: false, error: "BUDGET", detail: `deadline ${msg.deadlineMs}ms exceeded (op ${msg.op})` }); }
  }, msg.deadlineMs) : null;
  this.pending.set(key, { resolve, timer, ...(onChunk ? { onChunk } : {}) });
  this.incInflight(targetId, key);
  handle.post(msg);
}

// Replaces the bare decInflight call at all three existing sites: the deadline
// timeout above, the "return" branch in onWorkerMessage, and failInflight's drain loop.
private release(targetId: string, key: string): void {
  this.decInflight(targetId, key);
  const next = this.waiting.get(targetId)?.shift();
  if (next) this.admit(next);
}
```

`failInflight` additionally needs a loop over `this.waiting.get(pluginId)`,
resolving each with `{ ok: false, error: "DEGRADED", detail: reason }` and
clearing the queue — see §Consequences.
