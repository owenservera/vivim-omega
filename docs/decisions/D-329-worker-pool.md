# D-329 — Warm worker pool (latency B)

## Status

RATIFIED

## Context

D-322 removed the per-call process floor; per-call compartment boot remains:
every routed call still pays worker spawn + plugin init inside the long-lived
host. Pooling the isolate (not the plugin code — `init` loads the plugin per
assignment) attacks the next floor. This is the one upgrade that touches B2
(compartments never share a heap) directly, so its safety bar is the highest
in the plan.

## Options

| Criterion | (a) Generic-bootstrap isolate pool + pool-aware checkout, cold fallback (this record) | (b) Pool plugin code (skip per-assignment init) | (c) No pool (D-322 is enough) |
|---|---|---|---|
| B2 honesty | Provable: recycled worker indistinguishable from fresh (adversarial suite, ship-blocker) | Code reuse across tenants (bleed surface) | N/A |
| Fallback | Cold spawn on pool miss (correctness never depends on the pool) | Same | Always cold |
| Placement | V2.5 decided with the LOC count in-PR (G11 wall holds) | Same | N/A |

## Decision

**Decision:** (a) Generic-bootstrap isolate pool + pool-aware checkout, cold fallback — `spawnCompartment` gains pool-aware checkout; adversarial state-bleed suite (no `globalThis`/closure/timer leakage across tenants) is a ship-blocker, not a follow-up.

## Consequences

- Prerequisite: D-328a (correctness proven before performance complexity).
- Falsifier appended to `BENCHMARKS.md`: pool-spawn numbers.
- No untrusted-third-party plugin tier until the watchdog + pool-teardown proofs exist (non-goal).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.5-B); dependency chain from `OMEGA-19X-LATENCY-DESIGN.md` (Upgrade B).
- Placement (how the wall held): ~34 lines in `host/src` (hook interface + setter + `checkoutCompartment` + `wrapWorker` extract in `worker.ts`; two call-site swaps in `boot.ts`) → host 984/1000, nothing trimmed. The pool proper — idle queue, refill-to-N bound, generic `poolboot.ts` bootstrap (`assign {entry}` → dynamic import → `assigned` ack), stats — lives in `surfaces/daemon` (the process lifecycle the pool belongs inside). The host never imports surfaces: the pool is INJECTED via `setPoolHook`, mirroring the `onDemandSpawn` injection. No compliant placement existed *inside* `host/src` for the whole pool; splitting interface (host) from implementation (daemon) is what fits.
- History note: this record previously deferred landing (949 + ~62 > 1000 for a host-resident pool). The deferral was correct for that placement and is superseded by this one — the wall was met by placement, not by cramming (host delta auditable in the land commit).
- `surfaces/daemon/test/pool.test.ts`: mechanics (size-0/shutdown nulls, assign-failure refill, entry-per-assignment init→ready, 6-way concurrent soak) + the ADVERSARIAL ship-blocker (tenant pollutes `globalThis`/timers/closures/module cache → terminated → same slot serves inspector → all four channels pristine + distinct threadIds) + checkout-latency distribution + daemon integration (pooled hits serve boot + first touch, status reports stats, poolSize 0 disables honestly). `host/test/pool.test.ts`: hook-absent/throwing/null all degrade to cold spawn; plain `spawnCompartment` untouched.
- Falsifier run: pooled checkout n=12 min 8.1ms p50 ~52–60ms max ~105–163ms vs cold thread-spawn p50 26.5ms on record (numbers in `BENCHMARKS.md`); full `bun run omega:gate` GREEN 2026-09-13 (612/612, host 984/1000 — ratified in 46fc6b3).
