# Handoff — Round 12 (the course correction + the efficiency tooling round)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`e6c6b09` (the course correction landed: D-418..D-421 PROPOSED). This round
consumed the owner's two inputs — the `OMEGA-COURSE-CORRECTION-001` briefing
(items 1–6, filed as four separate directive records) and the operational-
efficiency directive ("implement the recommendations" from
`docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md`) — and closed both.

## What landed

| Item | Artifacts |
|---|---|
| **D-418** (ratified, directive) | The v1 substrate call: Chrome master/slave (`provider.browser`) ships; no AI-API realization in v1. The Ollama-first framing superseded at every law-bearing passage (vision header + §24 + §28 row 3 + §31; ROADMAP banner; FORGE-ARCHITECTURE banner + row 4; WAVE2 banner; CONSOLIDATION §4.10 pointer). F-1 the line-level sweep test (`v1-substrate-sweep.test.ts`) — it BIT live during the round (the missing-bold desync, caught by the gate in one test-run). |
| **D-419** (ratified, directive) | The CDP substrate lane: `provider.browser`'s live-Chrome path named as the parallel lane sequenced ALONGSIDE the forge lanes (never behind them); entry falsifier adopted from ARCHITECTURE-NEXT-STEPS §G5 (define "byte-identical" for live-vs-fixture BEFORE coding the substitution test). |
| **D-420** (ratified, directive) | The shippable composition fence: `browser.json` (or successor) is the shippable-v1 composition; a mechanical gate (the compositions stage's `shippableFence`, live in gate.ts) forbids `provider.llm` in any shippable-tagged composition — prose drift made structurally impossible. |
| **D-421** (ratified, directive) | The governor host-budget scoping: §18's tile-lifecycle scheduling must live inside a plugin over existing `platform/` capabilities, or name the host removal that pays for it — decided BEFORE Wave 4 opens, not mid-wave. |
| **The efficiency audit** | `docs/forge/annex/OPERATIONAL-EFFICIENCY-AUDIT.md` — the course-correction turn's hand-held ledger (≈418 KB transport for ≈6 KB decision payload; the 17-call entry storm measured), the B-register reconciled (B3 bit, B4 mostly retired by D-414, B7 bit via the hand-held scan, B8 did NOT bite; **B11 output-firehose + B12 full-file-doc-reads registered**), the native-tooling register A13–A17, the credit line (where a tool exists the class is dead), the restraint register, self-falsifiers. |
| **D-422** (ratified, evidence) | The efficiency tooling round — **the program now tools its own reading layer**: A13 `omega:brief` (record/section/row/since briefs — the bounded read transport, DATA-row numbering, path:line prefixes); A14 gate `--failures-only` + `--stage` (one-line failures naming their STAGE_DOCS rule; targeted verification that never writes status.json, attest skipped loudly); A15 `omega:docscan` (the doc-logic scan as a tool — S1 supersede targets, S2 span-aware bold-shape drift, S3 §-pointers, S4 citation existence with the checker's own grandfathers mirrored, S5 annex parity, S6 banner coverage — REPORT-ONLY, flip by a future record after one green wave); A16 `omega:entry` (the one-command session brief; read-only; nags on the harness worklog); A17 the ledger home (`resolveLedgerDir`: `--ledger` > `.ledger-path` pin > the D-414 default; refusals print every searched path; **the README table is the ledger of record** — row contiguity still refuses gaps, delivered bundle FILES may be pruned, only the last row's file is demanded for the double-run guard). Falsifiers F-1..F-8 (28 tests). The self-host proof ran the full chain: the record was brief-read, the tree scanned clean pre-flip (the tool caught its own author's unbackticked retired-id mention), round state entered via A16 (its own two bites — the D-213 index-prose phantom and the porcelain first-line trim — found by running it and fixed pre-flip). |
| The harness worklog law | `/home/z/my-project/worklog.md` created (was mandated, never existed); every round's agent appends before close; A16 checks. |

## Gate standing

Full gate **1175/0 green ×2** on the PROPOSED tree (14:12:54Z, 14:14:34Z —
1126 + 49 new since bundle `_11`: the course-correction sweeps + the
efficiency-tooling suite); post-ratification full green (numbered in
`build/status.json` at the close tip); host flat **1500/1500**; zero host
LOC; anvil untouched; compositions 18; board **0 open**; docscan **0
findings** (report-only, first green wave begins).

## Where the program actually stands

**The course correction is ratified law.** The vision doc of record teaches
Chrome-first v1 at every amended passage, the shippable fence is mechanical,
the CDP lane is named beside the forge lanes, and the governor scoping is on
file before Wave 4 needs it. The reading layer — the one surface every prior
round left untool-ed — is now tooling like everything else: briefs instead of
full-file reads, one-line failures instead of firehoses, one command for
round state, a scanner for the doc-logic, a ledger home that names its
searches. The efficiency audit's restraint register held: no gate tiering
(B8 measured low), no full-A8 pull-forward, no new mandatory ceremony.

## Next round's exact entry point

**Parallel work continues — the first command is `omega:entry` now.**

1. `bun run omega:entry` — round state, ledger, docscan count, next commands,
   in one call (the entry storm is retired).
2. Baseline falsifiers (unchanged law): `bun test
   plugins/forge-author/test/happy/self-host.test.ts --timeout 60000` then
   `bun run omega:quick`.
3. The open lanes (BACKLOG): the mine wave (`forge-mine-capture` +
   `forge-mine`, the decided D-409 shapes, receipts against
   `fixtures/mines/synthetic-v0/`) and the D-419 CDP lane
   (`provider.browser` attach-only; write down "byte-identical" for
   live-vs-fixture BEFORE the substitution test). SF1–SF4 resolve in the
   lanes' own design records.

**Round close:** `bun run omega:round-close --note … --evidence …` (rehearse
with `--dry-run` first). The close sequence: PROPOSED → gates ×2 → ratify →
board refresh at the ratified tip → close-out → round-close.
