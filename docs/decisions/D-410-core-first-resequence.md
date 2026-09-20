# D-410 — Core-first re-sequencing: the Core Phase (S1 → S2 → S3) precedes all plugin work

## Status

RATIFIED

## Context

The structural pass (`docs/forge/annex/OMEGA-CORE-STRUCTURAL-ANALYSIS.md`, commissioned by the owner's "any more core omega work needed — structurally, not tactically") graded the distance to the end vision: two hard seams (S1 canonical-intent, HARD, volume-clocked; S2 principal-identity, MEDIUM-HARD), one open choicepoint (S3 evidence-store), one invariant (compaction never deletes). Everything else — all forge plugin build-out, all new surfaces and engines — is tactical on top of the substrate Wave 0 and the D-3xx decisions already paid for. The wave arc as drawn puts plugin work first (Wave 1 = capture + five vertical slices + the W5 atom). The owner's directive this round, verbatim: *"But your skipping ahead still to plugin design park all plugin design until you have the core omega ready then identify if there are any plugins needed before parallel work - upgrade omega to that state."*

## Options

| Criterion | (a) Core Phase first: S1→S2→S3 as the next wave sequence, ALL plugin design parked, plugin-identification pass at core-ready, parallel work after (recommended — the owner's directive) | (b) Wave 1 as drawn (plugins interleave; seams ride later waves) | (c) S1-only rides first, rest as drawn |
|---|---|---|---|
| Retrofit cost (the S1 volume clock, B2) | Zero pre-seam rows written — the clock closes by construction | Waves 1–2 write retrofit surface (chat rows, surfaces, policies against untyped payloads) | Chat-path protection only; S2/S3 clocks keep running |
| Fidelity to the owner's directive | Verbatim | Contradicts it | Partial |
| Parallel-work readiness | The plugin register exists before any parallel stream opens | Parallelism arrives ad hoc, unregistered | Same |
| First user-visible light | Latest (core seams first) | Earliest | Middle |
| Decision hygiene | The blocking fork (OD-1/D-409) decided and parked cleanly; displacement class closed | Queue-jump pressure continues | Partial |

## Decision

**Decision:** (a) — the Core Phase precedes all plugin work: omega upgrades to **core-omega-ready** first; all plugin design is parked until then; a plugin-identification pass runs at core-ready, before parallel work opens.

## Consequences

- **Core-omega-ready milestone** (falsifiable; the annex re-sequence doc §2 is the working definition): **S1** cut — one canonical writer path for intents (ns `intent`/`intent-plan`), law decisions citing `{intentRef, payloadHash}`, the four-state resolution (UNDERSTOOD / AMBIGUOUS / REFUSED / EXECUTED) as rows, the `intent.cancel` silent-no-op defect fixed with a regression test that fails on the old code, one live path routing interpret → persist → gate → execute → resolve; **S2** cut — principal identity rows with the non-reuse invariant, new identity-bearing writes resolving through records, existing keyed history NOT re-typed; **S3** called by the owner (fold law-journal into the vault vs sidecar chain) and the decided shape landed, audit-chain persistence point either way; **C** — "compaction never deletes a revision, period" explicit in namespace law.
- **Parked-plugin register** (annex re-sequence doc §3): `forge-mine-capture`/`forge-mine` implementation (D-409's decided shape), `forge.mine.capture@1` against synthetic-v0, the five vertical-slice boundaries, the W5 atom as drawn, the remaining forge ops (survey/assay/shape/emit/proof/tier), the assembly plugin, GEN_SPECULATIVE_STALE hardening, all new-plugin design. The park lifts ONLY via the plugin-identification record at core-ready.
- **Not parked** — wiring of *existing* machinery the seams require (`plugins/vivim-intent`, the law journal's citation shape, `contracts/src/intent.ts`, namespace-law rows, existing compositions routing through the canonical path). Seam work on existing assets is core work; designing new capability plugins is parked. A seam provably requiring a new plugin lands that exception as its own record first — named, never assumed.
- Wave-arc timing statements in D-407/D-408 (Wave 1 scope as drawn: both mines, vertical slices, W5 at exit) are **superseded by this record's sequencing**; the vision text itself is untouched — it is direction, not schedule.
- The program review's §5.1 matrix (S1-in-Wave-1: a/b/c) resolves here in favor of the seam-first family, extended to the full shortlist; bottleneck B2 closes by construction; B1's displacement class closes with D-409.
- Zero code this round; zero host LOC; anvil untouched; composition count unchanged at 18. Directive-class per D-364.

## Evidence

- Owner directive, verbatim (2026-09-20): *"Decision made split plugin. But your skipping ahead still to plugin design park all plugin design until you have the core omega ready then identify if there are any plugins needed before parallel work - upgrade omega to that state."*
- `docs/forge/annex/OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §4 (the S1/S2/S3 shortlist with R-triggers), §5 (the tactical map — what hangs on what).
- `docs/forge/annex/OMEGA-PROGRAM-ACCELERATION.md` §5.1 (the matrix this record resolves), §3.2 (B1 displacement proven, B2 the volume clock).
- `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` — the milestone definition, parked-plugin register, post-core sequence, and falsifiers of the ordering itself.
- D-408 (the amended vision the core work structurally supports — restored and ratified this round); D-409 (the same round's split-plugin decision).
- Ratified: landed in `5cbd629`; quick gate green post-landing; full gate green on the record's tree (1056/0, host flat 1500/1500); directive-class per D-364 — no boot-security surface touched, zero code.
