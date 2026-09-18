# D-388 — Performance remediation round 2 (the 2026-09-18 second external performance review)

## Status

RATIFIED

## Context

A second external performance review of the packaged tree (reviewed at 0815d8c, the
D-387 line, gate GREEN 871/871) examined the paths D-387's round did not cover —
chiefly the automation tick loop and the warm-isolate pool's burst behavior — and
added a priorities-ordered remediation list over the remaining known limits. Every
finding was verified against the tree before any code moved. Two held as stated;
one (§2.2's assumed burst-degradation mechanism) did NOT survive measurement and
was corrected rather than implemented as written. The review also restates, in
performance terms, containment facts this repo already tracks (L-1/L-15), and
recommends holding the D-386 gate line — which needs no code, only a stance.
This record follows the same evidence law as D-387: verify, measure, falsify,
defer with named triggers, and let the harness overrule the narrative.

## Options

| Criterion | (a) Implement the review's priority list, measured | (b) Also batch the tick's rule loading | (c) Defer all to wave lanes |
|---|---|---|---|
| Blast radius | Tick read phase drops from ≤403 sequential hops to 5; pool burst becomes a measured number; cadence knob lands without touching the global default | Same, plus batch-all-fail semantics on a corrupt rule row (one bad envelope would stop ALL rules loading) | The 500 ms loop keeps paying N+1 forever; the pool stays unobservable |
| Risk | Each change pinned by a falsifier; the pool narrative corrected BY the falsifier | Semantic regression on the skip-not-fatal rule path for no measured need | Review ages badly; L-8's exposure window stays wide |
| Honesty | Report's unmeasured assumption corrected on the record; W3-owned work (L-4 backfill) NOT pulled forward across the wave boundary | Rubber-stamping beyond the review's own scope | Silent non-action contradicts the daily loop |

## Decision

**Decision:** (a) — implement §2.1 (batched tick read phase), §2.2 (pool burst
observability + tuning knob), and §2.3's interim cadence knob; hold the D-386
containment gate as-is; disposition the remaining limits with their already-named
triggers instead of code.

1. **§2.1 — the director tick's read phase is batched (HIGH).** After the bounded
   `vault.query@1`, every candidate that survives the `(id → rev)` memory check is
   fetched in ONE `vault.getmany@1` (ns email), and every trigger candidate's
   fired-ledger check rides ONE `vault.getmany@1` (ns automation) — the old loop
   paid up to 2×200 sequential `vault.get@1` round trips per tick. Semantics
   preserved row-for-row: missing row is DATA (error noted, rev unrecorded, honest
   retry), a found ledger row still means never-refire, a whole-batch failure
   degrades to the same partial-report posture as before (ledger-read failure
   still falls toward firing — at-least-once, unchanged direction), foreign/seen/
   self rows are still skipped cheaply, and the fire/ledger-append order over
   candidates is unchanged. Rule loading stays LAZY and PER-ROW on purpose
   (option (b) rejected): its skip-not-fatal behavior would be lost to a
   batch-all-fail on a corrupt envelope, it is bounded by TICK_RULE_CAP, and no
   workload justifies the semantics change (aligns with L-17's pagination
   trigger). The director's manifest requests `port:vault.getmany@1`; console +
   chat compositions re-granted via the matrix (regen byte-identity holds).
2. **§2.2 — pool burst becomes a measured number, not a silent assumption.**
   New burst case in `omega:bench`: 8 concurrent checkouts against poolSize 2,
   reporting hits/coldFallbacks/fallbackRate/wall next to the daemon RTT line and
   in `build/benchmarks.json`. MEASURED CORRECTION: the review assumed a burst
   larger than the pool "silently and individually falls back to cold spawns";
   the falsifier proved `refill()` runs synchronously inside `acquire()`, so the
   stock never starves — every burst checkout is served parked and the real burst
   cost is the INLINE thread spawn per checkout (bench: 8/8 hits, 0 fallbacks,
   ~10–13 ms/checkout). `coldFallbacks` remains the worse-signal detector (Worker
   construction failing), and the daemon `status` op already carries the live
   snapshot. The tuning knob is now exposed end to end: `daemon start --pool-size`
   (and `startDaemon.poolSize`), with the rule of thumb documented at the pool's
   definition: size ≥ expected peak concurrent compartment boots.
3. **§2.3 — the interim L-1 measure: a per-compartment watchdog cadence.**
   `runtime.budget.intervalMs` (additive, optional, SDK-schema field) lets a
   LATENCY-SENSITIVE composition declare a tighter probe cadence for its own
   compartment; `tooling/watchdog` gains pure policy (`dueForSample`,
   `watchdogTickInterval`) plus wiring (timer at the tightest declared cadence;
   undeclared compartments keep the 250 ms global default — the faster timer
   never tightens anyone by side effect). The global default is unchanged and the
   D-386 gate condition (L-1/L-15: verdict `enforced` before B1b/Wave2-LAUNCHED)
   is held exactly as the review recommends — no loosening.
4. **Dispositions without code (the review's priorities 3–5):** the L-4 Wave3
   full index build (backfill + repair) stays W3-owned per `STATUS.md` ("owes
   retention enforcement + backfill + repair") — pulling it forward would cross
   the wave boundary law; L-13 SLOs stay Phase F-3-owned; L-8's per-call deadline
   keeps its existing trigger (the batching in §2.1 narrows the exposure window);
   L-14 and L-17 stand with their recorded triggers.
5. **D-387 evidence repair (transparency):** the decisions checker flagged
   D-387's Evidence section for carrying no resolvable commit SHA. Following the
   D-384 precedent, the landing citation (`e2f756b` → `af771ac`) was restored to
   that RATIFIED record's Evidence — no substance edited.

## Consequences

- The 500 ms automation loop's read cost no longer scales with new/changed
  message count in round trips: 2 batched hops at any candidate count ≤ the
  scan cap; under any future non-in-process transport the win compounds.
- An undersized pool is now measurable from two surfaces (bench burst wall +
  live status snapshot) before production feels it, and tunable per deployment
  without a code change.
- Latency-sensitive compartments can buy a shorter detection window (bounded by
  missLimit × interval) at a small steady-state CPU cost, without moving the
  global default or weakening the D-386 line.
- SDK manifest schema widens additively (optional `intervalMs`); old manifests
  parse unchanged. Zero host/src LOC (B5 flat at 1039/1100).
- Deferred with named triggers: tick rule-loading batching (trigger: a real
  ruleset approaches TICK_RULE_CAP AND corruption-grade semantics change is
  accepted by an owner ruling), pool refill-policy redesign (trigger: a
  measured burst workload where the inline-spawn cost per checkout is the
  bottleneck), L-4 backfill (W3), SLOs (F-3).

## Evidence

- Falsifiers (named BEFORE ratification per B1–B4, D-364), 15 new tests:
  - `plugins/vivim-director/test/d388-tick-batching.test.ts` (8): 50 candidates
    ⇒ exactly 2 getmany hops + ZERO per-row gets (hop arithmetic pinned);
    unchanged rows cost one query row and nothing else (rules never loaded);
    ledger-hit never refires with revs recorded for the whole batch; missing
    row is DATA (error + rev unrecorded + other rows still fire, still batched);
    email-batch failure ⇒ partial report, zero appends, revs unrecorded; ledger
    batch failure ⇒ at-least-once firing with the error recorded; foreign/seen/
    self/wrong-folder semantics preserved; hop count flat at 200 candidates
    (2 batch hops, exact total-call accounting).
  - `surfaces/daemon/test/pool.test.ts` (+2): burst n=8 vs size=2 — every
    checkout served (sync refill), stats invariant checkouts = hits +
    coldFallbacks, parked bound holds, burst wall printed as the measured cost;
    post-burst serial checkout served parked with monotonic accounting.
  - `tooling/watchdog/test/watchdog.test.ts` (+5): dueForSample truth table
    (never-sampled due; declared interval tightens ONLY its own compartment;
    non-positive declarations fall back to the global cadence);
    watchdogTickInterval (tightest declared wins, default 250 untouched,
    invalid declarations never speed the timer); real-timer wiring — the tight
    compartment probed ≥10× vs the default ≤3× over the same 700 ms window.
- Measurements (`tooling/perf/perf-remediation.ts` case F, plus `omega:bench`):
  tick read phase at 200 candidates — OLD 403 sequential hops vs NEW 5 (read
  phase; whole batched tick incl. 200 fires + 200 ledger appends ≈ 7 ms
  in-process; hops are the durable win under network/IPC latency); pool burst —
  8 concurrent checkouts vs poolSize 2: 8 hits / 0 cold fallbacks, ~87–106 ms
  wall (~11–13 ms/checkout inline spawn), archived in BENCHMARKS.md.
- Structural: gate GREEN ×2 (PROPOSED + post-flip), 886/886 tests (15 new),
  host 1039/1100 FLAT (zero host LOC), compositions byte-identity 16/16 after
  regen, board ZERO open.
- D-387 evidence-shape repair noted in Decision ¶5.
- Landing: PROPOSED `3ccfe07` (gate GREEN 886/886, host 1039/1100 FLAT) →
  RATIFIED with the second gate run post-flip per D-364 cooling-off
  (owner-delegated ratification, directive-equivalent evidence class).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
