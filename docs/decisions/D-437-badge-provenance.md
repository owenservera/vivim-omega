# D-437 — Badge Proposal is core (Omega-7 port, paper D-431)

## Status

RATIFIED

## Context

- Badges stall (six clean months, still `speculative` — canvas edges, no automation) or lie (demoted Forge, 20 children still `harvested`): static stickers, not living contracts (paper `D-431` §1).
- Requires Ω-5 (tree D-435) + Ω-2 (D-432): proposals need forensic analytics; demotions ride governed contract-test failures.
- Invariant: propose automatically on evidence, demote loudly on failure — never silently promote; when a parent falls, children wear the scar.
- Tree collision noted: tree D-437 here vs paper builder-gap `D-437` (Ω-4.5) — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Core marketplace port (tooling + tests, zero host LOC) | (b) Forge self-grades | (c) Defer |
|---|---|---|---|
| No self-grading | Yes — kernel evaluates, Forge provides code | No — homework graded by author | Stalled |
| Proposal stops at gate | Yes — `pending` until signature/policy | Silent auto-trust | Friction |
| Loud demotion | Yes — spoken sentence + ledger row | Silent rot | Orphan lies |
| Transitive scars | Yes — appended rows, effective-badge fold | One level deep (a lie) | Blind |
| Forensic history | Yes — birth row untouched, fall dated | Rewritten | Lost |

## Decision

**Decision:** (a) — port paper `D-431` as tree D-437: proposal engine on analytics thresholds, signature-gated ratification with trust-zone delegation, loud automated demotion, appended lineage scars with read-time effective badges.

## Consequences

- Harder: every promotion cites analytics + signature; every demotion speaks; orphans born scarred; canvas reads effective badges.
- Easier: trust earns organically, falls instantly, propagates visibly; Ω-8 simulates scar cascades; layout reflects live trust.
- Revisit: threshold catalogs per artifact class; trust-radius policy UX; scar-compaction bounds (history preserved).

## Evidence

- F-BADGE.1 (proposal-engine) — 10 clean uses mint `badge.proposal` citing analytics; badge unchanged.
- F-BADGE.2 (ratification-gate) — ratify without signature refuses; with signature promotes; canvas recenters.
- F-BADGE.3 (loud-demotion) — 3 mine failures auto-demote with spoken + ledgered sentence.
- F-BADGE.4 (transitive-scar) — demoted parent scars all children; effective badges fall; canvas edges them.
- F-BADGE.5 (forensic-history) — birth row intact, scar dated; both truths, one query.
- F-BADGE.6 (orphan-born-scarred) — forging from a demoted parent mints the child scarred-`speculative`.
- Spec: paper `D-431` (§0–§10, 1-8 spec lines 1714–1887); requires Ω-5 + Ω-2.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-7 automated proposals plus transitive provenance from paper D-431
rationale: Propose automatically, ratify never; demotion propagates to dependents
class: evidence
