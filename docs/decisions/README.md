# The Decision Contract (v3 — D-414)

Decisions with clear eyes: every consequential choice in this repo is recorded as a
**decision record** — options, criteria, evidence, verdict — and the gate enforces the
shape. Prose in chat is not a decision. A table row without a record is not a decision.
A `RATIFIED` without evidence is not ratified.

## Where things live

- `docs/BUILD-DECISIONS.md` — the **index**: one row per decision (`D-NNN`), append-only.
  Rows `D-210`–`D-312` are the index-only era; `D-313`–`D-412` the hand-typed era; from
  **`D-413`** rows are **generated** from the record's `## Index` section (see §“The
  generated-row era” below).
- `docs/decisions/D-NNN-<slug>.md` — the **record**: the full matrix for one decision.
  Required for every index row `D-313` and up.
- `docs/decisions/CROSS-TRACK-REGISTRY.md` — the cross-track citation law (D-413, A7).
- `tooling/gates/decisions.ts` — the **checker**: validates index ↔ record consistency
  and record shape. Runs as the `decisions` stage of `bun run omega:gate`
  (and standalone via `bun run omega:decisions`).
- `tooling/gates/new-decision.ts` — the **scaffold** (`bun run omega:new-decision`, D-413):
  emits a record that passes the contract by construction, plus its generated row.
- `tooling/gates/round-close.ts` — the **round-close automator**
  (`bun run omega:round-close`, D-414): the bundle/sha256/ledger-row ceremony as
  one fail-closed command (see §“Round close” below).

## Record format

One file per decision, named `D-<n>-<slug>.md`. Exactly these `##` sections, in order:

1. `## Status` — one of `PROPOSED`, `RATIFIED`, `SUPERSEDED`, `REJECTED`, on its own line.
   Optional second line: `Superseded-By: D-NNN` / `Supersedes: D-NNN` (required when
   status is `SUPERSEDED`).
2. `## Context` — what forces the choice, in ≤10 lines. Links to code, not vibes.
3. `## Options` — a markdown **matrix**: options as rows (or columns), evaluation
   criteria as the other axis, one verdict cell each. Must contain at least one
   `| … |` table. A recommendation MAY be marked `(recommended)` on exactly one option.
4. `## Decision` — first line `**Decision:** <option name> — <one-line why>`.
   The named option MUST appear in the Options matrix. `TBD` is legal only while
   `PROPOSED` and means "matrix open, owner call pending" — it still names the
   recommended option after an em dash.
5. `## Consequences` — what gets harder/easier, what must be revisited, in bullets.
6. `## Evidence` — required non-empty for `RATIFIED`: at least one commit SHA
   (7–40 hex chars) resolving in this repo (`git cat-file -t <sha>` is `commit`),
   and/or the gate run that went green on it. `PROPOSED` records SHOULD cite
   supporting analysis (doc sections, assessment files); the checker requires
   the section to exist, evidence strictness applies at ratification.
7. `## Index` — **required from D-413 on** (optional before): exactly three lines —
   `summary:` (the row's Decision cell), `rationale:` (the row's Rationale cell),
   `class:` (`evidence` or `directive`). One line each, no `|`, no status words —
   the index row is generated from these, byte-exact.

## Lifecycle

```
PROPOSED ──(owner confirms / gate green on the change)──▶ RATIFIED
    │──(owner rejects / better option wins)──▶ REJECTED (terminal, never deleted)
    │──(replaced by a newer record)──▶ SUPERSEDED (terminal, points at successor)
```

- Status moves forward by editing the record's `## Status` line AND the index row's
  status cell in the same commit. The checker fails a `RATIFIED` index row whose
  record is not `RATIFIED`, and vice versa.
- Index rows are append-only: never renumber, never delete. Supersede, never edit
  (the D-210… register convention, unchanged).
- `REJECTED` records stay in the tree: rejected options with reasons are how the
  next person avoids re-litigating them.

