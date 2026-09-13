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
- dormant-first-touch echo.ping@1: 78–83 ms end-to-end (thread + import + init — D-331; pool would shave ~26 ms, deferred per D-329 wall math)
- host wall: 949/1000 LOC after D-331 (lazy +66); D-329 pool (~62) does not fit — deferred, not crammed


