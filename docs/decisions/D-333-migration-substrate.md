# D-333 — Omega as the sole migration substrate (M-series governance)

## Status

RATIFIED

## Context

Two migration plans exist and neither knows about the other:
`docs/kernel-plugins/` + `docs/end-state/` (inside `vivim-final-enhanced`,
Aug 2026) refactors the legacy monolith in place behind a `PluginHost`, while
omega was built per D-210 explicitly unshaped by legacy code. Executing the
retired plan as written strands omega; executing omega without the retired
plan's inventory wastes the per-file audit already done. One target must win
before any migration tooling runs — the retired plan's skills are already
scaffolded and will otherwise keep executing the wrong target.

## Options

| Criterion | (a) Omega sole target; retired plan's inventory salvaged (recommended) | (b) Execute the retired in-place plan | (c) Dual-track both |
|---|---|---|---|
| D-210 compliance | The backfill phase D-210 anticipated ("later backend into the new core") | Reopens D-210 (build inside the monolith) | Two architectures of record; authority split |
| Inventory value | Per-file audit reused against a new decision function (M-plan §2) | Used as written (targets `src/plugin-kernel/`) | Audited twice, shipped once |
| Migration tooling | `migration-*` skills retired/rewritten before any run (non-goal §8) | Runs as-is | Emits correctly-formatted, wrong-target output on one track |

## Decision

**Decision:** (a) Omega sole target; retired plan's inventory salvaged — `Migration/OMEGA-LEGACY-MIGRATION-PLAN.md` is the migration plan of record; `kernel-plugins`/`end-state` is retired as an architecture target and its inventory is reused per M-plan §2.

## Consequences

- `kernel-plugins`/`end-state` stays in the frozen legacy tree, read-only; nothing there executes.
- D-210's backfill phase opens: legacy repos remain frozen sources (read-only harvest, never runtime imports — the fresh-tree guard keeps enforcing).
- The `migration-*` skill tooling must be rewritten against the new decision function before any orchestrator run.
- M0–M4 substrate decisions and the Phase 3 pilot proceed under this record's authority.

## Evidence

- `Migration/OMEGA-LEGACY-MIGRATION-PLAN.md` §§0–2 (ratification target + inventory salvage).
- D-210 register row (backfill anticipated after the core exists; old repos frozen mines).
- Gate green on the land commit (SHA cited at ratification).
- Landing SHAs: records + index rows + board landed PROPOSED in ff762be; full `bun run omega:gate` GREEN 2026-09-13 on ff762be (612/612, host 984/1000, fresh-tree pass) — ratified on that evidence.
