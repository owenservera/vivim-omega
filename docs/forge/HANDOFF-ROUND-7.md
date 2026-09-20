# Handoff — Round 7 (D-413: the program tooling round — A1+A4+A7, landed while S3 awaits the owner)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`657f40e` (bundle `_6`'s tip). The owner's standing directive ("continue as
far as you can") was executed to its exact boundary: everything executable
without the owner's S3 call — which D-410's ratified milestone row reserves
to the owner ("CALLED by the owner") — was landed, and the boundary itself was
made cheaper to cross.

## What landed

| D-item | Artifacts |
|---|---|
| D-413 (ratified, evidence-class) | **A1** `omega:new-decision` (`tooling/gates/new-decision.ts`) — the record scaffold: six sections by construction, seeded (a)/(b)/(c) matrix, `Blocks: none`, `## Index` meta, and the **generated index row appended at scaffold time**; `GENERATED_FROM = 413` in the checker — records from there REQUIRE `## Index` (summary/rationale/class; no status words, no pipes) and their row must be **byte-equal to `generateIndexRow`** (hand-edits go red with the regen command named — the D-410 first-word trap class is unexpressible); `omega:questions --write` regenerates board AND generated-era rows (byte-stable, idempotent, hand-era rows verbatim). **A4** the `Blocks:` line — checker-validated vocabulary (`none | Core Phase | Wave 1..7 | parallel work`); the board gains a Blocks column and sorts **blocking-first, then D-number**. **A7** `docs/decisions/CROSS-TRACK-REGISTRY.md` — bare `D-NNN` always means THIS ledger, foreign ids track-qualified (`akb:D-389`); report-only collision warnings in the decisions stage (generated era on, grandfathered before); a lock test pins page ↔ `KNOWN_TRACK_COLLISIONS` (the D-403 doc-drift class). Contract doc → **v2** (`docs/decisions/README.md`). |
| S3 fork file | `S3-EVIDENCE-STORE-FORK.md` — the volume clock **MEASURED** (D-410's falsifier): **7,145 law-journal rows / 65 scratch journals per one full-gate run** on this tree (5,000 = the D-387 jh-large fixture, 1,310 = the chat pilot, ~835 across 62 suites; all ephemeral, nothing deployed); the lift re-id'd to **D-414** (D-413 is this round). |
| Backlog | The tooling row struck done; S3's row carries the measured clock + D-414; the annex README's fork-file row updated to match. |

## Gate standing

Full gate **1089/0 green ×2** on the PROPOSED tree (06:02:29Z, 06:04:18Z —
1074 + 15 new tests); post-ratification full green 1089/0 (06:06:45Z); host
flat **1500/1500**; anvil untouched; composition count unchanged at 18; board
regenerated — **0 open**. Zero host LOC (tooling/ + docs/ only).

## The self-host note (F-0, worth remembering)

D-413's own record was **scaffolded by `omega:new-decision`** and its row
generated; at ratification the row flipped `PROPOSED → RATIFIED` by
`omega:questions --write` itself ("1 regenerated, 0 appended") — the
generated-row era's first full lifecycle (scaffold → fill → flip → regenerate)
ran through its own tooling, in the round that landed it. The same round also
ate its own dogfood twice: the gate caught (1) the `## Index` section dropped
during authoring and (2) a bare `D-389` in the record's own Evidence text
triggering the A7 lint — both fixed before the PROPOSED commit, both exactly
the classes the round exists to catch.

## Ambiguities recorded, defaults used

1. **A1 scope vs the review's text**: the review says `omega:questions --write`
   regenerates rows "for every D-360+ record — byte-stable for unchanged
   records". As landed, the generated era starts at **D-413** (this round's own
   id): retrofitting `## Index` into D-313..D-412 RATIFIED records was
   **declined** — RATIFIED-never-edit outweighs byte-stability, and the D-390
   additive-repair precedent is reserved for repairs, not conveniences. The
   eras are named boundaries: `< D-313` index-only, `D-313..D-412` hand-typed,
   `D-413+` generated. Recorded in the D-413 Consequences.
2. **A4's wave-red view deferred**: "any wave whose blocker has no record shows
   red" needs wave-entry-blocker declarations that don't exist yet; trigger
   named in the record (the first wave-scoped PROPOSED).
3. **S3 was NOT called** — same standing as round 6: the owner's directive
   pushed to the boundary; the boundary is the owner's. The fork file now
   carries the measured clock, so the call is one word.

## Next round's exact entry point

**One of two paths, the owner's choice (unchanged in shape, cheaper now):**

1. **Call S3** (close the Core Phase): read
   `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md` — the clock now reads 7,145
   rows/run, all ephemeral — choose **(a)** fold-into-vault (recommended) or
   **(b)** sidecar chain+signature (or call the audit-chain persistence point
   alone). The lift is now mechanical: `bun run omega:new-decision
   evidence-store --class evidence …` → paste the fork file's six sections →
   falsifiers → greens → flip. After S3 lands: **core-omega-ready** — the
   plugin-identification pass (D-410's post-core gate) un-parks the register
   and parallel work opens.
2. **The next tooling round** (if the owner wants the program stack finished
   first): **A3** — invariants pass #2 + the report-only freshness trigger
   stage (the review's build-order row 4); **A2+A12** — the round-close
   automator + toolchain pin (row 5, first use at the `_8` cut). Both are
   executable without the S3 call; neither touches plugin design.

First command either way (falsifier baseline must still be green):
`bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
then `bun run omega:quick`.

**Parked and not to be touched until core-omega-ready (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
