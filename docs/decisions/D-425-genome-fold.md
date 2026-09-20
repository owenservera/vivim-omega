# D-425 — The system genome: the machine-readable constitution (genome/layers.json + tooling/gates/genome.ts + the genome gate stage)

## Status

RATIFIED

## Context

- `D-423` consolidated the process self-model, but it is SUMMARY-shaped —
  counts, colors, board rows. An agent (or the owner) still cannot load "the
  whole system state" in one context window: the layer map (the Ω upgrade
  lineage) lives entirely OUTSIDE the tree in paper specs, so nothing
  mechanical knows about layers, dependencies, or falsifier coverage, and
  every session re-derives the picture by re-reading.
- Two numbering systems coexist with no mechanical bridge: THIS ledger
  (docs/decisions, contiguous, authoritative for record files) and the
  external spec lineage (paper ids — the upgrade docs delivered alongside
  this tree). The external specs number Ω-1..Ω-16 as paper `D-425`..`D-448`;
  this ledger now assigns D-425..D-429 to the Ω-DEV family. The collision is
  real and must be recorded, not hidden — the registry's treeId/specId
  fields are the runbook's build-time renumbering rule made mechanical.
- The owner's 2026-09-21 directive sets the family's sequence: the DevOps
  core multipliers come first (this record and D-426..D-429), ahead of the
  previously queued Ω-0.5 durability work. The same directive stands from
  the earlier rounds: the Ω-1..Ω-16 layers are assume-implemented for
  continuation per their ratified external specs — the genome records BOTH
  facts (the directive AND the absent tree evidence), never silently one.

Blocks: none

## Options

| Criterion | (a) The genome fold: an authored layer registry + a pure fold through the existing readers, emitted as committed artifacts and byte-verified by a new MECHANICAL gate stage | (b) Extend process.ts with a layers section (the self-model grows the map) | (c) Defer — the paper specs stay the only layer map |
|---|---|---|---|
| One context window, whole system state | Yes — build/genome.json is the machine artifact; build/genome.md is the ≤16 KiB digest | No — the self-model stays a summary; layers are structure, not counts | No |
| Honesty about the two lineages | Yes — treeId/specId per layer, the collision recorded in the registry lineage, assumed-implemented as data | Nowhere to put it | Human memory only |
| Mechanical integrity | Byte-exact fold, DAG check, budgets, falsifier resolution — failures, not reports | The process stage is report-only by D-423's law; integrity would need a second stage anyway | None |
| New parser risk | None — the fold reads through decisions.ts (parseIndexRows, parseRecord) and explain.ts (STAGE_DOCS); the registry is NEW so its parser is the first and only | Low but real (process.ts grows a second concern) | N/A |
| Zero host LOC, no new write path | Yes — tooling/ + genome/ + build/ only | Yes | Yes |

## Decision

**Decision:** (a) — the genome fold, in substance:

- **`genome/layers.json`** is the ONLY hand-authored input: the layer
  registry (31 layers — CORE, Ω-0, the Ω-DEV family of this wave, Ω-0.5,
  Ω-1..Ω-16, the seven builder gaps), each carrying id, status claim
  (implemented / external-assumed / ratified-unimplemented / queued),
  treeId, specId, named falsifier, dependsOn (the DAG), and a one-line
  note. The lineage block records the two numbering systems, the collision,
  and the assume-implemented directive verbatim — a claim about paper,
  never about this tree.
- **`tooling/gates/genome.ts`** folds registry + ledger + test-tree
  inventory into `build/genome.json` (canonical) and `build/genome.md`
  (the brief). The fold is PURE (inputs in, genome out), deterministic by
  construction (sorted walks, fixed key order), and carries NO volatile
  fields — no timestamps, no head sha — so a fresh fold is byte-stable and
  the committed artifact is content-addressed (the D-362 discipline one
  notch stricter: byte-exact, because this artifact is deterministic, not
  runner-shaped).
- **The `genome` gate stage** (wired after `process`, registered in
  explain.ts) is MECHANICAL, unlike its report-only neighbors: registry
  shape, DAG validity, artifact presence, byte equality, decision-set
  equality both directions, falsifier resolution for implemented layers,
  status-shape honesty, and budgets FAIL. What stays REPORTED in the
  detail: the record status of implemented layers (the ratify ceremony owns
  the flip, per D-364) and the external-assumed count (the owner's
  directive, recorded as data).
