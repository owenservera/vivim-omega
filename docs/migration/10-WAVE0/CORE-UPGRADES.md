# Wave0 Core-Upgrade D-record Stubs

Copy each stub into `clone-omega/docs/decisions/D-37X-<slug>.md`, flesh the Options matrix + criteria per the Decision Contract (six sections, `**Decision:** (x)` line, class tag in the index row), then regenerate the board. Numbers below are proposed — the owner assigns final D-numbers.

## D-37X-U1 — Composition generation rule (directive)

- **Context:** 16-spec freeze (D-370) blocks migration composition design; D-316 flagship still open.
- **Options:** (a) generator + conformance net (recommended — mechanical, serves either flagship answer); (b) raise the cap (re-litigates every wave); (c) per-wave exceptions (drift by courtesy).
- **Decision:** (a). Generator checked in, hand-edits fail the net.
- **Falsifier:** generator reproduces `chat`+`browser` byte-identical (modulo sigs).
- **Class:** directive.

## D-37X-U2 — Vault index + retention with numbers (evidence)

- **Context:** L-4 total-ns scan; D-335 retention OPEN/unmeasured.
- **Options:** (a) writer-maintained per-conversation index + per-ns retention windows + compaction statement (recommended); (b) plugin-owned SQLite (rejected for pilot per D-335 — may revisit on bench numbers); (c) index-later (rejected — index after rows is a migration).
- **Decision:** (a). Numbers in `VAULT-NAMESPACES.md` same-commit as probe.
- **Falsifier:** append-latency vs ns-size bench (1K/10K/100K) + bounded-read + cap refusal.
- **Class:** evidence (touches storage durability reasoning — cooling-off applies).

## D-37X-U3 — Sharing boundary ruling (directive)

- **Context:** L-11 single-principal; GAP-4 deferred; legacy T-11 multi-user shapes ahead.
- **Options:** (a) Phase-1 boundary: attributed rows + pinned refusal, GAP-4 trigger named (recommended); (b) build sharing now (rejected — no consumer, M17 owns taxonomy); (c) leave implicit (rejected — smuggled sharing).
- **Decision:** (a). Refusal shape pinned by test.
- **Falsifier:** second-principal read REFUSED + ledgered.
- **Class:** directive.

## D-37X-U4 — Launch mode scope + stealth admission + byte-identical (evidence)

- **Context:** D-301 attach-only; T-07/T-08 open; G5/C0 undefined.
- **Options:** (a) definition + bar now, lifecycle code in W2; file-by-file stealth admission (recommended); (b) launch now (rejected — OS lifecycle + packaging unscoped); (c) bulk stealth import (rejected — trust expansion without a bar).
- **Decision:** (a).
- **Falsifier:** substitution test (modulo allowlist, zero classifier changes) + forbidden-nav refusal.
- **Class:** evidence (B3-adjacent trust surface — cooling-off applies).

## D-37X-U5 — Pack authoring checklist (directive)

- **Context:** one pack, possibly snowflake.
- **Options:** (a) SCHEMA+CONTRACT+POLICY+TEST checklist, retro-pass on `domain-email`, enforced on pack #2 (recommended); (b) no checklist (rejected — snowflakes).
- **Decision:** (a).
- **Falsifier:** retro-pass gap list filed; pack #2 clean.
- **Class:** directive.

## D-37X-U6 — Conformance net gate stage (evidence)

- **Context:** G9 drift + D-332 + D-351 as three partial nets.
- **Options:** (a) one read-only stage combining all three (recommended); (b) keep separate (rejected — triple maintenance, triple blind spots).
- **Decision:** (a). Land before W1 compositions.
- **Falsifier:** seeded drift fails with named diagnostic; green on current tree.
- **Class:** evidence (gate mechanics — cooling-off applies; stage itself is the falsifier).

## D-37X-U7 — Observability spine spec (directive)

- **Context:** no prod observability plugin; GAP-2 SLOs deferred; "ledgered and queryable" per-wave ambiguous.
- **Options:** (a) mind+vault-query+journal-stream spine + named query set + walls-to-watch (recommended); (b) metrics sidecar (rejected — second provenance graph); (c) per-wave ad-hoc (rejected — incomparable falsifiers).
- **Decision:** (a).
- **Falsifier:** mind-query round trip over seeded multi-provider vault on a real boot.
- **Class:** directive.
