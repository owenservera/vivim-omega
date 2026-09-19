# D-394 — Law-gate saturation ceiling (SCALABILITY §3 answered)

## Status

RATIFIED

## Context

SCALABILITY-CEILINGS §3 asked whether one global law gate is the throughput ceiling forever and what that ceiling is. Kernel-bench measured 4,331 ops/s light-load; this wave ramps to find where the queue stops keeping up.

## Options

| Criterion | (a) Document measured ceiling, keep single gate (recommended) | (b) Shard law gate now | (c) Add backpressure queue now |
|---|---|---|---|
| Data | 10-wide 179 ops/s p50 192ms, 20-wide 295 ops/s p50 337ms, 40-wide 403 ops/s p50 626ms, zero timeouts at 2s | No data | No data |
| Blast radius | Unrelated echo p50 stays 1 to 2ms during storm — no degradation | Unknown | Unknown |
| Cost | Zero | Large arch change | Medium |

## Decision

**Decision:** (a) — document measured ceiling, keep single gate.

## Consequences

- Ceiling rises with concurrency but latency climbs linearly; queue drains, no cascading BUDGET at tested widths.
- Unrelated non-risky dispatch unaffected — single event loop still drains.
- Sharding stays deferred until realistic plugin counts hit the measured wall.
- `deadlineMs 500` on callLaw never fired at these widths; revisit past 80-wide.

## Evidence

- `tooling/bench/law-saturation.ts`: law levels above, spine composition, consent-granted risky path.
- `BENCHMARKS.md` law-saturation entry this wave.
- Ratified: bench plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: d32609c.
