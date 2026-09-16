# W6 — Ops Stratum (observability, resilience, scheduler, tunnel, p2p, onboarding)

**Objective:** legacy ops as Omega-native plugins — patterns only, no code lifted (T-18).
**Consumes:** T-18, GAP-M7 spine, GAP-2 (SLO envelopes now), L-5/L-6 dispositions.
**Touches:** `vivim-mind` (query set), `vivim-run` + director ticks (scheduler), `platform/` (tunnel/p2p sockets), watchdog budgets (resilience), onboarding as rules + teachings.

## Tasks

1. Observability on the W0 spine: per-conversation history, per-realization status, per-decision resolve trail, per-eviction watchdog journal — all via vault query + journal stream. No metrics sidecar (no second provenance graph).
2. Resilience: manifest budgets on every migrated plugin (`requireBudget`/`onDefaultBudget` audit per D-366); watchdog walls re-measured with migration traffic (sibling-impact metric — L-1 detector).
3. Scheduler: legacy scheduler/onboarding → `vivim-run` + director ticks (data-only rules, ledgered, revertable).
4. Tunnel/p2p: via `platform/` + explicit forbidden policy + consent rows. No raw `node:net` outside declared surfaces; no ambient authority.
5. SLO envelopes published (GAP-2): boot / RTT / spawn / append-latency / eviction walls become objectives with numbers from W0–W5 benches. Soak green (serial lanes, clean slate); L-5/L-6 revisit triggers evaluated in writing.

## Falsifier

SLO set published in BENCHMARKS lineage with envelopes; soak green; every migrated plugin carries a budget; every eviction journals; mind-query set green over migration-scale vault.

## Non-goals

No process-per-compartment tier (flagged, not built — D-360). No auto-remediation beyond journaled eviction. No Windows-lane promotion without sustained green soak (L-5 trigger).
