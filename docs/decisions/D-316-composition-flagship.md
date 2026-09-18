# D-316 — Composition flagship vs N first-class compositions

## Status

RATIFIED

## Context

Thirteen shipped compositions (`agent, console, demo, discovery, discovery-mind,
email, healing, law, llm, notes, run, spine, vault`) with no stated flagship.
`console.json` is the de-facto product surface; the rest range from pipeline
slices to single-purpose harnesses. The question determines how much composition
machinery (conformance strictness, cross-file grant policy) is worth building.

## Options

| Criterion | (a) Declare console.json flagship | (b) N first-class compositions |
|---|---|---|
| Guidance for grant policy | Clear (flagship sets the standard) | Negotiated per composition |
| Conformance machinery value | High (drift measured against flagship) | Medium (pairwise, no reference) |
| Risk of premature centralization | Real — other compositions serve real harnesses | None |
| Cost of deciding now | A paragraph + grant audit | Zero (status quo) |

## Decision

**Decision:** (b) N first-class compositions — no flagship is declared. The record's
own revisit precondition is met: the composition-conformance net shipped and is
evidence-class ratified as D-376, and its operation has produced its findings without
any reference composition. The net holds all 16 specs to identical risk-parity and
matrix conformance — no composition gets a free pass — which is exactly the
"the net serves either answer" property this record deferred on, now confirmed in
operation rather than in promise. The Options matrix's named risk for (a), premature
centralization of compositions that serve real harnesses, is confirmed by the tree
itself: the 16 specs range from product surface to pipeline slices and
single-purpose harnesses, and discovery-mind's parser carriers are dormant by design
(D-385) — different-in-kind, not a hierarchy under one flagship. Grant policy stays
negotiated per composition; cross-composition grant variance is handled by the
DRIFT_ALLOWLIST rows, which name a D-pointer per row instead of privileging a spec.
Flagship status may still be declared later by a NEW record if a product need — for
example a migration-cutover blessing of one composition — demands one; this record
closes the architecture question only, and the net does not encode either answer.

## Consequences

- No composition is modified on the basis of flagship status — there is no flagship.
- The conformance net continues to treat every spec identically (risk parity +
  matrix conformance, D-376); grant variance remains allowlisted per-row with reasons.
- The original revisit trigger ("first irreconcilable grant conflict between two
  compositions") now resolves through a new decision record or a DRIFT_ALLOWLIST row
  with a D-pointer — never through a silent privileged spec.
- The open-questions board reaches zero open items once this record flips.

## Evidence

- `docs/archive/ARCHITECTURE-NEXT-STEPS.md` §3 G9, §7 Q4 — the origin of this
  question (archived 2026-09-18; originally `docs/ARCHITECTURE-NEXT-STEPS.md`,
  baselined `597d567`; see `docs/archive/README.md`).
- Historical concurrence: `upgrades/New/PROPOSED-NEXT-STEPS.md` §8 Q4 (defer) —
  file not present in this tree; cited verbatim from the original record for the
  audit trail.
- The revisit precondition is met: D-376 (composition-conformance net: risk parity
  + matrix conformance, seeded-drift falsifier green) is evidence-class RATIFIED.
- Independent recommendation report, 2026-09-18, §6: "the stated precondition for
  revisiting D-316 has been met… a genuinely cheap ratification (the net 'serves
  either answer' per the record) and would bring the open-questions board to zero."
- Landing SHA `e7de299` — decision text + archive pointer landed there (PROPOSED-state quick gate GREEN); this flip commit completes the ratification. Owner-delegated per the standing directive (D-367 fast-path; directive-class row). Gate GREEN at the flip: all stages, board regenerated to zero open items.
