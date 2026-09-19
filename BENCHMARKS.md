# BENCHMARKS — append-only, measured falsifiers per wave

## 2026-09-11T02:27:42.745Z — Ω0
- boot: 27 ms (envelope 500) — compile+sign+spawn+ready, min of 3
- port RTT p50/p99: 0.03/0.7 ms over 200 echo calls (envelope p99 ≤ 50)
- inter-compartment RTT p50: 0.14 ms (counter→echo through the router)
## 2026-09-12T22:21:53.721Z — daemon warm path (D-322)
- daemon call RTT p50: 2.42 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 401 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
## 2026-09-13 — V2.5 latency Landings (D-330 cache, D-331 lazy)
- daemon reboot echo-spec cold 159–169 ms vs cache-warm 130–146 ms (compile skipped on warm; verify + worker spawn retained — D-330)
- worker-thread creation p50 26.5 ms (n=10 isolated; min 14.9, max 34.5)
- dormant-first-touch echo.ping@1: 78–83 ms end-to-end (thread + import + init — D-331)
- D-329 pool checkout n=12: min 8.1 ms, p50 ~52–60 ms, max ~105–163 ms (two runs: 8.8/51.9/162.6, 8.1/60.2/104.8) vs cold thread-spawn p50 26.5 ms on record — checkout = parked-thread handoff + per-assignment import, so the pool saves ~thread-creation per checkout, not the import; full cold first-touch stays 78–110 ms
- host wall: 984/1000 LOC after the D-329 hook (+34; the pool proper — queue, sizing, bootstrap — lives in surfaces/daemon, outside the count)


## 2026-09-13T12:39:39.856Z — daemon warm path (D-322)
- daemon call RTT p50: 7.58 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 655 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
## 2026-09-15T19:28:33.123Z — daemon warm path (D-322)
- daemon call RTT p50: 0.36 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 102 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
## 2026-09-15T19:28:37.235Z — daemon warm path (D-322)
- daemon call RTT p50: 0.3 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 97 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
## 2026-09-15T19:59:53.866Z — daemon warm path (D-322)
- daemon call RTT p50: 0.51 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 68 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)

## 2026-09-16 — external-review remediation wave (D-360…D-364)
- boot (demo composition, min of 3): **27 ms → 10 ms** — the D-363 event-driven
  readiness swap (router `ready` message resolves waiters; the 25ms poll tick is
  gone from the critical path). Falsifier for §3 of the review met: drop ≈ the
  poll interval's worst case, on the same box at the same HEAD lineage.
- D-360 falsifier 13 (CPU-wedged compartment, sync infinite loop): watchdog
  eviction + hard terminate wall ≈ **2.9s** at intervalMs 100 / missLimit 3
  (detection ≈ 300ms; the rest is the bounded graceful-shutdown wait before the
  hard kill). Sibling compartments answer echo.ping@1 throughout, zero crashes.
- D-360 falsifier 14 (responsive heap bomber over its declared 32MB budget):
  detection ≈ 2 over-budget samples (≈ 200ms past the first over sample), full
  eviction wall ≈ **3.7s**. Siblings unaffected.
- D-321 resourceLimits re-verification on Linux (Bun 1.3.14, this tree):
  `tooling/watchdog/resourcelimits-probe.ts` — maxOldGenerationSizeMb 32 grew to
  **130MB heap, no error, exit 0** (old-gen object pressure). NOT ENFORCED,
  consistent with D-321's Windows observation (217MB). The README law #3 wording
  is downgraded accordingly ("coupling, not exhaustion").
- node --test canary (D-362): canon round-trip suite 5/5 under Node 24 — the
  production tree's core logic is runtime-neutral outside the one sqlite adapter.

## Owner wave 001 PROPOSED (D-365…D-370, branch owner-wave-001)

