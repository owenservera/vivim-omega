# D-395 — Vault single-writer ceiling (SCALABILITY §4 answered)

## Status

RATIFIED

## Context

SCALABILITY-CEILINGS §4 flagged the vault single-writer queue; VAULT-NAMESPACES covers logical organization only, not concurrent-writer throughput. Kernel-bench measured 1,777 writes/s light-load; this wave ramps concurrent writers.

## Options

| Criterion | (a) Document measured ceiling, keep single writer (recommended) | (b) Shard vault now | (c) Add writer pool now |
|---|---|---|---|
| Data | 10-wide 301 writes/s, 20-wide 526 writes/s, 40-wide 422 writes/s — peaks near 20 concurrent, read-after 1 to 10ms | No data | No data |
| Read impact | Reads stay flat, db.ts claim holds under load | Unknown | Unknown |
| Cost | Zero | Large | Medium |

## Decision

**Decision:** (a) — document measured ceiling, keep single writer.

## Consequences

- Throughput stops scaling past ~20 concurrent writers on this box; 40-wide drops.
- Reads are not queued behind writes; shared-thread CPU contention does not degrade reads at tested widths.
- Sharding deferred until real compositions sustain 20-plus concurrent writers.

## Evidence

- `tooling/bench/law-saturation.ts` vault levels above.
- `BENCHMARKS.md` vault-saturation entry this wave.
- Ratified: bench plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: d32609c.