## What the checker enforces (and grandfathers)

- Every `docs/decisions/D-*.md` has all six sections, a legal status, a matrix
  table under Options, and a `**Decision:**` line naming an option from the matrix.
- Every index row `D-313+` has exactly one matching record file (glob
  `docs/decisions/D-<n>-*.md`); rows `< D-313` are exempt (index-only era).
- Every `RATIFIED` record (any number) has Evidence containing a resolvable commit SHA.
- Statuses agree between index row and record file both directions.
- **D-364:** every index row `D-360+` carries a class tag — `· evidence` or
  `· directive` — in its status cell (see below).
- **D-413 (A1):** every record `D-413+` carries `## Index` (summary/rationale/class,
  no status words, no pipes) and its index row is **byte-equal to the generated
  row** — hand-editing a generated-era row fails the gate with the regeneration
  command named.
- **D-413 (A4):** a `Blocks:` line, when present, must be inside the vocabulary
  (`none | Core Phase | Wave 1..7 | parallel work`).
- **D-413 (A7), report-only:** bare citations of cross-track collision ids
  (`D-389` today) warn in records `D-413+`; track-qualified forms are silent.

What it deliberately does NOT check: whether the decision was *wise*. That is the
owner's job and the reviewer's job. The contract guarantees the decision is
*legible* — options visible, criteria explicit, evidence cited — so wisdom is auditable.

## Decision classes (D-364)

From **D-360** on, every index row declares its class in the status cell — one tag,
visible at a glance, gate-enforced:

- **`· evidence`** — the decision is backed by a probe/test falsifier that exists in
  the tree (a D-351-class catch, an adversarial case, a measured benchmark). The
  record's Evidence section names it. These are the rows the gate process's
  load-bearing claim rests on.
- **`· directive`** — an owner call (naming, placement, process, scope). Legitimate
  and fast; honestly labeled so an auditor knows which rows survived a falsifier
  and which record intent.

The tag is `**RATIFIED** · evidence` / `**PROPOSED** · directive` etc. — appended
to the status cell, never a new column. Rows before D-360 are grandfathered untagged
(the audit trail stays as it was; the consolidation page carries the synthesis).

## The generated-row era (D-413, A1) + the scaffold

From **D-413** on, the index row is not hand-typed data — it is a derivation:

```
bun run omega:new-decision <slug> --class evidence|directive \
  --title "…" --summary "…" --rationale "…"
```

scaffolds the record (six sections in order, bare `PROPOSED`, a seeded `(a)/(b)/(c)`
matrix, `Blocks: none`, the `## Index` meta) **and appends the generated row** —
the record passes the contract by construction, and the hand-typed-row trap class
(the D-410 first-word bite) is unexpressible: the checker requires the row to be
byte-equal to `generateIndexRow(record)`. `bun run omega:questions --write`
regenerates all generated-era rows (byte-stable when clean) alongside the board;
ratification flips the record's Status and regenerates the row in the same commit.
The one-liners must not contain status words or `|` — the scaffold refuses them,
the checker flags them if they arrive by hand. Retrofitting `## Index` into
D-313..D-412 was deliberately declined (RATIFIED-never-edit outweighs
byte-stability); the eras are named boundaries: `< D-313` index-only,
`D-313..D-412` hand-typed, `D-413+` generated.

## Blocks (D-413, A4) — what an open decision waits on

A record MAY carry one `Blocks: <value>` line (in Context). The vocabulary is
closed and gate-checked: `none | Core Phase | Wave 1 | Wave 2 | Wave 3 | Wave 4 |
Wave 5 | Wave 6 | Wave 7 | parallel work`. The open-questions board renders a
Blocks column and sorts **blocking-first, then D-number** — the program's true
serialization (owner attention on blockers) sorts to the top. Default when the
line is absent: `none`.

## Cross-track citations (D-413, A7)

