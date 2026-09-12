# D-322 — Daemon warm path (Upgrade A): per-vault long-lived host + thin CLI

## Status

RATIFIED

## Context

Steady-state CLI calls pay full process start + compile + verify + worker spawn per
invocation (~800ms warm-vault on the reference box for a ~1ms op). The MCP surface
already proves the long-lived shape; the CLI has no equivalent. Target restatement
(see Consequences): per-call-process spawn is a floor no warm path goes under
(~300ms here, tens of ms best case) — the falsifier must exclude it.

## Options

| Criterion | (a) Per-vault TCP daemon + thin CLI, cold fallback (this record) | (b) Unix-socket daemon | (c) No daemon (status quo) |
|---|---|---|---|
| Cross-platform risk | None (TCP loopback everywhere) | AF_UNIX-on-Windows unverified at spike time | N/A |
| Staleness detection cost | mtime+size restat per call (~ms) | Same | N/A (always fresh, always slow) |
| Host changes | Zero (surface package only) | Zero | Zero |
| Trust model change | None (vault-dir readers already hold root keys) | Same | N/A |
| Per-call floor removed | Process start + compile + verify + spawn | Same | Nothing removed |

## Decision

**Decision:** (a) Per-vault TCP daemon + thin CLI, cold fallback — falsifier: daemon-side call RTT p50 ≤ 5ms AND cold-CLI wall reported separately (the split is the honest number, not 19x-to-zero).

## Consequences

- CLI output is byte-identical warm vs cold (gated) — the warm path is performance, never a behavior fork.
- Stale plugin content reboots the daemon (restat drift); different spec/recipe always reboots. Same-size same-mtime writes inside filesystem granularity are the accepted residual (bounded by the 10-min idle timeout).
- `status()` over the warm path is a per-invocation snapshot (documented; no CLI flow mutates-then-rereads status).
- B/C/D (pool, cache, lazy activation) stay sequenced behind this; B's cross-plugin pooling restriction and the host-exception rule are recorded separately when B is scoped.

## Evidence

- Landed + gated in babd879: `surfaces/daemon` + `surfaces/daemon-client`, CLI
  thin-client with `--no-daemon` escape hatch, gate green 542/542 (all five stages).
- Bench split (daemon RTT vs cold wall) appended to `BENCHMARKS.md` by `bun run omega:bench`:
  daemon call RTT p50 2.42ms over 50 protocol calls (≤5ms falsifier MET, VLC-loaded box);
  cold CLI wall 401ms for one echo call (the spawn floor, reported separately).
- Warm/cold parity test + protocol/auth/staleness/idle suite green.
