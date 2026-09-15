# D-364 — Decision-log classes, cooling-off, and the consolidation pass

## Status

RATIFIED

## Context

360+ ratified decisions govern a host under 1,000 LOC. The process demonstrably works
(D-351 caught a genuine dual-risk-source bug), but the external review (turn-014 tree)
named the process debt: a new reader must traverse 360 rows to state present-day law;
nothing distinguishes decisions that survived a falsifier from owner directives; and
same-day PROPOSED→RATIFIED is fine for directive rows but weakest exactly where it
costs the most — evidence-class decisions touching B1–B4.

## Options

| Criterion | (a) Class tags + B1–B4 cooling-off + consolidation page (this row) | (b) Backfill tags on all 360 rows | (c) Mandatory multi-day cooling-off for everything | (d) Leave as-is |
|---|---|---|---|---|
| New-reader time to present-law | One page | Still 360 rows | One page | 360 rows |
| Auditable evidence-vs-directive ratio | Yes, from D-360 on | Yes (but requires honestly re-reading 360 rows in one pass) | Yes | No |
| Cost to solo-owner speed | None for directive rows | Large one-off, error-prone | Slows everything | — |
| Mechanically enforced | Yes (checker rule) | n/a | Partially (calendar) | n/a |

## Decision

**Decision:** (a) Class tags + B1–B4 cooling-off + consolidation page —

1. **Class tags** (checker-enforced from D-360): every index row carries `· evidence`
   (backed by a probe/test falsifier that exists in the tree) or `· directive`
   (owner call) in its status cell. Pre-360 rows are grandfathered untagged — the
   audit trail is never rewritten.
2. **Cooling-off for B1–B4 evidence-class decisions**: the named falsifier must be IN
   the record before RATIFIED (not referenced afterward), and a second gate run must
   follow ratification. Directive-class rows keep same-day ratification — solo-owner
   speed, honestly labeled.
3. **Consolidation pass**: every ~30 ratified decisions, refresh
   `docs/decisions/CURRENT-INVARIANTS.md` (B1–B5 in current language, the Ω laws,
   the adapter inventory, watchdog policy, process law). Pass #1 ships with this row.
   The full log stays append-only; the page is a synthesis layer, never a replacement.

## Consequences

- "How many RATIFIED rows are actually backed by a falsifier" becomes a glanceable,
  gate-checked number instead of an archaeology project — the load-bearing claim of
  the gate process.
- A fresh reader (human or new agent instance) states the top-5 invariants from the
  consolidation page; the 360-row log remains for provenance and audit.
- The checker grows one rule (rows ≥ 360 must carry a tag) — unit-tested alongside
  the existing contract tests.

## Evidence

- Checker rule green on the landing commit; decisions contract tests extended
  (tag parsing + flagging), 11/11 green.
- `docs/decisions/CURRENT-INVARIANTS.md` ships as consolidation pass #1.
- Landed in 0df18d0 (the remediation-wave commit; gate GREEN 733/733, host 999/1000, all seven stages incl. the new bun-surface stage).
