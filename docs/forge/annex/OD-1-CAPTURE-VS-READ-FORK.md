# OD-1 · The capture-vs-READ partition for forge.mine — fork file (lift-ready)

**Working-set fork file, 2026-09-20.** Pre-analyzed per the program review's
A5 design (accelerator: forks arrive at decisioning *analyzed*, in the repo's
own record grammar, so deciding = choose + lift, not analyze + author). This
is not a repo record. At lift it becomes the PROPOSED decision record under
the next open D-id (HANDOFF-ROUND-2 originally reserved **D-407** for this
fork; the endstate vision took the number — the displacement is itself
recorded program evidence; with D-408 parked, the realistic lift id is
**D-409** or the then-next open id).

> **DECIDED by the owner, 2026-09-20** — verbatim: *"Decision made split
> plugin."* Option **(a) split-plugin** is the decision; lifted at re-entry as
> **D-409**. Simultaneously the owner directed (**D-410**, core-first
> re-sequencing): *"park all plugin design until you have the core omega
> ready"* — so this decision's **implementation** (the two plugin directories,
> refusal tests, capture against the mine) is **parked until core-omega-ready**;
the partition shape below is settled law for when implementation resumes. The
Consequences' Wave-1 landing timeline is superseded by D-410; the partition
reasoning is unaffected.

## Status

DECIDED (a) — owner decision 2026-09-20 ("Decision made split plugin"); lifted
as D-409 at re-entry. Implementation parked until core-omega-ready per D-410
(the core-first re-sequencing); the partition itself is settled.

## Context

Wave 1 opens on `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/`
(42 files, rootHash-pinned MANIFEST.json) and, per the wave's arc, both mines.
D-406 froze the 24-op `forge.*` catalog with the mine family declared in wire
— capture, verify, diff, list — but **deliberately left open the partition**:
which part of the mine interaction is *capture* (a forge op, gated and badged
under the forge surface's risk-class law) and which part is *READ* (an
ordinary read-class operation over pinned input). HANDOFF-ROUND-2 names the
seam precisely: *the mine's READ-class row vs the capture receipt's write
path.* The backlog already carries a pre-position — capture is
EXTERNAL_MUTATION (the one filesystem seam) while its siblings are READ; one
risk class per plugin (FORGE_CLASS_SPAN) means capture splits into its own
plugin directory when it lands; *do not fix the catalog; split the partition.*
This fork file frames that position as a decidable record, with the
sub-forks named so the decision stays scoped to the class split.

**Blocks:** Wave 1 (entry is recorded and unstarted pending this decision).

## Options

Scored against named criteria — argue against the criteria, not past them.
C1 class honesty (the declared risk class equals the actual capability
envelope) · C2 catalog freeze (the 24 frozen ops change not at all) · C3
FORGE_CLASS_SPAN (one risk class per plugin directory) · C4 refusal-test
clarity (every refusal names one plugin and one rule) · C5 namespace law (the
capture receipt lands in a namespace with owner/writers/retention declared in
the same commit) · C6 auditability (the receipt's write path is a
governed-event row: gated, stamped, queryable).

| Option | Shape | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|---|
| **(a)** Split-plugin | `plugins/forge-mine-capture/` — EXTERNAL_MUTATION: reads the target tree, hashes, snapshots into the vault, writes the capture receipt; `plugins/forge-mine/` — READ: verify/diff/list over the pinned mine + vault reads | yes | yes | yes | yes | via SF1 | yes |
| **(b)** Single plugin, dual-class contributions | one `forge-mine` directory carrying both an EXTERNAL_MUTATION and a READ contribution | no | yes | **no** | muddied | yes | yes |
| **(c)** Read-thin capture | capture only orchestrates + writes the receipt; a READ-class op performs the file ingestion into staging | no (the READ op still needs the filesystem seam) | strain (ingest becomes a de-facto 25th op shape) | yes | split blame | yes | indirection hides the mutation |
| **(d)** Defer again | leave the partition open, start Wave 1 elsewhere | — | — | — | — | — | — |

## Decision

**Decision:** (a) — DECIDED by the owner, 2026-09-20; lifted as D-409.
Implementation of the split is parked until core-omega-ready per D-410.

