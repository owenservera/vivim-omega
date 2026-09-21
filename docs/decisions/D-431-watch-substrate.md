# D-431 — The Watch Substrate is core (Omega-1 port, paper D-425)

## Status

RATIFIED

## Context

- Core Omega is event-sourced but reactive to nothing: vault accumulates, law gates, kernel executes, yet no standing condition notices a predicate became true and mints the event (`tooling/gates/*.ts`, `plugins/vivim-vault/src`, `plugins/vivim-law/src`).
- Forcing watching into a plugin makes the most-trusted duty third-party: sovereignty violation. Paper `D-425` (§0–§11 of the 1-8 spec) designs the Watch Substrate as kernel-owned core.
- Genome reports Ω-1 `external-assumed` (paper `D-425`, tree null, F-WATCH unresolved): paper fact, no tree evidence. This record ports it.
- Requires W5 atom green (law gate + ledgered event, already built: waves Ω1–Ω5 in `build/status.json`). Unlocks Ω-2 conditional hydration.

Blocks: none

## Options

| Criterion | (a) Core substrate port (tooling + tests, zero host LOC) | (b) Plugin watch tile | (c) Defer |
|---|---|---|---|
| Sovereignty (watcher is core) | Yes — kernel-owned service, sole writer of `ns watch` | No — most-trusted duty sits third-party | No — gap remains |
| Law gating (`onFire` is intent, never action) | Yes — schema refusal + gate row | Bypass risk — plugin calls capability directly | Unproven |
| Determinism + idempotent multi-device fire | Yes — declarative predicate, `hash(watchRef, quantizedFireWindow)` + named merge | Ad hoc per plugin, double-mint likely | Unknown |
| Headless (zero pixels) | Yes — CLI/MCP/daemon see every fire | No — dies with canvas | No |
| B5 / anvil freeze | Holds — `tooling/` + `docs/` only, host 1500 flat, anvil untouched | Risks host growth | Holds trivially |

## Decision

**Decision:** (a) — port paper `D-425` as tree D-431: a declarative, capability-scoped, law-gated Watch Substrate that mints provenance-stamped events and nothing else.

## Consequences

- Harder: every `watch.*` op is law-gated with `{code, sentence}` refusals; retention + grants mandatory at register; `watch.fire` never grantable — plugins that polled must migrate to standing watches.
- Easier: all "when X, fire intent Y" (time, vault, fs, device, stream) becomes one primitive; Ω-2 spends against it; Ω-8 rehearses against its ledger rows.
- Revisit: predicate expressiveness bounds (what the declarative language admits); fs/device source adapters per OS (platform seam only); retention-rule catalog growth.

## Evidence

- F-WATCH.1 (register-fire-route) — time watch (60s) registers with consent, mints `watch.event` with `evidenceRef` + both badge axes, `onFire` routes through Law → executes → ledgered.
- F-WATCH.2 (onfire-is-intent) — `onFire` carrying a direct action is schema-refused with `WATCH_ONFIRE_NOT_INTENT`; privileged-capability intent without grant is law-refused, nothing executes.
- F-WATCH.3 (retention-required) — register without a named retention rule is refused with `WATCH_NO_RETENTION`.
- F-WATCH.4 (granted-observation) — `fs:/secret` without fs grant is refused with `WATCH_UNGRANTED_SOURCE`.
- F-WATCH.5 (sole-writer-lifecycle) — non-substrate write to `ns watch` refused with `WATCH_NOT_SOLE_WRITER`; `watch.fire` ungrantable (`WATCH_FIRE_NOT_GRANTABLE`); pause stops fire, demote stops + drops badge loudly, all ledgered.
- F-WATCH.6 (headless-idempotent) — canvas killed, watch still fires; synced watch firing on two devices reconciles to one event + named merge record (no double-mint).
- Entailed codes (beyond the paper five, same authority): `WATCH_NOT_OWNER` ("Only the watch owner arms or pauses this watch.") for §3 ownership, `WATCH_PAUSED` for fire-while-not-armed. No new privilege; both refuse loudly.
- Spec: paper `D-425` (§0–§11, `chat-Git Bundle Vision and Core Capabilities1-8.txt` lines 16–208); genome Ω-1 row (paper `D-425`, external-assumed pre-port); simulate receipt `build/sim-receipts/_-1.json` (4 applicable, 0 uncaught, advisory).
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-1 Watch Substrate from external spec paper D-425 into tree with F-WATCH green
rationale: System cannot notice conditions; watching is sovereign duty, never plugin
class: evidence
