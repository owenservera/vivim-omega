# D-413 — Program tooling round — the record scaffold, generated index rows, the blocks field, the cross-track registry

## Status

RATIFIED

## Context

- The acceleration review (annex `OMEGA-PROGRAM-ACCELERATION.md` §6, build-order row 3) scheduled **A1+A4+A7 as the first tooling round at re-entry**; the core-first re-sequencing (D-410) displaced it behind S1/S2, and with S3 now awaiting the owner's call, this is the executable round ("continue as far as you can" — the boundary is the S3 call itself, per D-410's milestone row).
- The trap class is live, not hypothetical: the D-410 index first-word trap bit during re-entry ("caught and rephrased — the trap class the acceleration review registered, biting once more").
- The displacement class is proven: D-407 queue-jumped the partition decision (review §B1); the board has no priority semantics today.
- The cross-track collision is real: omega:D-389 vs akb:D-389 (the Consolidated Core draft numbering), de-collided as OD-9; more akb-sourced material arrives with the vision corpus, so the citation law must precede it.
- All of this lives in `tooling/` + `docs/` only — zero host LOC, anvil and B5 freezes untouched (review §8's landing protocol).

Blocks: none

## Options

| Criterion | (a) A1+A4+A7 now, as scheduled | (b) Defer all tooling until after S3 | (c) A1 only (drop A4/A7) |
|---|---|---|---|
| Trap class killed before the next record | yes — the next PROPOSED (the S3 lift) is scaffolded, never hand-typed | no — at least one more hand-typed row in between | partially — rows generate, board stays blind |
| Displacement visible before parallel work | yes — the board sorts blockers first exactly when parallel decisions begin | no | no |
| Cross-track law precedes the vision corpus | yes — registry + lint land before any akb-sourced citations | no | no |
| Round size risk | medium — three small tools, one grammar, shared tests | zero | small |
| Edits to RATIFIED records | zero — the generated era starts at this record; D-312 and below and the D-313..D-412 hand era stay untouched | zero | zero |

## Decision

**Decision:** (a) — the scheduled build order, restored: the scaffold, the generated index rows, the blocks field, and the cross-track registry land together as one tooling round.

## Consequences

- Records from D-413 on (the generated era) **require** an `## Index` section (`summary:` / `rationale:` / `class:` lines) and their BUILD-DECISIONS row is **generated** from it — `omega:new-decision` appends it at scaffold time, `omega:questions --write` regenerates it, the checker requires byte-equality. Hand-editing a generated-era row goes red at the gate.
- `omega:new-decision <slug> --class evidence|directive --title --summary --rationale` scaffolds record + row together; the class is explicit, never defaulted (the D-351 drift class).
- Records may carry a `Blocks:` line (Context); vocabulary is checker-validated (`none | Core Phase | Wave 1..7 | parallel work`); the board gains a Blocks column and sorts blocking-first, then D-number.
- Cross-track citations: bare `D-NNN` in the known-collision set warns (report-only) from the generated era on; `docs/decisions/CROSS-TRACK-REGISTRY.md` is the naming law; a lock test pins the page and the checker constant together.
- Deferred with named triggers: the wave-red board view (a wave whose blocker has no record shows red — trigger: the first wave-scoped PROPOSED); retrofitting `## Index` into D-313..D-412 records — **declined**: RATIFIED-never-edit outweighs byte-stability; the D-390 additive-repair precedent is reserved for repairs, not conveniences.
- A2+A12 (the round-close automator + the toolchain pin) remain the next tooling round per the review's build order — first use at the next bundle cut.
- The S3 lift moves from "realistically D-413" to **D-414** (annex fork file + BACKLOG updated in the same round).

## Evidence

- **F-0 (self-host):** this record was scaffolded by `omega:new-decision` and its index row is the generated row — the tool forges its own record; the commit is the proof.
- **F-1 (scaffold-by-construction):** `tooling/gates/test/new-decision.test.ts` — scaffold → full `checkDecisions` clean on a scratch tree; the emitted file is byte-exactly `recordTemplate`.
- **F-2 (row-equality bite):** same file — a one-word hand edit to the generated row fails with `index row is not the generated row`; unit fixtures in `decisions.test.ts` cover missing `## Index`, empty lines, illegal class, status words (case-insensitive), pipes.
- **F-3 (byte-stability):** `regenerateIndexRows` restores a drifted row byte-exact, leaves hand-era rows verbatim, and is idempotent (second pass: `{changed: 0, appended: 0}`).
- **F-4 (blocks vocabulary + board order):** illegal `Blocks:` values fail with the vocabulary named; `computeOpenQuestions` sorts blocking-first then D-number; the board renders the Blocks column.
- **F-5 (cross-track lint):** a bare citation of the colliding id in a generated-era record warns; the qualified spellings (`akb:D-389` / `omega:D-389`) stay silent; hand-era records are grandfathered silent; the registry page ↔ `KNOWN_TRACK_COLLISIONS` lock test goes red on drift.
- Standing directives: the review's grant ("you get to choose") + D-410's post-core sequence (A1/A4 "wants to land before parallel work") + the owner's "continue as far as you can".
- Landed in `085f79a`: falsifiers F-0..F-5 green in the record's tree BEFORE the flip (D-364); full gate green 1089/0 ×2 on the PROPOSED tree (2026-09-20T06:02:29Z and 06:04:18Z, host flat 1500/1500, anvil untouched); this row flipped by `omega:questions --write` — the generated-row era's first ratification is its own proof.
- Post-ratification green re-run recorded in `build/status.json` (the D-364 cooling-off bar, held beyond the B1–B4 minimum: this round touches no boot security, zero host LOC).

## Index

summary: A1+A4+A7 — the tooling round the acceleration review scheduled as its build-order row 3: the record scaffold, generated index rows, the blocks field, the cross-track registry
rationale: kills the proven hand-typed-row trap class and the queue-jump displacement class at the root; landed while S3 awaits the owner call; zero host LOC
class: evidence
