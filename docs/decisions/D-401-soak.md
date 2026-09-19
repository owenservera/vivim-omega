# D-401 — Long-horizon soak: proving self-sustaining over time (Part2 §5)

## Status

RATIFIED

## Context

Pressure tests prove survival under sharp spikes for bounded durations. Self-sustaining needs unattended ordinary traffic over hours, surfacing slow leaks plus rare-timing races no 10-minute test catches.

## Options

| Criterion | (a) Soak harness now: sustained moderate randomized load plus rare faults, resource tracking, 60s default with 24h target flag (recommended) | (b) No soak, spikes suffice | (c) 24h mandatory before any claim |
|---|---|---|---|
| Slow leaks | Tracked: process memory, fds, vault size, chain length | Missed | Found but blocks wave |
| Rare faults | Crash plus breach plus tamper injected occasionally | Isolated only | Same as (a) |
| Cost | 60s default green, 24h on demand | Zero | 24h gate |

## Decision

**Decision:** (a) — soak harness now, 60s default with 24h target.

## Consequences

- `tooling/bench/soak.ts --seconds 60` runs supervisor plus bus plus steward live under moderate randomized traffic with rare faults; all caught plus handled plus auditable or the wave re-runs per cooling-off (two clean, not one).
- Unclean soak is the wave doing its job, not failing it; fix plus re-run.
- 24h remains the first real target once 60s is clean twice.

## Evidence

- `tooling/bench/soak.ts` plus short-run green this wave.
- Ratified: harness plus 15s smoke (374 ops, 0 errors) plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux); 24h target stays future work. Landing: 786006c.
