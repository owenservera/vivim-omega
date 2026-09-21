# D-436 — Layout-by-Predicate is core (Omega-6 port, paper D-430)

## Status

RATIFIED

## Context

- Infinite canvas without layout intelligence dies by accumulation: 200 tiles by month three, junkyard by month six, abandonment — and accidental burial is exercised authority without a decision record (paper `D-430` §1).
- Requires Ω-5 (tree D-435) + Ω-2 (D-432) + Ω-1 (D-431) + Ω-4 (D-434): layout reads analytics, re-evaluates under budget, fires on watches, signs rules.
- Invariant: the canvas arranges but never conceals — move, cluster, zone, edge, shrink; never invisible, unreachable, unfindable.
- Tree collision noted: tree D-436 here vs paper builder-gap `D-436` (Ω-3.5) — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Core engine port (tooling + tests, zero host LOC) | (b) Plugin organizer | (c) Defer |
|---|---|---|---|
| No burial by neglect | Yes — named rules, cited placements, reversible | No — sprawl buries what matters | Junkyard |
| Pin supremacy | Yes — pins immune, conflicts logged not forced | Heuristic overrides user | Violated |
| Concealment ban | Yes — `LAYOUT_CONCEALMENT` pre-registered keystone | Curtain risk (guest holds mic) | Undecided |
| Sealable + scrubbable | Yes — hash of state; read-only time travel | Unverifiable | None |
| Granted properties only | Yes — ungranted reads refuse | Attention harvested | Open hole |

## Decision

**Decision:** (a) — port paper `D-430` as tree D-436: rules/placements/pins in `ns canvas`, pins-win evaluation, priority conflict resolution, concealment prohibition, sealable state, read-only scrub.

## Consequences

- Harder: every placement cites rule + evidence; forged rules enter `speculative` through the same gate; provenance order untouchable; scrub never writes.
- Easier: ten scenario queries (badges, pins, quarantine, museum, scrub, hash, sentiment, gravity) answer as rows; Ω-7 badge changes re-evaluate visibly; Ω-8 rehearses spatially.
- Revisit: arrangement-heuristic catalog; priority-weight guidance; zone vocabulary growth; macro-layout clustering depth.

## Evidence

- F-LAYOUT.1 (badge-arrangement) — first-party-center/speculative-edge rule moves tiles; every placement cites rule + predicate + badge.
- F-LAYOUT.2 (pin-immunity) — pinned tile unmoved by matching rule; conflict row logged; pin untouched.
- F-LAYOUT.3 (concealment-refusal) — hide-speculative rule refuses `LAYOUT_CONCEALMENT`, spoken + ledgered; nothing invisible.
- F-LAYOUT.4 (temporal-scrub) — scrub to old watermark renders history; present restores exactly; zero current-state mutation.
- F-LAYOUT.5 (forged-rule) — spoken rule resolves via Intent Fabric, enters `speculative`, earns through the promotion path.
- F-LAYOUT.6 (semantic-arrangement) — sentiment arrangement invokes badged scorer; scores sealed into placement evidence.
- F-LAYOUT.7 (headless-integrity) — canvas killed, rows survive, reopen restores exactly, `layout.hash` seal stable.
- F-LAYOUT.8 (conflict-visibility) — contradictory rules resolve by priority; loser logged; inspect explains the winner.
- Spec: paper `D-430` (§0–§10, 1-8 spec lines 1428–1703); requires Ω-5/Ω-2/Ω-1/Ω-4.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-6 self-organizing canvas rules from paper D-430
rationale: Canvas arranges but never conceals; placement is a deterministic fold
class: evidence
