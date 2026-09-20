# D-423 — The process self-model: `tooling/gates/process.ts` + the `process` gate stage

## Status

RATIFIED

## Context

- The owner's directive this turn: the program has a strict, rigorous
  development loop (decision records, the gate, the board, the ledger, the
  round-close ceremony — `AGENTS.md`) but that loop is entirely **manual**:
  an agent (or the owner) must run `omega:entry`, `omega:brief`, `omega:docscan`
  separately and hold the picture in its head. `vivim.mind` (Ω10, D-215)
  gives the *runtime* rich, principled self-knowledge — but the *development
  genome* that governs the runtime's own evolution has none. Two epistemologies
  for one system: the booted composition knows itself; the repo that builds it
  does not.
- **The seam this record respects, not crosses:** `vivim.mind` is a
  compartment plugin. D-215's falsifiability guarantee — "a wrong self-model
  is falsifiable against intact evidence" — holds only because a compartment
  sees evidence *exclusively* through ports (`import-surface`, B-2: compartment
  code never imports the host, never touches the filesystem or git directly).
  `docs/decisions/*.md`, `build/status.json`, the board, and the ledger are
  repo-filesystem and git facts — a different evidence class, structurally
  unreachable from inside a compartment. Making this a `mind.query@1` kind, as
  first discussed, would either (a) be a lie — no compartment can read git —
  or (b) require a new signed write path carrying dev-process facts into the
  vault, which is a real, separate, riskier change (named below, not built
  here).
- This record does the honest, in-boundary half: the **toolchain's own
  self-description**, consolidated. `entry.ts` (A16) and `docscan.ts` (A15)
  already each read `docs/decisions/*`, `build/status.json`, and the board
  independently; a third reading tool would be a third place for the same
  facts to drift. One pure derivation, reused, is the fix — the same move the
  program already made for `mind.snapshot`/`mind.query`/`mind.portrait`
  (one WorldModel-building machinery, several views) and for
  `invariants-freshness.ts` (the mechanical-ok/reported-fact split this record
  copies exactly).

Blocks: none

## Options

| Criterion | (a) `tooling/gates/process.ts`: pure derivation + report-only gate stage + `omega:process` CLI, consumed by `entry.ts` (recommended) | (b) A new `mind.query` kind reading git/decisions from inside the compartment | (c) Do nothing further — `entry.ts`/`docscan.ts` stay separate, hand-correlated by the reader |
|---|---|---|---|
| Honest about the evidence boundary | Yes — stays host-side tooling, same class as `entry.ts`/`docscan.ts`/`round-close.ts`; no claim of compartment evidence law over facts a compartment cannot see | No — `import-surface` (B-2) forbids compartment code from touching git/fs; this option cannot be built as stated without breaking B-2 | Yes, trivially — but leaves the gap open |
| Closes the actual gap named by the owner | Yes — one command / one gate stage now answers "where does the program stand," reused by existing tools instead of hand-correlated by the reader | Would close it fully IF buildable, but it isn't under current law | No |
| Risk / new surface | Small — one pure module + one report-only gate stage, same shape as `invariants-freshness.ts` (D-415); zero host LOC; zero new write path | Large — requires a new op, a new write path into the vault, composition-grant changes, and reopens D-215's falsifiability argument | None |
| Leaves the bigger move (vault-durable process facts) available later | Yes — named as D-424, not built, not foreclosed | N/A (this IS that move, half-designed) | Yes, but un-named — the next person re-discovers the same boundary from scratch |
| Self-host provability | High — the stage runs in this record's own gate, `entry.ts` dogfoods it in this round | Untestable without breaking the boundary first | N/A |

## Decision

**Decision:** (a) — `tooling/gates/process.ts` (pure `deriveProcessModel` +
`assembleProcessModel`, a report-only `process` gate stage mirroring
`invariants-freshness.ts`'s mechanical-ok/reported-fact split, and an
`omega:process` CLI), consumed by `entry.ts` as one additional summary line.
In substance:

