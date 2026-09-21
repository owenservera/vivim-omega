# D-443 — Standing State is governed (Omega-13 port, paper D-445)

## Status

RATIFIED

## Context

- Ephemeral reasoning proposing durable control (watch my inbox, dead-man's switch) collides Ω-1 principal-ownership with Ω-9 request-only discipline: silent arming, un-revocable side-effects, lineage voids (paper `D-445` §1).
- Requires Ω-1 (tree D-431) + Ω-12 (D-442): watches principal-owned and retention-named; realizations invocation-granted.
- Invariant: realization proposes, principal ratifies; artifacts principal-owned, realization-badged, scoped; model suggests, human decides.
- Tree collision noted: tree D-443 here vs paper Ω-11 specId `D-443` — distinct per the two-numbering rule (this tree row ports paper `D-445`).

Blocks: none

## Options

| Criterion | (a) Core consent pipeline (tooling + tests, zero host LOC) | (b) Model arms directly | (c) Defer |
|---|---|---|---|
| No creepy automation | Yes — propose validates, never arms | Silent durable state | Entangled |
| Revocable lineage | Yes — cascade pauses on demotion/revoke | Orphaned firing watches | Void |
| Badged custody | Yes — proposedBy + ratifiedBy + proposalRef | Anonymous | Unattributed |
| Ephemeral hygiene | Yes — TTL shred, no partial arming | Orphan blueprints | Clutter |

## Decision

**Decision:** (a) — port paper `D-445` as tree D-443: `watch.propose` validates without arming, consent surface renders badge + plain terms, `consent.ratify` stamps custody and tombstones, revocation/demotion pauses with review.

## Consequences

- Harder: every durable proposal waits for a tap; retention mandatory pre-surface; TTL shreds the undecided; paused-not-deleted preserves forensics.
- Easier: agentic automation legitimate with context; lineage ties watches to proposers; Ω-15 reuses the pipeline for delegation asks.
- Revisit: proposal TTL default; surface rendering strings; pause-review UX; scheduled-task generalization beyond watches.

## Evidence

- F-STANDING.1 (direct-arm-refused) — model `watch.arm` refuses `WATCH_ARM_BY_REALIZATION`, nothing created.
- F-STANDING.2 (proposal-flow) — valid propose mints ephemeral proposal, renders badge + terms, arms nothing.
- F-STANDING.3 (ratification) — approve stamps custody, tombstones proposal, creates the watch row.
- F-STANDING.4 (cascade-pause) — grant revoke pauses proposed watches with review, stops firing.
- Spec: paper `D-445` (9-16 spec lines 2962–3110); requires Ω-1/Ω-12.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-13 propose ratify cascade from paper D-445
rationale: Model proposes durable state; principal ratifies; lineage persists
class: evidence
