# BENCHMARKS — append-only, measured falsifiers per wave

## 2026-09-11T02:27:42.745Z — Ω0
- boot: 27 ms (envelope 500) — compile+sign+spawn+ready, min of 3
- port RTT p50/p99: 0.03/0.7 ms over 200 echo calls (envelope p99 ≤ 50)
- inter-compartment RTT p50: 0.14 ms (counter→echo through the router)
