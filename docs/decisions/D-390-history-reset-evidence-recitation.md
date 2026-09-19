# D-390 — History-reset evidence reconciliation (re-citation of pre-reset landing SHAs)

## Status

RATIFIED

## Context

On 2026-09-18 the remote `main` line was deliberately re-based onto the adopted
`vivim-omega-latest` tree: the working line `owner-wave-001` became `main`
(commit `6d6a3ad`), the adoption wave landed as `f780d06` ("Adopt
vivim-omega-latest (6): time-traveled update, docs/migration refreshed"),
and `.github` actions were removed in the same sequence. The decision records
RATIFIED before the reset cite their landing commit SHAs from the pre-reset
history — real evidence at ratification time, but `git cat-file` cannot
resolve them in the re-based history, so the decisions checker (D-364, "RATIFIED
requires a resolvable commit SHA in Evidence") now fails on ~20 records whose
substance is untouched and whose ratification was genuine. Editing RATIFIED
records is forbidden — but the checker-demanded evidence-repair precedent
exists (D-388's record: "D-387 Evidence repaired with its landing citation,
checker-demanded, D-384 precedent, no substance edit"), and a gate the tree
cannot pass by any lawful path is a broken arbiter, not a strict one.

## Options

| Criterion | (a) One directive record + mechanical Evidence re-citation lines | (b) Teach the checker an old→new SHA alias table | (c) Leave the gate red until each wave re-lands |
|---|---|---|---|
| Record integrity | Original SHAs preserved verbatim; the re-citation line ADDS a resolvable attestation, changes no decision/options/context | Records untouched — but the gate silently accepts dead SHAs via a code path, weakening the arbiter | Records untouched; every future wave inherits a red decisions stage |
| Gate honesty | No gate code changes; the checker still demands a real, resolvable SHA | The alias makes `cat-file -t` return "commit" for SHAs that do not exist — dishonest verification | The red stage stops being signal (teams route around it) |
| Cost | One script, one line per affected record, reviewable as a diff | Gate change + falsifier + its own D-record; slower with the same outcome | Re-landing 20 waves is rewrite, not reconciliation |

## Decision

**Decision:** (a) — a single directive authorizes a mechanical, additive Evidence re-citation
for exactly the RATIFIED records left SHA-orphaned by the reset: append one
standard line under `## Evidence` citing adoption commit `f780d06` as the
attestation of the pre-reset landing state, preserving every original SHA and
word of the record. No other section may change; no decision, option, or
consequence is rewritten; the checker's law is unchanged. The re-cited records
are enumerated by the mechanical pass (every RATIFIED record whose Evidence
holds no resolvable SHA on the day of this record), and the pass must print its
file list for the commit message. Ratification of this record cites the first
green gate run that includes the re-citation commit.

## Consequences

- The decisions stage returns to green without weakening the checker or
  touching any record's substance; pre-reset evidence remains visible in full.
- Future history operations that strand SHAs repeat this pattern: a directive
  record first, then a mechanical additive re-citation — never silent edits,
  never checker aliases.
- The re-citation line is data (a fixed template), so a future consolidation
  pass can verify it mechanically and prune nothing.

## Evidence

Reset sequence on `main`: `f780d06` (adoption) → `6d6a3ad` (owner-wave-001 as
new remote main) — both resolvable in the current history. Orphan set observed
by `bun run omega:quick` decisions stage on 2026-09-18 (20 records, D-313…
D-388); the mechanical pass output is archived with the setup commit. Falsifier:
`omega:decisions` green after the pass, decisions checker self-host test
(`tooling/gates/test/decisions.test.ts` "live register + records validate
clean") green on the same tree. Ratified: re-citation landed `1adb540`, first
green gate including it `a97bcbe` (903/903, host 1039/1100, second run per
cooling-off); 21 re-citation lines verified present at ratification.
