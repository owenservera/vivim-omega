# D-414 — Round-close automator + toolchain pin — A2+A12, the ceremony as one command

## Status

RATIFIED

## Context

- The acceleration review's build-order row 5 (annex `OMEGA-PROGRAM-ACCELERATION.md` §6) schedules **A2+A12 at the next bundle cut**; D-413's ratified consequences name them "the next tooling round — first use at the next bundle cut" (now `_8`).
- The root cause is B4: six correct manual steps per round (bundle cut → sha256 → README row cells hand-derived from git output → board/status verification → next-round pointer) — the highest-error-prone sequence left in the protocol, and the row cells are exactly the hand-typed-derived-state class A1 killed for index rows.
- S3 remains the owner's call (D-410's ratified milestone row) — this round is the executable path while it waits, per the standing "continue as far as you can"; neither this round nor any part of it touches plugin design.
- All of it lives in `tooling/` + `docs/` — zero host LOC; the anvil and B5 freezes untouched (the review §8 landing protocol).

Blocks: none

## Options

| Criterion | (a) A2+A12 now, as scheduled | (b) Defer until after S3 | (c) A2 without A12 |
|---|---|---|---|
| First use at `_8` (the review's own trigger) | yes — this round closes through it | no — `_8`+ close by hand again | yes |
| The ledger row stops being hand-typed data | yes — generated from git, byte-shaped, cell-validated | no | yes |
| Evidence reproducibility notch (A12) | yes — toolchain recorded + drift reported | no | no |
| Round size risk | small-medium — one command, one test file, two small edits | zero | small |
| Zero host LOC / freezes untouched | yes | yes | yes |

## Decision

**Decision:** (a) — the scheduled build order restored: the A2 round-close automator and the A12 toolchain pin land together, and this round's own close is the first use — the self-host proof.

## Consequences

- `omega:round-close --note … --evidence …` runs the ceremony fail-closed: preflight (clean tree · quick gate green · decisions contract green · board fresh · status.json carried+green · ledger contiguous · tip advanced since the last bundle) → `git bundle create --all` + `git bundle verify` → sha256 over the bundle bytes → the README table row **generated from git data** (tip short-sha, tree hash, sha256 — the ledger's `8…8` truncation) → the next-round entry block printed from BACKLOG's OPEN items + PARKED sections + the open board (a scaffold, not prose). `--dry-run` rehearses the whole preflight and renders the row without writing; `--ledger <dir>` overrides the ledger location (default `../download` from the repo root, refused loudly when absent).
- **Recorded default** (vs the review's text "regenerate board/status"): the close **verifies** board freshness and status carriage — it never rewrites them. The regen steps belong to the ratify step ("Board refresh" in AGENTS.md's wave shape); a tool that rewrote derived state at close would race its own commit. Board/status regen stays where the protocol already puts it.
- A12: `build/status.json` gains `toolchain {bun, node, os, arch}` (pure `toolchainPin()`); `verify-status` compares committed-vs-fresh via `compareToolchain` and **reports** drift — report-only, never failing (runner-shape; D-362's two-machines rule extended one notch, exactly as the review scoped it).
- The double-run guard: HEAD is compared against the last bundle's recorded HEAD — an unchanged tip refuses ("nothing to close"); a README table desynced from the bundle files refuses; bundle-numbering gaps refuse.
- The S3 lift re-ids from D-414 to the next open D-id at the fork file's next touch (ids allocate at lift, never reserved — the same re-id D-413 performed).
- Deferred with a named trigger: writing a "next round" section into the ledger README (trigger: a round where the printed block proves insufficient) — the README's prose Next-round section stays agent-maintained; the tool prints to stdout only.

## Evidence

- **F-0 (self-host):** `--dry-run` green on this record's tree BEFORE the flip — the preflight passes on the PROPOSED tip and the row renders from live git data, nothing written; the round's own close then runs the real path, so bundle `_8` and its ledger row exist only because the tool ran. [Dry-run leg executed green pre-flip — and it bit twice: the preflight refused first on the row-shape desync (the underscore bite, fixed pre-commit) then on the dirty tree carrying the fix — the tool catching its own author's mistakes with zero writes, the self-host proof BEFORE the flip, not just after.]
- **F-1 (refusals):** `tooling/gates/test/round-close.test.ts` — every failed preflight fact produces its **named** refusal; `--note`/`--evidence` cells with pipes/newlines/emptiness refused; bundle numbering gaps refused; refusals write nothing (the CLI refuses before any mutation — by construction).
- **F-2 (row shape):** `renderLedgerRow` reproduces the ledger's exact row byte-shape; `shortHash` accepts exactly the 40/64-char hex shapes and refuses garbage; `appendLedgerRow` inserts after the LAST table row and refuses table-less READMEs (text returned unchanged). This falsifier bit during authoring: the first spelling was `8…7`, the ledger's convention is `8…8` — caught pre-commit, exactly the class F-2 exists for. The decisions stage also caught the paren-option trap in this record's own Decision line (`(A2)` read as an option ref — the AGENTS.md trap list, biting once more, caught by the gate as designed).
- **F-3 (bundle mechanics):** scratch-repo integration — real `git bundle create --all` + `verify` + `list-heads` (the bundle's HEAD equals the repo tip — the double-run guard's input), sha256 over the real bundle bytes, the row landing in a scratch ledger README after its last table row.
- **F-4 (derived, not typed):** the next-round entry block is generated from BACKLOG's OPEN items + PARKED section headers + the open board + the fixed baseline commands — no hard-coded round prose; struck BACKLOG rows excluded; empty states degrade honestly.
- **F-5 (A12):** `toolchainPin()` records the running shape (bun under the gate, null under non-bun); `compareToolchain` reports same/drift — drift never fails.
- Standing directives: the review's grant + build-order row 5; D-413's ratified consequences naming A2+A12 the next tooling round; the owner's standing "continue as far as you can", executed to the S3 owner-call boundary per D-410's milestone row.
- Landed in `0cb42fc` (underscore fixup `2acb77e`): falsifiers F-0..F-5 green in the record's tree BEFORE the flip per D-364 — F-0's dry-run leg refused-then-greened on its own round (the preflight catching the underscore desync and the dirty fix tree, zero writes); F-1..F-5 green in `tooling/gates/test/round-close.test.ts` (13 tests); full gate green 1102/0 ×2 on the PROPOSED tree (2026-09-20T08:51:59Z and 08:53:33Z, host flat 1500/1500, anvil untouched); the row flips to RATIFIED by `omega:questions --write` (1 regenerated, 0 appended).

## Index

summary: A2+A12 — the acceleration review's build-order row 5: omega:round-close (preflight refusals, bundle cut, sha256, the generated ledger row, the printed next-round entry block) + the toolchain pin in build/status.json
rationale: converts the highest-error-prone manual sequence of the round protocol into one fail-closed checked operation; first use closes this round — the self-host proof
class: evidence