- **The ceremony command** is `omega:genome` (emit + verify; `--check` for
  verify-only, `--json` to dump). Any wave touching decisions or the
  registry re-emits and commits the artifacts in the same commit — the
  stage enforces what the board regeneration already practices.

## Consequences

- The layer map becomes loadable, checkable, and citable: agents start from
  `build/genome.md` (or the JSON), the orchestration graph (D-427) reads
  the DAG from it, the loop (D-426) resolves falsifier coverage against
  it, and the sandbox (D-429) rehearses the verifier through it.
- A new failure class exists: a stale or hand-edited genome is a RED gate
  (GENOME_MISSING / GENOME_HAND_EDIT / GENOME_INCOMPLETE / GENOME_ORPHAN).
  The fix is always one command, and the failure message names it.
- The registry is a new hand-authored surface with its own drift risk —
  bounded by shape validation, the DAG check, and the status-shape laws
  (implemented claims need tree evidence; external-assumed forbids it).
- The genome does NOT cross the D-424 seam: it is repo-filesystem tooling
  state, invisible to compartments (B-2 unchanged), and it adds no write
  path, no grant, no host LOC.

## Evidence

- `genome/layers.json` (new — the authored registry), `tooling/gates/genome.ts` (new — parseLayerRegistry, checkLayerDag, extractNamedFalsifiers, foldGenome, serializeGenome, renderGenomeBrief, verifyGenome, gatherGenomeInputs, emitGenome, checkGenome), wired into `tooling/gates/gate.ts` (§5g, after `process`) and `tooling/gates/explain.ts` (STAGE_DOCS.genome); `package.json` gains `omega:genome`.
- Falsifiers, green in this record's tree BEFORE the flip per D-364 (the falsifier-first loop, D-426, generated this record's stub within the same wave — the bootstrap note is D-426's to state):
  - F-GENOME.1 (fold-completeness) — every index row and record file appears in the fold; a committed genome missing tree decisions refuses GENOME_INCOMPLETE and one listing ghosts refuses GENOME_ORPHAN.
  - F-GENOME.2 (no-hand-edits) — the fold is deterministic (same inputs twice ⇒ byte-identical artifacts) and committed artifacts must equal the fresh fold byte-for-byte; any other drift refuses GENOME_HAND_EDIT.
  - F-GENOME.3 (falsifier-resolution) — an implemented layer whose named falsifier resolves to no test file refuses GENOME_FALSIFIER_UNRESOLVED; resolution is word-boundary so F-SIM never matches F-SIMPLE.
  - F-GENOME.4 (dag-validity) — unknown dependencies refuse GENOME_DEP_UNKNOWN and cycles refuse GENOME_CYCLE (Kahn order, deterministic).
  - F-GENOME.5 (budget) — the genome stays within 256 KiB and the brief within 16 KiB; breaches refuse GENOME_BUDGET_EXCEEDED.
  - F-GENOME.6 (live-lock) — checkGenome runs GREEN against this record's own tree with the artifacts committed, and REPORTS (never fails on) the in-flight record statuses and the external-assumed count.
- Self-host, exercised in this record's own round: `bun run omega:genome` emits and verifies clean; `bun run tooling/gates/gate.ts --quick` shows `✓ genome` immediately after `✓ process`; `bun run tooling/gates/gate.ts --explain genome` names the scan, the allowlist, and this rule pointer.
- Precedents: D-423 (the self-model this extends), D-413 (generated-row discipline this mirrors for a derived artifact), D-362 (reproducible status — the content-addressed stance), D-410 (the renumbering context for the two-lineage mapping).

- Ratified on greens (evidence-class, F-GENOME.1..6 green in this record's tree BEFORE the flip per D-364 — stubbed by `omega:loop --stub D-425`, then implemented, the loop's own bootstrap): landing commit 083739b; full gate green 1232/0 ×2 on the PROPOSED tree (2026-09-20T22:24:15Z and 22:25:53Z — the prior tip's 1190 + 42 new across the wave); the genome stage GREEN with the artifacts committed (the record verified by the very fold it describes); the checker clean, docscan 0 findings; zero host LOC; anvil untouched.

## Index

summary: One fold of the whole system state — the authored layer registry (genome/layers.json) folded through the existing readers into build/genome.json + build/genome.md, committed and byte-verified by a new mechanical genome gate stage — so any agent loads the entire system in one context window
rationale: The layer map lives entirely in paper specs outside the tree and the process self-model is summary-shaped; the genome makes the constitution machine-readable, maps the paper lineage to the tree ledger (the renumbering rule made mechanical), and turns falsifier coverage into a checkable fact
class: evidence
