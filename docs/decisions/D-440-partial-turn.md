# D-440 — Partial-Turn Ledger is core (Omega-10 port, paper D-442)

## Status

RATIFIED

## Context

- W5 assumed completion: severed streams leave ghost turns (kernel blind), locked budgets (governor leaks), and clean-looking fragments the next model finishes into hallucination (paper `D-442` §0).
- Requires Ω-2 (tree D-432) + Ω-3 (D-433-tree) + Ω-9 (D-439): partials reclaim budgets, tag context honestly, resolve disclosure trails.
- Invariant: every initiated turn is ledgered — completed, aborted, or failed; partials are first-class with state, boundary, and resumption.
- Tree collision noted: tree D-440 here vs paper builder-gap `D-440` (Ω-7.5) — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Core ledger port (tooling + tests, zero host LOC) | (b) Single-row completed-only | (c) Defer |
|---|---|---|---|
| No ghost turns | Yes — init-before-first-token, finalize-or-orphan | Blind until EOF | Hangs |
| Budget integrity | Yes — settle/reclaim per terminal state | Locked or miscounted | Leaks |
| Honest fragments | Yes — tagged partials, redacted refusals | Clean-looking lies | Drift |
- Sealed resumption | Yes — anchors, exact re-seal, explicit resume | Altered retries | Divergence |

## Decision

**Decision:** (a) — port paper `D-442` as tree D-440: init/finalize spans, five terminal states, orphan reclaim on boot, tagged resumption anchors, mid-stream law kills with zeroed payloads.

## Consequences

- Harder: init must hit vault before first provider token; no silent retries; REFUSED_MID payloads unreadable; every death gets its row.
- Easier: 10k-turn loops survive flakiness; billing splits failed vs valued tokens; law inspects mid-syllable; retries anchor exactly.
- Revisit: streaming-inspector latency budgets; anchor retention bounds; orphan-scan cadence; resume UX.

## Evidence

- F-PARTIAL.1 (network-sever) — severed stream ledgers `FAILED_PROVIDER`, reclaims budget, tags the fragment.
- F-PARTIAL.2 (governor-ceiling) — 50-token cap cuts 500-token asks at 50 with `ABORTED_GOV` + resume offered.
- F-PARTIAL.3 (midstream-kill) — banned-regex output dies at match with `REFUSED_MID` and zeroed payload.
- F-PARTIAL.4 (crash-reclaim) — killed kernel reboots to `ORPHANED` marks and full budget reclaim; no death lacks finalize-or-reclaim.
- Spec: paper `D-442` (9-16 spec lines 2487–2599); requires Ω-2/Ω-3/Ω-9.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.

## Index

summary: Port Omega-10 init finalize terminal states resumption from paper D-442
rationale: Every initiated turn is ledgered whether completed aborted or failed
class: evidence
