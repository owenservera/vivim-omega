# D-391 — Lineage unification: merge the D-340 kernel lineage into main (kernel adoption + B5 re-amendment)

## Status

RATIFIED

## Context

Two lineages diverged at turn-009 (`4a108d7`): the **kernel lineage** (`omega` branch — D-340 Rust-core parity: host graph/genesis/state/audit/contract modules, `vivim.kernel-lens`, 650/650 tests incl. the ghost pressure suites) and **main** (D-350…D-390: remediation waves, chat, watchdog, multi-OS seam, discovery/provider ecosystem, intent mechanism, the D-390 history reset). Zero overlap after the base — main's host had no kernel modules; omega had none of D-350+. The owner directed unification ("yes — think holistically"), which forces the integration method AND the B5 reconciliation (D-365 froze host at 1,100; the kernel's host-critical subset costs 411 lines on top of it). D-390's own lesson applies directly: history operations must never strand cited SHAs.

## Options

| Criterion | (a) True merge: omega → main, both parents preserved (recommended) | (b) Rebase omega's 5 commits onto main | (c) Cherry-pick kernel files, no history |
|---|---|---|---|
| Evidence chains | Every cited SHA on both sides resolves (D-340's RATIFIED citations live via the second parent; main's D-389/D-390 citations via the first) | Strands D-340's landing SHAs (`c45602b`, `5c8d27b`, `7883922`) — re-creates exactly the D-390 orphan-set failure the tree just repaired | The 650/650 green record and D-340's citations become dead references; the kernel lands as unverifiable assertion |
| B5 honesty | One loud amendment (1,100 → 1,500), freeze re-instated, kernel lines itemized in this record | Same amendment, but on a rewritten lineage the record's own citations are weaker | Same amendment, weakest provenance |
| Conformance cost | Compositions via the D-377 matrix path (16 → 17 specs, zero hand-maintenance — the freeze's actual concern); drift fingerprints mirror demo shapes; risk parity holds (lens ops are READ) | Identical tree content, all the above minus history | Identical tree content, all the above minus provenance |
| Future merges | The pattern generalizes: merge-or-record, never rebase (D-390 consequence line, now load-bearing) | Sets the opposite precedent | Ditto |

## Decision

**Decision:** (a) — merge, never rebase: `git merge omega` into `main`, both parents preserved; the kernel adopts the D-390 host shape (grafted wiring, not file clobber — their ports/boot/recipe won structurally, the kernel ops ride the evolved router); B5 re-amended once and loudly 1,100 → 1,500 with the freeze re-instated at the new ceiling; compositions grow 16 → 17 strictly through the `_matrix.json` → generator path; `vivim.kernel-lens` joins the plugin ecosystem under the existing risk-parity and conformance nets.

## Consequences

- The merge commit is the landing citation; D-340 keeps RATIFIED (its SHAs resolve through the second parent); D-341 stays PROPOSED and carries forward on the open board.
- Host LOC 1,450/1,500 — 50 lines headroom under the re-frozen ceiling; D-365's removal-in-same-commit rule applies unchanged at the new number.
- The composition count leaves D-370's "16" — recorded here as the freeze amendment: the 17th spec is matrix-authored (the freeze's target was hand-maintained drift, and matrix rows carry none).
- CURRENT-INVARIANTS B5/budget-watch rows updated in the same commit; the kernel-lens manifest rides the D-389-era optional-field schema unchanged.
- Lineage rule hardened by practice: any future fork unification merges (or records first); rebasing a cited history is the one move this repo has already paid D-390 to learn not to make.

## Evidence

Owner directive (chat, 2026-09-18): "yes think holistically" — the unification authorization this record executes. Lineage facts machine-verifiable in this tree: `git merge-base main omega` = `4a108d7` (shared turn-009 base); `git rev-list --count omega` = 57 (52 base + 5 kernel-wave commits `c45602b`, `5c8d27b`, `7883922`, `0b58641`, `a30c9c8` — all resolvable via the merge's second parent); main-side head pre-merge `a97bcbe` (gate 903/903, host 1,039/1,100, quick-gate reproduced green in the merge workspace before integration). Merged-tree facts: host 1,450/1,500 (gate math); compositions regenerate byte-identical from `_matrix.json` (17 rows); kernel/ghost suites and the D-340 benchmark harness land with the wave. Landed in the merge commit `1d32a0d` (both parents: `a97bcbe` main + `a30c9c8` omega); full gate GREEN on it twice per D-364 cooling-off — 941/941 pass, 0 fail, 2 pre-existing skips, attest green, host 1,450/1,500 — stamped `ada4262` (D-367 directive fast-path: same-day ratification lawful; the second run is recorded anyway). Owner directive chat 2026-09-18: "yes think holistically."
