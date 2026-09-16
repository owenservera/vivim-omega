# D-368 — Test lanes + quick gate (D-317 trigger reached at 733)

## Status

RATIFIED

## Context

D-317 set the sharding trigger at ~700 tests (count, not wall clock). Tree now runs 733. Full `bun test` at default concurrency flakes on loaded boxes; the gate already caps at 4-wide (64s green vs 300s+ flaking at 20). Inner loop needs a fast lane that skips tests/attest without touching the merge gate.

## Options

| Criterion | (a) Lane scripts + --quick gate (this row) | (b) Full shard in CI now (parallel jobs per lane) | (c) Nothing (keep single bun test) |
|---|---|---|---|
| Inner-loop speed | Yes (`omega:quick` = host-loc/decisions/compositions/bun-surface, no tests) | Fastest in CI, no local gain | Slowest |
| Merge-gate strength | Unchanged (full gate still required) | Unchanged + faster signal | Unchanged, slower signal |
| Cost / risk | ~10 lines (scripts + early-exit, no status write) | CI matrix + status-shape risk | Zero |
| Flake visibility | Same (full tests still run pre-merge) | Better (lane attribution) | Worst |

## Decision

**Decision:** (a) Lane scripts + --quick gate — `omega:test:host/plugins/surfaces` lane scripts + `omega:quick` (`gate.ts --quick`: structural stages only, no tests/attest/status write). Full sharded CI jobs follow once lanes prove stable (deferred, not in this diff).

## Consequences

- `bun run omega:quick` becomes the local pre-commit check; `bun run omega:gate` remains the merge gate.
- No status.json shape change (quick writes nothing); `verify-status` unaffected.
- Lane split is by directory convention (host+tooling/gates, plugins+packs, surfaces+sdk+testkit) — move a file, it changes lanes automatically.

## Evidence

- `bun run omega:quick` green on the landing commit (structural stages only).
- Lane runs green: watchdog+sdk/chat suites 36/36, adversarial 15/15 (incl. 13/14 with D-366 fast/graceful paths), MCP isolated 11/11, decisions 11/11 with --timeout 60000.
- Full-serial soak on Windows: 727/735 with 8 MCP stdio `uv_spawn EUNKNOWN` flakes (handle exhaustion after ~200s of worker spawns); clean-tree baseline on the same box: 730/733 with 3 same-suite flakes — pre-existing environment soak flake, not a regression. Merge gate stays full `omega:gate`; Linux CI (`gate-reproduce`) is the green arbiter for this wave.
- Landed in 7d2cea7 (owner wave 001 PROPOSED; quick GREEN, lanes GREEN).
