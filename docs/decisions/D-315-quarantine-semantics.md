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

**Decision:** (a) Finish current task, refuse new calls — decided during B1a (D-327): `agent.exec@1` checks contract state once at admission (active → admit; quarantined/otherwise → REFUSED, no new calls) and admitted calls run to settlement with the outcome ledgered (re-checked post-settle only to annotate `quarantinedMidFlight`, never to abort — there is no mid-flight abort path by construction). RATIFICATION awaits B1b widening evidence or owner confirmation; the status stays PROPOSED until then.

## Consequences

- B1a ships fixture-replay with (a) pinned by test: quarantine-then-exec REFUSEs (refuse-new half); admitted exec settles + ledgers with `admittedContractRev` and a `quarantinedMidFlight` annotation (finish half — the ledger proves the call completed, the annotation proves the check ran once at admission).
- Why not (b) halt immediately: killing admitted calls mid-flight strands vault writes half-done with no revocation primitive in v0 (no generation bump / refuse-all exists for agent principals — only compartment tokens revoke, and exec rides the agent compartment's tokens).
- Why not (c) migrate: state transfer between contract versions has no machinery and murky audit ownership (which version owns the outcome?).
- The first B1b PR that widens beyond one op MUST present settlement evidence for re-ratification, or the gate's decisions stage should be extended to block it.
- `agent.describe@1` output exposes quarantine state via the resolved contract's `state` (already returned alongside the identity) — the combination rule (identity.state × contract.state → admittable?) is: admittable iff contract is `active` and identity is not `quarantined`/`retired`.
- Status stays PROPOSED (TBD resolved to (a), owner confirmation pending).

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G2/B-phase, §7 Q3 (elevated to blocker).
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §3 + §8 Q3 (concurs on elevation, argues code-first).
- B1a decision evidence: `plugins/vivim-agent/src/index.ts` `agent.exec@1` (admission check + settle-and-ledger, no abort path) + `plugins/vivim-agent/test/exec.test.ts` (refuse-new + finish-and-annotate); `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.2).
