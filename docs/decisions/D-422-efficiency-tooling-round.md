# D-422 — Operational-efficiency tooling round — A13–A17 land: the brief, the gate output discipline, the docscan, the entry brief, the ledger home

## Status

RATIFIED

## Context

- The owner's directive, verbatim, 2026-09-20: **"Implement the recommendations
  then commit and output the full bundle /// the recommendations need to come
  from fixing what you found in: docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md."**
  This record cites that line as the owner's call — the same citation discipline
  as D-408/D-409/D-410/D-418 — and lands the audit's §4 register (A13–A17 + the
  harness worklog law) as ONE tooling round, the D-413 shape: several small
  tools, shared tests, zero host LOC.
- The audit's measured case: the course-correction turn ingested **≈418 KB of
  tool payload for ≈6 KB of decision payload** (~70× transport overhead — B12),
  one expect-diff arrived embedded in 86.6 KB of passing-suite noise (B11), and
  reconstructing round state cost a measured 17-call entry storm (B3, priced for
  the first time). The audit's own one-line verdict: the rigor held — the waste
  was transport.
- Where each tool lives: `tooling/gates/brief.ts` (A13), `failures.ts` + gate
  flags (A14), `docscan.ts` (A15), `entry.ts` (A16), `round-close.ts`
  amendments (A17), `package.json` scripts. Zero host LOC; anvil untouched
  (the acceleration review §8 landing protocol).
- The audit's restraint register is honored verbatim: no A9 gate tiering (B8
  measured low again — the firehose was volume, not duration), no full-A8
  pull-forward (corpus-line verification stays post-Wave-1; A15 is the
  repo-self-contained slice only), no new mandatory ceremony (every tool here
  is a *reading* accelerator; nothing adds a required step), no claims of
  measured wall-clock savings (the honest units are payload overhead and
  hand-actions retired).

Blocks: none

## Options

