# D-362 — Gate claims reproduce mechanically: verify-status CI job + node canary

## Status

RATIFIED

## Context

The gate (`omega:gate`) that produces `build/status.json`/`build/gates.log` is run
and interpreted by the same agents proposing changes. The external review (turn-014
tree) flagged self-attestation: the adversarial suite is strong evidence FOR the
security laws, but nothing played the adversarial role for the PROCESS claims
(test counts, LOC counts) themselves. Cross-checking git history against gates.log
was informal and manual. D-320 had already established the CI lane; ci.yml ran the
gate but never compared its output to what was committed.

## Options

| Criterion | (a) verify-status CI job: fresh gate must reproduce the committed structural claims (this row) | (b) Byte-for-byte status.json equality | (c) Keep honor-system (commit and hope) |
|---|---|---|---|
| Catches stale/hand-edited numbers | Yes — mechanical, loud | Yes | No |
| False failures across machines | No — runner-shape fields normalized | YES (maxConcurrency, timings scale with the box) | No |
| Cost | One script + one CI job | Comparator that must be maintained against every status change | Zero |
| Extends to future claims | Yes (structural() grows with intent) | n/a | n/a |

## Decision

**Decision:** (a) verify-status CI job — `tooling/ci/verify-status.ts` re-runs
`omega:gate` from the checkout and fails loudly unless the COMMITTED
`build/status.json`'s structural claims reproduce: stage flags (host-loc,
fresh-tree, decisions, compositions, bun-surface, tests, attest), host LOC, test
pass/fail counts, wave registry, benchmarks pointer — modulo `generatedAt` and
runner-shape fields (a 4-core CI runner cannot byte-match a dev box's
`maxConcurrency` or timing details, so (b) is rejected as false-failure-prone).
Wired as the required `gate-reproduce` job. Additionally: a required `node-canary`
job runs the canon suite under plain Node 24 (`node --test
tooling/ci/canon-canary.test.mjs`) — the core logic is proven runtime-neutral, not
Bun-only beyond the one declared adapter (D-361). Commit discipline per the review's
§5.1: every gate-status refresh commit message cites the landing commit and the exact
command (`bun run omega:gate`).

## Consequences

- The committed status.json is now a CLAIM that CI re-derives; hand-editing or
  staleness fails the required job instead of surviving until a human notices.
- Any new status.json field must be added to `structural()` deliberately — either it
  is a claim (compared) or runner-shape (normalized). That choice is visible in code.
- The canary is deliberately narrow (canon module only): it proves the core is not
  Bun-only; a full Node port of the suite remains out of scope (D-361 (b) path).

## Evidence

- `verify-status.ts` green on the landing commit (structural comparison passes).
- Canary 5/5 under Node 24 on the landing commit.
- ci.yml: `gate-ubuntu`, `gate-reproduce`, `node-canary` (required) + `test-windows`
  (informational, D-320 unchanged).
- Landed in 0df18d0 (the remediation-wave commit; gate GREEN 733/733, host 999/1000, all seven stages incl. the new bun-surface stage).
