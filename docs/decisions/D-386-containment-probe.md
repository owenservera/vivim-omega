# D-386 — OS-enforced containment probe (the L-15 revisit trigger, elevated to a pre-autonomy gate)

## Status

RATIFIED

## Context

Three long-carried limits read together as one architecturally significant gap: L-1
(worker heap caps are not enforced by Bun's `resourceLimits` — 130MB measured inside
a 32MB cap), L-2 (the watchdog's heap signal is self-reported, so only
unresponsiveness is non-spoofable), and L-15 (process-tier budgets are advisory at
spawn — no cgroups/Job Objects enforcement). The 2026-09-18 independent
recommendation (§7) elevates this from watch item to gate condition: before B1b
(the wider acting loop — scheduling, retries, less supervision) or any other
widening of unsupervised execution, the OS-level enforcement probe that L-15 itself
names as its revisit trigger must be scoped and landed — "even as a single-OS
experiment (cgroups on Linux would be the natural first target)". DRAFT-003 §3
deferred OS-enforced limits with the same per-OS-falsifier condition; D-321's
honesty law forbids fake enforcement — machinery that looks alive but is not backed
is the worst outcome to ship.

## Options

| Criterion | (a) Land the Linux cgroup v2 probe now | (b) Keep deferring to B1b | (c) Build broker enforcement now |
|---|---|---|---|
| Answers the L-15 trigger | Yes — a measured verdict, kernel-side | No — the trigger stays open until autonomy forces it | Partially — enforcement without proof |
| Risk | None — read-only probe, honest verdicts, zero production behavior change | The gap widens exactly when B1b raises the blast radius | High — enforcement claims without per-OS falsifiers are the D-321 failure shape |
| Cost | One platform module + falsifier suite + a CLI | Zero now, larger later under pressure | Broker + schema + signed-config churn before the shape is proven |

## Decision

**Decision:** (a) — land the single-OS probe now, as `platform/src/containment.ts`
exposed by `omega:containment`. The probe detects the cgroup v2 unified hierarchy
(writability is tested by mkdir, never inferred), creates a probe subgroup,
configures `memory.max` (and `memory.swap.max` 0 when delegable — only a disabled
swap lets "peak ≤ cap" be a total-memory claim), spawns a REAL child, places it in
the subgroup, orders a 4× over-cap allocation, and reads kernel-side accounting
after exit — `memory.peak` (monotonic high-water) and `memory.events` `oom_kill` —
which the child cannot spoof; that is the non-spoofable signal the worker-tier
watchdog lacks (the L-2 analog at the process tier). Verdicts are enforced,
advisory, or unavailable, and enforcement is claimed ONLY when the measurements
demonstrate bounding (peak ≤ cap+slack while the child attempted > cap); every
non-claim names its reason, and the child's self-reported allocation is carried in
the report as data and NEVER feeds the verdict. Zero production behavior change —
no boot path imports the module; the verdict is data for decisions.

## Consequences

- The verdict is evidence, not runtime behavior: consumers treat anything not
  "enforced" as advisory. Nothing in the boot or broker path changes with this record.
- **GATE CONDITION (the §7 elevation):** B1b (wider acting loop) and any Wave2
  LAUNCHED provider must not land while the target OS's verdict is advisory or
  unavailable WITHOUT a new decision record recording the owner's acceptance of the
  residual. The probe makes that check cheap: run `omega:containment`, attach the
  JSON to the record.
- L-15 stays on KNOWN-LIMITS with its row updated to point here (worker-tier L-1
  and L-2 are untouched by this record — this is the process tier); its posture
  changes from assumed to measured.
- The Windows Job Objects probe is the named next slice, under the same
  per-OS-falsifier discipline; broker integration of enforcement is deferred until
  a measured verdict exists on the OS a deployment targets (named trigger, not a vibe).
- On hosts where the OS refuses the probe (read-only hierarchy, v1 layouts,
  non-Linux), the honest answer is "unavailable" with the exact reason — which is
  itself the evidence the gate condition consumes.

## Evidence

- Falsifier (named BEFORE ratification per B1–B4, D-364): `platform/test/containment.test.ts` —
  (1) accounting parsers refuse malformed input as null, never 0 (an unparseable
  kernel cannot be spun into a claim); (2) the `verdictFrom` truth table pins every
  verdict boundary, including the swap-unbounded → advisory downgrade, the
  attempted-≤-cap refusal, the one-byte-past-slack boundary, and the structural
  absence of any self-reported field in the verdict input; (3) live detection
  coherence (writable ⇒ available; reason always named; non-destructive re-detection);
  (4) the end-to-end probe on the real host asserts the honesty invariant — verdict
  enforced ⟹ measurements exist with attempted > cap and peak ≤ cap+slack; (5) the
  real-kernel enforcement case (128MB attempt under a 32MB cap → OOM kill or bounded
  peak) and the cleanup assertion run wherever the hierarchy is writable and skip
  honestly elsewhere.
- This container's measured posture (the honest-unavailable path actually runs
  here): cgroup v1 per-controller mounts under `/sys/fs/cgroup`, read-only (k8s
  pod) — no v2 unified hierarchy, so the probe reports unavailable and claims
  nothing; `omega:containment` output attached at ratification as evidence.
- Landing SHA `9ae6662` — probe, falsifier suite, CLI, and this record's PROPOSED
  state landed there with gate GREEN (847/847, host 1039/1100 flat); this flip is
  followed by the second gate run per the evidence-class cooling-off (D-364).
  Owner-delegated per the standing directive (D-367). `omega:containment` output on
  this container (cgroup v1, read-only — the honest-unavailable path):
  `{"verdict":"unavailable","reason":"no cgroup v2 unified hierarchy at /sys/fs/cgroup —
  memory enforcement probing is Linux cgroup v2 only; treat process budgets as
  advisory per KNOWN-LIMITS L-15"}` — archived in `docs/migration/40-EVIDENCE/OWNER/`.

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
