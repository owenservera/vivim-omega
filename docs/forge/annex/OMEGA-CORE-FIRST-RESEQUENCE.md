# OMEGA CORE-FIRST RE-SEQUENCE — the program order decision (D-410 material)

**Working-set, 2026-09-20.** Owner direction, verbatim, this round:

> "Decision made split plugin. But your skipping ahead still to plugin design
> park all plugin design until you have the core omega ready then identify if
> there are any plugins needed before parallel work - upgrade omega to that
> state"

This document holds what that directive means operationally: the re-sequencing
itself, the definition of **core omega ready** (the milestone that un-parks
plugin work), the parked-plugin register, the post-core sequence, and the
falsifiers of this ordering. It lifts into the repo as **D-410** alongside
**D-409** (the split-plugin decision, lifted from the OD-1 fork file) at
re-entry.

| Field | Value |
|---|---|
| Status | Working material. The decision is the owner's (made; verbatim above); the records land through the constitution at re-entry. |
| Inputs | Owner directive (this round) · `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` (the S1/S2/S3 shortlist — the answer to the owner's own "any more core omega work needed, structurally, not tactically") · `OMEGA-PROGRAM-ACCELERATION.md` §5.1 (the S1-in-Wave-1 matrix this directive resolves) · `OD-1-CAPTURE-VS-READ-FORK.md` (decided (a) the same round) · repo `BACKLOG.md` + `HANDOFF-ROUND-2.md` (the Wave-1-as-drawn scope being re-sequenced) |
| Not authorized by this file | Anything. It authorizes nothing; the D-records do, after the gate. |

---

## 1 · The decision, restated precisely

1. **The capture-vs-READ partition is DECIDED**: option (a) split-plugin —
   capture is EXTERNAL_MUTATION in its own plugin directory, siblings are READ,
   the 24-op catalog untouched. Lifts as D-409.
2. **All plugin design is PARKED** — the OD-1 fork file's Consequences (plugin
   directories, refusal tests, SF1–SF4 landing in Wave 1) were exactly the
   skipping-ahead the owner is correcting: deciding the partition is not
   permission to design the plugins.
3. **The Core Phase precedes all plugin work**: S1 → S2 → S3 (+ the compaction
   invariant), the structural shortlist, in load-bearing order.
4. **At core-omega-ready**: a **plugin-identification pass** — which plugins
   (if any) the core actually needs — *before* parallel work opens.
5. **The task now**: upgrade omega to that state. The repo park is lifted;
   decisioning re-opens; the Core Phase is the next wave of record.

## 2 · What "core omega ready" means (the milestone)

The structural analysis already answered *what core work the end vision
requires*: two hard seams, one choicepoint, one invariant. Core-omega-ready :=
all four landed and ratified, each with its own D-record and falsifier:

