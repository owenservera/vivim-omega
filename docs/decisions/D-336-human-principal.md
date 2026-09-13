# D-336 — M3: human principal `user:<id>` parallel to `agent:<id>`

## Status

RATIFIED

## Context

Omega's principals to date are `agent:<id>`, `vivim.director`, `root` — a
single-operator microkernel. The legacy product is multi-user-shaped
(VivimSession, ProviderSession, per-user keys among its 200 models). The pilot
is single-user, but the principal shape must exist before multi-user pressure
arrives, or sessions get bolted on outside the law gate.

## Options

| Criterion | (a) `user:<id>` parallel to `agent:<id>`, reusing forbidden + consent (recommended) | (b) Shared single principal for all humans | (c) Full multi-tenant RBAC now |
|---|---|---|---|
| Authority reuse | Forbidden overlay + ConsentTable machinery already per-principal (D-310/D-325) | No per-user policy possible later without a migration | New model before the pilot needs it |
| Pilot cost | Additive shape; agent.exec combination rule extends by one conjunct | Zero | Workspace/session/auth system upfront |
| Audit | Every human action attributable to its principal from day one | Unattributable by construction | Attributable, overbuilt |

## Decision

**Decision:** (a) `user:<id>` parallel to `agent:<id>`, reusing forbidden + consent — the shape is additive to the existing per-principal machinery, not a new authority model; the D-315 combination rule extends to cover it.

## Consequences

- `agent.describe@1`-style outputs expose the user principal the same way agent identities already surface quarantine state.
- Forbidden-overlay entries and consent grants scope to `user:<id>` with zero new tables (D-325 ns `law` rows already key per principal).
- Legacy session shapes (VivimSession/ProviderSession/ProfileSession, M-TRIAGE-01 T-11) and confirmation semantics (T-16) are the design input when sessions land; the pilot itself runs as one user.
- Option (c) is explicitly deferred until a second concurrent human exists, not a second imagined one.

## Evidence

- D-310/D-325 (per-principal forbidden overlay, vault-journaled) + D-315 combination rule (identity.state × contract.state pattern to extend).
- `Migration/M-TRIAGE-01.md` T-11/T-16 (session shapes + confirmation semantics).
- Ratification: owner directive 2026-09-13 (proceed on the record's recommendation); landed PROPOSED in c09c140; full `bun run omega:gate` GREEN on c09c140 (612/612, host 984/1000) — ratified on that evidence.
