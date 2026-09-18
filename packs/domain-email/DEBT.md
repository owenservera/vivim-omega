# pack.domain-email — DEBT (W1 retro-pass, GAP-M5)

The W0 pack checklist (SCHEMA+CONTRACT+POLICY+TEST) was applied to pack #1
retroactively (GAP-M5: "Retro-pass on `domain-email` + clean pass on pack #2").
The pack **passes the checklist** — the four contribution kinds are present,
namespace-clean, and conformance-tested — but the retro-pass surfaced gaps that
v0.2.0 shipped without. Filed here as PACK DEBT per the W1 spec; each row names
the reviewer-checkable reason and the wave that naturally retires it. Rows leave
by a pack version bump that closes them (append-only evolution, per the pack
description) — never by editing this list silently.

| # | Debt | Why it is debt (checkable) | Retire in |
|---|---|---|---|
| D1 | `email.contact@1` schema is declared but unmaterialized | No provider writes contact rows (provider.email.file persists messages only); `mind` derives contacts OUTSIDE the pack (`contactFromAddress` from vivim-nlcl-pure) — the pack does not own its own contact lifecycle | W3/W5 (contact learning lands beside conversation harvest) |
| D2 | `folder` is a free-form string with no enumeration boundary | `email.Folder@1` exists, but no op lists folders and no policy pins the taxonomy (sent/archive/trash/inbox is implicit in provider code) | W2 (provider realization bar pass) |
| D3 | Thread rollup is provider-implicit | `email.Thread@1` declares `messageIds`/`lastAt`, but no contract pins thread read/derive semantics — the (subject, to) derivation lives in provider code, not in the pack | W2/W5 |
| D4 | Draft state is not persisted | `stateMachine` declares draft→sent via `message.send@1`, but v1 materializes messages already `sent` (`flags.draft=false` at send); the draft state is unreachable in storage | W3+ (conversation-adjacent authoring) |
| D5 | `message.search@1` scope is bodies only | The pack doc pins "full-text search over stored message bodies (vault FTS)"; subject/from search is undeclared — a caller cannot discover that it is absent except by trying | W5 (surface parity pass) |
| D6 | Policy is intent-only data | `email.policy@1` consent defaults are declared, but vivim.law v1 evaluates its OWN risk table — the pack policy has no enforcement hook (documented in the policy doc itself); drift between the two is possible and unchecked | W6 (observability/consent spine pass) |
| D7 | Schema evolution is stated only in prose | "Contract evolution is APPEND-ONLY" lives in the manifest description; no schema-version bump rule is declared as data | W4+ (first schema v2 that needs it) |

Retro-pass verdict: **checklist PASS, debt 7 rows, none blocking W1** — every row
is a missing convenience/boundary, not a correctness break (the pack's declared
ops, risk classes, and schema shapes are conformance-green and provider-implemented).
