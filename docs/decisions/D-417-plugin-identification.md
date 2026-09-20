# D-417 — The plugin-identification pass — the plugins the core actually needs, enumerated (identify, never design)

## Status

RATIFIED

## Context

- D-410's ratified post-core gate: at core-omega-ready, ONE record enumerates
  the plugins the core actually needs — "identify, never design" — which
  un-parks the register (`docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md`
  §3) and opens parallel work. **core-omega-ready is reached** (D-416 closed
  the Core Phase: S1 D-411 + S2 D-412 + C D-410-item-C + the tooling stack
  D-413/414/415 + S3 D-416), so this is that record — the scaffold's second
  owner-call record, executing the owner's standing directive ("then
  identify if there are any plugins needed before parallel work").
- Three sources triangulate the enumeration: the frozen 24-op catalog
  (D-406, declared in `packs/builder/plugin.json`'s contract contributions —
  24 `forge.*` ops, exactly one of which is implemented: `forge.author.init@1`
  in `plugins/forge-author/`, Wave 0); the tactical map
  (`docs/forge/annex/OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §5 — which clusters
  hang on which substrate hooks); and the parked register (§3 above — the
  Wave 1/Wave 1+/Wave 2 items, including the DECIDED D-409 partition).
- The register's honesty line predicted the core's answer: "wiring of
  *existing* machinery that the seams require… If a seam provably cannot be
  cut without a new plugin, that exception lands as its own record first —
  the exception is named, never assumed." **No exception ever landed**: S1
  rode `plugins/vivim-intent` + the law journal's citation shape; S2 rode
  `plugins/vivim-law` + ns `principal`; S3 rode `plugins/vivim-law` +
  `plugins/vivim-vault` + `surfaces/web` — all existing assets.

Blocks: parallel work

## Options

| Criterion | (a) Enumerate the full lane set now (this record) | (b) Enumerate Wave 1 only, defer the rest | (c) Defer the whole pass |
|---|---|---|---|
| Parallel-work clarity | every lane named at once — lanes can open in any order the program schedules | only the mine wave visible; Wave 1+ lanes re-enter decisioning one by one | nothing opens |
| catalog coverage (the 23 unimplemented ops all need homes) | complete by construction — the enumeration IS the catalog minus the implemented op | partial; each Wave 1+ lane needs its own identification later | uncovered |
| design restraint (identify, never design) | holds — ids, op coverage, decided facts only | holds | holds |
| ceremony cost | one record | several records | zero now, the window closes silently |

## Decision

**Decision:** **(a)** — enumerate the full lane set now, from the frozen
catalog and the register, ids and op coverage and decided facts only. The
owner's directive asked "are there any plugins needed before parallel work";
the honest answer has two halves, and both are decided here: **the core
itself needs ZERO new plugins** (the seams all landed on existing machinery,
exactly as the register's honesty line predicted — no exception record was
ever needed), and **the parallel work ahead needs exactly eight forge
plugins plus the Wave-2 assembly plugin**, enumerated below.

## Consequences

- **The enumeration (the lanes — ids, op coverage, decided facts only):**
  - **Wave 1 (the mine wave — first receipts against
    `fixtures/mines/synthetic-v0/`, 42 files, MANIFEST.json rootHash,
    pinned):**
    1. `plugins/forge-mine-capture/` — op `forge.mine.capture@1` —
       EXTERNAL_MUTATION — the DECIDED shape (D-409): own directory,
       capture is the mutation, one-class-per-plugin (D-406).
    2. `plugins/forge-mine/` — ops `forge.mine.diff@1`,
       `forge.mine.list@1`, `forge.mine.verify@1` — READ — the DECIDED
       siblings (D-409). Mine-id discipline (HARVEST_CLASSES + MINE_PATTERN)
       gets its first real consumers once a capture receipt exists.
  - **Wave 1+ (forge build-out — the remaining 19 catalog ops):**
    3. `forge-survey` — `forge.survey.render@1`, `forge.survey.run@1`.
    4. `forge-assay` — `forge.assay.distill@1`, `forge.assay.run@1`.
    5. `forge-shape` — `forge.shape.budget@1`, `forge.shape.map@1`,
       `forge.shape.validate@1`.
    6. `forge-emit` — `forge.emit.composition@1`, `forge.emit.fixture@1`,
       `forge.emit.pack@1`, `forge.emit.plugin@1`, `forge.emit.record@1`.
    7. `forge-proof` — `forge.proof.conform@1`, `forge.proof.refusal@1`,
       `forge.proof.replay@1`, `forge.proof.secondmine@1`.
    8. `forge-tier` — `forge.tier.docs@1`, `forge.tier.promote@1`,
       `forge.tier.stamp@1`.
  - **Wave 2:** 9. the assembly plugin (the mind-spine carrier — the
    tactical map's CIV-14–18/F12 row names it). Identified; its design opens
    with Wave 2, never before.
  - Every lane lands with what the BACKLOG already demands: refusal tests
    naming every op (FORGE_NO_REFUSAL_TEST), one risk class per plugin,
    generality declared, catalog-exact manifest contributions.
- **Not plugins, un-parked with the register (identified as work, not
  lanes):** the five vertical-slice boundaries and the W5 conversation atom
  (Wave 1 work on EXISTING plugins — chat streaming through the law gate);
  GEN_SPECULATIVE_STALE caller/wave tracking hardening (behavior in existing
  code); the tactical map's remaining clusters (canvas ns, governor, time
  travel, treaties, Exit Manifest…) each hang on existing substrate hooks
  and open as their waves schedule, each with its own records.
- **What this record does NOT do — the restraint, restated:** no interfaces,
  no payloads, no schemas, no manifest bytes, no sub-fork resolutions
  (SF1–SF4 stay named-unresolved inside the D-409 shape); each lane's
  design lands as its own records when its lane opens. The catalog stays
  frozen (D-406): the enumeration covers exactly the frozen 24 — a 25th op
  needs an amendment record first. This record names lanes; it draws no
  maps. It also does not SCHEDULE the waves — sequencing stays with the
  program's own roadmap (Wave 1 = the mine wave first, per the register).
- **The D-410 register (§3) LIFTS with ratification: parallel work opens.**
  The park's purpose is served: nothing was designed before the core was
  ready, and the core is ready.

## Evidence

- Landed in `ac9aabf`: falsifiers F-1..F-3 green in the record's tree BEFORE the flip per D-364 (5 mechanical tests, `tooling/gates/test/plugin-identification.test.ts`); full gate green 1126/0 x2 on the PROPOSED tree (2026-09-20T10:51:27Z and 10:52:57Z — 1121 + 5 new; host flat 1500/1500, zero host LOC, anvil untouched); the row flips to RATIFIED by `omega:questions --write` (1 regenerated, 0 appended).
- **Falsifiers (in this record's tree BEFORE the flip, per D-364):**
  - **F-1 (enumeration completeness, mechanical):**
    `tooling/gates/test/plugin-identification.test.ts` — parses this
    record's op mentions and asserts SET-EQUALITY with `packs/builder`'s
    manifest forge contracts (the frozen 24, D-406): every catalog op
    appears in the enumeration, and nothing beyond the catalog appears.
    A forgotten lane or an invented 25th op fails by name. Failing on any
    tree without this record (or with a drifted table).
  - **F-2 (identify, never design, mechanical):** the same test asserts the
    record carries NO fenced code blocks and no TypeScript shape
    declarations — the shape-level proxy for "names lanes, draws no maps" (a
    design draft cannot hide in an identification record).
  - **F-3 (the core verdict, cross-checked):** the zero-new-core-plugins
    claim is attested by the seam records themselves — D-411/D-412/D-416's
    Evidence sections cite only pre-existing machinery (vivim-intent,
    vivim-law, vivim-vault, surfaces/web, contracts, namespace docs); no
    exception record ("a seam provably cannot be cut without a new plugin")
    exists in the index. Read them; the claim is their union.
- **Source triangulation:** `packs/builder/plugin.json` (the frozen 24 —
  `forge.assay.distill` … `forge.tier.stamp`, plus the implemented
  `forge.author.init`); `docs/forge/annex/OMEGA-CORE-STRUCTURAL-ANALYSIS.md`
  §5 (the tactical map — which clusters hang on which hooks; §5's
  ingestion-airlock row names `forge.mine.capture` on the real mine);
  `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3 (the parked register
  — the Wave 1/1+/2 items this record un-parks); D-409 (the DECIDED
  partition: capture EXTERNAL_MUTATION own-directory, siblings READ);
  D-406 (the catalog freeze, one-class-per-plugin, packs-exempt,
  refusal-as-data); D-410 (the post-core gate this record satisfies);
  D-416 (core-omega-ready reached — the gate's own precondition).
- **Counting check (mechanical, in F-1's test):** 1 + 3 + 2 + 2 + 3 + 5 +
  4 + 3 = 23 unimplemented ops across 8 lanes + `forge.author.init@1`
  implemented (Wave 0) = the frozen 24 exactly.

## Index

summary: core-omega-reached inventory: the core needs ZERO new plugins (the seams landed on existing machinery, exactly as the register predicted); the parallel-work lanes are 8 forge plugins covering the 23 unimplemented frozen-catalog ops (forge-mine-capture + forge-mine decided-shaped, survey, assay, shape, emit, proof, tier) plus the Wave-2 assembly plugin — enumerated by id, op coverage, and decided facts only
rationale: D-410's post-core gate: the identification record un-parks the register and opens parallel work; every design detail (interfaces, payloads, schemas, sub-forks SF1-SF4) stays with each lane's own future records — this record names lanes, it draws no maps
class: directive
