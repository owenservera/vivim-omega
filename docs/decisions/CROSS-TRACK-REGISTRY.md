# Cross-Track Decision Registry

**The naming law (D-413, A7):** a bare `D-NNN` citation inside this repo always
means **this repo's ledger** (`docs/BUILD-DECISIONS.md`) — never a foreign
numbering. Citing a foreign track's decision is always track-qualified:
`akb:D-389`, `omega:D-413`. A number is not a citation; a number with a track
is. The checker carries the known-collision set below (`KNOWN_TRACK_COLLISIONS`
in `tooling/gates/decisions.ts`) and warns — report-only — on bare citations
of colliding ids in records from D-413 on; the test suite locks this page and
that constant together (the D-403 doc-drift class, caught by construction).

## Tracks

| Track | What it is | Id space | Citation form |
|---|---|---|---|
| **omega** | This repo's build-decision ledger | D-2xx…D-4xx, append-only, gate-checked | bare `D-NNN` (or `omega:D-NNN` when disambiguating) |
| **akb** | The Consolidated Core working document (uploaded 2026-09-20) — an external corpus with its own draft numbering, **not a ledger** | draft D-numbers, unordered, unreconciled | `akb:D-NNN` always |
| **legacy mines** | The frozen legacy repos (`vivim-final-program@4a5eb84`, `vivim-final-enhanced@afebe00`) | repo commits, not decision ids | `repo@sha` — never D-numbers |
| **OD register** | The omega working-set open-decision register (annex: `OMEGA-CONSOLIDATION-INTEGRATION.md` §4) | OD-1…OD-9 | `OD-N` — distinct by construction |

## Known collisions

| omega id | foreign id | disambiguated as | status |
|---|---|---|---|
| omega:D-389 | akb:D-389 | **OD-9** — the hybrid BM25 + grep retrieval fork for `vivim.vault`, re-registered de-collided (the akb draft's citation is off-track; the omega D-389 is the intent mechanism, ratified with evidence) | open in the OD register |

Standing rule (from the integration doc §3): any external document citing
D-numbers gets its numbers reconciled against `BUILD-DECISIONS` **before** its
content is treated as carrying decision lineage. When a new collision is
discovered: add the row here, add the id to `KNOWN_TRACK_COLLISIONS`, cite both
in the same change — the lock test goes red until they agree.
