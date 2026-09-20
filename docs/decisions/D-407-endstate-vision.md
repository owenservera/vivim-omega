# D-407 — End-state vision adoption: the Sovereign Canvas, four substrate choicepoints resolved

## Status

RATIFIED

## Context

The program reached its first dream round with a full reference corpus on the table: two strategic chat exports (the fresh-vs-port dilemma, the layer-cake analysis, the five end-state scenarios, the four open substrate choicepoints), the old Vivim docs bundle (the Sovereign Mirror manifesto, the vivim-next MASTER-SPEC with P-01..P-08 principles, the end-state-first 7-verdict design), the source atlas (L0-L4, 2,424-file inventory, provider pilot table 16/16, NLCL verdicts 137/137, store-vault-ns mapping 67/67), and the full Vivim tree. Re-measured this round: 1,043 src TS files, 186 flat engines, 30 routers, 201+ Prisma models across two DBs — matching the atlas claims. Wave 0 machinery is green and ratified: the Forge that emits itself byte-identically, the generality axis, the forge-surface gate, the synthetic second mine. The user's strategic instinct on record: build almost everything fresh, target 100x over old Vivim, and dream the ideal end product this round — Vivim as inspiration, Omega as muse. Four substrate choicepoints have been open since the end-state design: object-model substrate (CRDT vs event-sourced vault watch), tile execution (primary runtime vs bounded sandbox), spatial state ownership (ns canvas first-class vs projection), and the first forgeable tile (local vs provider-heavy).

## Options

| Criterion | (a) Adopt the vision + resolve all four choicepoints now, falsifiers owed by named future waves (recommended) | (b) Adopt the vision, keep choicepoints open until each wave | (c) No vision document; carry the direction in chat memory only |
|---|---|---|---|
| Direction durability | North star in-repo, citable by every future record | Partial — shape drifts with each wave | None — lost at context boundary |
| Choicepoint risk | Decisions made with the full corpus in view; waves supersede if falsifiers contradict | Decisions deferred, re-litigated per wave | Same, plus no record |
| Wave-1 focus | Locked (W5 atom, unchanged by the dream) | Locked | Unchanged but undocumented |
| Honesty | Falsifiers named per choicepoint, owed by wave | Falsifiers implicit | No falsifiers |

## Decision

**Decision:** (a) — adopt `docs/forge/OMEGA-ENDSTATE-VISION.md` as the program's north star and resolve the four substrate choicepoints as directive-class direction: CP-1 vault-watch substrate with CRDT merge discipline folded over the log (one source of truth); CP-2 trust-tiered execution (first-party worker-thread, user-forged always process-tier under watchdog, wasm forward-declared); CP-3 ns canvas first-class with sole-writer canvas surface and versioned restorable retention; CP-4 the first forgeable tile is the local provider-free Ω Ledger Lens, healing-loop provider tile second. The vision codifies the fresh-build default (salvage list: 7 parsers as pinned fixtures, the atlas as assay input, the measured pain as requirements, the manifesto as soul) and folds the three W1 contract addenda (refusal sentences, ledger rows that answer why, both badges from row one) into the vision's contract shapes.

## Consequences

- The vision document is direction, not backlog: precedence stays with the architecture docs and the gate; conflicts resolve downward, never upward. No code lands from this record; zero host LOC; anvil untouched.
- CP-1: Yjs/Automerge-style engines may appear only as payload shapes inside namespace rows; the ledger stays one append-only vault with sole writers. Falsifier owed by the canvas wave: two-device divergence reconciles to identical layout with a named merge record and zero lost non-spatial rows.
- CP-2: nothing user-forged shares the primary runtime; the anvil never grows for tile execution (process tier + supervisor already exist, D-374/D-397). Falsifier owed by the tile wave: watchdog kills a looping forged tile with a named refusal; ungranted capability touch refused with a sentence.
- CP-3: layout is forge-able vault data; rows reference object identity, never duplicate object state. Falsifier owed: reinstall restores layout exactly; non-canvas writers get a named refusal.
- CP-4: the Ledger Lens exercises the full 5-tuple with zero external rot before the browser fleet wave opens. Falsifier owed: one sentence, one tap, live data, both badges, headless CLI parity.
- The 100x table and the refusal register become the standing review frame for future waves: each wave's evidence file may cite them. The salvage verdicts (one HARVEST, one PATTERN, one REMOVE, rest FRESH/RE-EXPRESS) bind future port pressure until superseded by evidence.
- The reference corpus is stored outside the repo (chat exports, vivim-docs, source-atlas, vivim-full clones) and cited by path in the vision header; the repo carries the synthesis, not the bulk.
- Wave 1 scope is unchanged by this record: forge.mine.capture@1 against both mines, the five vertical-slice boundaries, the W5 atom. The dream does not reorder the road; it explains where the road goes.

## Evidence

- Reference corpus verified and stored this round: both chat exports read in full; all three bundles `git bundle verify` ok and cloned (atlas-unit 84f166f, unit/docs 40ce5aa, vivim-full master c45c8ce); vivim-full re-measured live: 1,043 src TS files, 186 engines, 30 routers — atlas claims corroborated.
- Wave 0 standing at adoption: branch tip dddf4e4, full gate 1056/0 green on the Round 2 tree, self-hosting falsifier green on a real boot (forge-author 31/31, forge-surface 14/14, anvil 9/9, generality 15/15, pack.builder 24/24).
- The vision document's own claims are all either measured (inventories, gate numbers), already enforced (Wave 0 machinery), or explicitly marked as falsifiers owed by named future waves.
- Gate evidence for ratification: cited in the ratify commit per repo convention (quick gate green post-landing; full gate green on the record's tree).
- Ratified: landed in `4f1ad7f`; quick gate green post-landing; full gate green on the record's tree (1056/0, host flat 1500/1500, attest green, forge-surface green); directive-class per D-364 (no boot-security surface touched — zero code, zero host LOC).
