# D-398 — Self-observation bus: pull signals become push events (Part2 §2)

## Status

RATIFIED

## Context

Portrait plus centrality sweep are pull-only; the steward needs push events without polling on guess schedules. A general pub slash sub bus would be new ambient authority; the minimum specific signal set through existing port dispatch is not.

## Options

| Criterion | (a) Three capability-gated signal ops on existing dispatch, 5s sweep justified by cost (recommended) | (b) General pub slash sub bus | (c) Polling only, no push |
|---|---|---|---|
| New mechanism | None, ordinary ops | Ambient bus | None |
| Cost | Sweep p50 1.17ms at 20 nodes, verify 4.78ms — 5s interval is 0.1 percent overhead | Unbounded | Repeated poll cost |
| Steward input | Timely crossed slash breach slash chain-broken | Same | Delayed |

## Decision

**Decision:** (a) — three signal ops on existing dispatch, 5s sweep.

## Consequences

- `kernel.centrality.crossed@1` fires when sweep finds newly load-bearing nodes.
- `host.watchdog.breach@1` carries compartment plus measured plus threshold.
- `host.audit.chain-broken@1` is most severe, wired for loud escalation.
- No new transport; periodic sweep plus verify cost benchmarked, interval from measurement.

## Evidence

- `plugins/vivim-kernel-lens/src/signals.ts` plus test green; sweep p50 1.17ms, verify p50 4.78ms measured this wave.
- Ratified: falsifier plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: 50e5dcb.
