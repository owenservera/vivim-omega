# D-435 — Vault Analytics is core (Omega-5 port, paper D-429)

## Status

PROPOSED

## Context

- An infinite append-only log is a black box: "most used tool", "compute shape of my week" force users into BI export (sovereignty break) or mutable counters (second truth on first bug/shred) — paper `D-429` §1.
- Requires Ω-1..Ω-4 green (tree D-431..434): events, physics, cognition, identity all ledgered; the log now needs its lens.
- Invariant: a projection is a disposable deterministic fold, never a second truth, always citing its vault byte-range.
- Tree collision noted: tree D-435 here vs paper builder-gap `D-435` (Ω-2.6) — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Core projection port (tooling + tests, zero host LOC) | (b) External BI export | (c) Defer |
|---|---|---|---|
| Sovereignty (local-first lens) | Yes — kernel fold, `ns analytics` derived | No — shadow pipeline, unbadged | No |
| No second truth | Yes — watermarked, insert/delete only, rebuild byte-identical | Counters drift on bug/shred | Blind |
| Visible staleness | Yes — Staleness Delta rendered, never silent | Unknown freshness | Unknown |
| Badged semantics | Yes — write-time hashes + badged ML cluster refs | Ad hoc | None |
| Budgeted compute | Yes — materialize spends Ω-2 claims | Unbounded | Unmeasured |

## Decision

**Decision:** (a) — port paper `D-429` as tree D-435: fold/projection/materialization pipeline with mandatory watermarks, sole-writer engine, insert-only materializations, deterministic rebuilds.

## Consequences

- Harder: every materialization carries watermark + cost; manual edits refuse; external joins refuse; heavy rebuilds need explicit intent + governor claim.
- Easier: heatmaps, cost joins, intent clusters, center-of-gravity answer as queries with proofs; Ω-7 gains forensic usage data; Ω-8 gains baselines.
- Revisit: refresh policies per projection; access-batch tuning; semantic-hash schemas; snapshot support for giant vaults.

## Evidence

- F-ANALYTICS.1 (honest-heatmap) — namespace heatmap returns payload + watermark; vault append increments Staleness Delta until rebuild.
- F-ANALYTICS.2 (forensic-join) — costliest-tile query joins `gov.claim` rows with write frequency, citing its scanned byte-range.
- F-ANALYTICS.3 (no-second-truth) — manual edit of a materialization refuses `ANALYTICS_SECOND_TRUTH`; rebuild restores instead.
- F-ANALYTICS.4 (semantic-topology) — intent-cluster graph folds deterministic hashes, cites its projection row.
- F-ANALYTICS.5 (rebuild-ashes) — wiping `ns analytics` and rebuilding from byte 0 regenerates byte-identical payloads.
- Spec: paper `D-429` (§0–§10, 1-8 spec lines 1223–1417); requires Ω-1..Ω-4 (D-431..434).
- Gate: PROPOSED-tree greens pending (D-364 two-green bar before flip; status.json carried only from green).

## Index

summary: Port Omega-5 disposable projections with watermarks from paper D-429
rationale: Vault is truth; analytics are deterministic folds with visible staleness
class: evidence
