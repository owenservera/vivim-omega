# D-367 — Decision-process simplification (sole-owner speed, honestly labeled)

## Status

RATIFIED

## Context

360+ rows govern a sub-1100-LOC host. D-364 added class tags + cooling-off + consolidation — correct direction, but as sole owner the PROPOSED→RATIFIED ceremony for directive rows (naming, placement, process, scope) costs more than it buys. The audit trail must stay append-only; the daily workflow must get faster.

## Options

| Criterion | (a) Directive fast-path + invariants-first + stale-board discipline (this row) | (b) Keep full ceremony for everything | (c) Delete the decision log |
|---|---|---|---|
| Solo-owner speed | Yes (directive: commit, gate green = ratified) | No | Fastest, loses audit |
| B1–B4 safety | Preserved (evidence + cooling-off unchanged) | Preserved | Lost |
| New-reader onboarding | One page (invariants) | 360 rows | Nothing |
| Auditability | Full (log append-only, tags enforced) | Full | None |

## Decision

**Decision:** (a) Directive fast-path + invariants-first + stale-board discipline — directive-class rows ratify same-day on gate green (D-364 already allows; this row makes it the default); evidence-class B1–B4 keeps falsifier-in-record + second gate run; CURRENT-INVARIANTS remains the read-first page (refresh every wave-set); PROPOSED rows older than two wave-sets get decided (ratify/reject/supersede) or explicitly re-affirmed — no silent backlog.

## Consequences

- No checker change (tags + cooling-off already mechanical); workflow change only, recorded here.
- D-313/314/316/317 stay PROPOSED this wave (test `decisions.test.ts` pins them; closing them rides with the sharding wave D-368 follow-up, not drive-by).
- Full log never rewritten; synthesis lives in CURRENT-INVARIANTS.

## Evidence

- Process record (directive — gate green on the landing commit suffices per D-364 directive rule).
- Landed in 7d2cea7 (owner wave 001 PROPOSED; quick GREEN).
