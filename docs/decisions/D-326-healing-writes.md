# D-326 — G1 closure: healing writes DEGRADED/TESTING

## Status

RATIFIED

## Context

Promotion-side writes (PROMOTED/REQUIRES_REDISCOVERY/TESTING via
`discovery.verify@1`) landed (D-319). Healing-side writes (DEGRADED on drift,
TESTING on probation entry) are specified in `docs/VAULT-NAMESPACES.md` as an
open question, unwritten. Until one live drift writes DEGRADED, D-307
conformance is vacuous — no consumer can trust a status no producer writes.

## Options

| Criterion | (a) Healing appends DEGRADED/TESTING via `providerRealizationId` (this record) | (b) Healing reports stay in ns `discovery` only | (c) Registry fabricates unwritten statuses |
|---|---|---|---|
| Conformance honesty | Non-vacuous: every status has a live writer | Vacuous (the open question stays open) | Dishonest (reads-as-written that was never written) |
| Id discipline | `providerRealizationId()`, never hand-concatenated | N/A | Hand-built ids (drift surface) |
| Registry change | None (already handles all five statuses) + a real-vault-read assertion test | None | Logic change to invent rows |

## Decision

**Decision:** (a) Healing appends DEGRADED/TESTING via `providerRealizationId` — on drift `status: DEGRADED` with `evidenceRefs` citing the drift observation and `supersedes` the prior rev; on probation entry `status: TESTING`; `VAULT-NAMESPACES.md` open question closed in the same commit.

## Consequences

- Prerequisite: D-325 (this wave's V2.0) — durability first, then the statuses worth keeping.
- Tests: seeded drift PROMOTED→DEGRADED (real vault read); probation→TESTING; failed probation→REQUIRES_REDISCOVERY; re-probe→PROMOTED; full lifecycle round trip through `discovery.verify@1` + healing.
- Falsifier: lifecycle round-trip test green + gate green.

## Evidence

- `plugins/discovery-healing/src/index.ts`: `writeRealizationStatus` (reject→DEGRADED, hold-in-probation→TESTING, none/promote write nothing — verify owns promotion); id via `providerRealizationId()`; `supersedes` prior rev with verify-chain carry-forward; `evidenceRefs` cite the drifted contract address + heal event rev; never throws (skips are DATA with named reasons).
- `plugins/discovery-healing/test/realization-writes.test.ts`: full lifecycle PROMOTED→DEGRADED→TESTING→REQUIRES_REDISCOVERY→PROMOTED through `discovery.verify@1` + `discovery.heal@1`, every transition asserted by real vault read; registry reflects TESTING with live rev (2/2 green).
- `plugins/vivim-providers/test/providers.test.ts`: registry reads all five statuses from the real vault (no registry logic change).
- `compositions/healing.json` + `plugins/discovery-healing/plugin.json`: `port:vault.get@1` granted/requested (prior-rev read); `docs/VAULT-NAMESPACES.md` open question closed.
- Falsifier run: lifecycle round-trip green; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
