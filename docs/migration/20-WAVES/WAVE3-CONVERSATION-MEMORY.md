# W3 — Conversation / Memory Stratum

**Objective:** legacy conversation/memory shapes on the chat+credentials spine, at scale, single-principal.
**Consumes:** T-11 (conversations/messages/sessions/checkpoints/stream-blocks), T-16 (confirm semantics → consent data), GAP-M2 (index full build), GAP-M3 (boundary enforcement).
**Touches:** `plugins/vivim-chat`, `plugins/vivim-credentials`, ns `chat` + ns `law` (forbidden) + consent tables, `VAULT-NAMESPACES.md` retention numbers.

## Tasks

1. Full per-conversation index (W0 probe → production); `CHAT_HISTORY_CAP` on the indexed path, fail-closed.
2. Retention windows enforced per ns (W0 numbers → code); compaction drill (no cited rev collected; changelog forever; cold fallback).
3. Workspace/session/key rows attributed to `user:<id>`; no cross-principal reads (W0 refusal test stays green).
4. Confirm/consent semantics (T-16) as law consent rows + director teach data — never as store singletons.
5. Append-latency vs ns-size bench at 1K/10K/100K (+ 1M if the box allows, serial lane, clean slate).

## Falsifier

Multi-conversation, multi-thousand-message vault: bounded history-read green, cap refusal fail-closed, second-principal read REFUSED + ledgered, retention/compaction drill green, bench walls published.

## Non-goals

No sharing implementation (GAP-4). No NLCL port. No surface work beyond CLI-as-stand-in reads.
