# D-441 — Aperture Privacy is core (Omega-11 port, paper D-443)

## Status

RATIFIED

## Context

- Gated disclosure still leaks two ways: specific refusals map hidden topology (1,000 probes → vault census), and consumption profiles portrait the owner's habits immortally (paper `D-443` §1: oracle leak + shadow portrait).
- Requires Ω-9 (tree D-439) + Ω-4 (D-434) + Ω-3 (D-433-tree): aperture exists, scopes enforceable, assembly respects redaction.
- Invariant: refusals and attention-memory never reveal more than granted; negative space sovereign, no shadow portraits.
- Tree collision noted: tree D-441 here vs paper unassigned reserve `D-441` — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Core hardening port (tooling + tests, zero host LOC) | (b) Specific errors + ephemeral cache | (c) Defer |
|---|---|---|---|
| No oracle mapping | Yes — uniform code/sentence/size, padded timing, omitted manifests | No — 200 probes census the vault | Leaking |
| No immortal portrait | Yes — `ns profile` vault data, short retention, purge, dumb mode | Black-box ML cache | Dossier |
| Scoped slices only | Yes — sole-reader aperture, per-ns slices | Global readable | Exposed |
| Surface still helpful | Yes — surface (full scope) translates for the human | Model sees all | Either/or |

## Decision

**Decision:** (a) — port paper `D-443` as tree D-441: scope-filtered manifests with mathematical omission, uniform timing-padded refusals, profile as retention-bound vault data with purge + dumb mode + slice isolation.

## Consequences

- Harder: every denial uniform; manifests prove omission; profiles carry retention or refuse; global reads refuse; timing padded by design.
- Easier: third-party realizations connectable without topology fear; prefetch auditable; Ω-8 injects oracle attacks as rehearsals.
- Revisit: padding quantum tuning; retention default (14d) evidence; slice-grant UX; surface translation strings.

## Evidence

- F-APERTURE-PRIVACY.1 (oracle-test) — 200 mixed probes return identical uniform code/sentence/size within padding.
- F-APERTURE-PRIVACY.2 (manifest-blindness) — out-of-scope strings absent from manifest payloads, never redaction-marked.
- F-APERTURE-PRIVACY.3 (portrait-purge) — purge tombstones `ns profile`; prefetch falls back to recency with zero ML.
- F-APERTURE-PRIVACY.4 (profile-isolation) — granted slices only; cross-namespace habits undeducible.
- Spec: paper `D-443` (§0–§10, 9-16 spec lines 2609–2776); requires Ω-9/Ω-4/Ω-3.
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.

## Index

summary: Port Omega-11 uniform refusals plus profile governance from paper D-443
rationale: Refusals must not map hidden topology; portraits must not be immortal
class: evidence