| Criterion | (a) Land all five now, one round (the audit's §8 path) | (b) Defer to the next round | (c) Partial — A13/A14 only |
|---|---|---|---|
| The owner's directive | Executes it verbatim ("implement the recommendations") | Disobeys it | Partially executes |
| B-register coverage | B11 + B12 killed outright; B3's entry share halved; B7's self-contained slice tooled | All three keep biting every round | B11/B12 die; the entry storm and the hand-held scan keep biting |
| Round size risk | small-medium — five small tools, one shared test file, two small amendments | zero | small |
| Self-host provability | maximal — the close of this very round exercises all five | none | partial |
| Zero host LOC / freezes untouched | yes | yes | yes |

## Decision

**Decision:** (a) — the audit's landing path, executed on the owner's
directive. In substance:

- **A13 `omega:brief`** — the bounded read transport: `omega:brief D-418`
  (≤40-line record brief: status, class, blocks, supersession pointers, the
  generated Index meta, falsifier file pointers, option letters, the decision
  line), `--doc <path> --section <ref> [--row N]` (heading-substring section
  targeting with path:line prefixes; `--row` counts DATA rows — the doc's own
  numbering, the §28-row-3 case), `--since <bundle|rev>` (commits, files
  grouped, every record whose Status moved), `--headings` (the escape hatch).
  Read-only by construction; line-capped with an honest tail, never silent
  truncation.
- **A14 gate output discipline** — `--failures-only` (pass/skip lines
  suppressed; every failure renders as ONE line naming its STAGE_DOCS rule
  pointer via the new pure `failures.ts`; exit codes and status semantics
  unchanged) and `--stage <substrings>` (the TESTS stage targets matching test
  files; a targeted run SKIPS attest — the boot drill is evidence, not
  verification — and NEVER writes status.json: a partial run must not
  overwrite the carried full-run status, the D-362 stance). Default path
  byte-identical (F-5 pins it).
- **A15 `omega:docscan`** — the internal doc-logic scan as a tool (A8-lite,
  pulled forward): S1 supersede-target-exists (strict, all files), S2
  bold/bare marker-shape drift per file (span-aware: a `**…D-N…**` span is
  bold even with a parenthetical inside; quoted/backticked mentions are
  stripped — quoting both shapes is legitimate), S3 §-pointer resolution
  against the vision doc of record, S4 citation existence (strict from the
  generated era; ids < D-313 grandfathered per the checker's own law;
  hand-era files/rows grandfathered per A7's ratified consequence — including
  the RESET-NOTE retired range `D-340`–`D-349`), S5 annex README parity, S6
  banner coverage. `docs/migration/**` out of scope (the frozen historical
  corpus). **Report-only** (the D-415/D-368 adopt-observe-enforce pattern);
  the flip to a failing gate stage is a future record's call after one green
  wave of reports. Surfaced routinely via A16's finding count.
- **A16 `omega:entry`** — the one-command session brief: branch/tip, the last
  bundle + the ledger's resolved home + tip-advanced, dirty files with
  one-line classifications, status.json carriage/freshness/age, the open
  board + PROPOSED records (derived from the file-backed board — raw
  index-row scanning surfaces prose-word false positives from grandfathered
  rows, the D-213 bite), the docscan count, the harness worklog check, and
  the derived next-command block. Read-only: entry verifies, it never
  regenerates (the D-414 recorded default applied to entry).
- **A17 the ledger home** — `resolveLedgerDir` (order: `--ledger` flag > the
  repo-root `.ledger-path` pin > the D-414 default), refusals that print
  every searched candidate with its source, and the honest scope amendment:
  **the ledger README table is the ledger of record** — the delivery
  environment prunes delivered bundle files, so contiguity is demanded of the
  RECORDED rows (`ledgerContiguity`; a gap still refuses — the anti-lying
  property unchanged) while bundle FILES are demanded only for the last row
  (the double-run guard's list-heads input). scanBundles stands unchanged for
  its existing falsifiers. The pin is environment-local (gitignored); the
  ledger re-established at _11 in this environment's delivery folder with a
  preamble documenting the re-establishment.
- **The harness worklog law** (audit §4, zero repo LOC): the shared session
  ledger (`/home/z/my-project/worklog.md`, env-overridable) is appended by
  every round's agent before close; A16 checks and nags. Created this turn.

## Consequences

- The reading layer is tooled for the first time: the classes in the audit's
  §2 table (rows 1–5) are dead at the root — a brief or a section read
  replaces a full-file read; a failure line replaces a firehose; one command
  replaces the entry storm; the scan runs itself; the ledger hunt is over.
- What gets harder: five new surfaces to keep honest — each is fail-closed or
  report-only by explicit choice, each is falsifier-covered, and the output
  shapes are pinned by the tests (a brief that silently truncates or a filter
  that vacuously greens is exactly the failure mode the falsifiers refuse).
- The `--stage` scope is deliberately test-targeting, NOT a gate-stage
  registry refactor: the 305-line sequential gate's stage scheduling was
  never the measured pain (B8), and refactoring it is risk without a
  registered bottleneck. Named trigger for the refactor: a stage that must
  run in isolation without tests (e.g. re-running only attest on a slow box).
- The ledger-of-record amendment touches D-414's F-3 scope and says so in
  place: what relaxed is the assumption that delivered artifacts live
  forever; what did NOT relax is the refusal on gaps among recorded rows or
  a file beyond the table (a lying ledger still refuses).
- The docscan's report-only wave starts NOW: its findings (currently 0 on
  this tree — F-6's live lock) are visible in every `omega:entry`; the flip
  to failing needs its own record after one green wave.
- Revisit trigger: none scheduled. The audit's A8-full (corpus-line
  verification) lands post-Wave-1 as scheduled — this round deliberately
  does not pull it forward.

## Evidence

- The efficiency audit itself: `docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md`
  — the measured ledger (≈418 KB / ≈6 KB, the 17-call entry tax), the
  B-register reconciliation (B3/B11/B12), the A-register extension, the
  restraint register this record honors.
- **F-1..F-8 (`tooling/gates/test/efficiency-tooling.test.ts`, 28 tests, green
  in this record's tree BEFORE the flip per D-364):**
  F-1 the record brief ≤40 lines with the payload present and the matrix
  prose absent, clean named refusals; F-2 §/row targeting with path:line
  prefixes (the vision doc's §28 row 3 names the D-418 substrate call and no
  longer names Ollama-pilots — the audit's own F-2 scenario, reproduced live
  by `omega:brief` during this record's authoring: the self-host proof);
  F-3 `--since` resolution + bounded shape; F-4 the failure renderer (the
  _11 missing-bold desync renders as one line naming its rule; the vacuous
  green filter refuses); F-5 the gate flags e2e (targeted run: `statusWritten:
  false`, attest skipped, status.json byte-unchanged; default path untouched);
  F-6 the docscan live lock (0 findings on the fixed tree) + injected S1/S2/
  S4/S5 fixtures; F-7 the entry brief (pure classification + e2e read-only,
  tree unchanged by the call); F-8 the ledger home (resolver order, searched
  paths named, the scratch-pin honored, row-gap refusals, pruned-file shape).
- Self-host, every tool exercised on this record's own round: the record was
  brief-read (A13), the tree scanned clean by A15 before the flip, round
  state entered via A16 (its fixes — the D-213 phantom, the porcelain
  first-line trim bite — were found by running it), and the close runs
  through the A17-pinned ledger with `--failures-only` verification (A14).
- Full gate green ×2 on this record's tree (numbers cited at ratification);
  quick gate green; host flat 1500/1500; zero host LOC; anvil untouched;
  compositions 18.

- Ratified on greens (evidence-class, falsifiers F-1..F-8 green in this record's tree BEFORE the flip per D-364): landing commit a00113f; full gate green 1175/0 ×2 on the PROPOSED tree (2026-09-20T14:12:54Z, 14:14:34Z); the self-host line held at every step — the record was brief-read (A13), the tree scanned clean by A15 pre-flip (its one finding — this record's own unbackticked mention of the retired `D-349` — caught and fixed pre-flip, the report-only tool catching its own author exactly as designed; the same mention re-surfaced in THIS ratification line and was repaired additively under the D-390 precedent, the bite class now twice-documented), round state entered via A16 (its own two bites — the D-213 index-prose phantom and the porcelain first-line trim — found by running it), and the close runs through the A17-pinned ledger with A14 verification; post-ratification green follows at close-out; zero host LOC; anvil untouched.

## Index

summary: A13-A17 from the efficiency audit land as one tooling round: omega:brief (record/section/since briefs — the bounded read transport), gate --failures-only + --stage (one-line failures naming their STAGE_DOCS rule; targeted verification that never writes status), omega:docscan (the repo-self-contained doc-logic scan, report-only), omega:entry (the one-command session entry), and the ledger home (the .ledger-path pin + searched-paths refusals; the README table is the ledger of record)
rationale: the efficiency audit measured ~418 KB of transport for ~6 KB of decision payload and a 17-call entry storm — B3/B11/B12 made concrete; where a tool exists the failure class is dead, where none exists the hand pays — the owner's directive lands them now
class: evidence
