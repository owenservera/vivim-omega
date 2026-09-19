# D-402 — Windows test-hygiene: EBUSY cleanup retry plus chmod assertion scoping (no product change)

## Status

RATIFIED

## Context

Eight full-gate reds on Windows are platform facts, not product bugs: sqlite lock release races AV scans past close (EBUSY on scratch cleanup), and chmod is best-effort over ACLs (proven). The workload digests are green underneath; the red is hygiene around them.

## Options

| Criterion | (a) Bounded retry plus best-effort cleanup plus win32-scoped POSIX assertions, product untouched (recommended) | (b) Leave red, cite platform | (c) Weaken product guarantees to match Windows |
|---|---|---|---|
| Reds fixed | 8 (driver 4, daemon 4) | 0 | 8 but lies |
| Product risk | Zero (test helper, test assertions, gate spawn path) | Zero | Real |
| B5 | Flat (no host change) | Flat | Flat |

## Decision

**Decision:** (a) — bounded retry plus best-effort cleanup plus win32-scoped assertions.

## Consequences

- `conformance.ts` scratch cleanup retries ~5s then leaves the unique dir for the OS sweeper (ownerOnly doctrine: never throw); other errors still throw.
- Daemon POSIX mode bits assert on POSIX CI, file existence on Windows (p99BudgetMs precedent for platform-conditional expectations).
- Gate `sh()` spawns the running runtime via `process.execPath` (hermetic, no PATH dependence).
- Symlink EPERM stays red: needs OS privilege (Developer Mode), not a code fix.

## Evidence

- `driver-conformance.test.ts` 4 pass (incl. node lane) plus `daemon.test.ts` 7 pass on this Windows box, both 0 pass before.
- `bun-surface`, `os-surface`, `import-surface` stages stay green (no new APIs in prod dirs).
- Ratified on landing commit `a93439d` with the above greens plus quick structural green; directive-class test-only change, no product or B5 impact.
