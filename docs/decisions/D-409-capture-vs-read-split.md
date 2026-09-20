# D-409 — The capture-vs-READ partition for forge.mine: split-plugin, implementation parked until core-omega-ready

## Status

RATIFIED

## Context

D-406 froze the 24-op `forge.*` catalog with the mine family declared in wire (capture, verify, diff, list) but deliberately left the partition open: which part of the mine interaction is *capture* — a forge op under the forge surface's risk-class law, EXTERNAL_MUTATION, the one declared filesystem seam — and which part is *READ* over pinned input. HANDOFF-ROUND-2 reserved "next decision id D-407" for this fork; the vision ratification took the number instead (the queue-jump displacement, recorded as program evidence). The fork was pre-analyzed to lift-ready in the annex (`docs/forge/annex/OD-1-CAPTURE-VS-READ-FORK.md`) with options scored against six named criteria. The owner decided this round, verbatim: *"Decision made split plugin."* — and simultaneously directed that all plugin design park until core omega is ready (D-410, same round).

## Options

| Criterion | (a) Split-plugin (recommended) | (b) Single plugin, dual-class contributions | (c) Read-thin capture | (d) Defer again |
|---|---|---|---|---|
| C1 class honesty (declared class = actual capability envelope) | yes | no | no — the READ op still needs the filesystem seam | — |
| C2 catalog freeze (24 frozen ops unchanged) | yes | yes | strains — ingest becomes a de-facto 25th op shape | — |
| C3 FORGE_CLASS_SPAN (one risk class per plugin directory) | yes | **no** | yes | — |
| C4 refusal clarity (every refusal names one plugin and one rule) | yes | muddied | split blame | — |
| C5 namespace law (receipt lands with owner/writers/retention declared in the same commit) | via SF1 | yes | yes | — |
| C6 auditability (receipt write path = governed-event row) | yes | yes | indirection hides the mutation | — |

## Decision

**Decision:** (a) — split-plugin: `plugins/forge-mine-capture/` is EXTERNAL_MUTATION (reads the target tree, hashes, snapshots into the vault, writes the capture receipt); `plugins/forge-mine/` is READ (verify/diff/list over the pinned mine + vault reads). The repo's own laws converged here: (b) is refused by the forge-surface gate's one-risk-class-per-plugin rule as written, and "fixing" that rule to admit (b) would weaken the validator to fit the artifact; (c) is class dishonesty, the one sin C1 exists to prevent; (d) is refused by the fork's own trigger.

## Consequences

- The partition is **settled law for when implementation resumes**: two plugin directories per the shape above; the 24-op catalog untouched; each plugin ships refusal tests naming its own ops (capture's include path-escape and unpinned-target shapes; the READ plugin's include unpinned-hash verification failures).
- **Implementation is PARKED until core-omega-ready per D-410**: no forge-mine plugin code lands in the Core Phase; `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/` waits; HARVEST_CLASSES and MINE_PATTERN wait for their first real consumers.
- The sub-forks remain open *inside* the decided shape — SF1 receipt namespace (ns `proposal` unless retention differs), SF2 snapshot bytes (CAS blobs vs rows; incremental hashing budget), SF3 mine-id discipline, SF4 the real-mine out-of-tree pin — each lands with its own evidence in the implementing records, post-core.
- The displacement closes: the decision HANDOFF-ROUND-2 reserved D-407 for now has its record, two numbers late, with the displacement itself on file; Wave 1's entry point is re-sequenced to the Core Phase (S1) by D-410 — nothing is blocked by this fork any more.

## Evidence

- Owner decision, verbatim (2026-09-20): *"Decision made split plugin."*
- The lift-ready fork file: `docs/forge/annex/OD-1-CAPTURE-VS-READ-FORK.md` — options (a)–(d), criteria C1–C6, sub-forks SF1–SF4, the D-407 displacement evidence.
- `docs/forge/BACKLOG.md` Wave 1 pre-position (capture EXTERNAL_MUTATION, siblings READ, one plugin per class — "do not fix the catalog; split the partition").
- `tooling/gates/forge-surface.ts` (stage 5d) one-risk-class-per-plugin + refusal-tests-required; D-406 record — the catalog freeze; `fixtures/mines/synthetic-v0/MANIFEST.json` (42 files, rootHash-pinned).
- `docs/forge/annex/OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §5 — mine rows are new writes, not migrations; the receipt is a governed-event row from the first byte.
- Ratified: landed in `5cbd629`; quick gate green post-landing; full gate green on the record's tree (1056/0, host flat 1500/1500); directive-class per D-364 — no boot-security surface touched, zero code.
