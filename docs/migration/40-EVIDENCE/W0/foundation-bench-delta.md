# Bench delta — foundation landing (2026-09-16)

Command: `bun run omega:bench` at the landing tree. Walls unchanged within noise vs the carried baseline (boot 10ms D-363, daemon RTT ~0.3–0.5ms warm, cold CLI ~67–102ms).

- `portRtt`: n=200, p50=0.03, p99=0.72, unit=ms
- `interCompartmentRtt`: n=50, p50=0.11, unit=ms
- `daemonCallRtt`: n=50, p50=0.53, unit=ms

- Driver-conformance workload (in-suite, machine-dependent signal): ~5–6ms full 8-stage parity workload on bun:sqlite.