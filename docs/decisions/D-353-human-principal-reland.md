# D-353 — M3 re-land: the human principal (D-336 engineering, third lineage)

## Status

RATIFIED

## Context

D-336 ratified `user:<id>` as a principal parallel to `agent:<id>`. Its
engineering was landed once (first lineage, turn-007) and destroyed with the
second sandbox reset (RESET-NOTE: landed-lost rows need fresh D-records and a
fresh gate). Today's tree still knows only `agent:<id>`, `root`,
`µhost-gate`, and composition ids: a human has no attributable identity, so
the chat pilot (M2's `Conversation.principal`) has nothing to name, and
per-user consent/forbidden scoping has no honest spelling. The capability
map's begin order pairs this re-land with D-352 as the first code wave of the
third lineage. D-336's own consequence list already fixed the shape: the
combination rule (identity.state × contract.state, D-315) is realized by the
existing per-principal walks — forbidden, policy, and consent tables are all
keyed per-principal — so `user:<id>` needs zero new tables, only acceptance of
the prefix plus a descriptive read.

## Options

| Criterion | (a) Prefix acceptance + describe read (recommended) | (b) New identity type/tables for users | (c) Reuse `agent:` prefix with a user flag |
|---|---|---|---|
| D-336 fidelity | One-for-one with the ratified record ("same string-typed principal namespace… no new identity type") | Contradicts the ratified "zero new tables" consequence | Collapses two identity namespaces into one — the exact conflation D-323 warned against for axes |
| Machinery | `PrincipalKind`/`principalKind` (pure, TOTAL) + `law.describe@1` (READ) + `ConsentTable.listFor` | New storage, new lifecycle, new migration surface | A flag column threading every principal-keyed table |
| Audit clarity | `user:ada`'s consents and forbiddens are attributable and inspectable in one call | Same, heavier | Ambiguous ownership at every join |
| Chat pilot (M2) | `Conversation.principal` is a plain string — M3's deliverable | Blocks M2 on storage work | M2 gets a compound shape it must decode |

## Decision

**Decision:** (a) Accept `user:<id>` as a first-class principal and make its
state inspectable — no new identity type, no new tables:

1. **Contracts** (`contracts/src/port.ts`): `PrincipalKind`
   (`agent | user | host | composition`) and `principalKind()` — pure and
   TOTAL: the two identity prefixes decide agent/user, `root`/`µhost*` are
   host, and EVERY unrecognized string stays a legal composition principal.
   Classification is never rejection.
2. **Law** (`plugins/vivim-law`): `law.describe@1` (CONTRACT/READ, manifest
   0.1.0 → 0.2.0) — one call answers `{principal, kind, forbidden: {ops,
   persisted}, consents, generation}`: who is this principal, what may they
   never do (the D-310/D-325 overlay, with its persistence posture), which
   consents are theirs, at which law generation. `ConsentTable.listFor`
   returns principal-narrowed ACTIVE grants only — hash-keyed un-narrowed
   grants are honestly excluded (they cannot be attributed to anyone), and
   the op documents that exclusion.
3. **Stub parity** (`plugins/law-stub`): the same `law.describe@1` contract
   with the REAL kind classification (shared contracts vocabulary) and
   honestly empty tables — the stub never fabricates state.
4. **Grants**: `law.describe@1` granted in all 13 law-carrying compositions
   (uniform; the D-325 per-composition scope variance unchanged).

## Consequences

- A human principal is attributable, forbid-able, consent-able, and
  inspectable end-to-end: `user:ada`'s require-consent names HER stable
  consent id, a grant narrowed to her satisfies only her, a forbidden entry on
  her denies before policy eval, and her sibling users are unaffected —
  all through the existing per-principal tables (zero new storage).
- The combination-rule extension D-315 named (identity.state × contract.state
  gains a `user:` conjunct) is realized by the same walk — and the describe
  read makes the admission-relevant state visible instead of inferred.
- M2's `Conversation.principal` is a plain `user:<id>` string (or an agent's
  `agent:<id>`) — the chat pilot can run as one user with zero new authority
  machinery, exactly as the map's begin order expects.
- `PrincipalKind` is vocabulary: D-332's call-site net keeps it honest (the
  classifier and the describe op are its live readers from day one).
- Future identity surfaces (profiles, display names, credentials binding) are
  out of scope here — this record lands the principal's legal existence and
  its state read, nothing more.

## Evidence

- Lost-lineage precedent: worklog turn-007 §7-c (the identical shape, proven
  625 → 634 on base 4a108d7; destroyed with reset 2 — RESET-NOTE.md).
- `docs/decisions/D-336-human-principal.md` — the ratified ruling this record
  lands, including the "zero new tables" consequence and the describe-read
  requirement.
- M-Pilot Part 1 §M3 (`upload/M-PILOT-MISSING-CORE.md` lines 93–110) — the
  shape list this re-land implements one-for-one.
- Tests: `plugins/vivim-law/test/law.test.ts` (principalKind grammar +
  TOTAL-ness tables; listFor narrowing/revocation/global-count table) +
  `plugins/vivim-law/test/integration.test.ts` D-353 block through the real
  law.json boot (consent naming, narrowing, sibling isolation, kind table,
  malformed DEGRADED). Full `bun run omega:gate` GREEN on this wave
  (651/651, host 989/1000).
- Ratification: owner directive 2026-09-15 ("Setup here the DevOps hub and
  continue developing" — the map's begin order names M1+M3 from D-352); landed
  PROPOSED in 1d966dc; full `bun run omega:gate` GREEN on 1d966dc
  (651/651, host 997/1000, all stages) — ratified on that evidence.
