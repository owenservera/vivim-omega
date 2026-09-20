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
- ~~**T · the program tooling round (A1+A4+A7)**~~ — **DONE (D-413, ratified 2026-09-20)**: the record scaffold (`omega:new-decision`), generated index rows (byte-checked; hand-editing generated-era rows goes red), the Blocks field + blocking-first board, the cross-track registry (`akb:D-389` naming law + report-only lint). Landed while S3 awaits the owner — the acceleration review's build-order row 3, restored.
- ~~**RC · the round-close automator round (A2+A12)**~~ — **DONE (D-414, ratified 2026-09-20)**: `omega:round-close` — the round-closing ceremony as ONE fail-closed command (preflight refusals named: clean tree, quick green, decisions green, board fresh, status.json carried+green, ledger contiguous, tip advanced; bundle cut + verify + sha256; the ledger README row generated from git data, `8…8`; the next-round entry block printed from BACKLOG + the open board) + the toolchain pin in `build/status.json` (`toolchain {bun,node,os,arch}`; `verify-status` reports drift, never fails on runner-shape). First use: this round's own close (bundle `_8`). The acceleration review's build-order row 5.
- ~~**A3 · the invariants round (pass #2 + the freshness stage)**~~ — **DONE (D-415, ratified 2026-09-20)**: `CURRENT-INVARIANTS.md` pass #2, regenerated from the decision records as-of D-415 with the machine-readable marker (Wave 0's forge constitution, the Core Phase seams, the generated-row era, the D-391 B5 re-freeze — all folded in); the report-only `invariants-freshness` gate stage (T1 30-ratifications, T2 stage drift; the live lock test pins digest ↔ registry; T3 wave-closure deferred with its named trigger; the flip to failing after one green wave of reports). The acceleration review's build-order rows 3–5 are ALL landed — the scheduled program stack is built.
- ~~**S3 · the evidence-store choicepoint**~~ — **DONE (D-416, ratified 2026-09-20 — THE CORE PHASE IS CLOSED)**: the owner's call took (a) fold-into-vault — law's narrative journal rows ride vault ns `law` (id family `journal:<boot>-<seq>`, best-effort preserved; the recursion guard: the journal never narrates its own writes — the changelog row IS the record); the kernel audit chain's persistence point landed as `law.audit.drain@1` (ns `audit`, one whole signed export per drain; the console drains at close — 57 grants on its own test run); the console relay + connect-time history read the vault (the D-387 bounded discipline carried over and COUNTED); the sidecar file is the transition artifact (remaining writer: the B5-frozen µhost transport gate rows); the registry absorbs vault journal rows live; the volume clock re-measured at lift: 7,145 rows / 65 journals, unchanged. Zero host LOC — B5 flat at 1500/1500. **core-omega-ready per D-410's ratified milestone row.**
- ~~**C · the compaction invariant**~~ — **DONE (D-410's item C, stated 2026-09-20)**: "compaction never deletes a revision, period" is explicit namespace law in `docs/VAULT-NAMESPACES.md` (the stronger F9 prerequisite).
- ~~**At core-omega-ready (NOW REACHED — the next round's work)**~~ — **DONE (D-417, ratified 2026-09-20)**: the plugin-identification pass landed — the core needs ZERO new plugins (the seams all landed on existing machinery); the parallel-work lanes are enumerated (8 forge plugins covering the 23 unimplemented frozen-catalog ops + the Wave-2 assembly plugin; ids, op coverage, decided facts only — identify, never design; F-1's set-equality holds against the frozen 24 mechanically). **The register below is UN-PARKED; parallel work is OPEN.**

## Round 12 — the course correction + the efficiency tooling round (CLOSED 2026-09-20)

- ~~**The course correction (OMEGA-COURSE-CORRECTION-001, items 1–6)**~~ —
  **DONE (D-418..D-421, ratified 2026-09-20)**: the v1 substrate call
  (Chrome master/slave ships, no AI-API realization in v1, the Ollama-first
  framing superseded at every law-bearing passage); the CDP substrate lane
  named alongside the forge lanes; the shippable composition fence made
  mechanical (the compositions stage's shippableFence); the governor
  host-budget scoping on file before Wave 4.
- ~~**The efficiency tooling round (the audit's A13–A17)**~~ — **DONE
  (D-422, ratified 2026-09-20)**: the program tools its own reading layer —
  `omega:brief`, gate `--failures-only`/`--stage`, `omega:docscan`
  (report-only), `omega:entry`, the ledger home (`resolveLedgerDir` + the
  README table as the ledger of record); zero host LOC; falsifiers F-1..F-8.

## UN-PARKED by D-417 (the historical D-410 register — parallel work is open; each lane's design lands as its own records)

### Wave 1 (the mine wave) — OPEN (first lane pair: forge-mine-capture + forge-mine, the decided D-409 shapes)

- **Run `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/`** — the
  mine is pinned (42 files, MANIFEST.json rootHash) and waiting; parked with
  the plugin work per D-410.
- **Land `forge-mine-capture` + `forge-mine`** — the partition is DECIDED
  (D-409: capture is EXTERNAL_MUTATION in its own directory, siblings are
  READ; one plugin per class; do not "fix" the catalog, split the partition).
  Implementation parked; SF1–SF4 sub-forks stay named inside the shape.
- **Mine id discipline in anger**: HARVEST_CLASSES + MINE_PATTERN get their
  first real consumers once a capture receipt exists — waits with the park.

### Wave 1+ (forge build-out) — OPEN

- **forge.survey / forge.assay / forge.shape / forge.emit / forge.proof /
  forge.tier** — wire declared in FORGE_OP_CATALOG (24 ops, frozen), zero
  implementation. Each lands with: refusal tests naming every op (the
  FORGE_NO_REFUSAL_TEST gate is waiting), one risk class per plugin,
  generality declared, catalog-exact manifest contributions.
- **Wave/caller tracking for GEN_SPECULATIVE_STALE** — Wave 0 ships it
  report-only; turning it hard needs a caller census (who imports a
  speculative artifact) and a wave counter. Until then the code is honest
  about being soft.

### Parallel lane — provider.browser CDP substrate (D-419) — OPEN, sequenced ALONGSIDE the mine wave

- **`provider.browser`'s CDP substrate** — attach-only first; identified and
  sequenced by D-419, design lands as the lane's own records when it opens.
  Entry falsifier (ARCHITECTURE-NEXT-STEPS §G5, adopted whole): write down
  what "byte-identical" means for live-vs-fixture captures BEFORE the
  substitution test is coded — a live capture substitutes for
  `webmail-inbox/page.json` with zero classifier changes, or the fixture
  format is what's wrong, not the provider. The D-338 authority bar and the
  D-386 containment gate condition govern first live use. v1 ships Chrome
  master/slave (D-418) — this lane is the scheduled path from
  core-omega-ready to a real Chrome session.

### Wave 2 (the assembly plugin) — design opens with Wave 2, never before

- **The assembly plugin (the mind-spine carrier)** — identified by D-417;
  **distinct from `vivim.mind` (Ω10, self-knowledge/WorldModel, live)** —
  this plugin owns context assembly for the intelligence fabric (the F12
  byte-identical context window, evidence refs + named epistemic kinds), not
  world-model grounding.

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
