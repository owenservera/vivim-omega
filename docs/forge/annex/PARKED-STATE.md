# PARKED STATE — omega ↔ vision separation

**Date:** 2026-09-20 · **Owner direction (verbatim):** *"We are not yet at build
decisioning — keep omega and the vision separate for now, as we will want to
atomize the end-state vision first, then think through deeply if there is any
more core omega work needed to support the end vision (work required
structurally, not tactically)."*

## PARK LIFTED — 2026-09-20 (same day, re-entry executed)

The park's exit conditions were met and the owner directed the upgrade:
*"Decision made split plugin. But your skipping ahead still to plugin design
park all plugin design until you have the core omega ready then identify if
there are any plugins needed before parallel work - upgrade omega to that
state."*

- The atomization (94 atoms), the structural pass (S1/S2/S3 shortlist), the
  consolidation integration, and the program review are all complete — the
  separation the park protected has served its purpose.
- **Re-entry executed this round:** D-408 restored from `18d0ea8` and
  ratified; the working set landed in-repo as `docs/forge/annex/`; D-409
  records the owner's split-plugin decision (implementation parked);
  D-410 records the core-first re-sequencing (Core Phase S1→S2→S3 precedes all
  plugin work; plugin identification at core-omega-ready; parallel work after).
- **The new park is plugin design** — not the repo. The repo is live again;
  every new-plugin design item is parked until core-omega-ready per D-410
  (register: `OMEGA-CORE-FIRST-RESEQUENCE.md` §3, landed in the annex).
- From re-entry on, working material is authored **in the repo annex** — this
  directory is the historical mirror of the park era, kept for the record.

## What was parked, and why

The prior round had already landed the amended vision in-repo as **D-408
PROPOSED** (commit `18d0ea8`, docs-only: vision 308→713 lines, the six-section
decision record, and its index row). It was never ratified and never bundled.
Per the owner direction above, the vision must travel **separately** from omega
until the atomization and the structural pass are done — so the unratified
proposal was withdrawn from the branch and preserved here, restoring omega to
its last ratified law. PROPOSED records are modifiable before approval by the
repo's own convention; RATIFIED history is never edited. Nothing was lost.

## Before / after

| | before park | after park |
|---|---|---|
| branch `wave0-omega-forge` | `18d0ea8` (D-408 PROPOSED) | `476be50` (D-407 ratification tip — the last RATIFIED state) |
| working tree | `M build/status.json` (gate-evidence churn from the PROPOSED tree — discarded; regenerable) | clean |
| open-questions board | 1 open (D-408) | 0 open (as ratified at D-407) |
| bundle ledger | `_3` ↔ `476be50` (tip desynced) | `_3` ↔ `476be50` — **realigned**; bundle `_3` is again the exact round input |
| quick gate on parked tree | — | **green**, 2026-09-20T03:24:44Z (host 1500/1500 flat, all structural stages pass) |

## How to restore the parked proposal

The commit object remains in the repository (recoverable by SHA even after
reflog expiry, provided no gc has run):

```
git -C vivim-omega branch restore-d408 18d0ea871775e7799165559137dcc7406d7db380
```

Restoring gives back: the amended vision at `docs/forge/OMEGA-ENDSTATE-VISION.md`,
the record at `docs/decisions/D-408-endstate-amendment.md`, and the index row in
`docs/BUILD-DECISIONS.md`.

## What this directory holds

| file | what it is |
|---|---|
| `OMEGA-ENDSTATE-VISION.md` | the amended 713-line vision, **working copy** (separation header prepended) — the atomization target |
| `D-408-endstate-amendment.md` | the PROPOSED record verbatim (six sections; all corpus citations verified that round) |
| `BUILD-DECISIONS-at-d408-proposed.md` | the decisions index as it stood at `18d0ea8` (the D-408 row included) |
| `OMEGA-VISION-ATOMS.md` | the vision decomposed into atomic end-state claims |
| `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` | the structural pass: which atoms require core omega work — structurally, not tactically |
| `OMEGA-CONSOLIDATION-INTEGRATION.md` | the integration companion: the Consolidated Core (uploaded 2026-09-20) reconciled against this working set — supersession ledger, the D-389 collision de-collided, and the extracted material the set does not carry (AKB strategy G0–G3, two-track ground truth, Wave 1 capture-vs-READ fork, S0 zero-state, the five-step forge ceremony, tooling absorption, adjacent-work placement, 12 axioms + kernel planes, the OD-1…OD-9 open-decision register, ship posture) |
| `OMEGA-PROGRAM-ACCELERATION.md` | *program-side* — the pre-Wave-1 systematic review of operational tooling, processes, and program design: inventory + assessment, the root-cause thesis (the program as its own first customer), the B1–B10 bottleneck register (evidence-tagged; gate wall-clock honestly recalibrated to 64s), accelerator designs A1–A12, the S1-in-Wave-1 reconciliation matrix, the chosen build order, restraint register, and falsifiers of the review itself |
| `OD-1-CAPTURE-VS-READ-FORK.md` | *program-side* — the Wave-1-blocking fork pre-analyzed to lift-ready form: the repo's six-section record grammar, options scored against six criteria, recommended (a) split-plugin (capture = EXTERNAL_MUTATION, own directory; siblings = READ), sub-forks SF1–SF4 named. At lift: next open D-id (realistically D-409) |

When the owner is ready to land the vision (however the constitution prescribes —
the D-408 record restored, a fresh amendment record, or another class), these are
the re-entry artifacts. Nothing in this directory is a decision.
