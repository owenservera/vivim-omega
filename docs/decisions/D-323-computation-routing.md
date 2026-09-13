# D-323 — Computation routing (kind enum + 3 director ops + scorecard)

## Status

RATIFIED

## Context

Multi-agent-as-capability-specialization is named but not live, and the
director routes by matching rules only — there is no computation-kind axis, so
nothing can say "this task is deterministic, that one is probabilistic, this
one needs a human" before spending execution. The essay triage (§1 of the
final plan) closes this with a routing layer; the plan corrects the original
proposal twice (see Options).

## Options

| Criterion | (a) New `ComputationKind` axis + 3 director ops + scorecard (this record) | (b) Reuse `ProviderClass` as the routing axis | (c) Passive scorecard reader over `vivim.run` |
|---|---|---|---|
| Axis hygiene | Clean: execution modality ≠ reasoning kind (an API_NATIVE provider can serve a deterministic lookup) | Conflated: forces a 4th provider class for a non-provider concept | N/A (no routing at all) |
| Scorecard writer | Own writer (ns `resolve`: decision rev 1, outcome rev 2) — `TaskResult` carries no kind tag | Same as (a) if adopted | None possible — passive read cannot attribute kind |
| Hot-path risk | Zero (never touches `run.submit`) | Zero | Touches the hot path or stays vocabulary |

## Decision

**Decision:** (a) New `ComputationKind` axis + 3 director ops + scorecard — `DETERMINISTIC | PROBABILISTIC | HUMAN` folded into `vivim.director` (not a new plugin): `resolve.classify@1` (rule table: automation rule → PROMOTED realization → HUMAN default) + `resolve.report@1` + `strategy.scorecard@1` (pure aggregation, no thresholds, no auto-actions).

## Consequences

- Prerequisite: V2.2 green (proves execution exists before routing to it); D-315 finish-then-halt decided first (hard blocker on `agent.exec` code, still PROPOSED).
- No new plugin, no composition edits, no host/law/vault changes — `git diff --stat` reviewer check.
- Scoreboards inform, never decide (no auto-actions until a consumer with thresholds ships).
- Tests: rule-table branches + real-boot classify→report→scorecard round trip with exact arithmetic.

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.3) + §6 corrections adopted (kind axis, writer, three-value epistemic enum shared with D-324).
- `contracts/src/computation.ts`: `ComputationKind` (own axis, not a `ProviderClass` reuse) + `ResolveDecision`/`ResolveOutcome`/`ScorecardRow` + `resolveDecisionId`; re-exported through `provider.ts` + `index.ts` (one surface).
- `plugins/vivim-director/src/resolve.ts`: pure rule table (`classifyPure`: rule → PROMOTED-realization → HUMAN) + `scorecardPure` (exact lower-median p50, no thresholds) + strict input parsing (stale op/slug contradictions throw).
- `plugins/vivim-director/src/index.ts`: `resolve.classify@1` (decision rev 1, ns `resolve`) + `resolve.report@1` (outcome rev 2, UNKNOWN when missing) + `strategy.scorecard@1` (reads only); same vault caps, no new plugin/composition/host/law/vault changes.
- `plugins/vivim-director/test/resolve.test.ts`: branch tables + real-boot classify→report→scorecard round trip with exact arithmetic + stale-input refusal.
- Falsifier run: resolve suite green (with D-324 file); full `bun run omega:gate` GREEN 2026-09-13 (601/601, host 950/1000 — ratified in 3f53afc).
