# D-444 — Liveness Health is core (Omega-14 port, paper D-446)

## Status

PROPOSED

## Context

- Hard-failure checks miss the zombie: 200 OK in 40s, dropped schema fields, throttled local models — kernel routes critical work into sick pipes while budgets hold and vaults stay pure (paper `D-446` §1).
- Requires Ω-7 (tree D-437) + Ω-2 (D-432) + Ω-8 (D-438): demotion consumer, cost measurement, shadow rehearsal of degradation.
- Invariant: distinguish dead vs untrusted vs degraded; measure the pulse continuously; propose demotion before decay corrupts workflows.
- Tree collision noted: tree D-444 here vs paper Ω-12 specId `D-444` — distinct per the two-numbering rule (this tree row ports paper `D-446`).

Blocks: none

## Options

| Criterion | (a) Core stethoscope (tooling + tests, zero host LOC) | (b) Hard-failure checks only | (c) Defer |
|---|---|---|---|
| Zombie detection | Yes — TTFT/rate/schema pulses with contracts | 200 OK looks healthy | Foggy |
| Evidence-backed | Yes — pulses cite W5 turns, local-only rows | Estimates | Phantom |
| Loud degradation | Yes — persistent warning, no silent swap | Secret reroute | Betrayal |
| Ω-7 handoff | Yes — sustained signals mint demotion proposals | Disconnected | Starved |
| Headless-safe loops | Yes — pulse check gates 10k-step starts | Quiet collapse | Ruined nights |

## Decision

**Decision:** (a) — port paper `D-446` as tree D-444: liveness contracts per manifest, passive measurement + governed shadow probes, `ns liveness` vault rows, degraded/critical states, demotion signals, override-with-consent.

## Consequences

- Harder: every manifest declares physical expectations; pulses cite turns or refuse; degraded warns persistently; swaps need taps.
- Easier: slowness gets forensic answers; loops pre-check pulses; rehearsals inject degradation; poetry stays out of scope.
- Revisit: contract defaults per class; heartbeat intervals; window lengths for sustained signals; probe cost caps.

## Evidence

- F-LIVENESS.1 (latency-injection) — 5s TTFT on 2s contract completes with degraded pulse + surface warning, no fallback.
- F-LIVENESS.2 (schema-drift) — dropped fields sink pass rates, breach mints demotion signals.
- F-LIVENESS.3 (zombie-probe) — hung port times out per contract to critical.
- F-LIVENESS.4 (handoff) — 24h degraded consumes into badge proposals with ratification prompts.
- F-LIVENESS.5 (ledger-query) — latency history folds from rows, queryable, never RAM-hidden.
- Spec: paper `D-446` (9-16 spec lines 3123–3287); requires Ω-7/Ω-2/Ω-8.
- Gate: PROPOSED-tree greens pending (D-364 two-green bar before flip; status.json carried only from green).

## Index

summary: Port Omega-14 pulse probes ledger handoff from paper D-446
rationale: Alive but degraded must warn and signal demotion, never silently swap
class: evidence
