# 2026-09-18 — Performance remediation round 2 (D-388)

Second external performance review (`vivim-omega-performance-analysis.md`,
reviewed at 0815d8c, the D-387 line). Every finding verified against the tree
before code moved. Priority list implemented under the standing evidence law.

## Verification of the review's findings

| § | Finding | Verdict |
|---|---|---|
| 2.1 | Director tick N+1 port round trips (per-row body get + per-row fired-ledger get, up to 2×200/tick) | HELD — fixed (batched) |
| 2.2 | Pool burst silently degrades to cold spawns > pool size | MECHANISM CORRECTED by falsifier: sync `refill()` inside `acquire()` never starves the stock — real burst cost is the inline thread spawn per checkout; observability + knob implemented |
| 2.3 | L-1/L-15 isolation risk; tighten cadence for latency-sensitive compartments | HELD as a posture — implemented as the interim knob, D-386 gate line untouched |
| §3 / §4 | Priorities 3–5 (L-4 backfill, D-386 hold, L-13 SLOs) | HELD as dispositions: L-4 → W3-owned (wave boundary law), D-386 hold needs no code, L-13 → F-3 |

## Measured numbers

- **Tick read phase** (`tooling/perf/perf-remediation.ts` case F, 200 candidates
  = the scan cap): OLD 403 sequential read hops vs NEW 5 (scan + bodies batch +
  ledger batch + rule query + rule get). Whole batched tick including 200 rule
  fires + 200 ledger appends ≈ 7 ms in-process; the hop count is the durable
  win under network/IPC latency.
- **Pool burst** (`omega:bench`, 8 concurrent checkouts vs poolSize 2):
  8 hits / 0 cold fallbacks / 0% fallback rate; wall 87.5–105.5 ms across two
  runs (~11–13 ms per checkout — the inline spawn cost). Recorded in
  BENCHMARKS.md (append-only) and `build/benchmarks.json`.
- **Watchdog cadence falsifier** (real-timer): declared 40 ms cadence probed
  ≥10× vs the undeclared compartment ≤3× over the same 700 ms window — the
  knob tightens only its own compartment; global default (250 ms) untouched.

## Falsifiers (15 new, all green at landing 3ccfe07)

- `plugins/vivim-director/test/d388-tick-batching.test.ts` — 8
- `surfaces/daemon/test/pool.test.ts` — +2 (burst + monotonic accounting)
- `tooling/watchdog/test/watchdog.test.ts` — +5 (pure policy + real-timer wiring)

## Structural evidence

- Gate GREEN ×2: PROPOSED 3ccfe07 (886/886, host 1039/1100 FLAT) → RATIFIED
  7a2aa8b (886/886, host 1039/1100 FLAT) — D-364 cooling-off honored.
- Suite 886/886 (15 new tests), compositions byte-identity 16/16 after the
  console+chat grant regen, board ZERO open, verify-status reproduces.
- D-387 Evidence repaired (landing citation restored; checker-demanded,
  D-384 precedent, no substance edit) — recorded in D-388 Decision ¶5.

## Deferred with named triggers (unchanged from the record)

- Tick rule-loading batching — trigger: a real ruleset approaches
  TICK_RULE_CAP and the skip-not-fatal semantics change is owner-ruled.
- Pool refill-policy redesign — trigger: a measured burst workload where the
  inline-spawn-per-checkout cost is the bottleneck.
- L-4 chat index backfill + repair — W3-owned per STATUS.md.
- L-13 SLO envelopes — Phase F-3-owned.
