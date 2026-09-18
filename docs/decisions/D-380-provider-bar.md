# D-380 — W0-5 provider realization bar: byte-identical, launch scope, stealth admission, API_NATIVE-first

## Status

RATIFIED

## Context

W0-5: the legacy mines bring 13+8 provider manifests mixing browser auth and
API auth, a 30 KB chrome-governor, fleet machinery, CDP profiles, and 19
stealth engines. Three things are undefined in Omega code: the "byte-identical"
fixture rule, the launch-mode lifecycle, and per-file stealth admission.
Wave0 rules the bar (doc-only acceptable); Wave2 writes the code. This is the
only trust expansion the migration may make, so the bar is written down
before any provider realization is harvested.

## Options

| Criterion | (a) Rule all four bars now, code in Wave2 (this row) | (b) Define per-provider when harvesting | (c) Bulk-import the legacy stealth stack |
|---|---|---|---|
| Trust discipline | One bar, every realization measured against it | 21 local standards — the pilot fakes its own trust mechanism | Violates D-351/D-357's fenced-realization law outright |
| Wave2 speed | Harvest only what passes the bar | Every file re-litigates | Fast, unbounded |

## Decision

**Decision:** (a) Rule all four bars now —

1. **Byte-identical (the fixture rule):** a replayed capture substitutes for a
   recorded page fixture iff the extracted data (post-parser, canonical form)
   is byte-identical modulo a per-provider VOLATILE ALLOWLIST (fields that
   legitimately change per fetch: timestamps, nonces, session ids, ad slots,
   ordering-ties). The allowlist is per-provider DATA declared beside the
   realization (name + reason per field), never classifier edits — the
   substitution test is the falsifier: live capture replaces the recorded
   fixture, zero parser changes, extraction identical.
2. **Launch mode is Wave2 scope:** v1 stays attach-only (D-357's four bars:
   fence / attached / PROMOTED / pin). Launching Chrome (packaging, budgets,
   lifecycle) moves through `platform/` exclusively and extends the bar to
   LAUNCHED processes (same fence, same forbidden-domain entries, day-one);
   no launch code lands outside Wave2, no exceptions.
3. **Stealth admission is per-file, never bulk:** each of the 19 legacy
   stealth files is either ADMITTED with a law reason (which containment it
   rides: parser isolation tier, redact-before-vault, the D-357 bars) or
   REFUSED with a reason (pattern-only harvest per the observability
   precedent). The admission list lands as the Wave2 triage ledger rows —
   a file without a row cannot enter the tree.
4. **API_NATIVE-first:** where a provider offers a real API, the realization
   is API_NATIVE (credential.use-backed, live owner-machine tier);
   BROWSER_MEDIATED is admitted ONLY where automation is the product. Each
   harvested provider names its class in its realization row — a
   BROWSER_MEDIATED choice without a stated automation rationale refuses.

## Consequences

- Wave2's 15 provider realizations inherit a fixed bar; drift is caught by
  the conformance net (D-376), not by reviewers' memories.
- The substitution test + forbidden-domain refusal (ledgered through the
  browser realization) remain the Wave2 falsifiers, now with the fixture
  rule they were missing.
- Nothing here changes code today: v1 providers stay attach-only, sim/live
  split per D-356/D-358 unchanged.

## Evidence

- W0-5 need text (docs/migration/10-WAVE0/WAVE0-NEEDS-FROM-CODE.md) — the
  bar names the falsifier Wave2 must satisfy; ruling landed with the W0
  close-out. Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
