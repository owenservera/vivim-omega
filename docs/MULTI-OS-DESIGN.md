# Multi-OS Concept — one codebase, every OS, no per-OS branches (D-372 design)

Status: **RATIFIED** (D-372; this doc's "PROPOSED design" line is a pre-ratification snapshot, corrected 2026-09-20 in the doc-logic pass — the record is the authority).
Nothing here changes behavior. Implementation rides in phased follow-ups; each
phase lands with its own falsifier and gate evidence per house process.

## 1. Goal

The same tree boots and passes the same gate on Windows, Linux, and macOS
with **zero per-OS branches, zero per-OS specs, zero per-OS docs pages**.
Supporting a new OS must mean *adding a CI lane*, never editing product code.

Non-goals: OS-specific features, per-OS performance tuning, mobile OS ports,
changing the Bun/Node toolchain story (D-361 stands as-is).

## 2. Observation (why this is cheap here)

The D-371 audit proved the shape: ~95% of the tree is pure logic (contracts,
policy, parsers, redaction, stream discipline, decision checking) with no OS
knowledge at all. All OS contact concentrates in six narrow touchpoints:

| # | Touchpoint | Today | Count |
|---|---|---|---|
| 1 | Temp/scratch paths (`/tmp/omega-*`) | Literals in ~45 test files + 16 composition defaults | ~90 sites, all proven green via drive-relative resolution |
| 2 | File permissions (`chmod 600`) | 1 site (`host/src/boot.ts`, now best-effort) | 1 |
| 3 | Process spawn (`Bun.spawn`, `node:child_process`) | 2 surfaces (daemon-client, MCP tests) | 2 |
| 4 | Temp dir location | Implicit (`/tmp`) | — (fold into #1) |
| 5 | Line endings | Solved (`.gitattributes`, D-371) | 0 open |
| 6 | Symlinks in snapshots | Solved by policy (`bun install` regenerates; D-371 runbook) | 0 open |

So the concept is not "port the system" — it is **fence the six touchpoints
so they cannot spread**, then migrate the literals through the fence.

## 3. Architecture: purity by default, platform in exactly one place

```
┌─────────────────────────────────────────────────┐
│ LAYER 1 — Pure core (no OS knowledge)           │  contracts, policy,
│ Same bytes, same tests, every OS. Unchanged.    │  parsers, redact,
│                                                 │  stream checks, gates
├─────────────────────────────────────────────────┤
│ LAYER 2 — Platform seam: `@vivim/omega-platform`│  ONE new workspace pkg.
│ The ONLY module allowed to know the OS.         │  `platform/src/*.ts`.
│ Host, shim, plugins, surfaces, tooling import   │  No host LOC cost
│ it; nobody else touches `node:os`, paths, or   │  (dependency, not code).
│ permissions directly.                           │
├─────────────────────────────────────────────────┤
│ LAYER 3 — Adapters (D-361 pattern, unchanged)   │  vault `db.ts`, spawn,
│ One file per outside-world dependency, declared │  sleep, listeners.
│ in code, enforced by the gate.                  │
└─────────────────────────────────────────────────┘
```

Placement law heats: the seam lives **outside `host/src`** (B5 frozen, D-365)
as a workspace package beside `sdk`/`testkit`. `host` gains a dependency edge,
not lines.

## 4. Seam API sketch (minimal — three functions, nothing more until a second consumer exists)

```ts
// platform/src/platform.ts — the only file that may branch on the OS.
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Scratch root for this machine (os.tmpdir()). */
export function tmpRoot(): string { return tmpdir(); }

/** Join segments under the scratch root: omegaTmp("omega-chat-test", runId). */
export function omegaTmp(...segs: string[]): string { return join(tmpdir(), ...segs); }

/**
 * Resolve a data path value to this machine (pure, TOTAL on strings):
 * - "${TMP}/..." → under tmpRoot() (the portable spelling — specs use this)
 * - "/tmp/..."   → mapped to tmpRoot() (grandfathered; identical result)
 * - relative     → VERBATIM (plugin-relative paths like blueprintPath must
 *                  survive untouched — never resolve against cwd here)
 * - absolute     → VERBATIM (operator override, e.g. --vault)
 * Throws on non-string/empty input (fail-closed at the boundary).
 */
export function resolveDataDir(input: string): string;

/**
 * Owner-only intent for a file (key material).
 * POSIX: chmod 600. Windows: best-effort ACL narrowing, never throws (D-371).
 */
export function ownerOnly(path: string): void;
```

Deliberately absent: path-join re-exports (callers already use `node:path`,
which is portable), spawn wrappers (covered by D-361 adapters), drive
utilities (no caller). House style: no speculative abstraction — the seam
grows only when a second real consumer appears.

## 5. Spec spelling: `${TMP}` (compositions stop naming `/tmp`)

Composition defaults spell `"dataDir": "${TMP}/omega-chat/vault-data"`,
resolved at consumption by the vault's `resolveDataDir` (the single choke
point all vault file ops flow through). Recipes carry the token verbatim
(signed) and each machine resolves locally — one pinned recipe boots on all
three OS with zero edits. Resolving at compile time was considered and
rejected: it would bake machine-local temp dirs into signed recipes and fork
portability at the signature boundary. `/tmp/...` keeps working (mapped +
identical result) so old vaults and docs never break silently.

Relative dataDirs (e.g. `console.json`'s `dev-vault/console/vault-data`) pass
through verbatim and resolve against the process cwd — persistent-home
semantics for dev vaults. Prefer `${TMP}` for machine-local scratch; use
relative paths only when the composition intentionally names a repo-anchored home.

## 6. Enforcement: a new `os-surface` gate stage (D-361 pattern, copied)

Fail-closed from the day it lands, allowlist = `platform/src/*` only:

| Forbidden outside the seam | Regex (prod `*/src` only, tests excluded) | Why |
|---|---|---|
| Absolute tmp literals | `/\/tmp\//` | Must be `${TMP}` or `omegaTmp()` |
| OS branching | `/process\.platform/` | All branching lives in the seam |
| Raw permission calls | `/chmodSync|chmod\(/` | Must be `ownerOnly()` |
| Home-dir sniffing | `/os\.homedir|USERPROFILE|HOME/` | No caller needs it (add when one does) |

Test files (`*/test/*`) are excluded from this stage — same scoping as the
`bun-surface` stage — but migrate to `omegaTmp()` anyway (Phase 3) so suite
output stops scattering `C:\tmp` on Windows dev boxes. `node:os` `tmpdir`
imports are permitted in tests during migration (the seam re-export is
preferred for new code).

Pre-migration baseline first: land the stage in warn-and-list mode for one
commit (print hits, exit 0) so the hit count is on record, then flip to
fail-closed with the seam present. Two commits, no mystery reds.

## 7. Migration phases (each lands separately, each with gate evidence)

| Phase | Work | Falsifier / evidence |
|---|---|---|
| 0 | This design + D-372 PROPOSED | Owner approval (you are reading it) |
| 1 | `platform/` package + `os-surface` stage warn-mode, then fail-closed; `host` + `ensureVault` adopt `ownerOnly` | `omega:quick` green; stage lists exactly the allowlist |
| 2 | 10 dataDir values → `${TMP}` spelling + consumption-side resolution in the vault (recipes stay portable); grandfather mapping covered by vault + seam tests | All composition suites green; one boot per OS prints resolved dirs |
| 3 | Test files → `omegaTmp()` helper (mechanical, lane by lane) | Full suites green per lane; zero `/tmp` literals outside seam |
| 4 | Windows lane hardened (serial full gate via `OMEGA_TEST_CONCURRENCY=1`, stays informational until the soak flake retires by observation) + macOS informational lane; required-flag flip is the fast follow-up | ubuntu-required + both informational lanes green on one commit |
| 5 | Ratify D-372 (falsifier = Phase 4 matrix green) + CURRENT-INVARIANTS consolidation touch-up | Board refresh |

## 8. Acceptance criteria (when D-372 may ratify)

1. Same commit is green on ubuntu + windows CI lanes (macOS informational).
2. `os-surface` stage green with zero allowlist entries outside `platform/src`.
3. Zero `/tmp/` literals outside the seam (tests migrated).
4. `status.json` carries the `os-surface` stage; `verify-status` reproduces it.
5. `docs/WINDOWS.md` shrinks to setup-only (all behavior notes obsolete).

## 9. Risks and answers

- **Host LOC freeze (D-365):** seam is a dependency, not host code — host delta
  is +1 import line, offset by the removed chmod import (1013→1014/1100).
  `ensureVault` chmod hunk already spent in D-371.
- **Workspace dep churn:** each consumer adds one `package.json` edge; bun
  workspaces link it with zero config. Mechanical, lane-verified.
- **Composition token vs gate checker:** verified — the compositions stage
  ignores `config` values (no `config` references in `compositions.ts`), so
  `${TMP}` needs no checker change. As-built, resolution happens at
  consumption (vault `resolveDataDir`), not compile time: recipes carry the
  token verbatim and each machine resolves locally.
- **Windows soak flake (D-368):** unchanged by this design; lanes + Linux
  arbiter remain until retired. The design adds no new processes.
- **Scope creep into per-OS features:** the stage forbids the vocabulary such
  features would need (`process.platform` outside the seam fails the build).

## 10. What this document is not

Not a port plan (nothing is being ported), not a refactor of working code
(the pure core is untouched), not permission to add OS branches later (the
stage exists to say no). It is a fence, a spelling, and a checklist — in
that order.
