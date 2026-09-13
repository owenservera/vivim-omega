# D-315 — Live-agent quarantine semantics

## Status

RATIFIED

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

**Decision:** (a) Finish current task, refuse new calls — CONFIRMED by B1a evidence (D-327 RATIFIED; the code-first bet paid off — writing `agent.exec@1` with the question live revealed what the invariant needs). What running it showed, beyond the three original options: admission is *version-pinned*, not merely state-gated — after a rollback quarantines v2 and reactivates v1, the head IS active, so a pure "contract active?" check would admit the quarantined version's agents; the pinned-version match (`identity.behaviorVersion === head.version`) is what actually refuses them. The ledger proves both halves: every attempt appends exactly one ns `agent` row carrying `admittedContractRev` + `quarantinedMidFlight` (completion-then-refusal is auditable per attempt, not per agent). There is no mid-flight abort path BY CONSTRUCTION (admit → settle → annotate has no abort primitive to call — and (b) stays rejected: killing settled vault writes half-done has no revocation primitive in v0). Honest boundary: identity terminal states (`quarantined`/`retired`) have no live producer in v0 — only contracts move — so that half of the combination rule is defense-in-depth, not exercised machinery.

## Consequences

- B1a ships fixture-replay with (a) pinned by test: quarantine-then-exec REFUSEs (refuse-new half); admitted exec settles + ledgers with `admittedContractRev` and a `quarantinedMidFlight` annotation (finish half — the ledger proves the call completed, the annotation proves the check ran once at admission).
- Why not (b) halt immediately: killing admitted calls mid-flight strands vault writes half-done with no revocation primitive in v0 (no generation bump / refuse-all exists for agent principals — only compartment tokens revoke, and exec rides the agent compartment's tokens).
- Why not (c) migrate: state transfer between contract versions has no machinery and murky audit ownership (which version owns the outcome?).
- The first B1b PR that widens beyond one op MUST present settlement evidence for re-ratification, or the gate's decisions stage should be extended to block it.
- `agent.describe@1` output exposes quarantine state via the resolved contract's `state` (already returned alongside the identity) — the combination rule (identity.state × contract.state → admittable?) is: admittable iff contract is `active` and identity is not `quarantined`/`retired`.
- B1a evidence for ratification: `plugins/vivim-agent/test/exec.test.ts` "D-315 finish-then-halt" (v2 agent REFUSED post-rollback with the version-mismatch reason; v1 agent still admitted and settled OK) + the ledger assertions on every exec test (`admittedContractRev`, `quarantinedMidFlight: false` on sequential calls) + `decideExecAdmission`/`execQuarantinedMidFlight` pure tables in `src/agent.ts` (terminal states, version skew, rev drift each pinned). Full `bun run omega:gate` GREEN 2026-09-13 (612/612 — ratified in 46fc6b3; B1a exec evidence home 3f53afc).

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G2/B-phase, §7 Q3 (elevated to blocker).
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §3 + §8 Q3 (concurs on elevation, argues code-first).
- B1a decision evidence: `plugins/vivim-agent/src/index.ts` `agent.exec@1` (admission check + settle-and-ledger, no abort path) + `plugins/vivim-agent/test/exec.test.ts` (refuse-new + finish-and-annotate); `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.2).
- B1a confirmation evidence (this ratification): the version pin — not the state gate — does the refusing (rollback-reactivate case); ledger-per-attempt with `admittedContractRev` (audit pin) + `quarantinedMidFlight` (admission-once proof); identity-terminal half noted as unexercised defense-in-depth above. No fourth option emerged from running it.
- Landing SHAs: B1a exec machinery + tests in 3f53afc; confirmation text + 612-gate tree in 46fc6b3.
