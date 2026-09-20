# D-427 — The orchestration graph: omega:orchestrate plan + the constitutional merge check

## Status

RATIFIED

## Context

- The build sequence reads linear (Ω-1 → Ω-2 → …) but the dependency
  structure is a DAG, and until D-425 it lived in prose. Nothing mechanical
  could answer "what is ready to build now, what is blocked and on what,
  what only needs verification" — every session re-derived it.
- Parallel work is already law (D-417 lifted the register; the lanes are
  named), but parallel lanes merging through judgment instead of the gate
  is exactly the drift class the constitution exists to kill: a merge is
  constitutional only if the COMBINED tree still satisfies every
  falsifier, and "looks fine" is not that.

Blocks: none

## Options

| Criterion | (a) A pure planner over the genome + the merge verdict as the full gate | (b) A scheduler that also assigns work to agents | (c) Keep the plan in the BACKLOG prose |
|---|---|---|---|
| Says what is ready NOW | Yes — six buckets, deps named per node, derived from the genome's DAG | Yes, but assignment is a policy the owner owns | Stale by one wave, always |
| Honesty about assumed deps | Yes — the header states it: assumed deps satisfy planning but are paper facts, never tree evidence | Rarely — schedulers tend to flatten assumptions into facts | Prose, unaudited |
| Merge is constitutional | Yes — the verdict IS the full gate: every stage, every falsifier; red refuses with the failing stages named (ORCH_MERGE_RED) | Partially — assignment tools merge through their own criteria | Unenforced |
| One source, no drift | Yes — reads the genome (D-425), never a second layer list | Would own its own model of work | N/A |
| Zero host LOC, no daemon | Yes — one command, pure core | A scheduler implies a running process and state | Yes |

## Decision

**Decision:** (a) — `tooling/gates/orchestrate.ts`, in substance:

- **The plan** (`omega:orchestrate`, also emitted to
  `build/orchestration-plan.json`) is a PURE function of the genome:
  - `done` — implemented + record RATIFIED (tree evidence, falsifiers green)
  - `inFlight` — implemented + record PROPOSED (the ratify ceremony owns the flip)
  - `verifyQueue` — external-assumed: paper lineage, no tree evidence — port and verify against the spec falsifiers
  - `buildQueue` — ratified-unimplemented with all deps satisfied: READY
  - `specQueue` — queued with all deps satisfied: write the spec first
  - `blocked` — unsatisfied deps, named per node
  Deps are satisfied by implemented OR external-assumed layers — the
  owner's assume-implemented directive counts for planning, and the plan
  header says so out loud on every render.
- **The merge check** (`omega:orchestrate --merge`) runs the FULL gate on
  the combined tree and refuses on red with the failing stage names
  (ORCH_MERGE_RED) — the conflicting lanes get evidence, not a silent
  merge. Green merges cite the whole-gate run, never a subset.
- The plan artifact is a DERIVED VIEW (regenerate freely; the genome is
  the law, this is a lens) — it carries its own header saying so.

## Consequences

- "What next" stops being a re-derivation: the plan is one command, and
  its buckets map to actions (build, port-and-verify, write-spec, wait).
- The assumed-deps stance is deliberate and double-edged, stated in the
  plan header: it unblocks the verify queue NOW (the specs are ratified
  paper), and it can never silently become tree evidence — only records
  and falsifiers do that, through the gate.
- The merge check is deliberately not a new authority: it re-runs the
  existing gate. A future record may wrap lane coordination (claims,
  leases) — this one does not build that.
- Zero host LOC; reads the genome through its exported fold; writes only
  build/orchestration-plan.json.

## Evidence

- `tooling/gates/orchestrate.ts` (new — planFromGenome, renderPlan, mergeVerdict, runMergeCheck), `package.json` gains `omega:orchestrate`.
- Falsifiers, green in this record's tree BEFORE the flip per D-364:
  - F-ORCH.1 (plan-determinism) — the plan is a pure function of the genome: same genome ⇒ identical plan bytes.
  - F-ORCH.2 (bucket-correctness) — deps gate the buckets: unsatisfied deps → blocked with the dep named; external-assumed → verifyQueue; ratified-unimplemented with satisfied deps → buildQueue; queued with satisfied deps → specQueue; implemented splits done/inFlight on record status.
  - F-ORCH.3 (assumed-deps-honesty) — the plan carries the assumption note on every render, and an assumed dep satisfies planning without becoming tree evidence (the genome's evidence fields stay null).
  - F-ORCH.4 (merge-is-the-gate) — the merge verdict runs the FULL gate and refuses with the failing stage names on red; a green merge cites the whole-gate run — the runner is injected so the refusal path is testable without a red tree.
- Self-host, exercised in this record's own round: `bun run omega:orchestrate` renders the real plan — CORE + the Ω-DEV family in-flight, Ω-0 in the build queue, Ω-1..Ω-16 in the verify queue, the builder gaps in the spec queue, Ω-0.5 blocked on Ω-0.
- Precedents: D-425 (the genome it reads), D-417 (the parallel-era law), D-364 (the gate as the only arbiter of green).

- Ratified on greens (evidence-class, F-ORCH.1..4 green in this record's tree BEFORE the flip per D-364): landing commit 083739b; full gate green 1232/0 ×2 on the PROPOSED tree (2026-09-20T22:24:15Z and 22:25:53Z); the plan rendered live at the PROPOSED tip (CORE done on program evidence, the Ω-DEV family in-flight pending this very flip, Ω-0 the one build-queue row, Ω-1..Ω-16 the verify queue, the seven builder gaps the spec queue, Ω-0.5 blocked on Ω-0); the checker clean, docscan 0 findings; zero host LOC; anvil untouched.

## Index

summary: The layer DAG read from the genome as an actionable plan — done / in-flight / verify-queue / build-queue / spec-queue / blocked, deps named per node — plus the merge verdict: the constitutional merge check IS the full gate, never a subset
rationale: The build sequence reads linear but the dependency structure is a DAG in prose; the plan says mechanically what is ready now, and parallel lanes merge through every stage and every falsifier with refusal evidence on red
class: evidence
