# D-396 — Threshold tuning from measured wave data (Part1 §5)

## Status

RATIFIED

## Context

Part1 produced real distributions for every placeholder constant: 50-swarm fan-in, hog versus spike detection, law saturation latency versus deadline, daemon pool pressure. Tune from numbers, not guesses.

## Options

| Criterion | (a) Keep centrality 5 slash 20, watchdog 2 overs, MAX_DEADLINE 60000, pool 4 with ceilings documented (recommended) | (b) Raise centrality thresholds to quiet the swarm | (c) Lower MAX_DEADLINE to fail faster |
|---|---|---|---|
| Swarm 133 nodes 112 load-bearing | Correct for adversarial swarm, realistic shapes stay selective | Hides real fan-in | Unrelated |
| Hog 500ms, spike spared | Proven, no false positives | Unchanged | Unchanged |
| Law 40-wide zero timeouts at 2s | 60s ceiling never binds healthy queued calls | Unchanged | Risks killing healthy queued work |

## Decision

**Decision:** (a) — keep all four, ceilings documented.

## Consequences

- Centrality 5 slash 20 checked against 50-swarm: over-flagging is correct under adversarial fan-in, not a tuning failure.
- Watchdog 2 overs from D-393 stands with hog 500ms detection.
- MAX_DEADLINE 60000 never binds at tested saturation; queue-deadline fix makes it cover queue plus execution honestly.
- Daemon pool 4 stands; 50-swarm singleflight holds with no bottleneck, configurable later if real swarm hits it.

## Evidence

- `host/test/ghost-deep.test.ts`: 133 nodes, 126 edges, 112 load-bearing, audit 126 entries verified.
- `tooling/watchdog/test/watchdog-hog-spike.test.ts` plus D-393.
- `tooling/bench/law-saturation.ts` plus D-394 slash D-395.
- `tooling/bench/priority-bench.ts` plus D-392.
- Ratified: analysis plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: 50e5dcb.
