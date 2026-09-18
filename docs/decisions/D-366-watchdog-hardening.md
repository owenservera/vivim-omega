# D-366 — Watchdog hardening: spoof-note, two-path kill, required-budget audit

## Status

RATIFIED

## Context

D-360 bounds detection via `probe`/`probeStat`, but `heapUsed` is self-reported from inside the compartment — a malicious compartment can lie (report low while growing). Only the unresponsive signal (wedged loop cannot answer at all) is non-spoofable. Separately, `terminate()` always pays a 2500ms graceful wait (shutdown message) even when the target is wedged and will never process it — the measured 2.9s wall is grace-dominated. Manifests may also omit `runtime.budget.memMB`, silently falling back to `defaultMemMB 256`.

## Options

| Criterion | (a) Spoof-note + fast/graceful split + budget audit (this row) | (b) Keep single-path terminate + silent default | (c) Host-side memory measurement |
|---|---|---|---|
| Honest about spoofability | Yes (docs + header) | No | Strongest, but no API (worker RSS per-compartment not exposed host-side) |
| Unresponsive kill latency | Fast (~500ms cap, no grace) | 2500ms grace always | Same as (a) if built |
| Missing-budget visibility | Journal + callback (auditable) | Silent | Same as (a) |
| Host LOC cost | ~15 lines (fast flag + terminateFast) | Zero | Large (new measurement path) |

## Decision

**Decision:** (a) Spoof-note + fast/graceful split + budget audit — `CompartmentHandle.terminateFast()` (hard kill, 500ms cap), `host.compartment.terminate@1` gains `{fast}` flag, `classify()` returns `{fast}` (unresponsive→fast, memory→graceful), watchdog journals the kill path, `budgetStatus()` + `requireBudget`/`onDefaultBudget` audit undeclared budgets, headers document the spoof asymmetry.

## Consequences

- Unresponsive eviction no longer pays the wedged grace wait; memory eviction keeps grace (responsive target may flush).
- `defaultMemMB` fallback remains for compat, but `requireBudget:true` surfaces it in the journal for audit.
- Memory signal stays cooperative-advisory by construction; unresponsive stays reliable. No new security claim.

## Evidence

- Unit tests: `classify().fast` true/false matrix + `budgetStatus` declared/default (watchdog.test.ts, D-366 block).
- Falsifiers adversarial 13/14 still green (unresponsive reason contains "unresponsive", memory contains "heap over budget" — suffixes additive).
- Landing: 377c4ed gate GREEN (776/776) — implementation was already in-tree (terminateFast + {fast} flag + budgetStatus/requireBudget journal), falsifiers adversarial 13/14 green, classify/budgetStatus units green; D-374's broker adopts the same 500ms fast-kill discipline for process lanes.

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
