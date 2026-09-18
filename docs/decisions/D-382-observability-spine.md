# D-382 — W0-7 observability spine spec: what "ledgered and queryable" means at scale

## Status

RATIFIED

## Context

W0-7: Omega has bench/demo/status/watchdog evidence + `vivim-mind` WorldModel
derivation + the journal stream, but no prod observability plugin and no
stated query set for migrated traffic (16 providers × streaming ×
multi-principal). The legacy's `observability/telemetry-*/otel-sink/metrics`
engines must NOT be lifted (patterns only). Without a named spine, every wave
proves observability differently and none of the proofs compose.

## Options

| Criterion | (a) vivim.mind + vault query + journal stream, query set + walls named now (this row) | (b) Lift the legacy telemetry engines | (c) New metrics sidecar plugin |
|---|---|---|---|
| Composition | One derivation (WorldModel) every consumer shares | Parallel truth — the thing the strategy forbids | A second observability plane to keep honest |
| Host cost | Zero (all surfaces exist) | n/a | n/a |

## Decision

**Decision:** (a) The spine is `vivim.mind` + vault query + journal stream —
no new metrics sidecar. The query set every wave's falsifier must mean by
"ledgered and queryable": (1) per-conversation history (chat.history, bounded
per D-378), (2) per-realization status (providers ns latest-wins + healing
rows), (3) per-decision resolve trail (ns resolve verdict→outcome revs), (4)
per-eviction watchdog journal (eviction events on the journal stream). The
walls to watch (SLO objectives are Wave6's business; the walls are named now
so every wave measures the same thing): BOOT (cold boot wall), RTT (port
call), SPAWN (compartment + process-tier spawn), APPEND-LATENCY (vault
append vs ns size — D-378's probe is the first instrument), EVICTION
(watchdog kill latency). The mind-query round trip over a seeded
multi-provider vault (history + status + resolve trail + evictions) is the
Wave6 falsifier; waves 1–5 cite these walls in their bench deltas.

## Consequences

- Legacy telemetry is PATTERN-ONLY: harvest its ideas (sampling, redaction
  before emit) through the triage ledger, never its engines.
- BENCHMARKS.md extends with append-latency vs ns-size (D-378 probe did the
  first entry); every wave appends its walls evidence to 40-EVIDENCE/W<n>/.

## Evidence

- W0-7 need text; D-378's probe = the append-latency wall instrument.
  Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
