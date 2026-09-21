# D-432 — The Resource Governor is core (Omega-2 port, paper D-426)

## Status

RATIFIED

## Context

- Fifty live tiles = fifty claimants on finite RAM/CPU/GPU/procs; without lifecycle there is only "running" until the OS kills us mid-yes — a crash bypasses refusal, proof, provenance, memory (paper `D-426` §1).
- Requires Ω-1 green (tree D-431, F-WATCH green): notice exists, affordability does not. Completes choicepoint CP-2 (watchdog budget).
- Pipeline becomes two gates in fixed order: Law (`may it?`) → Governor (`can it?`) → Execution → Evidence citing both gates.
- Lifecycle is a fold over governor-ledgered `tile.transition` rows, never a stored field; budgets sync as policy, claims stay device-tagged physics (CP-1 held).

Blocks: none

## Options

| Criterion | (a) Kernel governor port (tooling + tests, zero host LOC) | (b) Plugin memory manager | (c) Defer |
|---|---|---|---|
| Survival (no mid-yes death) | Yes — on-path between Law and Execution, refuses before overcommit | No — kernel cannot refuse its own plugin | No — stalls stay fatal |
| Law-first attribution | Yes — forbidden refused before unaffordable evaluated | Muddy — budget grounds mask principle | Unknown |
| Lifecycle derived, sole writer | Yes — fold over `tile.transition`, governor sole writer | Two truths (tile claim vs ledger) | None |
| Coldness fairness (never badges) | Yes — vault-access recency + cheapest-rehydrate tiebreak, pre-registered refusals | Temptation to evict `speculative` first | Undecided |
| Prediction ceiling | Yes — provisional warms `ghost→dormant` only, never hydrates | Oracle spends real budget | Open hole |

## Decision

**Decision:** (a) — port paper `D-426` as tree D-432: every composition runs under a named budget; claims cite their law row; transitions are governor-sole-writer ledger rows; watchdog enforces with sentences.

## Consequences

- Harder: no execution without budget + claim + law ref; promotions (vN→vN+1) invalidate claims until revalidation; governor/forged/first-party alike get zero exemption.
- Easier: pressure becomes sentences + rows instead of stutter/freeze; `gov.inspect` answers cost questions in tile terms, headless; Ω-3 spends contexts against these budgets.
- Revisit: dormant TTL catalog; coldness signal richness (recency stays primary); cross-device claim audit views.

## Evidence

- F-GOV.1 (claim-refusal) — 3 GB claim on a 2 GB cap refuses `GOV_OVER_BUDGET` as a sentence; nothing executes; refusal is a queryable row.
- F-GOV.2 (pressure-eviction) — 50 dormant under caps fitting 10 ghost the 40 coldest, each a named `tile.transition` row; canvas rows untouched.
- F-GOV.3 (coldness-real) — touching A's bound vault rows keeps A while untouched B ghosts under identical pressure.
- F-GOV.4 (provisional-ceiling) — prediction warms `ghost→dormant` only; provisional never hydrates; preemption is a boring row, no sentence.
- F-GOV.5 (watchdog-enforcement) — over-grant burn is stopped with `cause=enforcement` + spoken sentence for forged tiles; zero host LOC to kill.
- F-GOV.6 (headless-inspect) — canvas killed, `gov.inspect` from CLI answers ghosted set, hidden-browser holders, costliest tile — all from rows.
- F-GOV.7 (locality) — vault sync carries budget policies to device B with zero granted claims until local execution.
- F-GOV.8 (healing-reclaim) — realization promotion refuses stale claims until revalidation; badge-weighted eviction and self-exemption refuse (`GOV_BADGE_WEIGHTED`, `GOV_SELF_EXEMPTION`).
- Spec: paper `D-426` (§0–§12, 1-8 spec lines 219–509); requires Ω-1 (tree D-431 green).
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-2 Governor with budgets, lifecycle, watchdog from paper D-426
rationale: Physics constrains law; every composition needs a named budget
class: evidence
