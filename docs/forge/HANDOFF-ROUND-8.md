# Handoff — Round 8 (D-414: the round-close automator round — A2+A12, the ceremony as one command)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`bd08436` (bundle `_7`'s tip). The owner's standing directive ("continue as
far as you can") was executed to its exact boundary — unchanged from round 7:
everything executable without the owner's S3 call was landed. What changed is
**how rounds close from here**: the ceremony itself is a tool now.

## What landed

| D-item | Artifacts |
|---|---|
| D-414 (ratified, evidence-class) | **A2** `omega:round-close` (`tooling/gates/round-close.ts`) — the round-closing ceremony as ONE fail-closed command: preflight (clean tree · quick gate green · decisions contract green · board fresh · status.json carried+green · ledger contiguous · tip advanced since the last bundle — every refusal named, nothing written) → `git bundle create --all` + `verify` → sha256 → the ledger README's table row **generated from git data** (tip, tree hash, sha256 — the `8…8` truncation; `--note`/`--evidence` one-line cells, pipes refused) → the next-round entry block printed from BACKLOG's OPEN items + PARKED sections + the open board (derived, never hard-coded prose). `--dry-run` rehearses the preflight + renders the row without writing; `--ledger <dir>` overrides the ledger location (default `../download`). **A12** the toolchain pin — `build/status.json` gains `toolchain {bun, node, os, arch}` (pure `toolchainPin()`); `verify-status` compares committed-vs-fresh via `compareToolchain` and reports drift — report-only, never failing (runner-shape; D-362's two-machines rule extended one notch). Contract doc → **v3** (`docs/decisions/README.md` — the Round close section). |
| Re-ids | The S3 lift moves D-414 → **D-415** (fork file, BACKLOG, annex README synced). |
| Backlog | The RC row struck done; the A3 row marked NEXT tooling round; the S3 row carries D-415. |

## Gate standing

Full gate **1102/0 green ×2** on the PROPOSED tree (08:51:59Z, 08:53:33Z —
1089 + 13 new tests); post-ratification full green 1102/0 (08:58:28Z); host
flat **1500/1500**; anvil untouched; composition count unchanged at 18; board
regenerated — **0 open**. Zero host LOC (tooling/ + docs/ only).

## The self-host note (F-0 — this round earned it three times)

The round that lands the close automation was closed **by** it: bundle `_8`
and its ledger row exist only because `omega:round-close` ran (first use, per
the review's "first use at the next bundle cut"). Before that, the **dry-run
leg bit twice, exactly as designed**: (1) the preflight refused on a row-shape
desync — the ledger's bundle rows carry an underscore (`| \`_7.bundle\` |`)
that the first `renderLedgerRow` spelling lacked — caught BEFORE any bundle
was cut, zero writes; (2) it then refused on the dirty tree carrying the fix.
The round also ate its own dogfood via the gate: the decisions stage caught
the `(A2)` paren-option trap in the record's own Decision line, and the F-2
test caught the `8…7`-vs-`8…8` truncation bite — three pre-commit catches in
one round, all in the classes the round exists to kill.

## Ambiguities recorded, defaults used

1. **"Regenerate board/status" (the review's A2 text) vs verify-only**: as
   landed, the close **verifies** board freshness and status carriage — it
   never rewrites them. The regen steps belong to the ratify step ("Board
   refresh" in AGENTS.md's wave shape); a tool that rewrote derived state at
   close would race its own commit. Recorded in the record's Consequences.
2. **The ledger README's prose "Next round" section stays agent-maintained**:
   the tool prints the entry block to stdout; writing prose into the ledger is
   deferred with a named trigger (a round where the printed block proves
   insufficient).
3. **S3 was NOT called** — third round running: the boundary is the owner's,
   per D-410's ratified milestone row. The fork file now says D-415.

## Next round's exact entry point

**One of two paths, the owner's choice (cheaper to cross than ever):**

1. **Call S3** (close the Core Phase): read
   `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md` — the clock reads 7,145
   rows/run, all ephemeral — choose **(a)** fold-into-vault (recommended) or
   **(b)** sidecar chain+signature. The lift is mechanical under the scaffold:
   `bun run omega:new-decision evidence-store --class evidence …` → paste the
   fork file's six sections → falsifiers → greens → flip. After S3 lands:
   **core-omega-ready** — the plugin-identification pass (D-410's post-core
   gate) un-parks the register and parallel work opens.
2. **The A3 invariants round** (build-order row 4, executable without the
   call): pass #2 of `CURRENT-INVARIANTS.md` — regenerated from the decision
   records, folding in Wave 0's forge constitution (anvil freeze, generality
   axis, forge-surface, catalog freeze, the mine), the Core Phase seams
   (D-411/D-412), the generated-row era (D-413), and the D-391 B5 re-freeze —
   plus the report-only `invariants-freshness` gate stage (trigger-based
   staleness; flips to failing after one green wave of reports, the
   D-368→D-402 adopt-observe-enforce pattern).

First command either way (falsifier baseline must still be green):
`bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
then `bun run omega:quick`.

**Round close from here:** `bun run omega:round-close --note "<round>" --evidence
"<gate evidence>"` — the preflight is the protocol; refusals are named; the
ledger row is generated, not typed. Rehearse with `--dry-run` first on any
round that changed the close's inputs.

**Parked and not to be touched until core-omega-ready (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
