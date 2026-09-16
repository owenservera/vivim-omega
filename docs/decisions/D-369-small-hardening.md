# D-369 — Small hardening batch (owner review nits, fail-closed)

## Status

RATIFIED

## Context

Owner line-review of 4a108d7..5a9e148 surfaced five small items, each fail-closed, each mechanical, none blocking the wave but all worth landing together rather than rotting as review comments.

## Options

| Criterion | (a) Land all five now (this row) | (b) File as separate waves | (c) Leave as nits |
|---|---|---|---|
| Review hygiene | Closes the loop | Slower, more ceremony | Rots |
| Risk | Minimal (each additive or comment-only) | Same, spread out | Zero now, drift later |
| Gate impact | None (all green-preserving) | Same | None |

## Decision

**Decision:** (a) Land all five now — 1. `contracts/src/chat.ts` comment corrected to `{1,64}` matching the enforced grammar; 2. `sdk/src/stream.ts` `maxBufferedChunks` flood guard; 3. `tooling/ci/verify-status.ts` fail-fast + /1100 log line; 4. `surfaces/daemon` socket-error buffer drop; 5. `BENCHMARKS.md` owner-wave reservation.

## Consequences

- No behavior change except the stream flood guard (new throw only when >1000 buffered — previously unbounded) and faster verify-status failure signal.
- Chat id grammar unchanged (comment-only); daemon protocol unchanged; status shape unchanged.

## Evidence

- Lane runs green on the landing commit (watchdog 8/8 incl. D-366 fast/budgetStatus, stream/chat/credentials suites unchanged green, adversarial 15/15, `omega:quick` green).
- Full-serial soak caveat per D-368 (Windows MCP `uv_spawn` flake, pre-existing on clean tree) — no new failures attributable to these five items (all five paths covered by the green lanes above).
- Landed in 7d2cea7 (owner wave 001 PROPOSED; quick GREEN, lanes GREEN).
