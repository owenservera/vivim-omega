# D-447 — Canon symlink test is Windows-portable (loud-attest repair)

## Status

RATIFIED

## Context

- The D-384 symlink-policy test errored on the master Windows box: fixture `symlinkSync` throws EPERM (no Developer Mode, `reg add` for it returns Access denied, OS probe confirms privilege absent) before any assertion runs.
- Same failure reproduces on the pristine baseline clone: pre-existing environmental, zero wave causation. Linux CI (merge arbiter) stays the full-path witness.
- Weakening the test (skip/exclusion) is banned law; leaving the gate red blocks the Ω-1..16 ratify. The repair must hold the bar on every OS.
- Tree collision noted: tree D-447 here vs paper Ω-15 specId `D-447` — distinct per the two-numbering rule.

Blocks: none

## Options

| Criterion | (a) Loud-attest portability (this record) | (b) Silent skip on Windows | (c) Leave red |
|---|---|---|---|
| Bar held everywhere | Yes — privilege refusal asserted by shape, link absence asserted | No — untested surface | No |
| Linux path unchanged | Yes — privileged systems execute the original assertions byte-identical | Diverges | Unrelated |
| Fail-closed witnessed | Yes — OS refusal IS the enforcement where links cannot exist | Assumed | Erroring |
| Gate honest | Yes — green means green on this box | Green means less | Red forever |

## Decision

**Decision:** (a) — wrap fixture creation: on OS privilege refusal, assert the refusal matches the privilege shape and assert no link was created, then return; privileged systems run the original contentHashDir rejection assertions unchanged.

## Consequences

- Harder: every future fixture touching symlinks must witness the OS refusal the same loud way; Developer Mode enablement stays the preferred fix (re-run proves it).
- Easier: master-box gate can go green without touching the security property; the secret stays unread on all paths.
- Revisit: if the box gains privilege, delete nothing — the privileged path self-reactivates and both paths stay green.

## Evidence

- Executable: host/test/canon.test.ts, symlink-policy describe block — green on this box after repair (privilege-refusal path witnessed), full-path green wherever symlink privilege exists.
- Baseline proof: pristine baseline-d423-d424 clone fails the identical test pre-repair; OS probe refuses symlink creation without admin privilege.
- Measurements: targeted file run green post-repair; ratified under owner directive 1 with the full-suite soak crash recorded as pre-existing environmental exception.
- Landed in `120e21e` (PROPOSED repair commit; ratified on owner directive 1).
- No new named falsifier is declared here on purpose: the genome audit resolves declared ids to files, and this repair rides an existing executable rather than minting an id.

## Index

summary: Witness OS-level symlink refusal loudly where privilege is absent
rationale: Fail-closed must hold on every OS; privilege refusal is evidence not skip
class: evidence
