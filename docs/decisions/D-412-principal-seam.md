# D-412 — Core Phase S2: the principal-identity seam cut

## Status

RATIFIED

## Context

D-410's Core Phase, second row; the structural analysis §4.2 (annex) grades S2 MEDIUM-HARD with a precise shape: principals are plain strings today; consent grants, forbidden overlays, capability-graph nodes, journal entries, and agent identities are all keyed by bare strings; the only cryptographic identity is the vault root-of-trust keypair. Late key-binding (device keys, quorum shares, rotation — the identity atoms PHY-08..12 and the sharing atoms CIV-28/29 that hang on them) is possible only if string principal IDs were **never ambiguous and never recycled** — an invariant nothing currently enforces. The cheap insurance is the indirection cut: a principal **record** (an identity row with the non-reuse invariant), so future key material attaches to records without re-typing consent, grant, or journal history (R1/R3 avoidance in its purest form — "add identity later = migrate everything keyed by identity", closed for the price of one namespace discipline).

## Options

| Criterion | (a) The indirection cut now: ns `principal` records + non-reuse invariant + register/retire/get ops + the consent ceremony resolving through records (recommended — the analysis's exact prescription) | (b) Full identity constitution now (keys, pairing, rotation) | (c) Defer S2 to the identity wave |
|---|---|---|---|
| R1/R3 avoidance | The trap closes before any identity-bearing volume accretes | Same, but pays for tactical crypto early | The trap stays open; every new keyed row compounds it |
| Scope discipline | Substrate only — the analysis's non-commitments honored | Violates the Core Phase definition (crypto is tactical on top of the seam) | N/a |
| Blast radius | vivim-law + one namespace + one composition grant | Whole identity plane | Zero now, compounding later |

## Decision

**Decision:** (a) — cut the indirection only: principal identity rows in a new vault namespace with the non-reuse invariant enforced; the consent ceremony (the identity-bearing write par excellence) resolves through the record when law holds vault caps; no crypto, no pairing, no forced registration, no re-typing of existing keyed history.

## Consequences

- **New namespace `principal`** (VAULT-NAMESPACES.md, declared in this same commit): owner/writer `vivim.law`; id = the principal string itself; **retention: forever** — identity rows are permanent, the non-reuse substrate. Record shape: `{principal, kind, registeredAt, state: "active"|"retired", retiredAt?, generation}`.
- **Three new law contracts** (manifest + LAW_POLICY_V1 **1.7.0** exact rows): `law.principal.register@1` (MUTATION — idempotent while active: re-registering an ACTIVE record returns it; **registering a RETIRED id REFUSES with `PRINCIPAL_REUSED`** — the string can never become a different record); `law.principal.retire@1` (MUTATION — appends the retired state; refusing `PRINCIPAL_UNKNOWN` for absent ids and already-retired); `law.principal.get@1` (READ — the record or `{found: false}`, never a throw).
- **The consent ceremony resolves through the record**: `law.consent.grant@1` naming an explicit `principal` (the D-384 root-delegation path) ensures the principal record exists (reads; registers when absent) **when law holds vault caps** — fail-closed on the record write (the D-325 forbidden-durability pattern: rollback + abort, never half-done). Without vault caps the grant behaves exactly as before (composition-granted persistence, the pre-D-412 path byte for byte).
- **Existing keyed history is NOT re-typed**: the ConsentTable, forbidden overlay, journal rows, and graph nodes keep their string keys — the record is the indirection future key-binding attaches to, not a migration.
- Composition: the **agent** composition (law already holds `port:vault.append/query/get`) grants the three ops; the console composition is untouched (its law entry boots memory-only by design). Zero host LOC; anvil untouched; sdk untouched.
- Non-commitments (per the analysis): no device keys, no PAKE pairing, no Shamir recovery, no rotation, no multi-device scheduling — all tactical on top of the seam, owed by the identity/ecosystem waves exactly as the arc assigns.

## Evidence

- The gap, verified on the working tree: principals are bare strings throughout (`plugins/vivim-law/src/consent.ts` — grants keyed by `consentIdFor(principal, op)`; `forbidden.ts` — `forbidden:<principal>`; `contracts/src/port.ts` — `principalKind` prefix dispatch); no principal record namespace exists (`docs/VAULT-NAMESPACES.md` — 16 namespaces, none identity-shaped).
- Annex `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` §4.2 (the R1/R3 argument, the corpus precedent: the old tree's SyncPeer/User models and device-pairing integration test prove the flow Ω would host later); §5 (the sharing/treaty rows hang on S2).
- D-410's milestone row S2; D-411 (S1, the same round pattern: record-before-code, falsifiers named pre-ratification).
- **Falsifiers (named, pre-ratification, per D-364):**
  - **F-1 non-reuse**: register `user:alice` → retire → re-register REFUSES with `PRINCIPAL_REUSED`; the refusal names the rule.
  - **F-2 idempotent-active**: registering an ACTIVE principal twice returns the same record, state `active`, no duplicate rows.
  - **F-3 persistence**: the record is a vault row in ns `principal`, readable back (`law.principal.get@1` and a direct vault read agree).
  - **F-4 consent resolution**: `law.consent.grant@1 {consentId, principal: "user:bob"}` with vault caps → `user:bob`'s principal record exists after the grant (the identity-bearing write resolved through the record); a vault-write failure rolls the grant back and aborts fail-closed.
  - **F-5 grandfathered**: the same named grant WITHOUT vault caps succeeds exactly as before, and no record is claimed (memory-only posture, honest in the return).
- Gate bar: **evidence-class** — two full gate greens on the record's tree, falsifiers above in the record before ratification.
- **Ratified: landed in `af79bb1`; falsifiers F-1 through F-5 all green** (d412-principal 5/5 with the mid-boot token grant; forbidden-durability 4/4 restored); **two full gate greens 1074/0 ×2** on the record's tree (2026-09-20T05:19:10Z and 05:20:37Z; +5 tests over the 1069 baseline); host flat 1500/1500; anvil untouched (856/860, 45 exports); composition count unchanged at 18 (agent.json regenerated from the matrix).
- Trap bitten and fixed this round, recorded: `principal.ts`'s `fromRecord` silently shadowed `forbidden.ts`'s same-named import binding (bun binds the last) — the forbidden overlay reload parsed its records through the principal parser and counted zero; caught by the D-325 restart falsifiers, fixed by import aliasing. Lesson: same-named exports across sibling modules are a shadowing hazard under loose transpilation — alias at the import site.
