# Owner-directed remediation — 2026-09-18 independent recommendation report

Source: the owner-uploaded `vivim-omega-recommendation.md` (reviewed snapshot
`5259921`, branch `omega`; reviewed against a tree that had already moved to
`17a0cbb`, W1 closed). All four recommendations implemented the same day:

1. **§5 — archive the two stale planning docs.** `docs/ARCHITECTURE-NEXT-STEPS.md`
   (baselined `597d567`, D-313…D-318 listed as open) and `docs/PROPOSAL-NEXT-WAVE.md`
   (baselined `9a1e00f`, D-323/D-324 "awaiting owner greenlight") moved to
   `docs/archive/` with supersede banners + a pointer README; RATIFIED records citing
   the old paths were not edited (append-only law). Landing: `e7de299` (part 1).
2. **§6 — close D-316.** Decision (b): N first-class compositions, no flagship —
   the record's own revisit precondition met (D-376 net shipped, evidence-class),
   the net has produced its findings without a reference composition, and the
   matrix's premature-centralization risk for (a) is confirmed by the tree.
   RATIFIED same-day (directive, D-367 fast-path): substance `e7de299`, flip
   `fe4453a`; board reached ZERO open items; board tests moved to the new state
   (test-led correction, state-agnostic pins).
3. **§7 — the OS-level containment probe.** D-386 (evidence-class): 
   `platform/src/containment.ts` + `omega:containment` — cgroup v2 probe with
   kernel-side, non-spoofable accounting (`memory.peak`, `memory.events` oom_kill);
   verdicts enforced/advisory/unavailable, enforcement claimed only from
   measurements that demonstrate bounding; the B1b/Wave2-LAUNCHED gate condition
   recorded. Landing `9ae6662` (gate GREEN 847/847), ratified same-day with the
   second gate run per D-364 cooling-off. This container's honest verdict archived
   as `2026-09-18-containment-probe.json` (cgroup v1, read-only → unavailable).
4. **§8 — budget watch.** Now an explicit section in
   `docs/decisions/CURRENT-INVARIANTS.md`: host LOC headroom (1,039/1,100 — name the
   removal before writing host code), test-count wall-time recheck near ~1,000,
   L-11 GAP-4 fence held, L-12/L-13 constants not load-bearing before Phase D/F-3.

Verification: `omega:gate` GREEN at every landing (830/830 pre-probe → 847/847 with
the D-386 falsifier suite), host 1039/1100 flat (B5 held), surfaces green, board
zero open after D-316 → one open (D-386) → zero after ratification.