The repo has already converged on (a) by its own laws: (b) is refused by the
forge-surface gate's one-risk-class-per-plugin rule as written today, and
"fixing" that rule to admit (b) would be weakening the validator to fit the
artifact — the exact inversion the Wave 0 hand-fix tally forbids; (c) moves
the filesystem mutation into a READ-class op, which is class dishonesty, the
one sin C1 exists to prevent; (d) is refused by the fork's own trigger —
Wave 1's entry point is recorded against this decision.

## Consequences

- Two plugin directories land in Wave 1: `forge-mine-capture` (EXTERNAL_
  MUTATION — the program's one declared filesystem seam outside the platform
  seam) and `forge-mine` (READ). The 24-op catalog is untouched; the split is
  at the plugin/class boundary, exactly where the backlog pre-positioned it.
- Each plugin ships refusal tests naming its own ops (FORGE_NO_REFUSAL_TEST
  is waiting) — capture's refusals will include path-escape and unpinned-
  target shapes; the READ plugin's will include un-pinned-hash verification
  failures.
- Wave 1's first D-item sequence becomes: lift this record → land
  `forge-mine-capture` + `forge-mine` per the D-406 grammar (generality
  `speculative`, `mine: null`, `granularity` + `internalSeams` declared) →
  run capture against synthetic-v0 → receipt exists → HARVEST_CLASSES and
  MINE_PATTERN get their first real consumers.
- The sub-forks below remain open *inside* the chosen shape — they are
  design-phase forks, not blockers, and each lands with its own evidence in
  the implementing record:
  - **SF1 · Receipt namespace** — ns `proposal` (the forge surface's declared
    namespace) unless retention differs, in which case a mine-specific ns with
    owner/writers/retention declared in the same commit (namespace law).
  - **SF2 · Snapshot bytes** — CAS blobs (content-addressed, one write per
    unique content) vs rows; incremental hashing budget (path+mtime+size
    cache) per the mine-ops harness design (program review A10).
  - **SF3 · Mine id discipline** — the first real consumers of HARVEST_
    CLASSES + MINE_PATTERN define whether the ids hold; expected churn is a
    named trigger, not a silent edit.
  - **SF4 · The real mine** — `reference/` is outside the repo; capture
    against it needs an out-of-tree input declaration (pin/manifest story)
    or the real-mine capture is explicitly a later record. Not this fork.
- If (a) is rejected, (b) requires a forge-surface rule amendment (new
  evidence-class record, adversarial case included) before any code — and
  the catalog freeze makes that the expensive door on purpose.

## Evidence

- `docs/forge/HANDOFF-ROUND-2.md` — "Record the deferred capture-vs-READ
  partition decision (next decision id: D-407) before any code — the mine's
  READ-class row vs the capture receipt's write path is the seam that was
  deliberately left open in D-406." (Also the displacement evidence: D-407
  became the vision ratification.)
- `docs/forge/BACKLOG.md`, Wave 1 section — "forge.mine.capture@1 is
  EXTERNAL_MUTATION (the one filesystem seam) while its siblings are READ —
  one plugin per class (FORGE_CLASS_SPAN) means capture splits into its own
  plugin directory when it lands. Do not 'fix' the catalog; split the
  partition."
- `tooling/gates/forge-surface.ts` (stage 5d) + `docs/forge/wave0-evidence.md`
  §D5 — the five forge-surface checks, including one-risk-class-per-plugin,
  refusal-tests-required, catalog-exact wire.
- D-406 record — the 24-op catalog freeze and the mine family declared in
  wire; `fixtures/mines/synthetic-v0/MANIFEST.json` (42 files, rootHash-pinned,
  `tools/hash.py --check` → 0 bad).
- `docs/forge/HANDOFF-ROUND-2.md` §Next round's exact entry point — the lift
  sequence this record unblocks.
- Working set: `OMEGA-CONSOLIDATION-INTEGRATION.md` §4.3 (the OD-1 register
  entry) and `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §5 (mine rows are new writes,
  not migrations — the receipt is a governed-event row from the first byte).
