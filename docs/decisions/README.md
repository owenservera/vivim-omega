# The Decision Contract (v1)

Decisions with clear eyes: every consequential choice in this repo is recorded as a
**decision record** — options, criteria, evidence, verdict — and the gate enforces the
shape. Prose in chat is not a decision. A table row without a record is not a decision.
A `RATIFIED` without evidence is not ratified.

## Where things live

- `docs/BUILD-DECISIONS.md` — the **index**: one row per decision (`D-NNN`), append-only.
  Rows `D-210`–`D-312` are the index-only era (grandfathered, see §4).
- `docs/decisions/D-NNN-<slug>.md` — the **record**: the full matrix for one decision.
  Required for every index row `D-313` and up.
- `tooling/gates/decisions.ts` — the **checker**: validates index ↔ record consistency
  and record shape. Runs as the `decisions` stage of `bun run omega:gate`
  (and standalone via `bun run omega:decisions`).

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

What it deliberately does NOT check: whether the decision was *wise*. That is the
owner's job and the reviewer's job. The contract guarantees the decision is
*legible* — options visible, criteria explicit, evidence cited — so wisdom is auditable.
