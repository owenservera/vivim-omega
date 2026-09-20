# D-415 — Invariants pass #2 + the freshness stage — A3, the digest on trigger, not calendar

## Status

RATIFIED

## Context

- The acceleration review's build-order row 4 (annex `OMEGA-PROGRAM-ACCELERATION.md` §6): "immediately after" row 3 — it "fixes a *present* law-reading gap before Wave 1 adds another layer". D-413 landed row 3; D-414 landed row 5 (the review's "first use at the next bundle cut" anchored A2 to `_8`); this round closes row 4.
- The gap is measured, not hypothetical: pass #1 of `CURRENT-INVARIANTS.md` was as-of D-364 + the D-365…D-370 owner wave; since then **45 records ratified** (D-371…D-414) — Wave 0's forge constitution, the Core Phase seams, the generated-row era, and the program tooling layer were all absent from the read-first page. A fresh reader mis-stated the law today (B5's registered cost: "fresh readers mis-state the law").
- The review's A3 design: the digest regenerates **on trigger** (a wave closes; a B-law or gate stage is added or amended; 30 ratifications accumulate — whichever first); enforcement starts report-only; the digest is generated from the decision records, not from memory.
- S3 remains the owner's call (D-410's ratified milestone row) — this round is the executable path while it waits, per the standing "continue as far as you can"; zero plugin design touched.
- All of it lives in `tooling/` + `docs/` — zero host LOC; anvil and B5 freezes untouched.

Blocks: none

## Options

| Criterion | (a) Pass #2 + report-only stage, as designed | (b) Pass #2 only (no stage) | (c) Stage failing from day one |
|---|---|---|---|
| Present gap closed this round | yes | yes | yes |
| The NEXT gap is caught mechanically | yes — staleness is a measured, named state | no — the calendar guess repeats | yes, but |
| Adopt-observe-enforce (D-368→D-402) | yes — one green wave of reports, then a record flips it | no stage to flip | no observation period — a stale report becomes a red gate before anyone has read one |
| Round size risk | small-medium — one digest rewrite, one small stage | small | small |
| Zero host LOC | yes | yes | yes |

## Decision

**Decision:** (a) — pass #2 regenerated from the decision records (as-of D-415, marker + stage inventory), plus the report-only `invariants-freshness` gate stage; the flip to failing is a future record's call after one green wave of reports.

## Consequences

- `CURRENT-INVARIANTS.md` is **pass #2**: the boot-security laws (B5 now 1500/1500 flat, zero headroom), the Ω laws + the compaction-never-deletes law (D-410 C), the Core Phase seam laws (D-411 canonical intent + citations; D-412 principal identity + non-reuse), the Omega Forge constitution (D-404 anvil freeze, D-405 generality axis, D-406 catalog freeze + forge-surface + the mine + self-hosting stance), the program law (D-408 vision, D-409 partition, D-410 re-sequencing, D-413 generated-row era, D-414 round-close + toolchain pin, D-415 this page's own law), the migration-readiness layer (D-376…D-383), driver lane + polyglot tier, budget watch updated to current numbers.
- The digest carries a **machine-readable marker** (`<!-- invariants: pass N · as-of D-NNN · regenerated … · stages: … -->`): the as-of for the ratification trigger, the stage inventory for the drift trigger.
- **The `invariants-freshness` stage (gate 5e, in `--quick`)**: computes staleness from the marker, the decisions index, and the stage registry (`explain.ts` `STAGE_DOCS` — the canonical list, now including the stage itself); **reports** — `stale: true` + named triggers in the detail, stage stays green. Mechanical breakage (unreadable digest, malformed marker) FAILS — a gate stage, not a suggestion.
- **T3 (wave closure) deferred with a named trigger**: no mechanical wave registry exists; the trigger for implementing it is the first forge wave closure landing WITH a registry to read (status.json's waves array extended to the forge waves, or a BACKLOG wave marker). Until then wave-closing records are caught by T1 within bounded distance — recorded honestly, not papered over.
- The **live lock test** pins the real digest's marker to the real `STAGE_DOCS` (the D-403 doc-drift class): the digest and the stage registry can no longer drift apart silently.
- The flip to failing: after one green wave of reports, its own record (the D-368→D-402 pattern — adopt, observe, enforce).
- The S3 lift stays **D-415 → next open at lift** (this round takes the id; ids allocate at lift, never reserved — the same re-id D-413/D-414 performed).

## Evidence

- **F-1 (marker):** `tooling/gates/test/invariants-freshness.test.ts` — well-formed marker parses (pass/as-of/stages); marker-less digests return null (the pre-era page REPORTS stale, never fails shape); malformed markers throw with the format named.
- **F-2 (triggers):** fresh case clean; T1 fires at exactly `RATIFICATIONS_TRIGGER` (30) ratified rows past as-of and not at 29; T2 fires both directions (a live gate stage the digest does not document; a documented stage the gate no longer runs) with the stage names in the trigger text; no-marker reports with regeneration named.
- **F-3 (report-only):** a stale digest on a scratch tree → `ok: true` + `stale: true` + triggers in the detail; a marker-less digest → green report; malformed marker / unreadable digest → **mechanical FAIL** with the issue named. The policy string lands in the detail ("report-only … the flip to failing is a future record's call").
- **F-4 (the live lock):** the REAL digest's marker matches the REAL `STAGE_DOCS` exactly (13 stages) and covers the ratified rows — the digest and the registry cannot drift apart silently; this test is the round's standing proof.
- **F-5 (the `-->` leak regression):** a marker ending `stages: … tests -->` parses without a phantom `--` stage — bitten while writing the parser (the first `[a-z- ]*` class ate the comment's dashes), caught by the falsifier before the gate ever ran.
- The digest itself cites its sources per section (the records named inline); pass #1's still-true material is retained, its stale numbers corrected (host 1500/1500 flat, anvil 856/860, compositions 18, tests 1102+ at the D-414 tip).
- Standing directives: the review's grant + build-order row 4; the owner's standing "continue as far as you can", executed to the S3 owner-call boundary per D-410's milestone row.
- Landed in `882324e`: falsifiers F-1..F-5 green in the record's tree BEFORE the flip per D-364 (13 tests, `tooling/gates/test/invariants-freshness.test.ts`); full gate green 1115/0 ×2 on the PROPOSED tree (2026-09-20T09:08:26Z and 09:09:58Z, host flat 1500/1500, anvil untouched); the live lock (F-4) green on the record's own tree — the digest and the stage registry pinned together in the round that lands both; the row flips to RATIFIED by `omega:questions --write` (1 regenerated, 0 appended).


## Index

summary: A3 — the acceleration review's build-order row 4: CURRENT-INVARIANTS.md regenerated from the decision records (pass #2, folding in Wave 0's forge constitution, the Core Phase seams, the generated-row era, the D-391 B5 re-freeze) + the report-only invariants-freshness gate stage
rationale: closes the B5 gap — the digest was a full constitutional layer stale; fresh readers mis-stated the law today; staleness becomes a measured, named state with a machine-readable as-of marker and stage inventory
class: evidence
