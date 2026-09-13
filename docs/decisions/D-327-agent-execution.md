# D-327 — B1a: one agent acts once (realization→execution wiring)

## Status

RATIFIED

## Context

The G2 diagnosis is "machinery that looks alive": identities, contracts, and
genealogy exist as data, but no agent has ever caused a gated op call under
its own principal. Everything downstream (routing, discovery, evolution)
depends on execution existing first. Hard prerequisite: D-315 (quarantine
semantics) must be decided before `agent.exec` code is written — currently
PROPOSED, not RATIFIED.

## Options

| Criterion | (a) Fixture-replayed PROMOTED realization → gated call under `agent:<id>`, ledgered (this record) | (b) Live-LLM agent loop now | (c) More descriptive records before any execution |
|---|---|---|---|
| Blast radius | One op, one fixture, refused-and-ledgered is a legitimate outcome | Unbounded (LLM in the execution path, D-216 violated in spirit) | Zero — and zero evidence (G2 unanswered) |
| Principal honesty | Real `agent:<id>` principal through the one gate | Same | No principal ever acts |
| Ledger invariance | Same entries as a director tick (rule stated in a design comment first) | New unreviewed loop | Nothing to ledger |

## Decision

**Decision:** (a) Fixture-replayed PROMOTED realization → gated call under `agent:<id>`, ledgered — reframed: NOT "principal traversal" (that already works per D-310's probe test) but realization→execution wiring; never silently retried; finish-then-halt semantics pinned by test.

## Consequences

- D-315 decides first (blocker on writing code, not a parallel task); B1a may ship with D-315's process rule while its semantic resolves during the build.
- Falsifier: PROMOTED record → gated call → ledger entry round-trips through a real boot.
- The first PR widening past one op MUST flip D-315 (or extend the gate to block it).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.2) + D-315 record (process rule).
- `plugins/vivim-agent/src/agent.ts`: `parseExecInput`/`execCallScope` (v0 vault.* verb scope) + `decideExecAdmission` (active + version-pinned + non-terminal) + `execQuarantinedMidFlight` + `execLedgerId`.
- `plugins/vivim-agent/src/index.ts`: `agent.exec@1` (admit → scope → realization → law pre-check for `agent:<id>` → settle → annotate → ledger exactly once to ns `agent` id `exec:<causationId>`; ledger rule + principal-honesty limitation stated in a design comment before the code).
- `plugins/vivim-agent/test/exec.test.ts`: PROMOTED→settled→ledgered round trip + forbidden-refused-and-ledgered + scope/verb/realization/shape gates + D-315 finish-then-halt (quarantine refuses v2, admits v1) — 8/8 green.
- `plugins/vivim-agent/plugin.json` + `compositions/agent.json`: `agent.exec@1` routed, `port:law.check@1` granted (pre-check); `docs/VAULT-NAMESPACES.md` ns `agent` row extended with `exec:*`.
- Falsifier run: `bun test plugins/vivim-agent/test/exec.test.ts` 8 pass / 0 fail; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
