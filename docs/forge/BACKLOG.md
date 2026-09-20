# Omega Forge — Backlog

Wave 0's deliberate non-goals and deferred sins, each with its trigger. The
hand-fix tally's raw material lives in `docs/forge/wave0-evidence.md`.

**Re-sequenced 2026-09-20 by D-410 (core-first):** the Core Phase below is the
next wave of record; every plugin-design item is PARKED until core-omega-ready
(the register: `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3). Decided
shapes stay decided (D-409 records the split-plugin partition); what parks is
implementation.

## Core Phase (next — D-410)

- **S1 · the canonical-intent seam** (HARD, volume-clocked — first): one
  canonical writer path for intents (ns `intent` / `intent-plan`, declared in
  namespace law); law decisions cite `{intentRef, payloadHash}`; the
  four-state resolution (UNDERSTOOD / AMBIGUOUS / REFUSED / EXECUTED) lands as
  rows; fix the `intent.cancel` silent no-op (undefined `stepId` inside
  try/catch — `plugins/vivim-intent/src/index.ts:233`) with a regression test
  that fails on the old code; one live path routes
  interpret → persist → gate → execute → resolve.
- **S2 · the principal-identity seam**: principal identity rows (a principal
  record namespace) with the non-reuse invariant enforced; new identity-bearing
  writes resolve through records; existing consent/grant/journal history is
  NOT re-typed (R1 avoided by design).
- **S3 · the evidence-store choicepoint** (owner call, closing window): fold
  the law-journal into the vault chain vs sidecar with its own chain +
  signature; the audit chain gains a persistence point either way; the call
  carries a measured law-journal volume number so window expiry is visible.
- **C · the compaction invariant**: "compaction never deletes a revision,
  period" (the stronger F9 prerequisite) explicit in namespace law, not prose.
- **At core-omega-ready**: the plugin-identification pass — one record
  enumerating the plugins the core actually needs (tactical map + frozen
  24-op catalog + the parked register below) — which un-parks everything
  below and opens parallel work.

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
