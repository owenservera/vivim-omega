# BENCHMARKS — append-only, measured falsifiers per wave

## 2026-09-11T02:27:42.745Z — Ω0
- boot: 27 ms (envelope 500) — compile+sign+spawn+ready, min of 3
- port RTT p50/p99: 0.03/0.7 ms over 200 echo calls (envelope p99 ≤ 50)
- inter-compartment RTT p50: 0.14 ms (counter→echo through the router)
## 2026-09-12T22:21:53.721Z — daemon warm path (D-322)
- daemon call RTT p50: 2.42 ms over 50 protocol calls (TCP loopback + op, same demo composition)
- cold CLI wall for one echo call: 401 ms (full child process, warm vault, --no-daemon — the spawn floor the warm path removes)

