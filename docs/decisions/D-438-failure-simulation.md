# D-438 — Failure Simulation is core (Omega-8 port, paper D-432)

## Status

RATIFIED

## Context

- Falsifiers prove nothing until something runs them adversarially: first-contact fragility (healing panic, revocation edge-case lockup) bills the user for the first test (paper `D-432` §1).
- Requires Ω-1..Ω-7 green (tree D-431..437): rehearsal needs existing components to break in the dark.
- Invariant: break itself in the dark so it never breaks the user in the light; shadow forks only, live vault immune, verdicts cryptographic.
- Tree collision noted: tree D-438 here vs paper builder-gap `D-438` (Ω-5.5) — distinct per the two-numbering rule. Module named `rehearse.ts` (the `simulate.ts` name belongs to Ω-DEV.5's design sandbox).

Blocks: none

## Options

| Criterion | (a) Core rehearsal port (tooling + tests, zero host LOC) | (b) Plugin test suite | (c) Defer |
|---|---|---|---|
| Same code paths as live | Yes — shadow fork through Law→Gov→Ctx | No — tests own code, passes own code | Hope |
| Live immunity | Yes — `SIM_LIVE_VAULT_WRITE` gate error | Risk by construction | Untested |
| Shadow keys, safe silicon | Yes — revocation rehearsed, hardware untouched | Real keys at risk | Fragile |
| Cryptographic verdicts | Yes — pass = hash of refusal rows | Boolean vibes | Unknown |
| Loud immune failure | Yes — failed rehearsal speaks | Silent rot | Blind |

## Decision

**Decision:** (a) — port paper `D-432` as tree D-438: shadow-fork scenarios in `ns sim` with 24h shredding, fault injection sole-writer, verdict engine comparing shadow ledgers to expected refusals, autonomous idle falsifiers + manual what-ifs.

## Consequences

- Harder: every scenario names expected verdicts; shadow keys die outside `sim.run`; budget overruns kill the rehearsal first; failed immunes speak loudly.
- Easier: corruption, starvation, cascade, lost-laptop, exfiltration, live-immunity rehearse on demand; healing tests repairs in shadow before ratification asks.
- Revisit: idle-cycle scheduling; scenario catalog growth; verdict-retention bounds; platform enclave shadow bindings.

## Evidence

- F-SIM.1 (context-corruption) — corrupted ctx hash in shadow yields `CTX_UNSORTED_INVISIBLE` in the shadow ledger → pass.
- F-SIM.2 (starvation) — spiked CPU mints shadow `tile.transition` cause=enforcement → pass.
- F-SIM.3 (lineage-cascade) — demoted shadow parent mints shadow scars on all children → pass.
- F-SIM.4 (lost-laptop) — revoked shadow-key writes rejected by shadow CRDT → pass.
- F-SIM.5 (negative-proof) — shadow exfiltration logs enclave refusal + network block in the audit.
- F-SIM.6 (live-immunity) — `ns canvas` targeting refuses `SIM_LIVE_VAULT_WRITE`.
- Spec: paper `D-432` (§0–§10, 1-8 spec lines 1898–2092); requires Ω-1..Ω-7 (D-431..437).
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.

## Index

summary: Port Omega-8 rehearsal engine over sealed contexts from paper D-432
rationale: Rehearse provider death key compromise starvation before world forces test
class: evidence
