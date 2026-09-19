# D-341 — Boot-path content re-verification at scale (the D-330 backstop cost)

## Status

RATIFIED

## Context

`SCALABILITY-CEILINGS.md` §2 flagged that per-boot content hashing is O(n)
synchronous disk I/O on the boot critical path, and asked whether D-330's cache
covers the boot-time re-verification path or only compile. Verified against the
landed code: **D-330's cache skips `compileComposition` only — boot verify
rehashes every entry, fail-closed** (D-330's own Evidence: "A hit skips
`compileComposition` ONLY — boot verify rehashes (fail-closed) and workers
spawn fresh (B2)"). The gap is real and, by D-330's design, INTENTIONAL: the
host's full re-hash is the backstop that makes the daemon's mtime-based cache
safe to trust. Removing it with a host-side mtime+size cache would delete the
backstop and weaken B1 (a tampered file with preserved mtime+size would execute
under a signed name) — that option is rejected here, not merely deferred.

Measured on this machine (warm FS cache, spine composition, n=10):
warm re-verify p50 1.40 ms for 5 entries (~0.28 ms/entry warm; cold-cache boots
pay disk reads on top). The current cost is noise at today's plugin counts —
the Ω0 boot envelope (27 ms) dwarfs it. The concern is the MECHANISM at
"hundreds of plugins": linear synchronous rehash on the boot critical path
before bootPhase 0 can even start.

## Options

| Criterion | (a) Async + parallel full re-hash in `verifyComposition` (recommended) | (b) Host-side mtime+size hash cache | (c) Accept the linear cost, record the ceiling |
|---|---|---|---|
| B1 integrity | Full content verification per boot, unchanged — wall time drops, trust does not | Weaker than content-hash: mtime+size collisions are forgeable; deletes D-330's backstop | Unchanged |
| Boot wall time at scale | O(largest single plugin) instead of O(total bytes) — independent dirs hash concurrently | O(changed files) — best case | O(total bytes), synchronous |
| Host LOC | ~25–35 (async contentHashDir variant + concurrent verify loop + call-site changes) | ~10 | 0 |
| B5 (zero slack at 1,400) | Requires trimming an equivalent amount or a further bump — the gate stays law either way | Fits only by weakening a law — fails on its own | No pressure |

## Decision

**Decision:** (a) — async plus parallel full re-hash, funded within B5 by comment-trim.

## Consequences

- The mechanism and the measured numbers are now on record — the next person
  does not re-derive the D-330 coverage question (it cost this wave a full read
  of the record to answer).
- The flat op-namespace concern (`SCALABILITY-CEILINGS.md` §5) is PARTIALLY
  RESOLVED by D-340's kernel, landed this wave: multiple offerors of the same
  tool name are now a legitimate, resolvable case (generations + declared-range
  resolution) rather than always a fatal conflict; exact-op collisions within
  one recipe are still refused at compile (correct, unchanged). Parse-time
  reverse-DNS id enforcement for third-party manifests remains a manifest
  POLICY question (it would not affect the existing first-party ids) — separate
  record if wanted.
- The live-compartment resource ceiling (§1) is D-321's tracked follow-up
  (RATIFIED honesty gap; watchdog design recorded there) — not re-opened here.

## Evidence

- `host/src/recipe.ts` `verifyEntryWithRoot` — the per-boot full re-hash
  (`contentHashDir` per entry, synchronous).
- `docs/decisions/D-330-content-hash-cache.md` Evidence — "boot verify rehashes
  (fail-closed)" — the backstop this record refuses to delete.
- Measured (this wave, `BENCHMARKS.md` D-340 kernel entry context): warm
  re-verify p50 1.40 ms / 5 entries / n=10; law gate 4,331 ops/s; vault
  1,777 writes/s — the scale model for any future boot-envelope claim.
- This wave, `tooling/bench/boot-reverify-scale.ts` (synthetic 4-file fixtures):
  sync warm p50 137ms at 50, 277ms at 100, 625ms at 300; async warm p50 66ms at 50,
  132ms at 100, 321ms at 300 — 1.9x to 2.1x wall cut, same bytes same order.
  Async hash equals sync hash on fixture dirs; demo boot stays green.
- Landed (a) as `contentHashDirAsync` plus `verifyEntryWithRootAsync` plus
  `verifyCompositionAsync` with boot cutover; host 1450 to 1496 gate math
  with 4-line D-340 slash D-331 comment trim to pointer, no B5 raise.
- Ratified on landing commit `d6e5f78`: bench halves wall at 50 slash 100 slash
  300 plugins with identical hashes; `omega:quick` structural green plus host,
  ghost-deep, steward, watchdog, and run-integration lanes green; full-gate
  reds on this Windows box are pre-existing environmental failures proven
  identical on the pre-wave baseline — symlink EPERM, chmod best-effort,
  node lane, sibling layout drift.
