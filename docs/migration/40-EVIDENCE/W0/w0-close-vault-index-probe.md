# W0-3 vault index probe — the D-378 falsifier run (2026-09-16, `bun run omega:probe`)

One real boot of `compositions/chat.json`. The 1K/10K corpora are written by the
REAL writer path (serial `chat.append@1`); the 100K corpus is seeded at the vault
layer with writer-shaped rows (root `vault.append@1` — the exact bytes
chat.append writes) with the chat layer still measured by the solo samples and
the falsifier ops. Full JSON: `build/vault-probe.json` (run output in the
BENCHMARKS.md entry of the same date).

## The numbers

| ns size at read | mode | append batch (ms/msg) | solo chat.append p50/p99 (ms) | indexed history p50/p99 (ms, limit 50) |
|---|---|---|---|---|
| 1,000 | chat.append | 3.67 | 3.59 / 8.76 | 11.35 / 35.78 |
| 11,000 | chat.append | 11.83 | 3.72 / 4.70 | 11.78 / 36.54 |
| 111,000 | root-seed + chat samples | 0.556 (root seed) | 4.65 / 6.50 | 11.95 / 76.83 |

- **Bounded history read (the falsifier):** indexed `chat.history@1` p50 stays
  11.35 → 11.78 → 11.95 ms as the ns grows **111×** — flat by construction
  (≤ CHAT_HISTORY_CAP=200 gets), now proven at 100K scale.
- **Per-append latency:** solo chat.append p50 3.59 → 3.72 → 4.65 ms across the
  same 111× growth — flat (the +1ms at 111K is the idx-row blob growth).
- **Cap refusal on the indexed path:** the 201st append refuses fail-closed
  (`conversation … reached the 200-message indexed cap … refusing fail-closed`).
- **Integrity:** `vault.verify@1` green over the whole 111K-message corpus.
- Storage fixes the probe forced (both in this landing): `changelog_ns_id_rev`
  index (next-rev resolution was a full scan per append — 4.7→33 ms/msg
  degradation between 1K and 10K rows) and `ftsInsert` replacing `ftsUpsert`
  (the per-append defensive DELETE scanned the whole FTS table — measured
  0.059 vs 3.0 ms/row, 50×).

## Methodology note — the disk-exhaustion artifact (recorded honestly)

Three earlier probe runs showed a progressive within-batch slowdown (up to
90 ms/msg) that four isolation benches could NOT reproduce at any layer
(vault.append p50 ≤ 0.5 ms at 100K rows; vault.get 0.01 ms; journal 0.003
ms/line; router+law+vault hop ~0.3 ms flat). The last of those runs crashed
`ENOSPC` — repeated killed runs had accumulated 3.6 GB of orphan scratch
vaults in `${TMP}` on a 4 GB-free disk. On a cleaned disk the entire probe
runs in ~90 s with the flat numbers above: **the slowdown was disk exhaustion,
not product code.** Lessons recorded: (1) probe scratch under `${TMP}` needs
cleanup on failure (the probe already `rmSync`es its own dir on success and
crash — the orphans were the killed runs); (2) any future "latency degrades
with scale" claim on this box must first show `df` headroom.
