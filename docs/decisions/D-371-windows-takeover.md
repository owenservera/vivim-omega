# D-371 — Windows takeover conversion (team works on Windows from here)

## Status

RATIFIED

## Context

Ownership moves to a Windows-only team. Audit of 4a108d7..979e215 found
exactly one Windows-unsafe code path (`chmodSync` mode bits in
`host/src/boot.ts` — Windows enforces ACLs, and a throwing chmod would fail
every first boot), plus three takeover gaps: no `.gitattributes` (per-file
CRLF warnings), no Windows setup/runbook doc, and no one-line setup script.
The 90 `/tmp/omega-*` paths (tests + composition defaults) resolve
drive-relative (`C:\tmp\…`) and are proven green on Windows — rewriting ~60
files buys nothing and risks the gate. The tar-symlink and MCP-soak behaviors
are environment facts to document, not code to change.

## Options

| Criterion | (a) Harden chmod + attributes + runbook + setup script (this row) | (b) Full /tmp → os.tmpdir() rewrite (~60 files) | (c) Nothing (take over as-is) |
|---|---|---|---|
| First-boot safety on Windows | Yes (best-effort chmod, never throws) | Same | chmod throws only on locked ACLs (rare, but real) |
| CRLF noise | Gone (repo-normalized LF) | Gone | Every new file warns |
| Takeover onboarding | One page (WINDOWS.md) + `omega:setup` | Same + diff churn | Tribal knowledge |
| Gate risk | Minimal (1 host hunk + inert files) | High (60-file touch, composition diffs) | Zero |

## Decision

**Decision:** (a) Harden chmod + attributes + runbook + setup script —
`ensureVault` chmod becomes best-effort try/catch (writeFileSync mode already
applied where supported); `.gitattributes` normalizes code to LF;
`docs/WINDOWS.md` records setup, daily commands, and the four verified
Windows behaviors (temp paths, chmod, MCP soak flake with clean-tree
baseline, decisions-test timeout); `omega:setup` alias for `bun install`;
README points at the runbook.

## Consequences

- Host grows by 1 line (1013→~1014/1100, frozen budget holds).
- `/tmp` paths stay by explicit decision (documented, proven) — revisit only
  if a box without a writable drive root appears.
- Composition specs untouched (no gate-compositions churn); CI lanes
  unchanged (Linux arbiter, windows informational per D-320).

## Evidence

- `bun run omega:quick` green on the landing commit (structural stages).
- Host boot-path suites green (every boot exercises `ensureVault`).
- Landed in 7a2ab02 (windows takeover PROPOSED; quick GREEN, lanes 37/37).
