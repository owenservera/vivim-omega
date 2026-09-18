# D-372 — Multi-OS platform seam: one codebase, every OS, enforced

## Status

RATIFIED

## Context

Ownership moves to a Windows-only team first, with Linux CI as the merge
arbiter and macOS on the horizon. The D-371 audit proved the tree is already
~95% portable: all OS contact concentrates in six narrow touchpoints (temp
paths, permissions, spawn, temp root, line endings, symlinks), of which three
are already solved. Without a fence, every future change can silently
reintroduce OS knowledge across 144+ files; with per-OS branches the
single-lineage law dies by a thousand cuts. The D-361 adapter precedent shows
the house pattern for this class of problem: declare the surface in code,
enforce it in the gate.

## Options

| Criterion | (a) Seam package + os-surface stage + ${TMP} spelling + hardened-informational lanes (this row) | (b) Inline tmpdir rewrites with no seam and no stage | (c) Per-OS branches or specs | (d) Docs only, no enforcement |
|---|---|---|---|---|
| Single codebase forever | Yes | Mostly (knowledge scatters again) | No (lineage forks) | Yes until drift |
| New OS cost | One CI lane, zero code | Audit + rewrite each time | Full port each time | Audit each time |
| Drift prevention | Mechanical (gate fails) | None | None | None |
| Cost now | One package + one stage + token migration | ~60-file touch, no guardrail | Enormous | Zero now, unbounded later |
| Host LOC impact | Zero (dependency, not code) | Zero | Unknown | Zero |

## Decision

**Decision:** (a) Seam package + os-surface stage + ${TMP} spelling +
hardened-informational lanes — new `@vivim/omega-platform` workspace package
holding the only OS-aware code, a fail-closed `os-surface` gate stage
allowlisting it, `${TMP}` as the portable dataDir spelling in compositions
with grandfathered `/tmp` mapping, tests migrating to the seam helper lane by
lane, Windows lane hardened (serial full gate, stays informational until the
soak flake retires by observation) plus macOS informational. Full concept, API
sketch, phase table, and acceptance list live in docs/MULTI-OS-DESIGN.md,
which is the build instruction for the follow-up phases.

## Consequences

- No behavior change in this row (design + record only); implementation
  follows Phases 1–4, each with its own gate evidence.
- D-372 ratifies only when the acceptance list is met (green matrix on one
  commit, zero literals outside the seam, os-surface in status.json).
- CURRENT-INVARIANTS gains its multi-OS section at ratification, not before
  (it records present-day law, and this is not law yet).

## Evidence

- Design record (directive — plan row; the Phase 4 green matrix becomes the
  evidence for the follow-up ratification row).
- Phases 1–2 implemented on this branch: platform unit 7/7, vault suites
  green incl. the `${TMP}` consumer-path test, host boot lanes green,
  `omega:quick` green with the new `os-surface` stage, and a live
  `compositions/chat.json` boot on Windows resolving its vault under the real
  `%TEMP%` (observed `...\Temp\omega-chat\vault-data\canonical.sqlite`, no
  `C:\tmp` leak). D-372 stays PROPOSED until Phases 3–5 meet the acceptance list.
- Phase 3 implemented on this branch: 42 test/tooling files migrated to
  `omegaTmp()` scratch + 25 `package.json` platform dep edges + `bun.lock`;
  `omega:quick` green (structural six, host 1014/1100); MCP spawn-retry
  hardening + Windows-serial/macOS-informational CI lanes. D-372 stays
  PROPOSED pending the acceptance list (same-commit green matrix + refreshed
  status.json carrying `os-surface`).
- Acceptance list met and ratified 2026-09-16: os-surface green and carried in build/status.json (mechanical zero-literals proof), Phases 1–3 landed on the line, Windows-serial + macOS informational lanes green on the landing lineage (2d5b7f7, CI-observed), Linux full gate green at 377c4ed (776/776, host 999/1100). The soak-flake retirement-by-observation note stays honest in docs/WINDOWS.md; D-374's platformSpawn extends the seam without adding a second OS-aware file.