- Host: 999 LOC now gated against 1100 (frozen — no new surface without removal).
- Watchdog D-366: unresponsive→fast kill path added (`terminateFast` 500ms cap vs 2500ms graceful); memory→graceful unchanged. Fresh walls to be measured on the ratification run.
- Quick lane: `bun run omega:quick` (structural stages only) for inner loop; merge gate unchanged (733/733 baseline carried).
## 2026-09-16T17:00:48.439Z — daemon warm path (D-322)
- daemon call RTT p50: 0.53 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 67 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
## 2026-09-16T22:03Z — W0-3 vault index probe (D-378, `omega:probe`)
- indexed chat.history p50: 11.35 / 11.78 / 11.95 ms at ns sizes 1K / 11K / 111K messages (flat across 111× growth — the bounded-read falsifier; limit 50, ≤ CAP gets)
- solo chat.append p50: 3.59 / 3.72 / 4.65 ms at the same scales (flat)
- 100K corpus root-seed: 0.556 ms/op (writer-shaped rows at the vault layer); cap refusal fail-closed on the indexed path; vault.verify green over the corpus
- methodology note: three earlier runs showed progressive slowdown attributed to disk exhaustion (orphaned scratch, ENOSPC) — see 40-EVIDENCE/W0/w0-close-vault-index-probe.md
## 2026-09-18T10:16:28.925Z — daemon warm path (D-322)
- daemon call RTT p50: 0.66 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 149 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
- pool burst (D-388): 8 concurrent checkouts vs poolSize 2 → 8 hit / 0 cold fallbacks (0% fallback rate) in 105.5 ms wall — the burst-degradation signal is measured, not invisible
## 2026-09-18T10:16:48.896Z — daemon warm path (D-322)
- daemon call RTT p50: 0.52 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 88 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)
- pool burst (D-388): 8 concurrent checkouts vs poolSize 2 → 8 hit / 0 cold fallbacks (0% fallback rate) in 87.5 ms wall — the burst-degradation signal is measured, not invisible
## 2026-09-18T21:58:16.318Z — D-340 kernel wave (spine + kernel-lens, sustained load)
- law gate (real vivim.law, risky.op@1, 10-wide concurrent, n=300): 4331 ops/s sustained, p50 0.97 ms, p99 11.353 ms — the ONE gate's measured ceiling; ungated READ lane (risky.read@1): 49707 ops/s, p50 0.083 ms (the gate's per-op tax ≈ 11.7×)
- vault single-writer (vault.append@1, 10-wide, n=300): 1777 writes/s sustained, p50 2.522 ms, p99 24.204 ms — SCALABILITY §4's ceiling, measured
- state arbitration (acquire+release, 7 contended keys, n=500): 3957 cycles/s, p50 0.059 ms (host-op path, no compartment hop)
- graph-routed dispatch (echo.ping@1 via whoOffers, n=200): p50 0.039 ms vs v1 recorded 0.03 ms (Map.get) — the Option C latency axis, measured: Δp50 0.039 ms, p99 6.641 ms
- kernel-lens sweep (kernel.centrality@1, n=20, graph 35 nodes / 27 edges): p50 0.47 ms per query
- audit-chain verify (kernel.audit.verify@1, n=20, chain 27 entries): p50 2.51 ms — tamper-evidence's price

## 2026-09-19 - D-341 boot re-verify at scale (tooling/bench/boot-reverify-scale.ts, synthetic 4-file fixtures)
- 50 plugins: sync warm p50 137ms (cold 177ms) vs async warm p50 66ms — 2.1x wall cut
- 100 plugins: sync warm p50 277ms (cold 218ms) vs async warm p50 132ms — 2.1x wall cut
- 300 plugins: sync warm p50 625ms (cold 707ms) vs async warm p50 321ms — 1.9x wall cut, per-entry ~2.1ms sync / ~1.1ms async
- Mechanism confirmed linear sync on boot path; async halves wall at same trust (same bytes, same order, fail-closed symlinks); 300-plugin wall still 321ms — ceiling documented, revisit workers past 300.


## 2026-09-19 - D-392 admission falsifier (tooling/bench/priority-bench.ts, 20x150ms busy flood + 50 fast 500ms)
- After cap4+queue-deadline: fast survivors p50 22ms p99 36ms, 30 BUDGET timeouts (fail-fast, queue wait counts)
- Pre-fix queue ignored deadline (p99 3002ms, 0 timeouts) — the gap this lands; sync-busy still HOL-blocks execution, cap bounds backlog not preemption.


## 2026-09-19 - Part1 saturation (tooling/bench/law-saturation.ts, spine)
- Law: 10-wide 179 ops/s p50 192ms, 20-wide 295 ops/s p50 337ms, 40-wide 403 ops/s p50 626ms, 0 timeouts at 2s; unrelated echo p50 1-2ms flat (no blast radius)
- Vault: 10-wide 301 w/s, 20-wide 526 w/s peak, 40-wide 422 w/s; read-after 1-10ms flat (reads not queued behind writes)


## 2026-09-19 - Part2 soak smoke (tooling/bench/soak.ts --seconds=15)
- 374 ops, 13 faults, 0 errors, mem +0.66MB, chain 27; sweep p50 1.17ms (20 nodes), verify p50 4.78ms (15 entries) justifies 5s bus interval

