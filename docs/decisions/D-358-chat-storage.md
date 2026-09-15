# D-358 — M2: chat storage in the vault (the `chat` namespace, first writer)

## Status

RATIFIED

## Context

The map's begin order names the chat pilot wave the next code wave (item 1,
from D-358). D-335 ratified the storage answer in advance: the pilot persists
through vault appends under an `email`-style convention — a `chat` namespace
row lands in `VAULT-NAMESPACES.md` with the pilot commit (same-commit rule) —
with the ceiling accepted in writing and option (b) (plugin-owned SQLite
behind a facade) named but not started. No `Conversation`/`Message` shape
exists anywhere in the tree today; ns `chat` has never been written. The
prerequisites the shape depends on are all landed-this-lineage now: D-353's
`user:<id>` principal gives `Conversation.principal` something to name with
zero new authority machinery, and D-352's `StreamChunk`/`meta.emit` gives the
streamed-arrival path its persistence hook ("ordered chunk refs → assembled
content, not a separate store" — M-Pilot Part 1 §M1/M2).

## Options

| Criterion | (a) Vault ns `chat`, vivim.chat first writer (recommended) | (b) Plugin-owned SQLite facade now | (c) Reuse ns `email` with a chat marker |
|---|---|---|---|
| D-335 fidelity | One-for-one: vault as-is, namespace row in the same commit, retention open with a named revisit trigger | Contradicts the ratified "no new storage code during the pilot" consequence | Overloads a domain namespace — message provenance (realizationRef) would lie about what produced the row |
| Shape fidelity | Conversation/Message per M-Pilot §M2, Merkle-chained like every other ns | A parallel store with no readers | Stream/realization refs semantically wrong |
| Falsifier | Real boot: open → append → history, sibling isolation, streamRef round-trip | Facade gates before the pilot proves anything | Cross-namespace contamination unprovable |

## Decision

**Decision:** (a) Land `plugins/vivim-chat` (0.1.0) — the FIRST WRITER of
vault ns `chat` — plus the shared record vocabulary:

1. **Contracts** (`contracts/src/chat.ts`): `ChatConversation`
   `{id, principal, title?, createdAt}` — `principal` is a plain string
   (D-353: `user:<id>` / `agent:<id>` / composition principals classify, they
   are never rejected); `ChatMessage`
   `{id, conversationId, role, seq, content, providerId?, realizationRef?,
   streamRef?, createdAt}` — `realizationRef` ties the message to the
   `ProviderRealization` that produced it (provenance, `VaultProvenanceRef`
   pattern), `streamRef {streamId, chunks, finalSeq}` references M1's chunk
   envelope when the message arrived streamed (the persistence hook: ordered
   chunk refs → assembled content — the chunk DATA is not duplicated);
   `chatConversationId()` / `chatMessageId()` (pure TOTAL id grammar);
   `asChatConversation` / `asChatMessage` narrowers; `CHAT_HISTORY_CAP`
   (bounded scans). Same ns/id/rev Merkle convention as every other
   namespace — explicitly NOT a new storage engine (D-335 option (b)
   deliberately not started).
2. **Plugin** (`plugins/vivim-chat`, three CONTRACT contributions):
   - `chat.open@1` (MUTATION) `{principal, title?}` → creates
     `conv_<8hex>` in ns `chat` — the conversation row D-353's consequence
     names ("M2's Conversation.principal is a plain `user:<id>` string").
   - `chat.append@1` (MUTATION) `{conversationId, role, content,
     providerId?, realizationRef?, streamRef?}` → appends `msg_<8hex>`;
     the conversation must resolve (attributable refusal otherwise); `seq`
     is assigned by the writer (prior count + 1) so history order is
     vault-derivable, never caller-asserted.
   - `chat.history@1` (READ) `{conversationId, limit?}` → bounded,
     seq-ascending messages for one conversation (scan capped at
     `CHAT_HISTORY_CAP`; sibling conversations cannot leak).
3. **The M1→M2 persistence hook, exercised by the provider:**
   `chat.complete@1`'s SIMULATOR path gains an ADDITIVE emission — ordered
   word-chunks via `meta.emit` (strict-seq, close-once — the shim enforces
   D-352's law) before returning the unchanged `ChatCompletion`. Single-shot
   callers observe nothing (sink-or-drop cold fallback, D-322/D-352
   placement); streamed callers assemble the same bytes the return carries.
   The request/response CONTRACT is unchanged — no op version bump, the same
   additive precedent the browser replay used (D-357). The live leg stays
   single-shot (owner-machine, unreachable in-sandbox).
4. **Composition** (`compositions/chat.json`): law + vault + director
   (resolve.* — D-359's consult target) + provider.llm (chat.complete@1) +
   vivim.chat with explicit grants (vault append/get/query + the chat ops);
   nothing implied (G9).
5. **Bookkeeping (same-commit rule):** ns `chat` row in
   `docs/VAULT-NAMESPACES.md` — owner vivim.chat, `conv_*` latest-wins,
   `msg_*` append-only ledger, retention open with D-335's stated revisit
   trigger (message latency or compaction pressure in benchmarks, not
   before).
6. **Policy parity inherited from day one:** `LAW_POLICY_V1` → **1.3.0**
   adds exact rows `chat.open@1` → MUTATION and `chat.append@1` → MUTATION
   (vault-internal writes, same class family as `vault.*` — never
   default-riding, D-351's lesson). The D-351 parity net covers both ops the
   moment the composition ships. `chat.history@1` is READ (never
   gate-triggering).

## Consequences

- The chat pilot can persist both sides of an exchange (user utterance,
  assistant completion) with full provenance: which realization produced the
  completion, and whether it arrived streamed — without a second store and
  without touching the host (LOC wall untouched at 997/1000).
- `streamRef` makes streamed messages distinguishable from single-shot ones
  at history time — the M1 falsifier's ordered-delivery proof now has a
  DURABLE consumer.
- The parity net's domain grows by exactly two ops; both carry deliberate
  exact rows, so the gate says what the manifests say from the first boot.
- Option (b) (facade) stays the named fallback with its shape already
  specified; no work starts on it during the pilot.

## Evidence

- `docs/decisions/D-335-storage-scale.md` — the ratified storage answer this
  record implements (vault-as-is, `chat` ns row same-commit, ceiling +
  revisit trigger).
- M-Pilot Part 1 §M2 (`upload/M-PILOT-MISSING-CORE.md` lines 69–89) — the
  shape list implemented one-for-one; §M1 line 64–65 (the persistence hook
  this record wires through chat.complete's additive emission).
- `docs/decisions/D-353-human-principal-reland.md` — the principal
  `Conversation.principal` names, zero new tables.
- Landed in this wave: `plugins/vivim-chat/test/chat.test.ts` (unit:
  validation tables, seq assignment, narrowing, bounds) +
  `plugins/vivim-chat/test/pilot.test.ts` (the real boot: open/append/
  history, sibling isolation, streamRef round-trip through
  `callAsRootStream`, attributable refusals) +
  `plugins/vivim-law/test/policy-parity.test.ts` (policy 1.3.0 rows).
- Gate evidence: full `bun run omega:gate` GREEN on the wave tree (0cfb7bc):
  718/718 tests (+27 vs the M0 wave's 691), host 997/1000,
  host-loc/fresh-tree/decisions/compositions/attest all pass; attest commit
  64f0fb2. The D-351 parity net covers chat.open@1/chat.append@1 from the
  first boot (exact rows, policy 1.3.0).
- Ratification: owner directive 2026-09-15 ("continue developing" — the
  map's begin order names the chat pilot wave from D-358); landed PROPOSED
  in 0cfb7bc; full `bun run omega:gate` GREEN on 0cfb7bc (718/718, host
  997/1000, all stages) — ratified on that evidence.