- **`deriveProcessModel(root)`** reads, through the EXISTING parsers only
  (never a second parser to drift from the first): `build/status.json` (gate
  color + staleness vs HEAD, via the new pure `summarizeStatus`),
  `docs/decisions/*.md` + `docs/BUILD-DECISIONS.md` (the board and ratified
  count, via `decisions.ts`'s `listOpenQuestions`/`boardFreshness`/
  `parseIndexRows` — unchanged), docscan findings (via `docscan.ts`'s
  `scanDocs` — unchanged, still report-only per D-422), and the ledger home
  (via `round-close.ts`'s `resolveLedgerDir` — unchanged).
- **`assembleProcessModel`** is the pure core (evidence in, `ProcessModel`
  out, zero I/O) — unit-testable byte-for-byte without a repo on disk, the
  same split `buildPortrait`/`buildWorldModel` already use.
- **The `process` gate stage** (`checkProcess`, wired into `gate.ts`
  immediately after `invariants-freshness`, and into `explain.ts`'s
  `STAGE_DOCS`) is **report-only**: an open board, a stale `status.json`, or
  live docscan findings are facts this stage reports in the detail — never a
  gate failure. The judgment those facts feed (ratify? close the round?) stays
  exactly where `AGENTS.md` already puts it. Only mechanical breakage (an
  unreadable `docs/BUILD-DECISIONS.md`, a derivation throw) fails — the same
  discipline `invariants-freshness.ts` set at D-415.
- **`omega:process`** (new `package.json` script) prints the human-readable
  report or, with `--json`, the full `ProcessModel` — the same two-mode shape
  `omega:docscan`/`omega:entry` already offer.
- **`entry.ts`** gains one `Process:` line (gate color/staleness, board
  open/blocking, docscan count, program-size count of index rows) sourced from `checkProcess`,
  added without touching entry's existing dirty-file/ledger/docscan-detail/
  worklog lines or its tested output contract.
- **Explicitly NOT built here — named for D-424:** a `process.publish@1` op
  (write capability, a new or extended plugin, composition-grant changes)
  that would push a signed *summary* of this same model into the vault under
  a reserved namespace, making it legitimately visible to `mind.query@1`/
  `mind.portrait@1` as real vault evidence. That is the actual "natively
  embedded into omega, the tool governs itself" move — it is bigger, it adds
  a write path, and it deserves its own record, its own falsifiers, and its
  own answer to "who publishes, how often, and what does a stale published
  snapshot mean" before it lands. This record does not gesture at it as
  finished; it names the boundary precisely so the next record starts there
  instead of re-discovering the seam.

## Consequences

- A fourth reading tool does NOT get added — `process.ts` is a fourth VIEW
  over the same three-and-a-half already-tested readers (`decisions.ts`,
  `docscan.ts`, `round-close.ts`, `build/status.json` itself), so a fix to any
  one of them (say, a `boardFreshness` bug) is inherited automatically by both
  `entry.ts` and `omega:process` rather than needing a second patch.
- `entry.ts`'s existing output grows by exactly one line; no existing line,
  helper function, or test assertion is touched or removed (verified: the
  full `efficiency-tooling.test.ts` suite — 28 tests covering A13–A17 —
  passes unchanged against the edited `entry.ts`).
- The `process` gate stage is one more report-only surface to keep honest,
  same as `invariants-freshness`/`docscan`: it is falsifier-covered (F-1..F-5
  below) and mechanically fails rather than silently passing on a broken
  read.
- **What this does NOT do, stated plainly so it isn't mistaken for D-424
  later:** it does not give `vivim.mind` any new visibility, it does not add
  a write path anywhere, it does not change any composition's grants, and it
  does not make dev-process facts vault-durable or journaled. The runtime and
  the development genome remain two separate evidence classes after this
  record lands — this record makes the *tooling* class coherent, it does not
  merge the two classes.
- Revisit trigger: D-424 (the `process.publish@1` seam) is a follow-on record,
  not scheduled by this one — its own falsifiers must answer staleness/cadence
  questions this record deliberately leaves open by not crossing the seam.

## Evidence

- `tooling/gates/process.ts` (new — `summarizeStatus`, `assembleProcessModel`,
  `deriveProcessModel`, `renderProcessReport`, `checkProcess`), wired into
  `tooling/gates/gate.ts` (the `process` stage, placed immediately after
  `invariants-freshness`) and `tooling/gates/explain.ts` (`STAGE_DOCS.process`).
- `tooling/gates/entry.ts` (amended: one `Process:` line, sourced from
  `checkProcess`; no other line changed).
- `package.json` (`omega:process` script, alongside the existing `omega:entry`/
  `omega:docscan`/`omega:brief`).
- **F-1..F-5 (`tooling/gates/test/process.test.ts`, 15 tests, green in this
  record's tree BEFORE the flip per D-364):** F-1 `summarizeStatus` — present/
  absent/unparseable/all-green/one-failing/head-mismatch, all pure; F-2
  `assembleProcessModel` — determinism (same evidence twice ⇒ byte-identical),
  correct counts/grouping, a `Blocks: none` row never counts as blocking; F-3
  the gate stage is report-only — the live tree's `checkProcess()` is
  `ok:true` regardless of board/gate content, and mechanical breakage (a
  nonexistent root) fails named; F-4 the live lock — `deriveProcessModel`
  runs clean against the real repo tree, `proposedIds` and `board.open` name
  the identical set; F-4 also pins that the program-size count is the count of RATIFIED index rows (127 at this tip — the whole program incl. grandfathered hand-era rows), NOT `decisions.ts`'s record-file count (102, a subset: records with a file), so the two never get conflated; F-5 `renderProcessReport` surfaces every field (gate
  color, stale flag, board rows with blocks/TBD markers, docscan by-rule
  counts, ledger resolution) with no silent drop, matching the "a brief that
  silently truncates is worse than no brief" discipline D-422 already set.
- Self-host, exercised in this record's own round: `bun run tooling/gates/
  process.ts` and `--json` run clean against this tree; `bun run tooling/
  gates/gate.ts --quick` shows `✓ process` immediately after
  `✓ invariants-freshness`; `bun run tooling/gates/gate.ts --explain` lists
  the `process` stage's scan/allowlist/rule; `bun run tooling/gates/entry.ts`
  prints the new `Process:` line correctly, including an honest `STALE` flag
  observed live (this record's own edits post-date the last committed
  `status.json`).
- Full gate green ×2 on this record's PROPOSED tree (D-364's evidence-class
  discipline), both 1190 pass / 0 fail with the `process` stage green between
  `invariants-freshness` and `tests`: the first started 2026-09-20T15:30:11Z,
  the second ran directly after (the prior tip's 1175 plus this record's 15 new
  falsifiers); docscan 0 findings; the checker clean. `CURRENT-INVARIANTS.md`
  moved to pass 4 (stage-drift trigger) and its pin in
  `invariants-freshness.test.ts` moved with it in the same commit. The
  `efficiency-tooling.test.ts` suite (entry/brief/docscan/failures) re-verified
  green against the amended `entry.ts`; zero host LOC; anvil untouched.
- Program-size vs record-file counts: the `Process:` line reports RATIFIED
  index rows (127 at this tip); the checker's own `ratified` figure counts
  record files (102). Both are correct measures of different things and F-4
  pins which one this tool reports.

- Ratified on greens (evidence-class, falsifiers F-1..F-5 green in this record's tree BEFORE the flip per D-364): landing commit cf7a8d5; full gate green 1190/0 ×2 on the PROPOSED tree (2026-09-20T15:30:11Z and the run directly after, 15:31:56Z–15:33:37Z); the checker clean, docscan 0 findings; the self-host line held (the record was checked by the very tooling it describes, and its own first index draft was caught by the D-410 status-word trap and repaired pre-flip); post-ratification full gate re-run follows at this commit; zero host LOC; anvil untouched. The vault-durable follow-on is `D-424`, ratified as a design commitment only.

## Index

summary: tooling/gates/process.ts consolidates the process self-model (gate color/staleness, board open/blocking, docscan findings, program-size count, ledger home) into one pure derivation, exposed as a report-only gate stage, an omega:process CLI, and one new line in omega:entry — closing the gap where vivim.mind knows the runtime but nothing knows the development genome, without crossing the compartment evidence boundary (B-2) that a runtime-visible version would require
rationale: the owner's directive named a real gap — a rigorous dev loop the system cannot see itself — but the honest fix respects import-surface (B-2): a compartment cannot read git/docs, so this lands as consolidated host-side tooling (Path 1) and explicitly names, without building, the vault-write seam (D-424) that would be needed to make it runtime-visible (Path 2)
class: evidence
