# D-335 — M2: conversation storage lives in the vault as-is for the pilot

## Status

RATIFIED

## Context

Legacy stores ~200 relational models in Prisma/SQLite; omega's vault is a
namespace/id/rev Merkle-chained KV store (WAL+FTS5) proven at demo and
decision-record scale, never at chat-history scale. The pilot must persist
messages, so the storage answer is needed before it writes its first row —
but the answer can be a decision with an explicit ceiling, not new machinery.

## Options

| Criterion | (a) Vault as-is for the pilot, retention explicitly open (recommended) | (b) Plugin-owned SQLite behind a vault-compatible facade now | (c) Port a Prisma subset into omega |
|---|---|---|---|
| Pilot cost | Zero new storage code (a namespace row + retention note) | New plugin + facade + its own gates before the pilot proves anything | Reimports the retired ORM layer (D-333 just retired it) |
| Scale honesty | Ceiling accepted in writing, revisit trigger defined | Higher ceiling, unproven facade | Familiar ceiling, wrong architecture |
| Evidence fit | Matches every prior wave (vault-backed, ledgered, mind-queryable) | Facade has no readers yet | No wave supports it |

## Decision

**Decision:** (a) Vault as-is for the pilot, retention explicitly open — conversation/message data lives in vault namespaces under the existing conventions; the retention policy stays an open question with a defined revisit trigger instead of a premature second store.

## Consequences

- The pilot persists through vault appends under an `email`-style convention (a `chat` namespace row lands in `VAULT-NAMESPACES.md` with the pilot commit, same-commit rule).
- Accepted ceiling: single-provider pilot volume on WAL+FTS5; revisit when message latency or compaction pressure shows in benchmarks, not before.
- Option (b) stays the named fallback with its shape already specified (facade, vault-compatible reads); no work starts on it during the pilot.
- Legacy model shapes (Conversation/Message/StreamBlock per M-TRIAGE-01 T-11) are the schema input, never the runtime.

## Evidence

- `Migration/M-TRIAGE-01.md` T-03/T-11 (17 harvestable provider/session/conversation shapes; Prisma runtime REMOVE).
- `docs/VAULT-NAMESPACES.md` open question (email retention undecided, no pressure yet) — this record scopes the pilot under it.
- Vault scale posture is gate-proven every run (attest round-trip + FTS search over the shared fixture DB).
- Ratification: owner directive 2026-09-13 (proceed on the record's recommendation); landed PROPOSED in c09c140; full `bun run omega:gate` GREEN on c09c140 (612/612, host 984/1000) — ratified on that evidence.
