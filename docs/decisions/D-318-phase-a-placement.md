# D-318 — Phase A composition placement: extend discovery-mind vs new providers file

## Status

RATIFIED

## Context

Phase A wires `vivim.providers` into a composition. Two placements were proposed;
the external review initially recommended a new `providers.json` (A0b) on the
premise that verification lives in no composition — but source shows
`discovery.verification` wired in `discovery-mind.json:44-51` alongside inference
and mapping, which reverses the tradeoff. Prior question Q6, now a record.

## Options

| Criterion | (a) Extend discovery-mind.json (A0a) | (b) New compositions/providers.json (A0b) |
|---|---|---|
| Factual premise | Correct — pipeline already co-located | Based on a falsified premise (verification nowhere) |
| New drift surfaces | Zero (edit one file inside the W1 net) | One (14th file needing its own boot-phase/collision review) |
| Separation of concerns | Weaker on paper (pipeline file grows) | Stronger on paper |
| Blast radius if wrong | One composition's grants re-reviewed | A composition nobody boots yet rotting unwired |
| Reversibility | Trivial (move the entry later, same shape) | Trivial (same, opposite direction) |

## Decision

**Decision:** (a) Extend discovery-mind.json — add the `vivim.providers` entry (phase 1, vault+law caps, providers contracts) to the existing pipeline composition; revisit only if the W1 net exposes a grant collision.

## Consequences

- Phase A1's boot canary runs against `discovery-mind.json`, not a new file.
- If a future wave needs the realization lifecycle bootable *without* the discovery engines, split then — with this record as the documented reason for the original colocation.
- Owner confirmed via wave approval (2026-09-12); reversal remains one moved entry.

## Evidence

- Implemented + gated in 1bcae72: `discovery-mind.json` carries the `vivim.providers` entry; end-to-end boot canary green (shipped-file boot asserts all six compartments active).
- `compositions/discovery-mind.json:44-51` (verification wired — the correcting fact).
- `ARCHITECTURE-NEXT-STEPS.md` §4 Phase A (A0), §7 Q6.
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §1 (A0a/A0b analysis; this record adopts A0a against its recommendation, with the source cited).
