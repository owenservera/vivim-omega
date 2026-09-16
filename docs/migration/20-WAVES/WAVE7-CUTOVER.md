# W7 — Cutover (coverage parity → archive)

**Objective:** prove Omega meets or exceeds legacy product behavior, then archive the legacy — never the reverse order.
**Entry:** W1–W6 falsifiers all green. **Exit:** parity matrix + full gate + full bench + clean-clone reproduction + archive commit.

## Tasks

1. Parity matrix: every T-series HARVEST row → landed + tested + benchmarked, or explicitly deferred with a D-record pointer. REMOVE rows verified absent (no EventBus/ModuleRegistry/Prisma-runtime/tar.gz-install imports anywhere in migrated code — mechanical grep + gate stage).
2. Full-suite re-run: `bun test` + `omega:gate` + `omega:bench` + `verify-status` on a clean clone (Linux CI arbitrates; Windows serial lane informational until L-5 retires).
3. Retention/compaction steady-state: drills from W3 re-run at migration-scale vault; KNOWN-LIMITS revisit triggers evaluated (L-4/L-11/L-12/L-13 either closed with falsifiers or carried with detectors).
4. Archive: legacy repos marked archived/read-only (D-210 doctrine fulfilled — they were read-only throughout; this makes the state visible). No deletion. No history rewrite.

## Falsifier

Parity matrix 100% accounted + full gate green + bench walls within SLO envelopes + `verify-status` reproduction on a clean clone + archive markers committed.

## Non-goals

No post-cutover features in this wave. No legacy deletion. No victory lap before the reproduction run.
