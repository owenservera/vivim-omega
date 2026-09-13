# D-324 — Provenance linkage (epistemicStatus + buildDecisionRef)

## Status

RATIFIED

## Context

`VaultProvenanceRef` gives typed backward-links but says nothing about *how
well* the cited evidence is known, and resolver/agent decisions cite no
build-decision lineage — a reader cannot tell an observed probe result from an
assumption, nor which D-record authorized the deciding logic. The essay triage
calls this "typed knowledge/claim graph: partially built" — extending the ref
is cheaper than a graph engine.

## Options

| Criterion | (a) Optional `epistemicStatus` + optional `buildDecisionRef` (this record) | (b) Five-value epistemic enum now | (c) New graph engine |
|---|---|---|---|
| Rollout risk | Zero (both fields optional; old records validate untouched) | `CONTRADICTED` ships with no producer (vocabulary without a writer) | Second provenance graph (explicit non-goal) |
| Writer discipline | `VERIFIED` reserved for probe-backed writes, adopted first by verification | Same | N/A |
| Genealogy clarity | Resolver decisions cite D-323, spawns cite D-309 | Same | Same, at 10x cost |

## Decision

**Decision:** (a) Optional `epistemicStatus` + optional `buildDecisionRef` — three values `OBSERVED | INFERRED | ASSUMED` (+ `VERIFIED` reserved); `CONTRADICTED` deferred until a producer exists.

## Consequences

- Ships with V2.3 (same commit wave as D-323): `decision.record` accepts/rejects `buildDecisionRef`; INFERRED-vs-VERIFIED distinction survives a vault round trip (test).
- `Freshness` (timing) is untouched — epistemic status is an orthogonal field, not a replacement (§6.2 of the plan).
- No second provenance graph, ever (non-goal, gated by review).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.3) + §1 triage row (typed knowledge/claim graph).
- `contracts/src/vocabulary.ts`: `EpistemicStatus` (`OBSERVED|INFERRED|ASSUMED` + reserved `VERIFIED`) + optional `VaultProvenanceRef.epistemicStatus` (old records untouched); `contracts/src/agent.ts`: optional `DecisionRecord.buildDecisionRef`.
- `plugins/discovery-verification/src/index.ts`: VERIFIED adopted first by verification — evidence from passing probes stamped at the writer; failed-probe evidence stays unmarked.
- `plugins/vivim-agent/src/agent.ts` + `src/index.ts` (unchanged wiring): `decision.record` accepts `buildDecisionRef: "D-###"`, rejects anything else fail-closed.
- `plugins/vivim-agent/test/decision-ref.test.ts`: cite/round-trip + legacy-without-pointer + six malformed shapes refused and never stored.
- INFERRED-vs-VERIFIED distinction survives the vault round trip: asserted in `plugins/vivim-director/test/resolve.test.ts` (rule evidence INFERRED, realization evidence VERIFIED, both read back exact).
- Falsifier run: decision-ref + resolve suites green; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
