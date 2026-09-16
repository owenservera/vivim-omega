# D-365 — Host budget 1100 + freeze (sole-owner boring-host law)

## Status

RATIFIED

## Context

`host/src` sits at 999/1000 LOC. One line trips the gate. The 1000 number was arbitrary; the principle (boring host, transport-only) is what matters. As sole owner there is no second reviewer to impress with a tight number — there is only the risk of theater pressure (comment-golf to stay under) versus honest headroom with a freeze.

## Options

| Criterion | (a) Bump to 1100 + freeze (this row) | (b) Keep 1000, diet to reclaim headroom | (c) Remove the LOC gate |
|---|---|---|---|
| Honest headroom | Yes (~100 LOC) | Temporary (fills again) | Unlimited (loses the law) |
| Preserves boring-host principle | Yes + freeze rule | Yes | No |
| Cost | One-line gate + docs | Refactor + risk | Deletes safety |
| Auditable | Yes (gate-enforced 1100) | Yes | No |

## Decision

**Decision:** (a) Bump to 1100 + freeze — `tooling/gates/gate.ts` enforces 1100, README law #1 and CURRENT-INVARIANTS B5 state the freeze: no new host surface without removing old surface in the same commit.

## Consequences

- Gate `host-loc` passes at 999/1100 with ~100 headroom; the freeze rule prevents refill.
- Future host growth must cite the removed surface in the same commit message.
- B5 remains law, number changes once, principle unchanged.

## Evidence

- Gate `host-loc` green on the landing commit (1013/1100; was 999/1000).
- `bun run omega:quick` green (structural stages only).
- `verify-status.ts` log line updated to /1100.
- Landed in 7d2cea7 (owner wave 001 PROPOSED; quick GREEN structural, lanes GREEN per D-368).
