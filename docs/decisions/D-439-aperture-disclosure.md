# D-439 — Aperture Disclosure is core (Omega-9 port, paper D-433)

## Status

RATIFIED

## Context

- Ω-3 assembles one static shot: under-feed hallucinates, over-feed dilutes and burns; multi-turn needs evolve while policy stays frozen; starved-context hallucinations misread as model failures (paper `D-433` §1).
- Requires Ω-2 (tree D-432) + Ω-3 (D-433-tree) + Ω-5 (D-435): disclosure spends streaming budget, emits sealed contexts, logs efficiency folds.
- Invariant: the realization never reads the vault — it requests, core discloses; prediction probabilistic, disclosure deterministic, gated, budgeted, receipted.
- Tree collision noted: tree D-439 here vs paper builder-gap `D-439` (Ω-6.5) — distinct per the two-numbering rule. G1/G7 seams ride inside this port as clauses; full G1/G7 harden in Ω-11/Ω-15.

Blocks: none

## Options

| Criterion | (a) Core aperture port (tooling + tests, zero host LOC) | (b) Batch-fill windows | (c) Defer |
|---|---|---|---|
| Efficiency (seed + drill) | Yes — minimal seed, demand-driven depth | No — under-feed or dilute | Waste |
| Adaptive need | Yes — explicit pulls + implicit offers, profiles | Frozen policy | Stale |
| Full trail honesty | Yes — seed/manifest/requests/chunks/refusals/spend/prefetch/profile | Blob receipt | Curtained |
| Pull-first, staged prefetch | Yes — prefetch never injects without act | Silent supply | Leakage |
| Budget feedback live | Yes — governor tightens mid-turn with sentences | One-shot grant | Blind |

## Decision

**Decision:** (a) — port paper `D-433` as tree D-439: seed + existence-honest manifest, drill/expand/fetch/manifest pulls, badged prefetch staging, compression ladder, streaming budget claims, ledgered consumption profiles, full `ctx.trail`.

## Consequences

- Harder: every disclosed byte needs a row; sensitive namespaces existence-only; policy principal-only; flood rate-limited at the aperture; replay restated as same-seed-divergent-disclosure.
- Easier: long agents breathe; small windows punch above weight; disclosure vs model failures separable; Ω-5 tracks bytes-disclosed-vs-cited; Ω-8 rehearses starvation.
- Revisit: manifest redaction depth (G1 full); retention of manifests/buffers (S1/S2); flood thresholds; profile-privacy governance (G7 full in Ω-15).

## Evidence

- F-DISCLOSURE.1 (seed-manifest) — any response reconstructs its seed + manifest (existence-only for sealed namespaces).
- F-DISCLOSURE.2 (pull-trail) — every drill/expand/fetch request, granted chunk (sealed, badged, byte-cited), and refusal sentence replays from rows.
- F-DISCLOSURE.3 (no-unrowed-byte) — no byte reaches the model without a disclosure row; red otherwise.
- F-DISCLOSURE.4 (prefetch-staged) — prefetch predictions hit/miss logged; staged chunks cross only via disclosure acts, never injected.
- F-DISCLOSURE.5 (budget-itemized) — spend itemized per request; governor tightening mid-turn speaks with reason.
- F-DISCLOSURE.6 (profile-receipted) — consumption-profile entries justify each prefetch; updates badged, reversible, inspectable.
- F-DISCLOSURE.7 (policy-principal-only) — realization attempt to set aperture policy refuses; flood of drills rate-limits at the aperture.
- F-DISCLOSURE.8 (retention-vacated) — shredded rows surface as `vacated` in manifests and replays, never silent breaks.
- Spec: paper `D-433` (§0–§9, 9-16 spec lines 1945–2143); requires Ω-2/Ω-3/Ω-5.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.

## Index

summary: Port Omega-9 seed manifest pull prefetch trail from paper D-433
rationale: Context disclosed progressively under law budget with full receipts
class: evidence
