# D-379 — W0-4 sharing boundary: the single-principal fence (Phase 1)

## Status

RATIFIED

## Context

W0-4: nothing in code accepts a second principal, but nothing pins the
refusal shape either — and the legacy mines are multi-user (sessions,
workspaces, per-user keys across ~17 harvestable shapes). Without a ruling,
Wave3 could smuggle a sharing model inside "session bookkeeping". The need
text fixed the deliverable: rule the Phase-1 boundary (single `user:<id>`
attribution + credentials spine + no cross-principal reads, refusal shaped
REFUSED not DEGRADED, the reopen trigger named), with the falsifier — a
second-principal read against a `user:<id>` conversation is refused AND
ledgered — pinned by a test on a real boot.

## Options

| Criterion | (a) Read-side fence in vivim.chat, REFUSED-as-verdict + ledger row (this row) | (b) Host-side principal gate (router knows principals) | (c) Doc-only ruling, no code |
|---|---|---|---|
| Falsifier | Real boot: refused + ledgered, test pins the code | Real, but grows the µhost (B5: new host surface without removal — unlawful) | Not met |
| Refusal shape | REFUSED verdict envelope (the vivim-run pattern: policy refusals are verdicts, not handler failures) + `ledgered: true` + ledgerRef | REFUSED at the router (law.check already does this for risky ops) | — |
| Authority growth | Zero new capabilities: the fence rides ports vivim.chat already holds (vault.get/append in ns chat, its own namespace) | New host concept | Zero |
| Ledger | `refusal_*` rows in ns `chat` (the writer's own ns — one-writer discipline holds), meta.type `principal-refusal`, inspectable via vault.get | Host journal (file, outside vault verification) | — |

## Decision

**Decision:** (a) Read-side fence in vivim.chat — `chat.history@1` gains an
optional `principal` field (additive; absent principal = the Phase-1
trusted-reader path, unchanged behavior — the compartment itself is the only
reader in a single-principal deployment). When the presented principal
differs from the conversation's owner, the op returns the REFUSED verdict
envelope `{refused: true, error: "REFUSED", op, detail, ledgered: true,
ledgerRef}` — a POLICY verdict carried as data (ok:true at the port
boundary), never a bare DEGRADED, which is reserved for broken handlers —
and appends the attempt to the ledger (`refusal_<hex>` in ns `chat`:
`{conversationId, owner, caller, op, at}`). The Phase-1 boundary is: ONE
principal per conversation row; workspace/session/key shapes land as
ATTRIBUTED rows, never as shared objects; cross-principal reads refuse +
ledger; no sharing implementation ships. **Reopen trigger:** a new decision
record with a multi-principal falsifier set (consent rows, per-principal
credentials, and a migration story for attributed rows) — never drift.
Write-side stays compartment-scoped (the composition's writer is the
trusted writer; principal checks on writes are Wave3's business with the
full index).

## Consequences

- The falsifier is a permanent pilot test: user:mallory's read of user:ada's
  conversation refuses with the envelope AND the ledger row names both
  principals (`owner: user:ada`, `caller: user:mallory`); the owner's read
  and the absent-principal path still return history.
- Refusal rows accumulate in ns `chat` (bounded traffic: refused reads only)
  with the D-378 window (400d).
- Surfaces keep calling without `principal` — zero breaking change; when
  Wave5 wires authenticated users, the fence is already there to call.

## Evidence

- Falsifier: `plugins/vivim-chat/test/pilot.test.ts` "W0-4/D-379: the
  cross-principal read REFUSES as a verdict and LEDGERS the attempt" —
  green on a real boot of compositions/chat.json (30/30 chat suite).
  Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
