# D-321 — Bun resourceLimits honesty gap

## Status

RATIFIED

## Context

Verified 2026-09 on Bun 1.3.14 (Windows): a worker spawned with
`resourceLimits: { maxOldGenerationSizeMb: 32 }` grew to ~217MB heap without
error (old-generation object pressure, not Buffers — which sit outside the V8
heap on every runtime and would make any such test vacuous). Compartments are
isolated against each other (separate V8 isolates — true) but NOT against
starving the process. No in-tree code claims otherwise (zero `resourceLimits`
references in `host/src`), so this is a missing protection, not a false claim —
but the capability-security pitch invites the assumption, which is the honesty gap.

## Options

| Criterion | (a) Document now, watchdog later | (b) Watchdog now (host polls compartment stats, quarantine past threshold) | (c) Ignore (first-party plugins only) |
|---|---|---|---|
| Cost | One comment block (in `host/src/worker.ts`) | New host-adjacent machinery + policy thresholds | Zero |
| Closes honesty gap | Yes, immediately | Yes, with enforcement | No — assumption persists |
| Protects against buggy plugins | No (documents the exposure) | Partially (polling granularity) | No |
| Protects against adversarial plugins | No | No (polling is not a boundary) | No |

## Decision

**Decision:** (a) Document now, watchdog later — the comment names the verified numbers; a consumption watchdog (mirroring vivim.run's crash-loop quarantine) is specified follow-up, and subprocess-per-compartment stays reserved for a future untrusted-plugin tier.

## Consequences

- Any "adversarial plugin" threat model MUST cite this record as an open exposure until the watchdog lands.
- The watchdog, when built, goes through the Decision Contract as its own row (thresholds are policy, not plumbing).
- Re-verify on Bun upgrades: runtime behavior here is version-sensitive (method: old-gen object pressure, cap 32MB, expect OOM-kill when enforced).

## Evidence

- Landed in 1bcae72: `host/src/worker.ts` header documents the verified gap
  (217MB heap in a 32MB-capped worker, Bun 1.3.14, old-gen object pressure —
  Buffer-based probes are vacuous on every runtime).
- `upgrades/New/VIVIM-OMEGA-INDEPENDENT-REVIEW.md` §2 Priority 2 (origin of the ask).
- Probe method: worker_threads + `resourceLimits.maxOldGenerationSizeMb: 32` + object-graph pressure to ~217MB, no error.
