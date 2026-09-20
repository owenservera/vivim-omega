# D-419 — The CDP-substrate lane: provider.browser goes live — attached to the open parallel work alongside the mine wave

## Status

RATIFIED

## Context

- The finding, checked directly against the tree at the register lift:
  `plugins/provider-browser/plugin.json` states the CDP leg is
  owner-machine-only future work and never silently simulated — today it
  runs only against fixture-recorded captures. `grep -n "cdp\|w2-b\|browser"
  docs/forge/BACKLOG.md` returned zero results at the time of the check: the
  wave that would make `provider.browser` go live existed only in the
  explicitly-superseded `ROADMAP.md` (W2-b) and in decision records that
  predate D-410's resequencing (D-338, D-357, D-381). What D-417 opened for
  parallel work is 8 forge lanes + the Wave-2 assembly plugin — all Forge
  self-extension machinery, none of it live-browser work.
- So: Core Phase closing and the register lifting did not move the product
  one inch closer to running against a real Chrome session. That thread has
  had no owner since the core-first resequencing began. The owner's
  directive is a *shipping* target ("the shipable first product … is fully
  chrome master slave", cited verbatim in D-418), not an architecture
  preference — and with D-418 fixing the substrate *documentation*, this
  record fixes the substrate *schedule*: the lane is named now, in the open
  parallel work, instead of surfacing undefined after 8+ lanes of forge work.
- The falsifier discipline already on file is adopted whole:
  `docs/ARCHITECTURE-NEXT-STEPS.md` §G5 — write down what "byte-identical"
  means for live-vs-fixture captures BEFORE coding the substitution test
  (identical after canonicalization, or identical modulo a documented
  volatile-field allowlist), then prove a live capture substitutes for
  `webmail-inbox/page.json` with zero classifier changes; if it cannot, the
  fixture format is what's wrong, not the provider.

Blocks: none

## Options

| Criterion | (a) Attach the CDP-substrate lane to the open parallel work now, sequenced alongside the forge lanes (recommended) | (b) Defer CDP behind the forge buildout (the forge lanes first, browser re-enters decisioning after) | (c) Defer the whole question — no lane named |
|---|---|---|---|
| "Shippable v1" definition | Defined now: the lane's exit falsifier is the live-capture substitution test — the product has a scheduled path to a real Chrome session | Undefined for another 8+ lanes' worth of work — the exact drift the course correction exists to stop | Undefined indefinitely |
| Resource conflict with the forge lanes | None in the gate's own terms: the CDP lane does not compete for the forge plugins' surface (one plugin boundary, `provider-browser`, separate from every `forge.*` lane) — the lanes can run at once | None (by construction — serial) | None |
| Attach-only discipline (D-301 lineage) | Preserved: attach-only first, the substitution falsifier before any navigation/write ambition; the D-338 authority bar (law-reviewed, day-one forbidden entries, fixture falsifier) still governs first live use | Same, later | Same, never |
| Sequencing honesty | The lane rides the un-parked register as a named parallel lane (this record is its identification; its design lands as its own records when it opens) — alongside, not behind | The lane re-enters decisioning post-forge, re-litigating context that is fresh today | The thread stays ownerless |

## Decision

**Decision:** (a) — name the lane now: `provider.browser`'s CDP substrate is
an explicit lane in the currently-open parallel work, attach-only first,
sequenced alongside the forge lanes rather than behind them (it does not
compete for the same plugin surface, so there is no real resource conflict in
running both at once). Per house convention this record identifies and
sequences the lane; it designs nothing — the lane's own design records land
when the lane opens, and the owner can still overrule at ratify through the
normal path. The lane's entry falsifier is §G5's, restated as the lane's
definition of done for its first slice: the byte-identical definition for
live-vs-fixture captures is WRITTEN BEFORE the substitution test is coded,
and a live capture substitutes for `webmail-inbox/page.json` with zero
classifier changes — or the fixture format gets fixed first, not the
provider. The D-338 authority bar (law-reviewed authority, day-one
forbidden-overlay entries, the D-380(1) byte-identical fixture rule) governs
first live use unchanged; `omega:containment`'s D-386 gate condition governs
any launched-process slice exactly as W2-c always required.

## Consequences

- `docs/forge/BACKLOG.md` gains the lane under the un-parked register:
  "Parallel lane — provider.browser CDP substrate (D-419) — OPEN, sequenced
  alongside the mine wave". The register's Wave-1 lane pair stays the first
  lane pair; this lane runs alongside it, not after the Wave-1+ buildout.
- The lane's first slice is falsifier-first: G5's definition-before-test
  discipline is the lane's own entry record's first obligation. No CDP
  navigation/write code lands before the substitution test's success
  criterion exists as written data.
- What gets harder: the parallel era now has two fronts (the mine wave and
  the browser substrate) — round close-outs must report both. What gets
  easier: "shippable v1" has a scheduled path; the owner's shipping target
  no longer depends on a lane nobody owns.
- Revisit trigger: if the substitution falsifier proves the fixture format
  is what's wrong, the fixture-format fix is its own record before the
  provider is touched (the G5 rule, now lane law).
- Rejected alternative, recorded so it is not re-litigated silently:
  deferring CDP behind the forge buildout would leave "shippable v1"
  undefined for another 8+ lanes' worth of work — the exact drift this
  record exists to stop.

## Evidence

- Course-correction briefing `OMEGA-COURSE-CORRECTION-001` §2 (the finding is
  cited to real file:line checks: both provider plugin manifests' stated
  postures; the BACKLOG grep's zero results; the D-417 lane list).
- `docs/ARCHITECTURE-NEXT-STEPS.md` §G5 + Phase-C C0 (the falsifier
  discipline adopted whole; the volatile-field allowlist question named
  there is the first thing the lane's design record answers).
- D-338 (the authority bar), D-357 (the M0 GATE composition — the
  shippable-v1 composition named by D-420), D-301 (attach-only), D-386 (the
  containment gate condition for launched processes), D-381 (the parser bar
  the fixtures answer to).
- Zero code in this record — the lane is identified and sequenced; its
  design records carry the falsifiers when it opens. Gate green ×2 on this
  tree (numbers cited at ratification); host flat 1500/1500; zero host LOC.

- Ratified on greens (directive-class, same-day per D-364): landing commit e6c6b09; full gate green 1175/0 ×2 on the round's PROPOSED tree (2026-09-20T14:12:54Z, 14:14:34Z — 1126 + 49 new falsifiers since bundle _11: the course-correction sweeps + the efficiency-tooling suite); zero host LOC; anvil untouched; compositions 18.

## Index

summary: provider.browser's CDP substrate becomes an explicit lane in the currently-open parallel work, attach-only first, sequenced alongside the forge lanes rather than behind them — the falsifier discipline is ARCHITECTURE-NEXT-STEPS G5: write down what byte-identical means for live-vs-fixture captures BEFORE the substitution test is coded (a live capture must substitute for webmail-inbox/page.json with zero classifier changes, or the fixture format is what is wrong, not the provider)
rationale: Core Phase closing and the register lifting moved the product zero inches closer to running against a real Chrome session — the wave that would make provider.browser live (W2-b) existed only in retired planning docs; the owner's directive is a shipping target, not an architecture preference, so the lane is named now instead of surfacing after 8+ lanes of forge work
class: directive
