# D-411 — Core Phase S1: the canonical-intent seam cut

## Status

RATIFIED

## Context

D-410 opened the Core Phase; its milestone's first row is S1, the structural analysis's HARD, volume-clocked seam (annex `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §4.1). The verified gap: the law gate is typed on *who* and *which op* and blind to *what*; the deterministic interpreter's `Interpretation` is returned and discarded (the console collapses interpret→invoke); `vivim.intent` is wired into zero of 18 compositions; `PendingIntent` is consumed by nothing; the `intent.cancel` compensation-evidence write silently no-ops on an undefined `stepId` inside try/catch (`plugins/vivim-intent/src/index.ts:233`); and `payloadHash` is not a hash (`"sha256:" + raw JSON`, `src/index.ts:107`). The constitutional claim — probabilistic perception, deterministic intent, deterministic execution; the law consumes canonical intent only (D-408 §2, the NLCP) — currently has no artifact for the law to consume.

## Options

| Criterion | (a) Full seam cut this round: canonical writer path + real payloadHash + law-gate citation + four-state resolution rows + the defect fix + live-path routing (recommended) | (b) Contracts + defect fix only; wiring deferred | (c) Gate binding only (journal citation without persisted intents) |
|---|---|---|---|
| Closes the volume clock | Yes — the first live rows route through the seam from this round | No — assets stay unwired; every console command stays pre-seam surface | No — citations without artifacts are dangling refs |
| Falsifiability | Five named falsifiers, all mechanical | Two | One |
| Blast radius | plugins/vivim-intent, vivim-law (additive), surfaces/web (routing), console composition, one contracts field | contracts only | vivim-law only |
| Honesty of the four-state claim | UNDERSTOOD/AMBIGUOUS/REFUSED/EXECUTED land as rows from the first command | Claim stays aspirational | REFUSED-only evidence |

## Decision

**Decision:** (a) — cut the whole seam in one round, at the plugin/surface layer, zero host LOC (B5 flat; the host's dispatch order is already correct: gate downstream of resolution, upstream of execution and spawn).

## Consequences

- **Canonical writer path**: `intent.submit@1` persists intents to ns `intent` (as today) with a **real sha256 payloadHash** (`node:crypto` createHash — the forge-author/provider pattern) and now also the **interpretation summary** (`text`, `canonical`, `reading`, `confidence`, `status`) as one additive optional field on the `Intent` contract type. Identical inputs produce identical `canonical` + `payloadHash` (F7's byte-identical red line, mechanical form).
- **Defect fixed**: `intent.cancel@1` derives `stepId` from the payload (default `"all-pending"`), and the compensation-evidence write result is **reported** in the outcome (`compensationRecorded: true/false`) — never silently swallowed; cancellation itself still succeeds regardless (§3.9 non-rollback).
- **Four-state resolution as rows**: new op `intent.resolution@1` (MUTATION) writes resolution rows to ns `intent`. **UNDERSTOOD** is the intent row itself (state `submitted` + interpretation summary); **AMBIGUOUS** / **REFUSED** / **EXECUTED** are `:res` rows — id `<hex>:res` when an intent exists, `amb:<hex>:res` for ambiguous attempts — each citing `intentRef` (null for AMBIGUOUS), the NL text, reading, and outcome.
- **Law-gate citation**: `law.check@1` accepts optional `intentRef` + `payloadHash`; journal rows carry both when present. `evalPolicy` is unchanged — policy granularity stays *who/which-op*; the citation is evidence binding, not new policy. Callers without citations journal exactly as before (grandfathered).
- **Live path**: the web console `execute()` routes interpret → `intent.submit@1` (UNDERSTOOD) → `law.check@1` pre-gate **with citation** (the existing director.rule pre-check pattern; the host's own mechanical gate still runs for risky ops — defense in depth, two journal rows, one citation) → the routed call → `intent.resolution@1` (EXECUTED with outcome / REFUSED with decision + consentId). Confidently-unparseable commands (the `surface.assist` family / null IR) write an AMBIGUOUS row without a submit. Console pseudo-intents (`surface.help`, `surface.entity`) are console queries, not governed events — no rows.
- **Composition**: `console` gains `vivim.intent` (matrix edit + regeneration; spec count stays 18). Grant: `port:vault.append@1`, `port:vault.get@1`; contracts `intent.submit@1`, `intent.status@1`, `intent.resolution@1`.
- **Zero host LOC** (B5 1500/1500 flat); anvil untouched (sdk 856/860, 45 exports); sdk untouched; the one contracts change is additive-optional; `docs/VAULT-NAMESPACES.md` ns `intent` row updated with the resolution row family.
- The `ExecuteOutcome` wire type gains additive `intentRef?` and `resolution` fields (surfaces-local type; the browser UI ignores unknown fields).

## Evidence

- The gap, verified this round on the working tree: `plugins/vivim-intent/src/index.ts:107` (fake hash) and `:233` (undefined `stepId` inside try/catch); `surfaces/web/src/api.ts:105` (`call(ir.intent, ir.payload)` — interpretation discarded); `host/src/ports.ts:284-312` (the gate call shape — unchanged, by design); zero compositions carrying `vivim.intent` (grep across `compositions/*.json`).
- Annex `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §4.1 (S1: R4 trigger, three volume-clock fronts, the cheapest-credible-cut illustration this design follows) and §3.4 (the trusted path already LLM-free — this round adds the persistence the claim lacks).
- D-410's milestone row S1; D-408 §2 (the NL Control Plane's constitutional tier); D-389 (the intent mechanism's ratified phases).
- **Falsifiers (named, pre-ratification, per D-364):**
  - **F-1 defect regression**: `intent.cancel@1` on a submitted intent → the compensation row EXISTS in ns `intent-plan` and the outcome reports `compensationRecorded: true`. Fails on the pre-D-411 code (the silent no-op).
  - **F-2 hash reality**: `intent.submit@1` returns `payloadHash = "sha256:" + <64 lowercase hex>`, identical for identical payloads, different for different payloads.
  - **F-3 citation**: `law.check@1` called with `{intentRef, payloadHash}` on a journaling row → the journal row carries both; called without → the row shape is byte-identical to today's.
  - **F-4 four-state rows**: one confident executed console command → an intent row (state `submitted`, interpretation summary) + an `EXECUTED` resolution row citing `intentRef`; one ambiguous command → an `AMBIGUOUS` row with `intentRef: null`; one refused (require-consent) command → a `REFUSED` row carrying the consentId.
  - **F-5 live-path parity**: the existing console consent ceremony (interpret → consent card → grant → retry) is behaviorally unchanged; the refused card still carries the consent id (now from the structured pre-gate decision, not regex extraction); `surfaces/web/test/web.test.ts` stays green with the new assertions added.
- Gate bar: **evidence-class** — the falsifiers above are IN this record before ratification; ratification cites two full gate greens on the record's tree (1056 + new tests / 0 ×2).
- **Ratified: landed in `9d142fa`; falsifiers F-1 through F-5 all green on this tree** (intent-seam 7/7 — the F-1 regression fails on the pre-D-411 code; d411-citation 3/3; web 14/14 including the F-3 live journal citation and the F-5 consent-ceremony parity); **two full gate greens 1069/0 ×2** on the record's tree (2026-09-20T05:02:00Z and 05:03:50Z; +13 tests over the 1056 baseline); host flat 1500/1500; anvil untouched (856/860, 45 exports); composition count unchanged at 18.
