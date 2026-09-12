# D-315 — Live-agent quarantine semantics

## Status

PROPOSED

## Context

When a behavior contract is quarantined mid-flight (via `behavior.rollback@1`), the
contract says nothing about agents already running under it. Three semantics are
available; the choice interacts with B1a scope pressure (once an acting loop works
even for one op, widening before this is answered risks the exact sequencing mistake
G2 warns about). Carried forward through two assessments unanswered.

## Options

| Criterion | (a) Finish current task, refuse new calls | (b) Halt immediately | (c) Migrate to prior version |
|---|---|---|---|
| Safety (quarantine means suspect) | Medium — suspect code keeps running briefly | Maximum — stops now | Low — new code paths mid-flight |
| Liveness (no stranded work) | High — in-flight completes | Low — work dies, must be retried | Medium — migration itself can fail |
| Implementability on current machinery | Medium (needs call-generation tracking per agent) | Trivial (generation bump / refuse-all) | Hard (state transfer between versions) |
| Audit clarity | Clean (ledger shows completion-then-refusal) | Clean (ledger shows halt) | Murky (which version owns the outcome?) |

## Decision

**Decision:** TBD — (a) finish-task recommended as the default to confirm during B1a, with the hard process rule: decided before B1a ships past fixture-replay, not before B1a is written (writing the code with the question live reveals which answer the invariant needs).

## Consequences

- B1a intentionally ships with this record PROPOSED: the fixture-replay test cannot distinguish the options, which is precisely why it is safe to ship first.
- The first B1b PR that widens beyond one op MUST flip this record (chosen option + evidence) or the gate's decisions stage should be extended to block it — file that extension as follow-up work if B1b starts.
- Whichever option wins, `agent.describe@1` output must expose the quarantine state so callers can see it (currently the identity carries `state`, the contract carries `state` — the combination rule needs writing down).

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G2/B-phase, §7 Q3 (elevated to blocker).
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §3 + §8 Q3 (concurs on elevation, argues code-first).
