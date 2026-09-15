# D-360 — The consumption watchdog: bounded detection for compartment consumption

## Status

RATIFIED

## Context

D-321 documented honestly that `worker_threads` is not an OS-level boundary: a
compartment can exhaust host memory or CPU and degrade every compartment it shares
a process with (`resourceLimits` are not enforced by Bun — re-verified on this
runtime: 130MB heap inside a 32MB cap, exit 0; `tooling/watchdog/resourcelimits-probe.ts`).
The external review (turn-014 tree) named this the highest-severity gap: capability
tokens stop a compartment from *calling* things it shouldn't; nothing stopped it
from *starving* things it shares with. D-321's own Consequences pre-authorized this
row: "The watchdog, when built, goes through the Decision Contract as its own row
(thresholds are policy, not plumbing)."

## Options

| Criterion | (a) Watchdog — out-of-tree, probe-based (this row) | (b) Enforce `resourceLimits` under Bun | (c) Process-per-compartment tier now | (d) Keep documentation-only (D-321 as-is) |
|---|---|---|---|---|
| Real containment, today | Partial — bounded DETECTION, no new deps | None — Bun does not enforce it (re-verified) | Strongest | None |
| Cost / LOC budget | ~1 module out-of-tree + 4 host LOC (worker seam) | Zero (impossible on this runtime) | High (IPC latency, new boot path) | Zero |
| Honest bounds stated | Yes (interval×N; containment ≠ boundary) | n/a | Yes | No — exposure persists |
| Fits the house (D-329 placement, B5 budget) | Yes | n/a | Deferred | n/a |

## Decision

**Decision:** (a) Watchdog — out-of-tree, probe-based — `tooling/watchdog` attaches to a
booted router, polls active compartments, probes each raw worker directly (the shim answers
`probe` with `probeStat`; a wedged event loop CANNOT answer, which is itself the signal), and
terminates violators through the sanctioned host op `host.compartment.terminate@1` as root.
Two-signal enforcement: **unresponsive** (N consecutive unanswered probes) and **memory**
(N consecutive answered samples over the manifest's declared `runtime.budget.memMB` —
thresholds are manifest data). Termination journals (principal `watchdog`). (c) stays
flagged for a future untrusted-plugin tier, gated on measured IPC latency — the review's
own recommendation; (b) is re-verified per runtime upgrade via the probe.

## Consequences

- Detection is bounded (interval × N); a compartment may still allocate or pin a core
  WITHIN a detection window. This is containment, not a security boundary — the README
  law #3 wording is downgraded accordingly, and worker.ts's honesty header now points here.
- The host grows by the minimal seam only: `CompartmentHandle.worker` (raw worker exposure)
  and `PortRouter.compartmentWorker(id)`; the host neither sends nor reads probes (B3 surface
  unchanged — probing is not a Port Protocol op).
- Falsifiers (must be green before RATIFIED, per D-364's cooling-off for B1–B4-adjacent
  evidence-class rows): adversarial **case 13** (CPU-wedged compartment → unresponsive
  eviction, siblings unaffected) and **case 14** (responsive heap bomber over its declared
  budget → memory eviction, siblings unaffected). Measured: eviction walls ≈ 2.9s / 3.7s at
  intervalMs 100, missLimit 3.
- Re-run `tooling/watchdog/resourcelimits-probe.ts` on every Bun upgrade (D-321 protocol).

## Evidence

- Adversarial cases 13/14 green (726/726 across the tree on the landing commit).
- resourceLimits probe on Linux/Bun 1.3.14: `{"capMB":32,"peakHeapMB":130,"exitCode":0,
  "verdict":"NOT ENFORCED"}` — recorded in BENCHMARKS.md (remediation wave entry).
- Landed in 0df18d0 (the remediation-wave commit; gate GREEN 733/733, host 999/1000, all seven stages incl. the new bun-surface stage).
