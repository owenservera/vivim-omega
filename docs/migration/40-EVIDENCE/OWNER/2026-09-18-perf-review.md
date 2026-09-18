# Evidence — D-387 hot-path performance remediation (2026-09-18)

Source: external performance review of `vivim-omega-latest` (reviewed at 4cf5283),
9 findings, all verified against the tree before any code moved. Record:
`docs/decisions/D-387-perf-remediation.md`. Landing SHA `e2f756b` (PROPOSED),
ratified at `af771ac`. Reproduce any number below with
`bun tooling/perf/perf-remediation.ts` on the respective checkout.

## Measured before/after (same harness, same host, Bun 1.3.14)

| Case | Before | After | Note |
|---|---|---|---|
| B · compact, 2,000 candidates | 782.1 ms | 17.97 ms | per-row FTS scan → one temp-table batched delete; zero FTS orphans both sides |
| E · journalHistory last-60 @ 5.7 MB | 8.56 ms | 1.08 ms | whole-file read (grows with lifetime size) → bounded backward read (flat) |
| A · 200-id namespace window, in-process | 2.8 ms | 2.43 ms (1.87 batched) | the real win is structural: 201 → 2 port hops per namespace per poll tick, plus 4-way parallelism |
| C · verify, 4,000 entries | 24.59 ms | 24.36 ms | flat at this scale — the set-based probe's win grows with vault size (per-row seeks removed) |
| D2 · liveRefs, 5,000 objects, 0% refs | 3.16 ms (old algo, inline) | 3.78 ms | prefilter REJECTED — SQLite json_extract loses to V8 JSON.parse |
| D · liveRefs, 5,000 objects, 50% refs | 3.86 ms (old algo, inline) | 7.06 ms | same — reverted per measured-not-assumed |

## The console steady-state cost model (finding #1, the HIGH blast radius)

- Zero connected sockets: poll reads NOTHING (was: 3 namespaces × (1 query + ≤200
  sequential gets) = up to 604 port round trips + full bodies every 500 ms, forever).
- One watcher, no change: 4 parallel light evidence reads — registry + 3×(query +
  one `vault.getmany@1`), bodies never fetched.
- Version change: one full snapshot fetched for the emit (bodies included), as before.

## Deferrals and rejections recorded in D-387

- #3 reverse-reference index — deferred. Trigger: compaction runs periodically
  against multi-GB vaults (schema change to vault format v1 needs its own cycle).
- #3 json_extract prefilter — implemented, measured slower, REVERTED (rows above).
- #7 batch-append fsync boundary — deferred. Trigger: a bulk-import wave
  requirement (≥1k objects/call) gets an explicit `vault.appendMany` with a
  documented, distinct durability guarantee.
- #8 test-only compile-path hash cache — deferred. Trigger: the Budget-watch
  suite wall-time line flags `bun test` as a cost item (recheck near ~1,000 tests).

## Gate truth

- Gate GREEN ×2 at 871/871 tests (24 new falsifiers: vault 10, web 8, policy 6),
  host 1039/1100 FLAT — zero host LOC in the entire remediation.
- Matrix byte-identity 16/16 after regen; the driver conformance workload
  (append → verify → search → roundtrip → compaction, bun:sqlite ≡ node:sqlite)
  exercises the new SQL cross-runtime.
- Environment note: during this remediation the gate's fresh-tree stage caught
  both legacy mines (vivim-final-enhanced, vivim-final-program) with mode-only
  pollution (100644→100755, zero content diffs — an archive-extraction artifact);
  both restored to clean at their pinned HEADs (afebe00 / 4a5eb84).
