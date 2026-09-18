# D-313 — Agent runtime: acting loop vs descriptive records

## Status

RATIFIED

## Context

Control plane v0 (`plugins/vivim-agent`) mints governed identities, but nothing ever
acts as an agent principal: `meta.from` is always a plugin id or root
(`host/src/ports.ts` `callAsRoot` dispatches `from: "root"`), and `forbiddenActions`
has enforcement machinery exercised only by tests. The system must decide whether
agents become actors or stay records — the current middle (machinery that looks
alive) is the worst outcome. See `ARCHITECTURE-NEXT-STEPS.md` G2.

## Options

| Criterion | (a) Acting loop, B1a-first | (b) Descriptive records only |
|---|---|---|
| Closes G2 (machinery actually lives) | Yes — one replayed realization proves the chain | No — gap stays open permanently |
| Safety surface on day one | Narrow: single fixture-replay under existing consent/ledger discipline | None added |
| Reversibility if wrong | High: B1a is additive, deletable | N/A (no change) |
| Cost | One wave (B1a scoped, then B1b) | Zero |
| Risk of scope creep | Medium — mitigated by quarantine blocker (D-315) | Zero, at the price of a dead control plane |

## Decision

**Decision:** (a) Acting loop, B1a-first — build the single-op fixture replay to produce evidence for the fork rather than debating it further in the abstract.

## Consequences

- B1a must ledger like a director tick and reuse the existing grant grammar (no new capability machinery to justify the loop's existence).
- If B1a evidence shows principal traversal breaking any layer invariant, the fallback is (b) with enforcement moved to composition grants — recorded here as a live alternative, not a defeat.
- Owner confirmation still required: this record is PROPOSED until then.

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G2, §4 Phase B, §7 Q1.
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §3 (independent review concurs on B1a-first).
- D-310 integration test already proves non-plugin principal traversal (`agent:forbidden-probe`).
- Owner confirmation recorded 2026-09-16 (delegated ratification for the foundation wave, D-367 directive fast-path): option (a) stands — B1a fixture-replay first, enforcement stays composition-grant-shaped. Gate green at landing 377c4ed (776/776).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
