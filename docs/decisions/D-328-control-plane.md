# D-328 — Control-plane v0 slice (read/orient, then act/evolve)

## Status

RATIFIED

## Context

The mission's first clause — "an agent with no prior knowledge can discover
the system, itself, its authority, and its contract" — has no versioned
first-contact path: today that knowledge lives in repo docs and composition
files, unreachable from inside a boot. V2.4 exposes discovery, but only after
V2.2–V2.3 give it something worth discovering. Scope risk is managed by
splitting read/orient (safe to ship alone) from act/evolve (may slip alone).

## Options

| Criterion | (a) Split slice: 4a read/orient first, 4b act/evolve second (this record) | (b) Whole control plane in one wave | (c) No control plane (docs only) |
|---|---|---|---|
| Shippability | 4a holds alone if 4b slips (unknown → UNKNOWN, never a crash) | All-or-nothing (one slip sinks discovery too) | Mission clause unmet |
| Write-path risk | 4a adds zero write path (`describe` extends `WorldModel` read-only) | New envelope + evolution aliases together | None, and no capability |
| Evolution safety | 4b aliases existing mechanics (evidence-required, never self-authorized above L5) | Same, later | N/A |

## Decision

**Decision:** (a) Split slice: 4a read/orient first, 4b act/evolve second — 4a: `control.bootstrap@1` (versioned first-contact object, ns `control`) + `control.describe@1` (READ op on `vivim.mind`, bounded `ControlModel` projection) + `agent.snapshot@1`; 4b: `agent.delegate@1` (receiver re-discovers its own contract, never trusts the envelope) + `evolution.propose/evaluate/promote/rollback@1` (thin aliases, distinct names for genealogy).

## Consequences

- Gate 4a: a zero-knowledge agent calls describe → snapshot → bootstrap and states who it is, what governs it, what it may call.
- Gate 4b: full discover→act→verify→record→explain→propose loop green through a real boot with zero undocumented assumptions.
- Data-only reprogramming holds: no codegen in either half (D-219).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.4).
- 4a: `plugins/vivim-mind/src/index.ts` `control.bootstrap@1` (versioned first contact, zero write path) + `control.describe@1` (bounded `ControlModel`, UNKNOWN on unknown kind/capability/version); `plugins/vivim-agent/src/index.ts` `agent.snapshot@1` (identity + contract + exec ledger cursor). No new caps, no composition edits.
- 4b: `agent.delegate@1` (subset-mathed handoff + `delegation:<childId>` to ns `control`; receiver re-discovers via describe) + `evolution.propose/evaluate/promote/rollback@1` (identical behavior-mechanics gates, genealogy-distinct names, mirrors to `evolution:<contractId>`; evidence-required; agent actors need a live version-pinned identity — no L-levels exist, so the evidence requirement IS the floor, per the no-second-auth-model non-goal).
- `contracts/src/control.ts` (one vocabulary surface via `provider.ts`); `docs/VAULT-NAMESPACES.md` ns `control` row (first writer lands here, same wave).
- `plugins/vivim-agent/test/control.test.ts`: 4a gate (describe→snapshot→bootstrap, UNKNOWN trio) + 4b loop (delegate re-discovery, propose→evaluate→promote mirrors, ghost/empty/dangling refusals, rollback mirror, describe activity count).
- Falsifier run: control suite green with mind+agent suites; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc; 4b did not slip).
