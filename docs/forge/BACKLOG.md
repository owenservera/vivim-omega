# Omega Forge — Backlog

Wave 0's deliberate non-goals and deferred sins, each with its trigger. The
hand-fix tally's raw material lives in `docs/forge/wave0-evidence.md`.

**Re-sequenced 2026-09-20 by D-410 (core-first):** the Core Phase below is the
next wave of record; every plugin-design item is PARKED until core-omega-ready
(the register: `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3). Decided
shapes stay decided (D-409 records the split-plugin partition); what parks is
implementation.

## Core Phase (next — D-410)

- ~~**S1 · the canonical-intent seam**~~ — **DONE (D-411, ratified 2026-09-20)**: real sha256 payloadHash; the `intent.cancel` defect fixed with a failing-on-old-code regression; interpretation summaries on intent rows; `intent.resolution@1` four-state rows; law decisions cite `{intentRef, payloadHash}`; the console live path routes interpret → persist → gate-with-citation → execute → resolve.
- ~~**S2 · the principal-identity seam**~~ — **DONE (D-412, ratified 2026-09-20)**: ns `principal` identity rows (retention forever); the non-reuse invariant (PRINCIPAL_REUSED — retired is forever); the consent ceremony resolves through the record when law holds vault caps; existing keyed history untouched.
- ~~**T · the program tooling round (A1+A4+A7)**~~ — **DONE (D-413, ratified 2026-09-20)**: the record scaffold (`omega:new-decision`), generated index rows (byte-checked; hand-editing generated-era rows goes red), the Blocks field + blocking-first board, the cross-track registry (`akb:D-389` naming law + report-only lint). Landed while S3 awaits the owner — the acceleration review's build-order row 3, restored; A2+A12 (round-close automator) are the next tooling round; A3 (invariants pass #2) the one after.
- **S3 · the evidence-store choicepoint** — **OPEN, the owner's call** (the last Core Phase item): fold the law-journal into the vault chain (recommended) vs sidecar with its own chain + signature; the audit-chain persistence point common to both and landable first; pre-analyzed lift-ready in `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md` (D-414 at lift; volume clock measured: 7,145 rows / one full-gate run on the D-413 tree).
- ~~**C · the compaction invariant**~~ — **DONE (D-410's item C, stated 2026-09-20)**: "compaction never deletes a revision, period" is explicit namespace law in `docs/VAULT-NAMESPACES.md` (the stronger F9 prerequisite).
- **At core-omega-ready (after S3 lands)**: the plugin-identification pass — one record enumerating the plugins the core actually needs (tactical map + frozen 24-op catalog + the parked register below) — which un-parks everything below and opens parallel work.

## Parked until core-omega-ready (D-410 register)

### Wave 1 (the mine wave) — PARKED

- **Run `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/`** — the
  mine is pinned (42 files, MANIFEST.json rootHash) and waiting; parked with
  the plugin work per D-410.
- **Land `forge-mine-capture` + `forge-mine`** — the partition is DECIDED
  (D-409: capture is EXTERNAL_MUTATION in its own directory, siblings are
  READ; one plugin per class; do not "fix" the catalog, split the partition).
  Implementation parked; SF1–SF4 sub-forks stay named inside the shape.
- **Mine id discipline in anger**: HARVEST_CLASSES + MINE_PATTERN get their
  first real consumers once a capture receipt exists — waits with the park.

### Wave 1+ (forge build-out) — PARKED

- **forge.survey / forge.assay / forge.shape / forge.emit / forge.proof /
  forge.tier** — wire declared in FORGE_OP_CATALOG (24 ops, frozen), zero
  implementation. Each lands with: refusal tests naming every op (the
  FORGE_NO_REFUSAL_TEST gate is waiting), one risk class per plugin,
  generality declared, catalog-exact manifest contributions.
- **Wave/caller tracking for GEN_SPECULATIVE_STALE** — Wave 0 ships it
  report-only; turning it hard needs a caller census (who imports a
  speculative artifact) and a wave counter. Until then the code is honest
  about being soft.

## Structural debts recorded, not owed

- **Comparison walker excludes `node_modules`** under the host
  `contentHashDir` precedent (package-manager links are machine state, not
  plugin bytes). If plugin dirs ever ship vendored dependencies that ARE
  plugin bytes, this exclusion needs its own decision.
- **`packs/builder` spans all three risk classes by design** (a pack declares
  the wire; plugins implement partitions). FORGE_CLASS_SPAN exempts packs —
  recorded in D-406 so the exemption is a decision, not a gap.
- **Self-hosting authoredFiles = 4** (spec/self.json + compare.ts + two test
  files), each with recorded justification. The packet's "empty unless
  unavoidable" bar is met by argument; a future template-language that can
  express tests without self-reference could shrink it — revisit only with a
  real need.
- **forge.author.init@1 serves pluginId `forge.author` only** (Wave 0
  self-hosting stance, refusal SPEC_PLUGIN_ID_MISMATCH). Generalizing to
  other plugin ids is a post-core decision once the wire has proven itself —
  it is a deliberate refusal, not a TODO.

## Evidence-file hand-fix material (for the retrospective)

- The three self-reference traps (token-in-own-source, hash-covers-hash,
  burned-header-repin) are now structural knowledge: any future Forge
  emission tooling hits the same family. Consider a `docs/forge/` note on
  "hash self-reference patterns" when the emit ops land.
- The GENERATED-header regex initially missed `@` in the schema id character
  class — rule 6 silently never fired. Lesson: every gate check needs a red
  fixture on the REAL tree before it is trusted (the forge-surface test
  suite now does this by construction).
