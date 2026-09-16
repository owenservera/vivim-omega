# D-370 — Node-boot proof + composition freeze (plan, spike next)

## Status

RATIFIED

## Context

D-361 claims production-tree runtime neutrality (one sqlite adapter) with only a canon canary (5/5 under Node) as proof. The full demo boot under Node has never been attempted. Separately, compositions stand at 16 specs with 3 drift allowlists — one more hand-maintained spec turns the allowlist into debt.

## Options

| Criterion | (a) Plan-only this wave: freeze + spike protocol (this row) | (b) Full Node boot this wave | (c) Commit to Bun, delete canary |
|---|---|---|---|
| Risk this wave | Zero (docs + freeze note) | Medium (sqlite API drift, npm vs bun install, daemon net) | Low, loses neutrality claim |
| Evidence value | Freezes growth, defines the spike exit criteria | Highest (real boot log) | Honest but narrowing |
| Cost | Minutes | 1 day timebox | Minutes + policy change |

## Decision

**Decision:** (a) Plan-only this wave — freeze compositions at 16 (no new spec without deleting/generating one; stated here + CURRENT-INVARIANTS note), define the Node-boot spike exit criteria (swap `db.ts` to `node:sqlite`, `bun install`→`npm install`, boot demo under Node, record wall + failures in BENCHMARKS; success = boot + echo round-trip, failure with reasons also closes the row by committing to Bun).

## Consequences

- No code change this wave for Node boot; the spike runs next wave timeboxed to 1 day.
- Composition freeze is social (review discipline), not gate-enforced yet — the conformance net (D-316) mechanizes it later.
- Either spike outcome is acceptable and pre-authorized here.

## Evidence

- Plan record (directive — no falsifier; the spike's boot log becomes the evidence for the follow-up row).
- Landed in 7d2cea7 (owner wave 001 PROPOSED; quick GREEN).
