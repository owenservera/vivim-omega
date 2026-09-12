# D-320 — CI workflow + conditional fresh-tree

## Status

RATIFIED

## Context

No `.github` automation exists, and the `fresh-tree` gate stage fails on any machine
without the sibling legacy repos (pins unsatisfiable elsewhere) — so nobody off the
owner's box can go green. Independent confirmation of self-reported numbers needs CI;
CI needs an honest fresh-tree story.

## Options

| Criterion | (a) Ubuntu-required gate + Windows-informational test + loud fresh-tree skip | (b) No CI (owner box only) | (c) Full matrix all-required |
|---|---|---|---|
| Independent confirmation | Yes (required ubuntu gate) | No | Yes, plus Windows signal |
| Windows 2-core runner flake risk | Contained (informational lane) | N/A | Blocks merges on machine noise (D-317's exact warning) |
| fresh-tree honesty | Loud skip (○, recorded) — never silent green, never red-on-clean-clone | Unchanged (red elsewhere) | Same as (a) |
| Cost | One workflow file + skip branch | Zero | Same file, higher flake tax |

## Decision

**Decision:** (a) Ubuntu-required gate + Windows-informational test + loud fresh-tree skip — promote Windows to required only with runner sizing that matches the budgets.

## Consequences

- `.github/workflows/ci.yml` is descriptive of machine reality, not aspirational: the informational lane says so in-file.
- A red ubuntu gate blocks; a red windows lane pages nobody but must be triaged (flake vs regression) before the next wave.
- fresh-tree `skipped:true` in status.json is a first-class outcome reviewers must read as "inapplicable here," not "passed."

## Evidence

- Landed in 1bcae72: `.github/workflows/ci.yml` (ubuntu-required gate, windows-informational
  test) + loud fresh-tree skip (`○`, recorded `skipped:true` — never silent green).
- `upgrades/New/VIVIM-OMEGA-INDEPENDENT-REVIEW.md` §2 Priority 4 (origin of the ask).
- Absent siblings verified: clean-clone gate fails fresh-tree by construction (pre-change behavior).
