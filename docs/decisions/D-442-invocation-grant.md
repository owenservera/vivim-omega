# D-442 — Invocation Grant is core (Omega-12 port, paper D-444)

## Status

RATIFIED

## Context

- Capability + context gated, invocation open: spam burns assembly/budget before refusal, side-effect realizations fire under low-trust callers, costly runs lack asker-permission custody (paper `D-444` §1: spam, side-effect loophole, accountability void).
- Requires Ω-4 (tree D-434) + Ω-2 (D-432) + Ω-9 (D-439): principals verifiable, budgets claimable, contexts assemblable — after the first gate.
- Invariant: invocation is the absolute first gate — before assembly, before budget; no grant, no wake; no silent fallback.
- Tree collision noted: tree D-442 here vs paper Ω-10 specId `D-442` — distinct per the two-numbering rule (this tree row ports paper `D-444`).

Blocks: none

## Options

| Criterion | (a) Core first-gate port (tooling + tests, zero host LOC) | (b) Per-realization ad hoc checks | (c) Defer |
|---|---|---|---|
| Preventive (halts first) | Yes — no assembly, no claim, no network on denial | Reactive — damage before refusal | Open door |
| Scoped + expiring grants | Yes — realization-level, namespace scope, TTL, revocation | All-or-nothing | Coarse |
| Custody chain | Yes — every W5 event cites its grantId | Who-ran without who-may | Void |
| Public local sane | Yes — enrolled-local public, frontier granted | Friction or exposure | Either/or |

## Decision

**Decision:** (a) — port paper `D-444` as tree D-442: manifest invocationPolicy, trust-mesh grants with scope/expiry, law-gate-first sequence (invoke → context → budget → capability), mid-stream revocation aborts.

## Consequences

- Harder: every wake needs policy or grant; scoped callers stay in scope; revocation kills streams; no implicit re-invocation rights.
- Easier: spam dies at the door; side-effects need permission; custody unbroken; Ω-15 inherits the grant shape; Ω-14 scores by invoker.
- Revisit: policy defaults per realization class; scope vocabulary; grant TTL guidance; in-flight abort latency.

## Evidence

- F-INVOKE.1 (unauthorized) — grantless frontier wake refuses before assembly, claim, or network, ledgered.
- F-INVOKE.2 (scoped-denial) — finance-scoped grant on health intent refuses scope-violation.
- F-INVOKE.3 (midstream-revocation) — revoked grant aborts stream, finalizes partial, reclaims budget.
- F-INVOKE.4 (public-exception) — enrolled-local public policy wakes without explicit grant.
- Spec: paper `D-444` (9-16 spec lines 2789–2950); requires Ω-4/Ω-2/Ω-9.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-12 first-gate invocation policy plus grants from paper D-444
rationale: Invocation precedes context budget capability; no grant no wake
class: evidence
