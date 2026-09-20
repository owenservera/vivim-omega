# Handoff — Round 4 (re-entry: the vision ratified, the program re-sequenced core-first)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`476be50` (the parked tip, bundle `_3`). This round lands **no code** — it
re-opens decisioning, ratifies the amended vision, and re-sequences the
program per the owner's directive.

## What landed

| D-item | Artifacts |
|---|---|
| D-408 (restored + ratified) | `docs/forge/OMEGA-ENDSTATE-VISION.md` (713 lines, verbatim from the parked commit `18d0ea8`), the record, the index row — the Sovereign Environment is law |
| Annex (A11) | `docs/forge/annex/` — the working set in-repo: atoms, structural analysis, consolidation integration, program acceleration, core-first re-sequence, the OD-1 fork file, the park record; README with the two-line status discipline (versioned, citable, never law) |
| D-409 (ratified) | The capture-vs-READ partition DECIDED (a) split-plugin by the owner — capture EXTERNAL_MUTATION own directory, siblings READ, catalog untouched; **implementation parked** |
| D-410 (ratified) | Core-first re-sequencing — Core Phase S1→S2→S3 precedes ALL plugin work; parked-plugin register (annex §3); plugin identification at core-omega-ready before parallel work; wave-arc timing in D-407/D-408 re-sequenced |
| Docs | `BACKLOG.md` re-sequenced (Core Phase next; mine wave parked); `ROADMAP.md` banner pointing at D-410 |

## Gate standing

Full gate **1056/0 green** on the PROPOSED tree (`5cbd629`) and again on the
ratified tree (`9304c30`, status refresh `3ba325f`); quick gate green
post-landing; host flat **1500/1500**; anvil untouched (856/860, 45 exports);
composition count unchanged at 18; board regenerated — **0 open**.

One checker trap bitten and caught live this round: the D-410 index row's
description cell contained the word "superseded" before the status cell
(first-word match) — the exact trap class AGENTS.md documents and the
acceleration review registered as B4; rephrased to "re-sequenced". The gate
caught it exactly as designed.

## Ambiguities recorded, defaults used

1. **Vision ratification without an explicit "ratify D-408" instruction** —
   the owner's directive ("upgrade omega to that state" — core omega ready for
   the end vision) was read as the re-entry trigger; the park's own exit
   conditions (atomization + structural pass) were complete. Default: restore
   and ratify D-408 verbatim in the same round as the re-sequencing records,
   citing the directive. If the owner disagrees, supersession is the
   constitutional remedy.
2. **Handoff numbering** — round 3 (the dream) closed via PARKED-STATE.md
   instead of a handoff; handoff numbering realigned to bundle numbering
   (this file ↔ bundle `_4`).

## Next round's exact entry point

**Core Phase, first D-item: S1 — the canonical-intent seam** (D-410's
milestone, first row; the structural analysis grades it HARD and
volume-clocked — every pre-seam row is retrofit surface).

1. First command (falsifier baseline must still be green):
   `bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
   then `bun run omega:quick`.
2. Read the assets that already exist, declared and unwired:
   `contracts/src/intent.ts` (the full D-389 IR — IntentState machine,
   IntentStep, payloadHash, planRef, evidence refs), `plugins/vivim-intent/`
   (wired into zero of 18 compositions; `PendingIntent` consumed by nothing;
   the latent `intent.cancel` defect at `src/index.ts:233` — undefined
   `stepId` inside try/catch, the compensation-evidence write silently
   no-ops), `plugins/vivim-law/src/index.ts` (the gate — `evalPolicy` typed on
   who/which-op, blind to what), `plugins/vivim-nlcl-pure/` (the
   zero-import deterministic interpreter — `Interpretation` returned and
   discarded today), `docs/VAULT-NAMESPACES.md` (ns `intent` / `intent-plan`
   rows), `compositions/chat.json` + `console.json` (the existing live
   interpret→invoke path).
3. Author D-411 PROPOSED with the S1 design and its falsifiers *before* the
   code: the canonical writer path (ns `intent`), law decisions citing
   `{intentRef, payloadHash}`, the four-state resolution
   (UNDERSTOOD / AMBIGUOUS / REFUSED / EXECUTED) as rows, the defect fix with
   a regression test that fails on the old code, one live path routing
   interpret → persist → gate → execute → resolve.
4. Then S2 (principal identity rows + non-reuse invariant), then the S3 fork
   file (owner call: fold law-journal into the vault vs sidecar chain — the
   annex gets the lift-ready fork, `docs/forge/annex/`).

**Parked and not to be touched until core-omega-ready (D-410 register):**
all forge-mine plugin code, capture against the mine, the five vertical
slices, the W5 atom as drawn, the remaining forge ops, the assembly plugin —
the full register is `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
