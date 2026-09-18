# D-374 — Polyglot process tier: OS compartments behind the broker plugin

## Status

RATIFIED

## Context

Every plugin today is a `worker-thread` compartment (B2). Two verified gaps motivate a
process tier: (1) DRAFT-002/W0-10 — plugins in other runtimes (Python first) cannot
participate in a composition, so "expand foundational needs" would otherwise mean host
growth or a silent sidecar; (2) D-360/D-321 honesty — `resourceLimits` are NOT enforced
on Bun, so a consuming worker-thread compartment can only be DETECTED, never contained,
until a process-per-compartment tier exists (the flagged open gap in CURRENT-INVARIANTS
B2 row). DRAFT-001's raw draft put spawning in the host (`host/src/process.ts`) —
rejected by arbitration item 1 (B5). DRAFT-002's resolved shape: the broker plugin owns
process lifecycle, `platform/` owns OS contact, secrets ride `credential.use` references,
fail-closed everywhere, malformed IPC is bounded (BUDGET, never a hang).

## Options

| Criterion | (a) Broker-plugin process tier over ndjson stdio (this row) | (b) Host-side process spawner | (c) WASM tier first |
|---|---|---|---|
| B5 host LOC | 0 added (broker lives in vivim-run's compartment) | Grows host — rejected | 0 |
| B2 isolation | Stronger than worker tier: OS process boundary, shared-nothing is literal | Same | Strongest, but D-354 reserves WASM for the isolation-taxonomy ruling |
| Polyglot | Any runtime that reads stdin and writes ndjson (Python, Node proven) | Same | Wasm modules only |
| Containment | OS process kill bounds consumption; budgets advisory at spawn, watchdog bounds detection | Same | Fuel metering |
| Enforcement honesty | Stated: no fake OS limits in this slice (D-321 note stands) | — | — |

## Decision

**Decision:** (a) Broker-plugin process tier over ndjson stdio — `RuntimeTier` widens
additively to `worker-thread | process | wasm` (wasm forward-declared only; D-354
reserve honored; no WasmRuntime shape until its own record) and `PluginManifest.runtime`
gains optional `process` (`ProcessRuntime {cmd[], stdio "ndjson", credentialRefs?,
poolSize?}`), schema-validated additively so all existing manifests parse unchanged.
`platform/src/spawn.ts` gains `platformSpawn()` over `node:child_process` — the only new
OS-aware code, inside the D-372 seam, with no fake limit enforcement. `plugins/vivim-run`
gains `ProcessBroker` (`src/process-broker.ts`) exposed as `run.process.call@1`
(MUTATION class, exact LAW_POLICY row same-commit per D-351): pools are declared ONLY in
signed composition config (`config.processPools` — id, cmd, stdio "ndjson", poolSize, ops),
unknown pool id is REFUSED, caller payload can never name a command; ndjson framing with
id correlation; malformed lines are bounded and trip BUDGET (fail-closed, never a hang);
stderr is journaled; shutdown kills children with the D-366 500ms fast-kill cap. The
polyglot shims live in `shims/polyglot/` (`vivim_omega_shim.py` — hardened per DRAFT-002
§5: drain awaited, malformed counter, Windows Proactor note — and `shim.mjs`, the Node
twin); `fixtures/polyglot/provider-python-echo/plugin.json` exercises the additive
manifest fields. A process-tier plugin enters a composition as a Recipe-verified entry
whose child process the broker spawns — B1 holds (no code executes without a signed
manifest entry in the Recipe); the W0-1 generator will embed target manifests'
`runtime.process` into broker config when it lands (D-370 freeze respected: `run.json`
is EXTENDED, no new spec).

## Consequences

- The host is unchanged: 0 LOC added, no new host op — the broker is transport-adjacent
  policy exactly like the D-329 pool placement.
- Composition with a process compartment gains OS-boundary containment for that
  compartment: the B2 "coupling, not exhaustion" residual now has its sanctioned escape
  hatch; worker-tier compartments keep today's honesty notes unchanged.
- Process-tier budgets are advisory at spawn in this slice (declared, journaled, watched
  by the D-360 detection machinery); OS-enforced limits (cgroups/Job Objects, DRAFT-003
  §3) arrive as a follow-up record with per-OS falsifiers — never silently.
- Python shims must keep the malformed-line discipline: the broker kills on bounded
  overflow, so a flood degrades to BUDGET, never a wedged pipe.
- Streaming through the process tier is NOT in this slice (single-shot returns only);
  D-352 chunk discipline extends later with its own falsifier.

## Evidence

- Falsifier (in tree BEFORE ratification): `plugins/vivim-run/test/process-broker.test.ts`
  — polyglot boot: python3 shim child answers `echo.say` through the Port Protocol over
  ndjson stdio; node shim twin likewise; malformed-IPC flood resolves to bounded BUDGET
  (never a hang); unknown pool id REFUSED; deadline honored; shutdown kills children.
- DRAFT-002 received verbatim: `docs/migration/10-WAVE0/received/FOUNDATION-DRAFT-002-DB-AGNOSTIC-DATA-PLANE.md`
  (arbitration chain: D-375).
- Gate: `omega:quick` + full gate green with host LOC unchanged at 999/1100 — landing
  SHA + numbers cited in the ratify commit.
- Landing: 377c4ed — gate GREEN (same run: 776 pass / 0 fail, host 999/1100 — the host-loc-flat falsifier holds mechanically via git diff --stat -- host/src being empty); process-broker.test.ts 9/9 on real children (python 3.12 + node 24 shims, malformed flood BUDGET <10s wall, deadline 500ms honored, REFUSED paths, no orphans).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
