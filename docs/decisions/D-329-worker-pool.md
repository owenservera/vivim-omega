# D-329 — Warm worker pool (latency B)

## Status

PROPOSED

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
- DEFERRED BY THE WALL (not by value): the in-PR LOC count decides placement
  (Options row above), and the count forbids landing. `host/src` stands at
  949/1000 after D-331; the minimal honest pool (generic-bootstrap entry +
  checkout/checkin/refill/stats + `spawnCompartment` pool-aware checkout with
  cold fallback) is ~62 lines → ~1011/1000, a G11 breach. Compartments are
  host-owned, so no compliant placement exists outside `host/src`. Cramming it
  to 997 would obey the letter while violating the wall's spirit ("a wall, not
  a budget") — refused explicitly.
- Measurements (the value case, for the resequencing decision): worker-thread
  creation p50 ~26ms (n=10, isolated bench); dormant-first-touch `echo.ping@1`
  78–83ms end-to-end (thread + import + init) with D-331 live and no pool.
  Lazy + daemon already capture most of B's single-tenant value; the pool's
  remaining prize is first-touch thread time (~26ms/checkout) at multi-tenant
  spawn churn — real, but not worth a wall breach today.
- Design (frozen for the resequencing PR): pool of generic-bootstrap isolates
  (`assign {entry}` → dynamic import → `assigned` ack); checkout assigns,
  checkin TERMINATES (never recycle — a recycled worker needs the adversarial
  bleed proof, a fresh isolate needs none) + background refill; cold fallback
  when empty; stats (checkouts/hits/cold/refills). The adversarial
  state-bleed suite (no `globalThis`/closure/timer leakage) stays the
  ship-blocker, not a follow-up.
- Resequencing condition (either): (a) owner amends G11 (wall relief is an
  owner decision, not an engineering shortcut), or (b) future host refactors
  reclaim ≥70 LOC of honest budget. Until then D-329 stays PROPOSED with
  design + data — vocabulary with a design is a plan, not a relapse (no
  `contracts/` surface was added for it, so D-332 stays silent correctly).
