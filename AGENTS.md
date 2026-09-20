# AGENTS.md — working agreements for vivim-omega (owner-maintained)

Read this before touching code. The gate (`bun run omega:gate`) is the arbiter;
this file tells you how not to fight it. Details live in `docs/WINDOWS.md`
(Windows runbook) and `docs/MULTI-OS-DESIGN.md` (platform direction).

## Commands

| Purpose | Command |
|---|---|
| First-time setup | `bun install` (aka `bun run omega:setup`) — regenerates workspace symlinks; never copy `node_modules` or expect tarball symlinks to survive on Windows |
| Pre-commit check (seconds) | `bun run omega:quick` — structural stages only, writes nothing |
| Explain a gate stage | `bun run tooling/gates/gate.ts --explain [stage]` — what it scans, its allowlist, its rule |
| Full gate (minutes) | `bun run omega:gate` — all stages + writes `build/status.json` + `gates.log` |
| Test lanes | `bun run omega:test:host` / `omega:test:plugins` / `omega:test:surfaces` |
| Decisions CLI | `bun run omega:decisions` (check) · `bun run omega:questions --write` (regenerate board) |
| Status reproducibility | `bun run tooling/ci/verify-status.ts` (D-362 — committed `status.json` must reproduce) |
| Node canary | `node --test tooling/ci/canon-canary.test.mjs` |
| Long runs on Windows | `$env:OMEGA_TEST_CONCURRENCY=1` before gate/tests; always pass `--timeout 60000` to bare `bun test` (default 5s trips git-heavy tests) |
| Before long soak runs | Kill orphans first: `Get-Process bun | Stop-Process -Force` (leaked workers poison results) |

Requires Bun ≥ 1.3.14. CI: `gate-ubuntu`, `gate-reproduce`, `node-canary` required;
`test-windows`, `test-macos` informational (serial full gate).

## Laws that bite (B1–B5 + process)

- **B5 frozen:** `host/src` ≤ **1500 LOC**, hard gate (D-365 froze 1100; D-391
  re-amended once and loudly to 1500, re-frozen). No new host surface
  without removing old surface **in the same commit**. Policy lives out-of-tree.
- **B1–B4 evidence rule (D-364):** evidence-class decisions touching boot security
  need the named falsifier IN the record BEFORE ratification + a second gate run
  after. Directive-class rows ratify same-day on gate green — label honestly.
- **Ratings need receipts:** `RATIFIED` requires a resolvable commit SHA in Evidence.
- **Never edit a RATIFIED record or rewrite history.** Supersede, never edit.
  PROPOSED records may be amended before ratification.
- **Append-only log:** `docs/BUILD-DECISIONS.md` is the audit trail;
  `docs/decisions/CURRENT-INVARIANTS.md` is the read-first synthesis (refresh on trigger per D-415 — wave close, B-law/gate-stage change, or 30 ratifications; the `invariants-freshness` gate stage reports staleness).
- **Board:** `docs/decisions/OPEN-QUESTIONS.md` is generated — edit records, then regenerate. Commit it in the same wave.

## Decision records: checker traps (all bitten live — respect them)

`tooling/gates/decisions.ts` parses loosely; write defensively:

1. Index status is **first-word match** on the whole row: never write
   proposed/ratified/superseded/rejected (any case) in the decision cell
   before the status cell.
2. Record `## Status` is the **bare word only** (`PROPOSED`). Class tags
   (`· evidence` / `· directive`, required for D-360+) live in the **index row only**.
3. No `(N)`-style parens in `**Decision:**` lines — the checker reads them as
   option references. `(a)/(b)/(c)` only, matching the Options matrix.
4. Every record: six sections in order (Status, Context, Options, Decision,
   Consequences, Evidence) + matrix table + `**Decision:** (x)` line.
