# D-399 — Steward: narrowly scoped self-action through ordinary capabilities (Part2 §3)

## Status

RATIFIED

## Context

Signals without action are dashboards; action without capability discipline is ambient authority. The steward must be an ordinary plugin that requests through existing gated ops, never a backdoor, with every action in the same tamper-evident audit chain.

## Options

| Criterion | (a) Build narrow steward now: re-sweep on crossed, idempotent confirm on breach, escalate plus refuse on chain-break (recommended) | (b) Defer: signal bus alone, no autonomous action | (c) Broad steward with recompose power |
|---|---|---|---|
| Risk | Low, pre-approved low-stakes tier only | Zero autonomy | High, self-grants capability |
| Audit | Same chain via host audit | No actions to audit | Parallel log risk |
| Value | Closes loop on low-stakes signals | Leaves loop open | Overreach |

## Decision

**Decision:** (a) — build narrow steward now.

## Consequences

- Allowed alone: re-sweep on crossed, confirm quarantine on breach only if watchdog did not already act synchronously (idempotent, never double).
- Never alone: chain-broken only escalates loudly plus optional system-wide risky refusal via law overlays, never silent continue.
- Every action audited in host chain; live-pressure ghosts prove scoping, idempotence, escalation.
- Becoming load-bearing is not a fault; steward never quarantines for it.

## Evidence

- Record precedes code per Part2 discipline; plugin `vivim.steward` plus `host/test/steward.test.ts` landed with 3 pass, audit verified. Ratified: narrow audited autonomy plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: 786006c, a68096c.
