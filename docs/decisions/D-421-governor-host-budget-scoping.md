# D-421 — The resource-governor scoping call: tile-lifecycle scheduling presumes plugin-side living over existing platform/ capabilities — the host does nothing new (B5)

## Status

RATIFIED

## Context

- The unreconciled pair, cited: `docs/decisions/CURRENT-INVARIANTS.md` (the
  law snapshot) holds B5 at "`host/src` ≤ 1,500 LOC, hard gate… At the freeze
  since the Core Phase: 1500/1500 flat, zero headroom" — while the vision
  doc's §18 (the resource constitution, adopted by D-407/D-408) commits the
  kernel to new duties: "the kernel is their OS-level scheduler — not just
  their capability router" — including suspending an entire Chrome fleet
  within 2 seconds of an unplug event and governing CPU/RAM/GPU/battery
  across live tiles. §18 honestly marks its own falsifier as owed (F8,
  Wave 4). But nothing yet says WHERE that scheduling logic lives given zero
  host headroom — and B5's law is unconditional: no new host surface without
  equal-or-greater removal in the same commit.
- The risk of deciding this mid-Wave-4: the physics chapter of the vision
  doc turns out unbuildable under B5 as scoped, discovered after Wave 4's
  other contents (ns canvas, live objects, the scrubber) have been designed
  against scheduler assumptions that cannot land. The course correction
  prescribes filing this scoping BEFORE Wave 4 opens, not during.
- What exists today to build on (the design-input inventory): `platform/`
  carries the process-lifecycle and containment machinery (the D-386
  containment probe's `omega:containment`, launched-process lifecycle,
  per-OS supervision); the watchdog lives out-of-tree in `tooling/watchdog`
  (D-329 placement law) and already does interval probing + two-signal
  enforcement + threshold-as-manifest-data; the D-360 watchdog bounds
  detection of a consuming compartment; composition resource budgets
  (`runtime.budget`) are manifest data today. Tile lifecycle
  (ghost/dormant/hydrated/suspended) is a *state machine over existing
  primitives* before it is anything new.

Blocks: Wave 4

## Options

| Criterion | (a) Scoping directive: scheduling presumes plugin-side living over existing `platform/` capabilities; the host does nothing new; any host-primitive claim arrives as its own record naming the equal-or-greater removal BEFORE code (recommended) | (b) Scoping directive: the scheduler is host machinery — a new host primitive is declared now, with the removal to pay for it named now | (c) Defer the scoping to Wave 4's own design records |
|---|---|---|---|
| B5 fit | Clean — zero host LOC is the working assumption; B5's exception path stays available but never assumed | Requires naming the removal at scoping time, before the design exists to know what to remove | The collision is discovered mid-Wave-4 — the exact failure mode the course correction names |
| Falsifier honesty | F8 stays the judge: if plugin-side scheduling cannot meet the 2-second unplug bound, the failure is MEASURED and the host-primitive fork re-opens with evidence | F8 is pre-committed to a host design nobody has drawn yet | F8 judges a design that assumed its own answer |
| Design freedom for Wave 4 | The Wave-4 governor design record optimizes inside the plugin boundary (states, transitions, budgets as data) — the boundary is known before the design, not after | The Wave-4 design starts from a forced host surgery | Every design assumes a different substrate; rework lands at falsifier time |
| Cost | One record, zero code | One record + a removal plan against code that has not been designed | Zero now, maximum later |

## Decision

**Decision:** (a) — the scoping directive: tile-lifecycle scheduling
(ghost/dormant/hydrated/suspended, §18) is scoped to live entirely INSIDE a
plugin talking to existing `platform/` process-lifecycle capabilities, with
the host doing nothing new. The unplug→suspend duty rides the existing
out-of-tree watchdog placement (D-329) + platform containment/launch
machinery (D-386) + manifest-declared budgets (the D-360 threshold-as-data
pattern); the host's role stays exactly what it is today: transport,
compartment supervision, capability routing — not scheduling policy. If a
Wave-4 design record PROVES a new host primitive is genuinely required (the
2-second bound measurably unreachable from a plugin, with the measurement
cited), that record names the equal-or-greater host removal BEFORE the code
is written — B5's unconditional law, applied with no exceptions. The burden
of proof sits with the host-primitive claim, never with the plugin-side
default. §18's own law stands unchanged: degradation is a visible badge
state, never a quiet freeze; the falsifier owed is F8, judged at Wave 4.

## Consequences

- Wave 4's governor design record opens against a KNOWN substrate boundary:
  plugin-side state machine + platform/ capabilities + watchdog placement.
  The design's variables are states, transitions, budget data, and the
  physical-event wiring — not host surgery.
- What gets harder: a genuinely host-bound scheduler need must arrive as a
  measured falsifier failure plus a named removal — the expensive path, by
  design. What gets easier: the physics chapter cannot be silently
  unbuildable under B5; the collision (if any) surfaces as evidence, not as
  a mid-wave surprise.
- The B5 freeze stays flat at 1500/1500 through this record: zero host LOC.
- Revisit trigger: F8's falsifier run at Wave 4 — a measured plugin-side
  failure against the 2-second bound re-opens the fork with evidence; until
  then this scoping is the working law for the governor's substrate.
- The vision doc's §18 text is NOT amended by this record (it is direction,
  honestly labeled as falsifier-owed); this record scopes WHERE its duties
  live, not WHAT they are.

## Evidence

- Course-correction briefing `OMEGA-COURSE-CORRECTION-001` §3 (the finding:
  the B5 freeze quote vs §18's scheduler commitment, both cited to their
  documents).
- `docs/decisions/CURRENT-INVARIANTS.md` B5 row (1500/1500 flat, zero
  headroom — the freeze this record works inside) + the watchdog policy
  section (D-360/D-366 two-signal enforcement, thresholds as manifest data).
- Vision doc §18 (the duties being scoped; F8 owed, Wave 4) + §21 (the
  degradation-is-a-badge-state law this scoping preserves).
- D-329 (watchdog out-of-tree placement — the pattern the governor's
  scheduling loop follows), D-386 (containment verdicts as the gate
  condition for enforcement claims), D-360 (detection-time bounding).
- Zero code in this record — it is a scoping directive. Gate green ×2 on
  this tree (numbers cited at ratification); host flat 1500/1500; zero host
  LOC; anvil untouched.

- Ratified on greens (directive-class, same-day per D-364): landing commit e6c6b09; full gate green 1175/0 ×2 on the round's PROPOSED tree (2026-09-20T14:12:54Z, 14:14:34Z — 1126 + 49 new falsifiers since bundle _11: the course-correction sweeps + the efficiency-tooling suite); zero host LOC; anvil untouched; compositions 18.

## Index

summary: before Wave 4 opens: the §18 resource constitution's scheduling duties (ghost/dormant/hydrated/suspended, the 2-second unplug suspension) are scoped to live INSIDE a plugin talking to existing platform/ process-lifecycle capabilities, with the host doing nothing new; if a Wave-4 design record proves a new host primitive is genuinely required, that record names the equal-or-greater host removal BEFORE the code is written (B5, unconditional)
rationale: the host budget is flat at 1500/1500 with zero headroom while the vision's §18 commits the kernel to OS-level scheduler duties — deciding where the scheduling logic lives now avoids discovering mid-Wave-4 that the physics chapter is unbuildable under B5 as scoped
class: directive
