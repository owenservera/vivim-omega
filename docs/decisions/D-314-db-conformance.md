# D-314 — DB-track conformance strength

## Status

PROPOSED

## Context

D-307 declares Omega's vocabulary the reference the DB track's control plane conforms
to, but nothing checks conformance — not even a schema comparison. Meanwhile G1 notes
conformance is vacuous in both directions until writers exist on at least one side.
The choice is how much mechanism to build now vs later. See `ARCHITECTURE-NEXT-STEPS.md`
G12 and `PROPOSED-NEXT-STEPS.md` §8 Q2 (both docs concur).

## Options

| Criterion | (a) Human-attested checklist now | (b) Fixture test when both sides publish | (c) Shared package |
|---|---|---|---|
| Cost today | ~Zero (a doc section per wave) | Wasted (nothing to diff against yet) | High (cross-repo release coupling) |
| Catches drift | Weakly (human diligence) | Strongly, once applicable | Strongly, always |
| Reversibility | Trivially superseded by (b) | N/A (not yet applicable) | Painful (coupling is sticky) |
| Fit for Phase A | Yes — writers are still being built | No — needs Phase A writers + DB enum | No — premature |

## Decision

**Decision:** (a) Human-attested checklist now — adopt (b) when Phase A writers exist AND the DB side publishes a status enum worth diffing against.

## Consequences

- Each wave's definition of done gains one checklist line: "DB-track differing concepts noted or none."
- The checklist MUST name the DB contact/owner of the handshake (an unattributed checklist rots).
- (c) stays off the table until (b) proves insufficient — shared packages are easy to adopt, nearly impossible to un-adopt.

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G12, §4 Phase D (D2), §7 Q2.
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §8 Q2 (concurs: checklist now).
