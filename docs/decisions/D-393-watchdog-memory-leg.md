# D-393 — Watchdog memory leg: hog caught, spike spared (D-321 child)

## Status

RATIFIED

## Context

D-321 ratified documenting the gap, D-360 built the out-of-tree watchdog, D-366 hardened kill paths. Missing: measured threshold justification from this wave plus hog versus spike falsifiers proving no false positives on transient pressure.

## Options

| Criterion | (a) Two consecutive over-budget samples evict, single over plus recovery spared (recommended) | (b) Single over-sample evicts | (c) Three consecutive overs required |
|---|---|---|---|
| Catches hog | Yes, 500ms past first over at 250ms cadence | Yes, faster | Yes, slower |
| Spares spike | Yes, single over never trips | No, transient batch reads evict | Yes |
| False-positive cost | One extra interval of growth | Evicts healthy plugins | Lets hog grow longer |

## Decision

**Decision:** (a) — two consecutive overs evict, single over spared.

## Consequences

- Hog at 32MB budget trips at 2nd consecutive over, 500ms detection at 250ms cadence.
- Spike to 58MB in 64MB budget then recovery never trips.
- Bun per-worker resourceUsage is process-level, version-sensitive; shim probeStat stays the signal with D-366 spoof note unchanged.
- No subprocess isolation this wave, per D-321 scope.

## Evidence

- `tooling/watchdog/test/watchdog-hog-spike.test.ts`: hog series trips at index 2, spike series never trips.
- Fixtures `ghost.hog` plus `ghost.spike` with manifest discipline.
- Existing `host/test/adversarial.test.ts` cases 13 plus 14 stay green as boot falsifiers.
- Ratified: hog/spike plus adversarial falsifiers green plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: d32609c.