| # | Item | Ready when (falsifiable) |
|---|---|---|
| **S1** | canonical-intent seam | Intents persist through **one canonical writer path** (ns `intent` / `intent-plan`, already declared in namespace law); the law gate's decisions cite `{intentRef, payloadHash}`; the four-state resolution (UNDERSTOOD / AMBIGUOUS / REFUSED / EXECUTED) lands as rows; the `intent.cancel` silent-no-op defect (fork-file evidence: undefined `stepId` inside try/catch) is fixed with a regression test that fails on the old code; at least one live path routes interpret → persist → gate → execute → resolve. |
| **S2** | principal-identity seam | Principal **identity rows** exist (a principal record namespace) with the **non-reuse invariant** enforced (recycled/ambiguous ids refused with a named refusal); new identity-bearing writes resolve through records; existing consent/grant/journal history is **not re-typed** — the indirection is cut so late key-binding never requires re-typing (R1 avoided by design, per the analysis). |
| **S3** | evidence-store choicepoint | The choice — (a) fold law-journal rows into the vault chain vs (b) sidecar with its own chain + signature — is **CALLED by the owner** and the decided shape landed; **either way** the kernel audit chain gains a persistence point (today it is in-memory only and evaporates on shutdown). |
| **C** | compaction invariant | "Compaction never deletes a revision, period" (the stronger form of today's convention — the F9 prerequisite) is held explicitly in namespace law, not just prose. |

Deliberately **not** in the milestone: every tactical-map item (analysis §5) —
surfaces, engines, schedulers, ceremonies, canvas, governor, mind spine. They
hang on V/R/C/L plus the seams; enumerating them is precisely what the
plugin-identification pass does at core-ready.

## 3 · The parked-plugin register

**REGISTER LIFTED 2026-09-20 by D-417 (RATIFIED)** — core-omega-ready was
reached (D-416), the plugin-identification pass enumerated the lanes (8
forge plugins covering the 23 unimplemented frozen-catalog ops + the Wave-2
assembly plugin; the core itself needs ZERO new plugins), and the park lifted
with its ratification. The table below is the HISTORICAL register — what was
parked, and why, for the record. Each lane's design now lands as its own
records when its lane opens.

Every plugin-design item in the current program, parked until core-omega-ready
(the park lifts only via the plugin-identification record):

| Item | Was scheduled | Parked state |
|---|---|---|
| `plugins/forge-mine-capture/` + `plugins/forge-mine/` implementation — partition **DECIDED** (D-409) | Wave 1 | No code lands; SF1–SF4 sub-forks stay named, unresolved |
| `forge.mine.capture@1` against `fixtures/mines/synthetic-v0/` (the first receipt) | Wave 1 | Waits; the mine stays rootHash-pinned |
| Five vertical-slice boundaries | Wave 1 | Boundary design parked |
| W5 conversation atom as drawn (person-types → streamed → law-gate → ledgered → queryable, both mines) | Wave 1 | Parked. S1's minimal routing of the **existing** interpret→invoke path is seam work, not the atom |
| `forge.survey/assay/shape/emit/proof/tier` | Wave 1+ | Declared in wire only, exactly as today |
| The assembly plugin (mind-spine carrier) | Wave 2 | Parked; S1's intent-cited assembly hook is the seam part that survives |
| GEN_SPECULATIVE_STALE caller/wave tracking hardening | Wave 1 | Report-only, as today |
| All other new-plugin design | any | Parked by rule |

**What is NOT parked — the line that keeps the park honest:** wiring of
*existing* machinery that the seams require — `plugins/vivim-intent` (exists),
the law journal's citation shape, `contracts/src/intent.ts`, namespace-law
rows, existing compositions routing through the canonical path. Seam work on
existing assets is core work; designing **new** capability plugins is parked.
If a seam provably cannot be cut without a new plugin, that exception lands as
its own record first — the exception is named, never assumed.

## 4 · The post-core sequence

1. **Core-omega-ready declared** — the §2 table all green, each item's
   D-record ratified, milestone record closes the Core Phase.
2. **Plugin-identification pass** — one record enumerating the plugins the
   core actually needs, drawn from (a) the tactical map's hang-on columns,
   (b) the frozen 24-op forge catalog, (c) the parked register above,
   (d) the seams' own consumer needs. Output: the plugin register — risk
   class, generality, refusal obligations per plugin — which becomes the
   parallel-work backlog.
3. **Parallel work opens** — multiple plugin streams under the existing
   per-record gate discipline. The acceleration review's A1/A4 tooling
   (record scaffold, `blocks` field) wants to land before this point so
   parallel rounds stay safe against the proven trap and displacement classes.

## 5 · What this re-sequencing resolves

- **The §5.1 matrix** (S1-in-Wave-1: a/b/c) — resolved in favor of the
  seam-first family and extended: not S1-minimal riding a plugin wave, but the
  whole structural shortlist before any surface volume. The volume clock
  (B2) closes by construction: the Core Phase writes no pre-seam rows.
- **The B1 displacement class** — the blocking decision (OD-1) is decided and
  recorded rather than queue-jumped again; Wave 1's entry point moves to S1
  with the plugin work explicitly parked, not silently deferred.
- **The re-entry question** (PARKED-STATE: "when the owner is ready to land
  the vision, however the constitution prescribes") — answered: restore D-408,
  land the annex, ratify with the re-sequencing records.

## 6 · Falsifiers of this ordering

- If the Core Phase stalls because a seam needed a parked plugin (the §3
  exception fires more than once), the park line was drawn wrong — the
  exception becomes a named review trigger, not a habit.
- If core-ready arrives and the plugin-identification pass finds **zero**
  plugins needed, "parallel work" was never plugin-shaped — the program's
  parallelism story needs rethinking (and the park will have cost nothing).
- If S3's window closes while the Core Phase works S1/S2 (law-journal volume
  grows un-called), "cheap now" expired silently — the S3 fork file must carry
  a measured volume number at call time so the expiry is visible.
- If any parked item's deferral is later shown to have cost **more** than
  cutting it early (retrofit evidence), that item's tactical-vs-structural
  grading was wrong — the structural analysis's own §6 falsifiers apply
  verbatim, item by item.
