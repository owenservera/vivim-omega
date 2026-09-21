# D-445 — Delegation is bounded (Omega-15 port, paper D-447)

## Status

RATIFIED

## Context

- Headless loops face stall-vs-blank-check: consent-per-step halts at step 4 asleep; root auto-approve alienates identity to a probabilistic model (paper `D-447` §1).
- Requires Ω-4 (tree D-434) + Ω-2 (D-432) + Ω-12 (D-442): verifiable principals, governed ceilings, invocation grants to inherit.
- Invariant: lend authority, never surrender sovereignty — tethered, bounded (time/budget/scope/steps), instantly revocable; agent holds the pen, principal holds the leash.
- Tree collision noted: tree D-445 here vs paper Ω-13 specId `D-445` — distinct per the two-numbering rule (this tree row ports paper `D-447`).

Blocks: none

## Options

| Criterion | (a) Core leash port (tooling + tests, zero host LOC) | (b) Root auto-approve | (c) Defer |
|---|---|---|---|
| Overnight loops | Yes — 5-step leash runs 5, halts at 6 ledgered | God-mode script | Stalled |
| Dual-stamp custody | Yes — agent + BDT, never aliasing root | User "did it" | Blurred |
| One-link chain | Yes — sub-delegation refused | Attack mints roots | Breached |
| Snap shut | Yes — TTL/steps/budget/revoke halt safely | Silent overrun | Leaked |

## Decision

**Decision:** (a) — port paper `D-447` as tree D-445: BDTs with scope/budget/steps/TTL, dual-signature acts, no transitive delegation, automatic ledgered halts, audit by authority.

## Consequences

- Harder: every leash names bounds (forever invalid); agents badge agent-driven forever; revocation aborts streams; harness windows stay short.
- Easier: 10k-step nights run leashed; IDE windows grant safely; audits isolate agent acts; Ω-16 admits future adaptation under this shape.
- Revisit: TTL/budget guidance per task class; scope vocabulary; step counting semantics; surface leash UX.

## Evidence

- F-DELEGATE.1 (headless-loop) — 5-step leash runs 5 dual-stamped, refuses step 6 exhausted, halts safely.
- F-DELEGATE.2 (scope-containment) — work-scoped agent on personal rows refuses violation, ledgered, unleaked.
- F-DELEGATE.3 (midnight-revocation) — revoked BDT aborts streams, finalizes partials.
- F-DELEGATE.4 (transitive-block) — agent minting sub-agents refuses hard.
- F-DELEGATE.5 (audit-query) — authority-fold renders acts, costs, refusals per token.
- Spec: paper `D-447` (9-16 spec lines 3300–3459); requires Ω-4/Ω-2/Ω-12.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-15 scoped revocable proxy consent from paper D-447
rationale: One sovereign may leash an agent without surrendering sovereignty
class: evidence
