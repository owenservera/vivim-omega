# D-319 — G1 realization-loop spike scope

## Status

RATIFIED

## Context

G1 (status lifecycle has readers but no writers) is the top gap, but the full
A1–A6 plan is a wave, not a step. The spike proves the wire live end-to-end
(map → verify → registry) before the remainder (healing writes, full docs
pass beyond the namespaces minimum) lands. Smaller blast radius per gate run.

## Options

| Criterion | (a) Spike: A1 boot + A2 get + A3 verify-writes + A5-minimal registry + A6 namespaces | (b) Full A1–A6 incl. healing writes in one wave |
|---|---|---|
| Time to first end-to-end proof | Days (one gate cycle) | Weeks (healing semantics are their own design) |
| Risk per gate run | One new writer + one new reader | Adds drift/probation status writes untested against the new reader |
| Leaves behind | A4 healing writes (specified, unwritten) | Nothing — but bigger review surface |
| Docs debt | A6 namespaces lands WITH the spike (non-negotiable) | Same |

## Decision

**Decision:** (a) Spike — A1/A2/A3/A5-minimal/A6 now; A4 healing writes as specified follow-up.

## Consequences

- The spike's gate criterion is an end-to-end fixture test asserting a non-empty
  PROMOTED registry entry from a real vault read (not a `deriveRegistry` unit test alone).
- Merging without A6 reopens the namespaces gap the spike exists to start closing — merge blocked on the doc.
- A4 remains specified-but-unwritten; its absence is visible (open item in VAULT-NAMESPACES.md), not silent.

## Evidence

- Landed in 1bcae72: A1 (providers entry in discovery-mind.json + boot canary), A2
  (realization.get vault read), A3 (verify PROMOTED/REQUIRES_REDISCOVERY/TESTING
  writes citing the promotion event), A5-minimal (registry reads via deriveRegistry),
  A6 (`docs/VAULT-NAMESPACES.md`).
- End-to-end fixture test green: map → verify → registry returns non-empty PROMOTED
  rows sourced from real vault reads (`plugins/vivim-providers/test/providers.test.ts`).
- `ARCHITECTURE-NEXT-STEPS.md` §4 Phase A (as resequenced post-review).
- `upgrades/New/PROPOSED-NEXT-STEPS.md` §2 (concurs on spike-first; this record adds the A6-at-merge guardrail).