A bare `D-NNN` in this repo always means THIS ledger. Foreign tracks are cited
track-qualified (`akb:D-389`); the known-collision set lives in
`docs/decisions/CROSS-TRACK-REGISTRY.md` and in the checker's
`KNOWN_TRACK_COLLISIONS` — a lock test pins them together. From D-413 on, a bare
citation of a colliding id produces a **report-only warning** at the decisions
stage (never a failure); the qualified spellings are silent.

## Cooling-off for B1–B4 evidence-class decisions (D-364)

Boot-security laws are where a same-day rubber stamp costs the most. For an
**evidence-class decision that touches B1–B4**:

1. The named falsifier (the adversarial test or probe that would catch the regression)
   must be IN the record **before** the status flips to RATIFIED — not referenced
   afterward. (Several pre-360 rows already do this — D-352, D-357 — it is now the template.)
2. A second gate run must follow ratification (the status-refresh re-run counts).
   Same-day ratification stays legal for **directive-class** rows — solo-owner speed,
   honestly labeled.

## Consolidation pass (D-364)

Every ~30 ratified decisions (or once per wave-set, whichever comes first), refresh
`docs/decisions/CURRENT-INVARIANTS.md` — the one-page snapshot of present-day law
(B1–B5 in current language, the Ω laws, the adapter inventory, watchdog policy,
process law). A fresh reader (human or new agent instance) should be able to state
the top-5 invariants from that page alone. The full log is never pruned, rewritten,
or renumbered — the page is a synthesis layer, the log stays the audit trail.

## Team surface: open questions board

`docs/decisions/OPEN-QUESTIONS.md` is the generated, browsable view of every PROPOSED
record — the set of open questions, each with its recommended position and what it's
awaiting. Regenerate it after any record change:

```bash
bun run omega:questions --write   # renders the board from the records at HEAD
bun run omega:decisions           # validates index ↔ record contract (gate stage)
```

The file carries a `<!-- base: <sha> -->` marker; the gate's `decisions` stage reports
board freshness (`fresh`/`stale`/`missing`) in its detail output — informational only,
never failing. A stale board means someone changed records without regenerating.

## Round close (D-414 — A2)

The bundle protocol's ceremony runs as one command, fail-closed:

```bash
bun run omega:round-close --note "<round description>" --evidence "<gate evidence>" [--dry-run]
```

Preflight refuses (named, nothing written) unless: the tree is clean, the quick gate
is green, the decisions contract is green, the board is fresh, the committed
`build/status.json` is green and its head is an ancestor of HEAD, the ledger's bundle
numbering is contiguous, and HEAD advanced since the last bundle (double-run guard).
On green it cuts `git bundle create --all`, verifies it, computes sha256, and appends
the ledger README's table row **generated from git data** (tip, tree hash, sha256 —
`8…8` truncation; `--note`/`--evidence` are one-line cells without `|`). It then
prints the next-round entry block, derived from BACKLOG + the open board. The close
**verifies** board/status freshness — it never rewrites them; the regen steps belong
to the ratify step. `--dry-run` rehearses the preflight and renders the row without
writing. The toolchain pin (A12) rides in `build/status.json` (`toolchain` field);
`verify-status` reports committed-vs-fresh drift, never failing on it.

## How to propose (team workflow)

0. New decision? Start it with `bun run omega:new-decision <slug> --class
   evidence|directive --title … --summary … --rationale …` — the record and its
   index row land together, passing the contract by construction. Then fill the
   six sections; never hand-type a row from D-413 on.
1. Read `OPEN-QUESTIONS.md`, pick a row, read its record — Options matrix first.
2. Argue *against the criteria by name* (PR/discussion). New evidence goes where the
   record's domain lives (vault refs, gate runs, benchmarks) and gets cited.
3. To change the matrix itself (new option/criterion): edit the record in a branch —
   the checker's shape rules apply — and regenerate the board in the same branch.
4. Ratification flips Status + index row together with evidence; the checker enforces it.
