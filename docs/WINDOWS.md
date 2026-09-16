# Windows Takeover Guide (D-371)

The team works on Windows from here. This tree is Windows-native: Bun 1.3.14
ships a Windows x64 build, all file access goes through `node:fs`/`node:path`,
and the full suite has been run green-laned on Windows (see Evidence in
D-365…D-369). Read this once, then `bun run omega:quick` is your pre-commit.

## Prerequisites

- **Bun ≥ 1.3.14** (pinned — `bun --version`; install from bun.sh, ensure
  `bun.exe` is on `PATH`; this repo used `C:\Users\<you>\.bun\bin\bun.exe`).
- **Git for Windows** (bundles, `cat-file`/`merge-base` in the gate + verifier).
- **Node 24** (optional — only for the `node-canary` job:
  `node --test tooling/ci/canon-canary.test.mjs`).
- PowerShell 7+ (`pwsh`). All commands below are PowerShell.

## Setup (fresh clone)

```powershell
git clone <remote> vivim-omega
Set-Location vivim-omega
bun install          # or: bun run omega:setup
bun run omega:quick  # structural gate: host-loc + decisions + compositions + bun-surface (~seconds)
```

`bun install` regenerates the workspace symlinks (`node_modules/@vivim/*`).
Never copy `node_modules` between machines, and never extract a `.tar.gz`
snapshot expecting its symlinks to survive on Windows — `tar.exe` cannot
create them (`Invalid argument`); `bun install` is the supported rebuild.

## Daily commands

```powershell
bun run omega:quick        # pre-commit: structural stages, writes nothing
bun test <path> --max-concurrency 1 --timeout 60000   # one lane/file
$env:OMEGA_TEST_CONCURRENCY=1; bun run omega:gate     # full gate, serial fallback
node --test tooling/ci/canon-canary.test.mjs          # Node canary (D-361/D-362)
bun run tooling/ci/verify-status.ts                   # status.json reproducibility (D-362)
```

`omega:gate` caps concurrency at `max(4, min(20, cpus))` with a 60s per-test
budget. On a loaded box use the serial fallback above.

## Windows behaviors you should know (all verified)

- **Temp paths.** Composition defaults spell portable `${TMP}/…` (resolved per
  machine by the platform seam, D-372); tests and tooling scratch via
  `omegaTmp(…)` (same root: `%TEMP%` on Windows, `/tmp` on POSIX).
  Grandfathered `/tmp/…` spellings still resolve identically — old vaults and
  docs never break. Manual boots can override any vault dir: `bun run host/src/main.ts compose
  --vault dev-vault --composition compositions/demo.json`.
- **Key file permissions.** `ensureVault` writes the root-of-trust with mode
  `0o600`; the follow-up `chmodSync` is best-effort on Windows (ACLs, not mode
  bits) and never throws (D-371).
- **Line endings.** `.gitattributes` normalizes `*.ts/json/md/yml/mjs` to LF in
  the repo. If Git warns `LF will be replaced by CRLF`, that is the policy
  working — don’t “fix” it per-file.
- **MCP stdio.** `surfaces/mcp` spawns `bun run …` over stdio; green in
  isolation (11/11). Under a full-serial soak (>200s of worker spawns) Windows
  can refuse spawns (`uv_spawn EUNKNOWN errno -134`, handle exhaustion) —
  pre-existing environment flake, also present on clean `turn-015` (3/733).
  Retry the lane; the merge arbiter is Linux CI (`gate-reproduce`).
- **Decisions self-host test needs time.** `checkDecisions` shells out to git
  per SHA (~17s on Windows); the gate passes `--timeout 60000` for this.
  Don’t lower it.
- **`fresh-tree` skips loudly** (`○`) on clean clones with no sibling legacy
  repos — expected, never green, never red (D-320).

## CI

Required: `gate-ubuntu`, `gate-reproduce` (D-362), `node-canary` (D-361/D-362).
Informational: `test-windows` (D-320, unchanged). Recommendation for the
Windows era: keep Linux as the merge arbiter; promote `test-windows` to
required only after the MCP soak flake is retired.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `tar.exe: Can't create … Invalid argument` on extract | Windows can’t create the archived `node_modules` symlinks | Ignore; run `bun install` |
| `decisions test` timeout at 5000ms | Default `bun test` budget too small for git-spawn-heavy check | Use `--timeout 60000` (gate already does) |
| MCP `(fail)` with `uv_spawn EUNKNOWN` after long runs | Windows handle exhaustion under soak | Re-run the MCP lane alone; green in isolation |
| `host-loc` over budget | B5 frozen at 1100 (D-365) | Move the code to a plugin or out-of-tree tooling — same commit |
| `verify-status` structural mismatch | `status.json` predates your change | Full green `omega:gate` run rewrites it (Linux CI for soak-sensitive trees) |
