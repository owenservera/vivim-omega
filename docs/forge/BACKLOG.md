# Omega Forge — Backlog

Wave 0's deliberate non-goals and deferred sins, each with its trigger. The
hand-fix tally's raw material lives in `docs/forge/wave0-evidence.md`.

## Wave 1 (the mine wave)

- **Run `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/`** — the
  mine is pinned (42 files, MANIFEST.json rootHash) and waiting; this is the
  packet D6 acceptance's recorded follow-up.
- **Land `forge.mine`** (capture/verify/diff/list). The partition question is
  pre-recorded: `forge.mine.capture@1` is EXTERNAL_MUTATION (the one
  filesystem seam) while its siblings are READ — one plugin per class
  (FORGE_CLASS_SPAN) means capture splits into its own plugin directory when
  it lands. Do not "fix" the catalog; split the partition.
- **Mine id discipline in anger**: HARVEST_CLASSES + MINE_PATTERN get their
  first real consumers once a capture receipt exists.

## Wave 1+ (forge build-out)

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
  other plugin ids is a Wave 1+ decision once the wire has proven itself —
  it is a deliberate refusal, not a TODO.

## Evidence-file hand-fix material (for the retrospective)

- The three self-reference traps (token-in-own-source, hash-covers-hash,
  burned-header-repin) are now structural knowledge: any future Forge
  emission tooling hits the same family. Consider a `docs/forge/` note on
  "hash self-reference patterns" when Wave 1's emit ops land.
- The GENERATED-header regex initially missed `@` in the schema id character
  class — rule 6 silently never fired. Lesson: every gate check needs a red
  fixture on the REAL tree before it is trusted (the forge-surface test
  suite now does this by construction).
