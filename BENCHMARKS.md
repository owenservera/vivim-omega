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
