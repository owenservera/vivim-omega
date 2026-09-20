# Handoff — Round 9 (D-415: the invariants round — A3, the digest on trigger, not calendar)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`75c810b` (bundle `_8`'s tip — the first bundle cut by `omega:round-close`
itself). The owner's standing directive ("continue as far as you can") was
executed to its exact boundary — fourth round running: everything executable
without the owner's S3 call is now landed, **including the entire program
stack the acceleration review scheduled** (build-order rows 3, 4, 5: D-413,
D-415, D-414).

## What landed

| D-item | Artifacts |
|---|---|
| D-415 (ratified, evidence-class) | **Pass #2** of `CURRENT-INVARIANTS.md` — regenerated from the decision records as-of D-415 (pass #1 was 45 ratified records behind; fresh readers mis-stated the law): the boot-security laws (B5 at 1500/1500 **flat, zero headroom**), the Ω laws + compaction-never-deletes (D-410 C), the **Core Phase seam laws** (D-411 canonical intent + `{intentRef, payloadHash}` citations + four-state resolution; D-412 principal identity + `PRINCIPAL_REUSED` + retired-forever), the **Omega Forge constitution** (D-404 anvil freeze; D-405 generality axis; D-406 24-op catalog freeze, one-class-per-plugin, packs-exempt, refusal-as-data, the mine, the self-hosting stance), the **program law** (D-408 vision, D-409 partition, D-410 re-sequencing, D-413 generated-row era, D-414 round-close + toolchain pin, D-415 the page's own trigger law), migration-readiness D-376…D-383, driver lane + polyglot tier, budget watch at current numbers. Carries the **machine-readable marker** (`pass · as-of · stage inventory`). |
| The stage | `invariants-freshness` (gate 5e, in `--quick`, `tooling/gates/invariants-freshness.ts`): computes staleness from the marker vs the decisions index (**T1**: 30 ratifications past as-of) and vs the stage registry (**T2**: drift both directions; `STAGE_DOCS` is the canonical list, stage included); **REPORTS** — stale + named triggers in the detail, stage stays green (adopt-observe-enforce; the flip to failing is a future record's call after one green wave of reports); mechanical breakage fails. **T3** (wave closure) deferred with a named trigger (the first forge wave closure landing WITH a wave registry). **The live lock test** pins the real digest's marker to the real `STAGE_DOCS` — the D-403 doc-drift class, dead. |
| Re-ids | The S3 lift moves D-415 → **D-416** (fork file, BACKLOG, annex README). |

## Gate standing

Full gate **1115/0 green ×2** on the PROPOSED tree (09:08:26Z, 09:09:58Z —
1102 + 13 new tests); post-ratification full green 1115/0 (09:12:00Z); host
flat **1500/1500**; anvil untouched; compositions 18; board **0 open**. Zero
host LOC. The freshness stage's own report at this tip: `stale: false ·
pass 2 · asOf D-415 · gateStages 13 · ratifiedSince 0` — visible in
`build/status.json`.

## The bites (pre-commit, both caught as designed)

F-5's `-->` leak: the marker parser's first character class (`[a-z- ]*`) ate
the comment-closer's dashes, producing a phantom `--` stage — bitten while
writing the parser, caught by the falsifier before the gate ever ran. And
the round-close preflight's standing lesson from round 8 held: the board
refresh at the ratified tip ran BEFORE the close, no refusal this time.

## Where the program actually stands

The acceleration review's scheduled stack is **fully built**: A1+A4+A7
(D-413), A2+A12 (D-414), A3 (D-415). What remains of the review is A5/A6
(consumed by the core-first re-sequencing), A8 (citation verifier — needs the
corpus pin check first), A9 (deliberately deferred), A10 (mine-ops harness —
Wave 1, parked with the mine). The Core Phase itself: S1 ✓, S2 ✓, C ✓, the
tooling rows ✓ — **S3 is the only remaining item, and it is the owner's
call** (D-410's ratified milestone row reserves it). Everything on the other
side of that one word — core-omega-ready, the plugin-identification pass,
parallel work — is sequenced and waiting.

## Next round's exact entry point

**One path now, and it is the owner's:**

1. **Call S3** (close the Core Phase → core-omega-ready): read
   `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md` — the clock reads 7,145
   law-journal rows / one full-gate run, all ephemeral — choose **(a)**
   fold-into-vault (recommended) or **(b)** sidecar chain+signature (or call
   the audit-chain persistence point alone). The lift is mechanical under the
   scaffold: `bun run omega:new-decision evidence-store --class evidence …`
   → paste the fork file's six sections → falsifiers → greens → flip. After
   S3 lands: the plugin-identification pass (D-410's post-core gate)
   un-parks the register and parallel work opens.

First command either way (falsifier baseline must still be green):
`bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
then `bun run omega:quick`.

**Round close:** `bun run omega:round-close --note … --evidence …` (rehearse
with `--dry-run` first). The close sequence: PROPOSED → gates ×2 → ratify →
board refresh at the ratified tip → close-out → round-close.

**Parked and not to be touched until core-omega-ready (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
