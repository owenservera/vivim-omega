# D-363 — Boot readiness rides the `ready` message: event path, not polling

## Status

RATIFIED

## Context

`boot.ts`'s `waitReady`/`waitForActive` polled compartment state every 25ms via
`setTimeout`, although the router already receives an explicit `ready` message when
a compartment transitions to active (`onWorkerMessage`'s `m.type === "ready"` case).
Correctness-neutral, but the half-wired event path invited every future "wait for
state X" need to reach for the same polling pattern. The external review (turn-014
tree) flagged it as the low-risk cleanup item.

## Options

| Criterion | (a) Pending-resolver primitive on the router (this row) | (b) Keep polling, document it | (c) Generic event emitter on the router |
|---|---|---|---|
| Removes the poll loop | Yes | No | Yes |
| Preserves deadline/degraded/timeout semantics | Yes — same bounds, verified by existing suites | n/a | Yes, with more surface to maintain |
| LOC (B5 budget is law) | Net-negative in boot.ts, small addition in ports.ts | Zero | Larger; abstraction without a second consumer |
| Future waiters | `waitActive` is the primitive; generalize when a second shape exists | n/a | Premature |

## Decision

**Decision:** (a) Pending-resolver primitive on the router — `PortRouter.waitActive(id,
timeoutMs = 10s)` resolves immediately if the compartment is already active, otherwise
subscribes a pending resolver that the `ready` case wakes directly; the crash path
(`failInflight`) and the timeout reject the same waiters. Boot's `waitReady` becomes
`Promise.all(eager.map(waitActive))`; the dormant first-touch path calls `waitActive`
directly. Delivery-mechanism swap ONLY — bounds, degraded rejection, and fail-closed
behavior are unchanged, and the poll loops are deleted (net-negative host LOC).

## Consequences

- Boot no longer pays the 25ms poll tick: demo-composition boot measured **27ms → 10ms**
  (min of 3, same box, BENCHMARKS.md remediation-wave entry) — the review's falsifier met.
- The one `waitActive` shape is the primitive; a generic emitter waits for a second
  real consumer (house style: no speculative abstraction).
- Statuses still flip through the same code path (`onWorkerMessage` ready case); the
  `ready` message remains the single source of activation.

## Evidence

- All suites green on the landing commit (726/726), including lazy-activation and
  boot-timeout cases that previously exercised the pollers.
- Bench before/after recorded in BENCHMARKS.md (27ms → 10ms).
- Landed in 0df18d0 (the remediation-wave commit; gate GREEN 733/733, host 999/1000, all seven stages incl. the new bun-surface stage).
