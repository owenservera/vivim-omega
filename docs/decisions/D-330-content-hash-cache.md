# D-330 — Content-hash cache (latency C)

## Status

RATIFIED

## Context

With the daemon warm (D-322) and isolates pooled (D-329), repeated boots of
identical plugin content still pay verification + spawn per call. Content
hashes are already verified (`contentHashDir`); a daemon-side map keyed by
them turns repeat boots into token mints. Staleness is the failure mode that
matters — a stale hit executes the wrong code under the right name.

## Options

| Criterion | (a) Daemon-side map on verified hashes, LRU-bounded, miss boots only non-matching entries (this record) | (b) Unbounded cache | (c) No cache (pool is enough) |
|---|---|---|---|
| Staleness | Unobservable to a correct caller (byte-identical `router.status()`/routed-op behavior, tested) | Same hits, unbounded memory | N/A |
| Memory | LRU-bounded | Unbounded growth | N/A |
| Mismatch direction | Self-restart on content-hash mismatch (D-322's pattern, reused) | Same | N/A |

## Decision

**Decision:** (a) Daemon-side map on verified hashes, LRU-bounded, miss boots only non-matching entries — hit mints tokens only, no spawn; test: cache-hit and cold-boot produce byte-identical behavior.

## Consequences

- Prerequisite: D-329 (pool-backed miss path).
- Falsifier appended to `BENCHMARKS.md`: cache-hit equivalence numbers.
- Every new "absent" state logs and refuses loudly (silent-staleness mitigation).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.5-C); dependency chain from `OMEGA-19X-LATENCY-DESIGN.md` (Upgrade C).
- `surfaces/daemon/src/cache.ts`: `specCacheKey` (entry id/source/grant/bootPhase/config — build artifacts never the key) + LRU `CompileCache` (bound 8; hit/partial/miss; vault-scoped keys so a record never serves a different vault).
- `surfaces/daemon/src/daemon.ts`: two-step lookup (mtime restat first — hit skips hashing AND compile; restat-moved → rehash → all-match hit / some-match partial naming survivors / none miss). A hit skips `compileComposition` ONLY — boot verify rehashes (fail-closed) and workers spawn fresh (B2); "mint tokens only" is the per-hit fresh crypto. The per-entry partial boot awaits D-329's pool + a host partial-boot primitive (no host changes per G11); the matched list is its recorded input.
- Staleness: verified-hash comparison (not mtime trust alone) + verify-on-boot retained + changed-sources-miss proven live (marker v1→v2 through a temp plugin copy; the repo tree is never written by the test).
- `surfaces/daemon/test/cache.test.ts`: key/LRU unit tables + cold→warm switch-back equivalence (identical routedOps + call results; misses 2 / hits 1) + changed-sources partial + never-stale behavior.
- Prerequisite note: landed WITHOUT D-329 (sequencing inverted honestly — the cache composes with lazy, not with the pool; the pool-backed miss path is D-329's recorded follow-up).
- Falsifier run: cache suite 4/4 + daemon suite green; reboot numbers in `BENCHMARKS.md`; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
