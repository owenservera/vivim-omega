# D-351 — Risk parity: one truth for the gate (policy amendment 1.1.0 + the parity net)

## Status

RATIFIED

## Context

Two independent sources of risk truth exist and nothing reconciles them:

1. **The manifest** — `Contribution.risk` on contract contributions, collected
   host-side by `riskyOps()` into `opRisk` — decides **whether `law.check@1`
   fires at all** (`host/src/ports.ts` dispatch: no `opRisk` entry ⇒ the op
   executes ungated).
2. **The policy** — `LAW_POLICY_V1.riskTable`, evaluated by `classifyRisk()`
   inside `vivim.law` — decides **what the gate says** once it fires,
   ignoring the manifest's declared value entirely.

The finding is L1 from the owner's 360-review channel
(`upload/L1-DUAL-RISK-SOURCE.md`, empirically verified by a live probe booting
the real law spine against turn-010 @ b0f4c46). Three live instances:

- **Silent downgrade (probe-proven, behavioral):** `vault.roundtrip@1` is
  manifest-declared `EXTERNAL_MUTATION` but the `vault.*` prefix row classifies
  it `MUTATION` — every real composition (console.json among them) executed it
  **without the consent its own manifest demanded**. The probe ran it with no
  consent granted anywhere and got `ALLOWED`.
- **Silent upgrade (latent):** `providers.session.start@1` is
  manifest-declared `MUTATION` but matches no policy row, so law's fail-closed
  `defaultRisk: "EXTERNAL_MUTATION"` demands consent it was never declared to
  need. Latent only because no test invokes it through any router.
- **Dead row (naming drift):** the `notes.*` prefix row matches no op that has
  ever existed (the real fixture family is `note.*`; `note.write@1` therefore
  falls through to the fail-closed default — an upgrade instance too). A test
  enshrined the fiction with `notes.write@1`.

Masking: the 624/624 gate is green because real-law suites pre-grant consent,
several suites boot the allow-all law-stub, and the upgraded op is never
routed in tests — no green test absorbs a wrongful `require-consent`, but one
green test (vault roundtrip through the router) passes *thanks to* the
downgrade.

The gate-visible domain is contract-kind ops with declared non-READ risk —
`riskyOps()` scans `contributions.contract` only and filters `READ`, so
READ-declared ops never reach the gate and engine/provider ops are outside
this record's domain entirely (each needs its own deliberate answer, recorded
as a standing note, not silently ungated forever).

## Options

| Criterion | (a) policy amendment + gate-layer parity net (recommended) | (b) host consults the policy table directly as the gate trigger | (c) document the divergence, change nothing |
|---|---|---|---|
| Host law | No host change — "no policy lives in the host" (`ports.ts` header) stays true | Moves policy knowledge into the host; inverts manifest=request / policy=gate-data | Stays true |
| Correctness | `classifyRisk(policy, op) === manifest risk` enforced fail-closed for every routed op with declared risk; divergence becomes a loud gate failure | Single source of truth in principle, but couples host boot to law's data and changes B3-adjacent semantics mid-lineage | Downgrade remains live in console.json |
| Blast radius | Policy is data (versioned amendment 1.0.0 → 1.1.0); one new test file; one test line de-fictionalized | Host + boot + law changes | None |
| Pre-M0/M7 duty | The review named L1 as needing a D-record **before** the re-land wave — new provider/parser ops will each need correct risk in two places; the net makes divergence structurally impossible | Same, heavier | New ops inherit the blind spot |

## Decision

**Decision:** (a) amend `LAW_POLICY_V1` to parity (1.0.0 → 1.1.0) and enforce
parity fail-closed at the gate layer:

1. Two exact rows — exact rows outrank prefixes in `classifyRisk`:
   `vault.roundtrip@1 → EXTERNAL_MUTATION` (restores the manifest's own
   declared strictness), `providers.session.start@1 → MUTATION` (states what
   the manifest already declares).
2. One row repair: `notes.*` → `note.*` (the row's own intent, now matching
   the ops that exist).
3. The parity net (`plugins/vivim-law/test/policy-parity.test.ts`): walks
   every shipped composition, resolves each entry's manifest, collects every
   routed contract op with declared non-READ risk, and asserts
   `classifyRisk(LAW_POLICY_V1, op) === manifest risk` — failing with a table
   naming composition, entry, op, and both sources. A domain-floor test
   guards the net against silently matching nothing.

## Consequences

- `vault.roundtrip@1` now requires consent in every real composition — the
  only behavioral delta in the live tree, and it is the restoration of what
  the manifest always declared. The vault roundtrip router test is unaffected
  (its composition boots law-stub; the real-law consent path is covered by
  law's integration suite pattern).
- Any future op that arrives with risk declared in two places cannot diverge
  silently: the gate fails with both values named. New provider/parser ops in
  the M0/M7 re-land wave inherit this enforcement from day one.
- The engine/provider blind spot is a stated standing note (L1 note §5), not
  silently permanent: each ungated engine/provider op eventually carries its
  own deliberate answer (gated, consent-covered one level up, or explicitly
  host-internal).
- Logic Gap A (risk bound to op identity vs runtime mode — `SURFACES.md`
  line 130) is explicitly NOT settled here; it needs its own record before any
  live adapter tier lands.
- Fixture rows `risky.op@1` / `risky.read@1` stay: they are exercised through
  direct `law.check@1` calls by law's own suites and are in-domain whenever a
  shipped composition routes them.

## Evidence

- `upload/L1-DUAL-RISK-SOURCE.md` — the completed finding: mechanism, per-op
  table, probe log verbatim, masking answer, correction of the 360 review's
  READ-op claim.
- Live probe (real law spine, turn-010 base): `vault.roundtrip@1` ALLOWED
  without consent pre-amendment; `REFUSED: consent required: consent_…`
  post-amendment — the fix is behavioral, not cosmetic.
- `plugins/vivim-law/test/policy-parity.test.ts` (4 tests: domain floor,
  parity across all shipped compositions, version pin, standalone row checks).
- `plugins/vivim-law/test/law.test.ts` — policy table test de-fictionalized
  (`note.write@1`, `vault.get@1` prefix checks).
- Ratification: owner directive 2026-09-15 ("Setup and continue using the two 360 MD as guide" — the 360 review names L1 as needing a D-record before the M0/M7 re-land wave); landed PROPOSED in 865451d; full `bun run omega:gate` GREEN on 865451d (628/628, host 984/1000, attest ddf2c58) — ratified on that evidence.
