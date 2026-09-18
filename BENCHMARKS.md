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
## 2026-09-18T21:58:16.318Z — D-340 kernel wave (spine + kernel-lens, sustained load)
- law gate (real vivim.law, risky.op@1, 10-wide concurrent, n=300): 4331 ops/s sustained, p50 0.97 ms, p99 11.353 ms — the ONE gate's measured ceiling; ungated READ lane (risky.read@1): 49707 ops/s, p50 0.083 ms (the gate's per-op tax ≈ 11.7×)
- vault single-writer (vault.append@1, 10-wide, n=300): 1777 writes/s sustained, p50 2.522 ms, p99 24.204 ms — SCALABILITY §4's ceiling, measured
- state arbitration (acquire+release, 7 contended keys, n=500): 3957 cycles/s, p50 0.059 ms (host-op path, no compartment hop)
- graph-routed dispatch (echo.ping@1 via whoOffers, n=200): p50 0.039 ms vs v1 recorded 0.03 ms (Map.get) — the Option C latency axis, measured: Δp50 0.039 ms, p99 6.641 ms
- kernel-lens sweep (kernel.centrality@1, n=20, graph 35 nodes / 27 edges): p50 0.47 ms per query
- audit-chain verify (kernel.audit.verify@1, n=20, chain 27 entries): p50 2.51 ms — tamper-evidence's price
