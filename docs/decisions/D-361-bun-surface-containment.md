# D-361 — Bun surface containment: one declared adapter, runtime-neutral production tree

## Status

RATIFIED

## Context

`bun:sqlite` (vault), `Bun.sleepSync` (host canon.ts + vault cas.ts), `Bun.file`
(host main.ts, surface boots), `Bun.listen` (daemon), and `Bun.spawn`
(daemon-client) meant the codebase ran, built, and verified ONLY under Bun. The
external review (turn-014 tree) named the cost: independent verification and
deployment both require taking Bun's toolchain on faith, and nobody could tell —
without reading everything — whether Bun-ness was two chokepoints or a smear.
The truth was in between: the RUNTIME-relevant surface was small; the toolchain
surface is Bun by definition (the gate itself runs `bun test`).

## Options

| Criterion | (a) Adapter inventory: neutralize production, declare + gate-enforce the one adapter (this row) | (b) Full Node port including tooling | (c) Document Bun requirement only |
|---|---|---|---|
| Independent verification of the core | Yes — node canary runs the canon suite | Yes | No |
| Swap cost for a Node deployment | One module (vault db.ts) | Whole toolchain rewrite | n/a |
| Risk of silent re-smear | No — gate `bun-surface` stage fails the build | n/a | Yes |
| Cost | Mechanical swaps + ~25 gate LOC | Large, ongoing | One README line |

## Decision

**Decision:** (a) Adapter inventory — neutralize production, declare + gate-enforce the one adapter.

- `plugins/vivim-vault/src/db.ts` is the ONLY `bun:sqlite` importer (it exports
  `openDatabase` + re-exports the `Database` type; changelog/roundtrip/tests ride it).
  A Node build swaps exactly this module (`node:sqlite` or `better-sqlite3`).
- All sleep uses are `Atomics.wait`-based `sleepSync` (shim export for plugins;
  host-local in canon.ts) — runtime-neutral, no adapter needed.
- Production swaps: `Bun.file` → `node:fs` readFileSync (host main.ts, cli/mcp/web boots);
  `Bun.listen` → `node:net` createServer (daemon, same newline-JSON protocol);
  `Bun.spawn` → `node:child_process` (daemon-client); decisions checker + status emitter
  become node-compatible (`node:child_process` + `node:fs`).
- Dev/test toolchain stays Bun (**≥ 1.3.14 pinned, stated in README's Run section** —
  the gate runs `bun test`; that is toolchain, not production surface).
- **Gate `bun-surface` stage**: scans every production dir (including all `plugins/*/src`)
  for `Bun.` calls and `bun` imports; the only allowed hit is the declared vault adapter.
  The inventory can no longer smear silently.

## Consequences

- `grep -rn "Bun\." --include="*.ts"` over the production tree returns nothing; the
  declared adapter is the single documented exception, and the gate enforces the claim
  mechanically instead of by convention.
- The daemon now runs its TCP loop on `node:net` — protocol, ports, daemon-file
  handshake, and tests unchanged (daemon tests green on the landing commit).
- A future Node build owns exactly two changes: swap `db.ts`'s import, run the toolchain
  under Bun as today (or port the gate later — (b) remains available, unforked).

## Evidence

- Gate `bun-surface` stage green on the landing commit (scan: 30 production dirs).
- Node canary (D-362): canon suite 5/5 under Node 24 — `node --test tooling/ci/canon-canary.test.mjs`.
- Daemon/CLI/MCP/web/vault suites green on the landing commit (726/726).
- Landed in 0df18d0 (the remediation-wave commit; gate GREEN 733/733, host 999/1000, all seven stages incl. the new bun-surface stage).
