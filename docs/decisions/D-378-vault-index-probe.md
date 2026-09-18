# D-378 — W0-3 vault index probe: writer-maintained conversation index + scale numbers

## Status

RATIFIED

## Context

W0-3 demanded the retention/index groundwork BEFORE years of rows exist: the
`chat` ns relied on a total-ns scan (`vault.query` idPrefix `msg_`) plus one
`vault.get` PER message row for every history read and every append's cap/seq
check — O(total ns size) per op, with Wave3 writing multi-thousand-message
histories into what would then become a migration instead of a feature. The
need text fixed the shape: a writer-maintained index row (design in the
record), retention windows per ns with numbers, the compaction interaction
stated, and a probe bench (1K/10K/100K messages, bounded history-read)
published in Wave0; the full index ships with the rows it indexes in Wave3.

## Options

| Criterion | (a) Writer-maintained per-conversation index row, bounded by the existing cap (this row) | (b) New vault-side secondary index (vault API change) | (c) Defer everything to Wave3 |
|---|---|---|---|
| Wave0 falsifier (bounded read at 100K) | Met — reads fetch ≤ CHAT_HISTORY_CAP rows | Met | Not met |
| Blast radius | Plugin-local (vivim-chat); zero host, zero contracts | Vault API + every driver + parity suite | None |
| Legacy rows | Scan fallback keeps them readable; Wave3 backfills | Same | Same |
| Crash window | Msg append + index append are two vault appends in one critical section (C-1) — a hard crash between them undercounts the index (the msg row survives in the changelog; Wave3 backfill repairs; no duplicate seqs — the next append reuses the seq) | n/a | n/a |

## Decision

**Decision:** (a) Writer-maintained per-conversation index row — vivim.chat
appends `idx_<hex>` (latest-wins, ns `chat`, meta.type `conversation-index`)
holding `{conversationId, count, entries:[{id, seq}]}` in the SAME append
critical section as each message; `chat.history` reads the index and fetches
≤ CAP message rows (the legacy scan remains the fallback for un-indexed rows;
a PRESENT-but-corrupt index row refuses fail-closed, never downgrades
silently); `chat.append`'s cap/seq check reads the index when present
(the cap refusal names the path: "indexed" vs "scan"); the legacy backfill
derives the first index row from the scan (bounded — the cap check precedes
it). Entries are bounded by construction: the same CHAT_HISTORY_CAP (200)
the append path enforces bounds `entries`, so an index row can never exceed
200 entries. Wave3 full build = retention enforcement + formal backfill +
repair of the crash window; this record is the design pointer Wave3 reads.

Two probe-driven storage fixes landed with the index (both evidence below):
the `changelog_ns_id_rev` index (next-rev resolution was a FULL SCAN per
append — 4.7 → 33 ms/msg degradation between 1K and 10K rows) and
`ftsInsert` replacing `ftsUpsert` (the defensive DELETE scanned the whole
FTS table per append — measured 50× per-row cost; a committed FTS row can
never pre-exist on the append path since rev is minted MAX+1 inside the
transaction and the objects PK rejects duplicates first). The Merkle chain,
changelog semantics, and the D-373 driver parity digests are untouched
(schema indexes and an INSERT-only path do not change any query result).

**Retention windows per ns (declared policy now, mechanical enforcement in
Wave3 with the full index; compaction interaction: refs are honored by
compaction today, the changelog is append-only forever, superseded revisions
move to cold_objects — never deleted):**

| ns | Window (hot → cold) |
|---|---|
| `chat` | conversations hot 180d; conv rows' superseded revs cold after 90d; refusal ledger rows 400d; messages bound by CHAT_HISTORY_CAP=200/conversation (enforced now) |
| `email` | keep-all v1 (pack policy); per-folder windows stay the named open question |
| `automation` | ledger rows kept while the rule lives + 180d |
| `discovery` | promotion events forever (proof chain); graphs/captures cold after 365d unless cited |
| `agent` | exec rows while the agent lives + 365d |
| `behavior` | all revs forever (rollback walks history — by law, never compacted) |
| `decision` | append-only forever (genealogy, parent refs must resolve) |
| `providers` | latest-wins; superseded revs cold after 30d |
| `law` | latest-wins per principal; superseded revs cold after 90d |
| `resolve` | kept while referenced by scorecards + 365d |
| `control` | latest-wins per id; superseded revs cold after 90d |

## Consequences

- History reads and append cap/seq checks are O(cap) instead of O(ns) —
  the probe's bounded-read claim holds at every scale measured.
- The scan fallback and the indexed path coexist until Wave3 backfills;
  new conversations are always indexed (append creates the row on first
  message), so the fallback is a legacy-only path by construction.
- The probe lives at `tooling/bench/vault-probe.ts` (`omega:probe`), one-off,
  never part of omega:gate; numbers land in `build/vault-probe.json` +
  `40-EVIDENCE/W0/vault-index-probe.md` + a BENCHMARKS.md section.
- Wave3 owes: retention enforcement (the table above becomes code), formal
  backfill, index-repair after a mid-append crash.

## Evidence

- Probe (`bun run omega:probe`, real boot of compositions/chat.json; full
  table in `docs/migration/40-EVIDENCE/W0/w0-close-vault-index-probe.md`):
  indexed history p50 11.35 → 11.78 → 11.95 ms as the ns grows 1K → 11K →
  111K (111×) — FLAT; solo chat.append p50 3.59 → 3.72 → 4.65 ms — flat;
  the 201st append refuses fail-closed on the indexed path;
  `vault.verify@1` green over the whole corpus.
- Storage-fix falsifiers: the degradation the probe caught (4.7 → 33
  ms/msg before the changelog index; the FTS DELETE evidence run measured
  0.059 vs 3.0 ms/row) — both fixed and re-measured flat. A progressive
  slowdown in three earlier probe runs is attributed with evidence to DISK
  EXHAUSTION (orphaned scratch vaults, ENOSPC crash; four isolation benches
  could not reproduce it at any layer) — see the methodology note in the
  evidence file.
- Unit: vivim-chat suite (30 tests incl. the indexed cap refusal at 201st
  append + index/history agreement); vault suite green post-index;
  driver parity digests unchanged. Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
