# D-316 — Composition flagship vs N first-class compositions

## Status

PROPOSED

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

**Decision:** TBD — defer until the W1 composition-conformance net ships; the net is valuable under either answer, so no need to resolve first (recommended: revisit with evidence from the net's first month of findings).

## Consequences

- No composition is modified on the basis of flagship status until this record flips.
- The W1 conformance check MUST NOT encode flagship assumptions (no composition gets a free pass) — otherwise the later decision is prejudiced by tooling.
- Revisit trigger: first irreconcilable grant conflict between two compositions.

## Evidence

- `ARCHITECTURE-NEXT-STEPS.md` §3 G9, §7 Q4.
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §8 Q4 (concurs: defer).
