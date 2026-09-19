# D-397 — Process supervisor: who restarts the thing that restarts things (Part2 §1)

## Status

RATIFIED

## Context

Recovery handles crashes within the process; nothing brings the Bun process itself back after OOM-kill, panic, or reboot. A self-sustaining core needs a thin outer restart layer that cannot become a second host.

## Options

| Criterion | (a) Separate OS-process supervisor, restart on non-zero exit with backoff, stop plus loud surface past threshold (recommended) | (b) In-process self-supervision | (c) Platform restart-only with no backoff |
|---|---|---|---|
| Restarts a corpse | Yes, separate process | No, dead process cannot restart itself | Yes |
| Crash-loop safety | Backoff plus stop plus file plus log | Unbounded retry risk | Unbounded retry risk |
| Scope creep | One bit (exit code), no IPC channel | Grows into IPC | No policy |

## Decision

**Decision:** (a) — separate supervisor, backoff, loud stop.

## Consequences

- Clean exit 0 never restarts; non-zero restarts with 2^n backoff to a cap, then stops and writes a loud file plus log line.
- No IPC channel: exit code is the only signal.
- SIGKILL mid-write fault-injection proves pin-then-swap recovery on real process death.
- First Ω piece outside the process boundary, kept thin by record.

## Evidence

- `tooling/supervise.ts` plus `tooling/supervise.service` plus `tooling/supervise/test/supervise.test.ts` green.
- Ratified: falsifier plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: 50e5dcb.