5. Composition count: **18 specs** (D-370 froze 16; D-391 raised to 17 via the
   D-377 matrix path; Wave 0/D-406 adds `forge-author.json` the same way — 18).
   New specs go through `compositions/_matrix.json` + `omega:generate
   composition`, never by hand-editing a spec. Drift allowlists need a
   D-record pointer; new drift shapes fail.

## Code surfaces with gate teeth

- **`bun-surface` (D-361):** zero `Bun.*`/`bun` imports in prod `*/src` except
  `plugins/vivim-vault/src/db.ts` (the one declared sqlite adapter).
- **`os-surface` (D-372):** zero `/tmp/` literals, `process.platform` branches,
  raw `chmod` in prod `*/src` except `platform/src/platform.ts` lines marked
  `D-372`. **Only `platform/` may know the OS.** Specs spell `${TMP}/…`;
  code uses `omegaTmp(…)` / `resolveDataDir` / `ownerOnly` from
  `@vivim/omega-platform` (add the `workspace:*` dep edge when importing it).
- **`import-surface` (B-2):** compartments never import `@vivim/omega-host`;
  surfaces never import `plugins/` source relatively (use workspace deps);
  `contracts/` takes no workspace imports; `shim/` sees contracts only;
  `host/` sees contracts + platform only.
- **Tests:** scratch via `omegaTmp(…)` (never `/tmp/` literals); tests are
  excluded from the surface stages but held to the same spelling.
- **Streaming discipline:** terminating `PortResult` is authoritative; chunks
  sequence-checked (`checkStreamSeq`), emit-after-final throws → DEGRADED.
- **Fail-closed everywhere:** unknown ops REFUSED, budget exceeded BUDGET,
  handler throws → DEGRADED, oversized captures refused (never truncated).

## Commits, tags, push (conventions that prevent real incidents)

- Wave shape: `PROPOSED` commit (code + records + index) → `Ratify … (landed in
  <sha>, <gate evidence>)` → `Board refresh`. Cite landing SHA + gate numbers
  in every ratify/status message (D-362 discipline).
- `build/status.json` refreshes ONLY from a green gate run (local or CI-observed
  with run-URL citation — never hand-written). It is a claim CI re-derives.
- Branch `owner-wave-001` is the working line; `omega` moves by fast-forward PR
  only. Tag waves (`…-wave-N`, `turn-N`) at the tip.
- Push disambiguation: branch and tag share names here, so always push with full
  refspecs — `git push github refs/heads/owner-wave-001:refs/heads/owner-wave-001`,
  `refs/tags/<t>:refs/tags/<t>` (bare names error with "matches more than one").
- PR: `gh pr create --repo owenservera/vivim-omega --base omega --head owner-wave-001 …`;
  read checks with `gh pr checks` / `gh run list` before ratifying off CI evidence.

## Windows facts (proven, not folklore)

- `/tmp/…` resolves drive-relative and works, but the portable spelling is
  `${TMP}/…` (specs) / `omegaTmp(…)` (code) — grandfathered `/tmp` maps identically.
- `chmod` is best-effort (ACLs); `ownerOnly()` never throws by contract.
- Known soak flakes (pre-existing, reproduce on clean tree): MCP `uv_spawn
  EUNKNOWN` after ~200s (mitigated by bounded spawn retry in `mcp.test.ts`),
  Bun stack-overflow crash under multi-GB worker soak — clean slate + serial
  lanes; Linux CI is the merge arbiter.
- `.gitattributes` normalizes code to LF — `CRLF will be replaced by LF`
  warnings are the policy working, not errors. Check `git diff -- bun.lock`
  for real content vs line-ending noise before committing it.

## Do not

Edit RATIFIED records · byte-compare `status.json` (runners differ; compare
structural claims) · add host code without same-commit removal · add a
composition without deleting/generating one · branch per OS · commit red
`status.json` · push with bare refspecs · lower a test timeout to make a
suite pass · `rmSync` without `force:true` on scratch dirs.
