# D-389 — Intent Mechanism: All Phases (Complete Status)

Status: ~~PROPOSED~~ **RATIFIED** — see the decision record `docs/decisions/D-389-intent-mechanism.md` (this companion's "PROPOSED" line and its "Remote status" section below are v0.4-era snapshots, corrected 2026-09-20 in the doc-logic pass; the record is the authority)
*(snapshot-era line kept verbatim: PROPOSED · evidence · v0.4 · committed `99f7fb8` (remote `main` updated when network available))*

## What exists (contracts, plugin, docs, tests)
- `contracts/src/intent.ts` — durable `Intent` + `IntentStep` + `IntentState`
- `contracts/src/intent-plan.ts` — `PlanTemplate` / `PlanStepTemplate` + `detectCycle` / `maxDependencyDepth`
- `contracts/src/intent-phase3.ts` — `InputMapping` (JSON-pointer, depth ≤4), `ArtifactReference`, `PlanTemplateV2`
- `contracts/src/intent-phase4.ts` — `IntentContext`, `CompensationIntent` (consent-gated), `SagaEvidenceRef`
- `contracts/src/index.ts` — exports all above
- `contracts/src/manifest.ts` — optional fields (`idempotent`/`cancellable`/`estimatedCostMs`)
- `plugins/vivim-intent/plugin.json` — manifest (5 contracts, `law.attenuate@1` dependency)
- `plugins/vivim-intent/src/index.ts` — plugin wiring (submit, resolve with multi-step plan lookup, step execute with delegation evidence, cancel with compensation write, status read)
- `docs/VAULT-NAMESPACES.md` — `intent` + `intent-plan` namespace rows (separate writer trust)
- `docs/decisions/D-389-intent-mechanism.md` — design record
- `plugins/vivim-intent/test/intent.test.ts` + `intent-phase3-4.test.ts` — falsifier tests

## What is deferred (proposal §4: explicitly out of scope, not omission)
1. Kernel-side dynamic multi-plugin router (breaks B1, B5 — frozen by architecture laws)
2. Host-minted per-intent capability tokens (B3/B5 budget; existing attenuation achieves same narrowing)
3. Full saga/rollback engine (compensation actions need fresh consent; implying rollback is worse than stating the limit — proposal §3.9 doc string)
4. `IntentContext` consumer (no provider/discovery consumer exists yet — deferred to avoid vocabulary drift per `KNOWN-LIMITS.md`)
5. Data-only input mapping / output chaining (v1 plan templates = same-payload DAG only; projection mapping deferred to `plan:<type>@2` format once real workflow needs it — proposal §3.6, §5 Phase 3)

## Remote status
- `github` remote: `main` = latest adopted version (`99f7fb8` when push succeeds; last confirmed `77d6c28` before network timeout)
- `omega` branch: protected/default (cannot delete via push — GitHub setting)
- `owner-wave-001`: deleted from remote
- Local repo clean; no uncommitted changes
