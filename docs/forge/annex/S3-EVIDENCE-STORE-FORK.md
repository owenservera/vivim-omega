# S3 · The evidence-store choicepoint — fork file (lift-ready, owner call)

**Annex fork file, 2026-09-20.** Pre-analyzed per the program review's A5
design (forks arrive at decisioning *analyzed*, in the repo's own record
grammar, so deciding = choose + lift, not analyze + author). This is not a
repo record. It is **the last open Core Phase item** (D-410's milestone row
S3) and — unlike S1 and S2, which the owner's directive queued for immediate
execution — it is **a genuine architectural choice the structural analysis
deliberately reserved for the owner** ("an owner call to make later, with a
closing window"). At lift it becomes the PROPOSED decision record under the
then-next open D-id — **D-416** (D-413 the program tooling round, D-414 the
round-close automator round, and D-415 the invariants round are all ratified
2026-09-20; the S3 lift will be the scaffold's first owner-call record).

**Measured volume (the window's clock, per D-410's falsifier — MEASURED
2026-09-20 on the D-413 tree, one full-gate corpus run):** **7,145 law-journal
rows across 65 scratch journals** — 5,000 of them the D-387 `jh-large`
deliberate volume fixture, 1,310 the chat-pilot run, ~835 across the other 62
suites. All ephemeral (scratch dirs, nothing deployed, zero persistent rows
anywhere); the runtime journal is test/demo volume only. The window is wide
but the cost of unification grows with every row, which is exactly why the
number belongs in the record: **the choice must be called before the first
real deployment writes governance rows at volume, not after.**

## Status

**LIFTED — D-416 (RATIFIED 2026-09-20).** The owner's call came with the standing
directive ("upgrade omega to core omega ready"); the lift took the recommended
(a) fold-into-vault, argued against the named criteria, not past them. The
volume clock was re-measured at lift — 7,145 rows / 65 journals / one full-gate
run, byte-identical to the number above (D-414/D-415 added zero journal-writing
tests; the window never moved). This file is the record's lifted source — the
record (`docs/decisions/D-416-evidence-store.md`) supersedes it wherever the
two disagree; it stays as the pre-analysis for the record's provenance.

## Context

Three evidence stores with mismatched strengths (verified on the working
tree, D-410/D-411/D-412 era): the **vault changelog** — hash-chained, CAS,
boot-verified, but its rows are object state, not governance narrative; the
**law journal** — the governance narrative (gate decisions, consents,
refusals, principal registrations since D-412, intent citations since D-411),
but a plain unsigned best-effort FILE (`law-journal.jsonl` via the host's
journalAppend port) that vault verification explicitly does not cover
("not a vault ns", acknowledged in namespace law); and the **kernel audit
chain** — signed ed25519, hash-chained, but in-memory only, exported through
`HOST_OPS.auditChain`, persisted nowhere — it evaporates on shutdown.

The tension (the structural analysis §4.3, verbatim in spirit): the evidence
atoms (CON-14, CON-16, CON-18 — the governed event, "why" as a query, replay)
want governance evidence to be as tamper-evident and replayable as everything
else — and today the most important narrative lives in the weakest store,
while the strongest signature machinery evaporates.

**Blocks:** core-omega-ready (the milestone's last row — D-410's definition
requires S3 *called and landed*).

## Options

Scored against named criteria — C1 tamper-evidence (governance rows under a
verifiable chain) · C2 replayability (governance narrative folds like object
state) · C3 blast radius now (rows/paths touched by the migration) · C4 the
audit chain (persistence point either way) · C5 volume-clock honesty (cost
grows with journaled rows until called).

| Option | Shape | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|
| **(a)** Fold law-journal rows into the vault | law.check/consent/grant/refusal rows become ns `law` vault appends (the ns exists — the forbidden overlay and principal records already live there); the sidecar file becomes a boot-replay convenience or dies | yes — under the changelog chain + CAS | yes — the governed event is a fold like any other | medium — the journal write path moves from the host port to the vault port (plugins already hold the caps in agent); the FILE stays readable for transition | unaffected — the audit chain needs its own persistence point regardless | closes the clock for the narrative rows |
| **(b)** Sidecar keeps the narrative; gains its own chain + signature | `law-journal.jsonl` becomes hash-chained + signed (the audit chain's ed25519 machinery, persisted) | yes — its own chain | no — two replay disciplines, two verification stories, forever | small — one file's format | partially solved — the SAME signing machinery persists, but as the sidecar's, not the kernel audit's | the narrative clock keeps running per row |
| **(c)** Defer again | unchanged | no | no | zero now | unaddressed | the window closes silently — "cheap now" expires without anyone deciding anything, which is itself a decision |

## Decision

**Decision:** TBD while unlifted — **recommended (a)** fold-into-vault: one
chain, one verification story, one replay discipline; the governed event was
already generalized (D-408) precisely so narrative and state share a
substrate; ns `law` already exists with the right owner; and the vault's
append path is the only write path the program trusts end-to-end today. The
audit chain's persistence point (C4) is common to both options and can land
first, either way: a consumer (the law plugin or a small auditor surface)
drains `HOST_OPS.auditChain` at close/shutdown into a vault ns — **zero host
LOC** (the export already exists), which keeps B5 flat.

## Consequences

- If **(a)** lifts: law's journaling writes ns `law` rows (ids
  `journal:<causationId>` or a sequence family) with the same best-effort
  discipline (a law decision is never blocked by a journal failure — the
  failure is logged, the row is lost loudly, never silently); the D-411
  intent citations and D-412 principal events ride the same chain; the
  sidecar file becomes a read-only transition artifact with its own
  deprecation note in namespace law; the web console's socket relay reads
  the vault instead of the file.
- If **(b)** lifts: the sidecar gains `{seq, prev_hash, sig}` framing and a
  verify tool; the vault/ns law rows stay what they are today; two
  verification stories are documented as the permanent cost.
- Either way: **the audit chain gains a persistence point** — the common
  core, landable independently and first.
- The falsifier (the analysis's own): if law-journal volume grows past
  trivial before this is called, option (a) silently prices itself out
  versus (b) — the call must carry the measured volume number, and this
  file's clock paragraph is where it starts being tracked.

## Evidence

- The structural analysis §4.3 (the choicepoint, rendered without a verdict
  on purpose); §6's falsifier (the closing window as a decision-by-default).
- `plugins/vivim-law/src/index.ts` — the `journal()` helper (best-effort,
  `HOST_OPS.journalAppend`); `host/src/ports.ts` — the audit chain's
  in-memory export; `docs/VAULT-NAMESPACES.md` — ns `law` (forbidden overlay
  D-325, principal records D-412) and the "not a vault ns" acknowledgment.
- D-411 (intent citations in law journal rows), D-412 (principal events) —
  the narrative families that would ride the fold.
- D-410's milestone row S3 + its falsifier ("the S3 fork file must carry a
  measured volume number at call time so the expiry is visible") — **the
  number is now carried above, measured on the D-413 tree**; re-measure at
  lift if more than trivial rows land in between.
