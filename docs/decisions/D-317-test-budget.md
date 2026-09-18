# D-317 — Test wall-time budget: clock vs count trigger

## Status

RATIFIED

## Context

516 tests, ~90–150s per full run on the reference Windows box (less contention with
`--max-concurrency 4` than without — thrash dominates past core count). Wall time is
machine-dependent (a VLC decode session visibly moved full-suite results); test count
is not. The trigger for test-lane sharding should be the stable metric.

## Options

| Criterion | (a) 5-minute wall-clock trigger | (b) ~700-test count trigger |
|---|---|---|
| Stability across machines | Poor (same suite: 87s quiet, 300s+ saturated) | High (count is count) |
| Actionability (tells you what to do) | Weak ("be faster" — how?) | Strong (count lanes = files ÷ lanes) |
| Gaming risk | Perverse (drop slow meaningful tests to beat the clock) | Low (counting tests never suggests deleting them) |
| Fit with existing budgets | p99/spawn budgets already machine-scoped; clock adds a second machine axis | Count trigger composes with existing budgets |

## Decision

**Decision:** (b) ~700-test count trigger — shard lanes when count crosses ~700; wall time stays an observed signal, never the tripwire.

## Consequences

- No action until ~700 tests (headroom for ~180 more from 516).
- When triggered: file-group lanes (e.g., surfaces/*, discovery/*, core) run as separate `bun test` invocations, results summed — same tests, same assertions, less thrash. No test file is split or weakened to fit a lane.
- If wall time crosses 5 minutes *before* 700 tests, that indicates a machine/load problem (see the VLC incident), not a suite problem — investigate load, not the suite.

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G10, §7 Q5.
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §8 Q5 (concurs).
- Observed: 87s quiet vs 300s+ saturated for the same suite on one box.
- 2026-09-12: `bun test --max-concurrency 4 --timeout 60000` → 534/534 in 64s on a
  VLC-saturated 4-core box, while default-concurrency plain runs flaked with varying
  culprits (533/1, 532/2) — contention, not regressions (all flake suspects green in
  isolation and in the constrained run). Thrash dominates past core count.
- Owner confirmation recorded 2026-09-16 (delegated ratification, D-367 fast-path): option (b) count trigger — already mechanized by D-368 lanes (trigger crossed at 733; suite at 776 runs as lanes). Gate green at landing 377c4ed (776/776).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
