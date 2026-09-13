# D-331 — Lazy activation (latency D)

## Status

RATIFIED

## Context

Eager boot pays for plugins no call ever touches: every phase-1 compartment
spawns, inits, and reports ready before the first routed call. Spawning on
first routed call removes the cost, but introduces a new "absent" state that
health machinery must not confuse with failure — conflating "never started"
with "started and unwell" would turn laziness into silent permissiveness.

## Options

| Criterion | (a) Phase-0 eager, rest spawn-on-first-call, `dormant` distinct from `degraded` (this record) | (b) Lazy without a distinct state (reuse `degraded`) | (c) Eager always (status quo) |
|---|---|---|---|
| Health honesty | `router.status()` + `vivim.mind` snapshot + `vivim.run` health loop all tell never-started from unwell | Health flaps on cold plugins (false alarms, masked real failures) | Honest, always paying |
| First-touch cost | One spawn, then warm (measured and recorded) | Same | Zero (pre-paid) |
| Boot speed | Fastest steady-state boot in the plan | Same | Slowest |

## Decision

**Decision:** (a) Phase-0 eager, rest spawn-on-first-call, `dormant` distinct from `degraded` — a never-called op still spawns and answers correctly on first touch; dormant-vs-degraded health tests green.

## Consequences

- Prerequisite: D-330 (pool + cache make first-touch cheap).
- Falsifier appended to `BENCHMARKS.md`: dormant-first-touch latency.
- `vivim.mind` snapshot schema and `vivim.run` health loop updated together (same commit — no half-migrated health vocabulary).

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §5 (V2.5-D); dependency chain from `OMEGA-19X-LATENCY-DESIGN.md` (Upgrade D).
- `host/src/ports.ts`: `DormantEntry` + `registerDormant` (tokens minted at boot — same authority, deferred transport) + `spawnDormant` singleflight + gate-before-spawn dispatch (a refused call never pays a spawn) + `status().dormant` + stats dormant-zeros.
- `host/src/boot.ts`: phase-0 eager, rest dormant; `onDemandSpawn` injected (ports stay transport-only); `waitReady` covers eager only; `waitForActive` bounds first touch.
- `host/test/lazy.test.ts`: dormant-at-boot + first-touch spawns-and-answers + transitive wake + stats zeros + concurrent-touch singleflight + never-called touch. Falsifier: dormant-first-touch `echo.ping@1` 78–83ms (thread ~26ms p50 + import + init).
- Health vocabulary, held consistent three ways (same wave): (1) `router.status()` + `host.compartment.stats` report `dormant` explicitly — never-started vs degraded is structural; (2) `vivim.run`'s loop needed NO logic change (zero-crash rows cannot trip either rule — proven by the new dormant unit test in `run.test.ts`, not assumed); (3) `vivim.mind`'s lens documents its boundary honestly instead of faking it: the lens reports law-observed liveness only, so dormant ≡ unobserved there, falsifiable against `router.status()` (deviation from the "schema updated" letter, reasoned: the mind has no router-state port, and inventing dormancy without evidence would be the worse dishonesty).
- Prerequisite note: D-330 (cache) landed; D-329 (pool) did not — first-touch measured 78–83ms without it, so the "first-touch cheap" intent is met by measurement; the pool remains pure upside (see D-329).
- Migration: twelve boot-active assertions across spine/providers/inference/perceive/email/observe/mind/director/llm/cli/web re-pinned to dormant-at-boot (each now proves MORE: dormant set + intact routes); `surfaces/cli` renders `[dormant]`; `/api/health` merges dormant rows.
- Falsifier run: lazy suite 6/6 + all migrated suites green; full `bun run omega:gate` GREEN 2026-09-13 (601/601, host 950/1000 — ratified in 3f53afc).
