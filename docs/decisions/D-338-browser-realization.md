# D-338 — M0: `BROWSER_MEDIATED` realization scope + authority bar

## Status

RATIFIED

## Context

`ProviderClass` reserves `BROWSER_MEDIATED` but nothing implements it — yet the
whole legacy product runs on ChromeGovernor driving authenticated Chrome via
CDP. A browser realization reads and writes another application's UI state: a
categorically larger trust surface than any capability token granted so far.
Scope and authority bar must be written before code, or the pilot fakes the
very mechanism it claims to prove.

## Options

| Criterion | (a) `provider-browser` plugin + law-reviewed authority + day-one forbidden entries + fixture falsifier (recommended) | (b) Wrap ChromeGovernor as-is | (c) Defer browser; API-only pilot and product |
|---|---|---|---|
| Trust posture | Reviewed under `vivim.law` before first use; never-navigate domains fenced proactively | 30 KB of pre-omega control logic trusted on arrival | No browser risk, but abandons 3 built provider plugins + stealth corpus |
| Falsifier | One real message via a fixture-recorded session through the realization under `law.check@1` | Same falsifier, unearned trust | No falsifier possible for browser providers |
| Harvest honesty | CDP mechanics harvested (T-06), governor restructured (T-08), stealth admitted selectively (T-07) | Ports the coupling too (governor owns its own authority today) | Harvest rots unused |

## Decision

**Decision:** (a) `provider-browser` plugin with law-reviewed authority — holds a CDP connection, exposes it as a capability realization, carries day-one forbidden-overlay entries, and proves itself with a fixture-recorded provider session gated by `law.check@1` exactly like every other op.

## Consequences

- Falsifier (ship-blocker for the browser path): one real message sent through a `BROWSER_MEDIATED` realization from a fixture-recorded session (import parsers per M-TRIAGE-01 T-05 supply fixtures — fixture, not live network).
- ChromeGovernor enters as RESTRUCTURE input (T-08): single-point-of-control concept kept, authority rewritten against capability tokens.
- Blocks a browser-dependent pilot provider; does not block an `API_NATIVE` pilot (Ollama candidacy per M-TRIAGE-01 §3), which still exercises M1/M2/M3/M4 for real.
- Stealth engines admit only through the same law review — no silent human-mimicry in the trusted path.

## Evidence

- `contracts/src/manifest.ts` (`ProviderClass` reserves the member; nothing implements it) + `plugins/vivim-providers` registry (class-typed, status-carrying).
- `Migration/M-TRIAGE-01.md` T-05/T-06/T-07/T-08 (§3 pilot-provider ordering).
- Ratification: owner directive 2026-09-13 (proceed on the record's recommendation); landed PROPOSED in c09c140; full `bun run omega:gate` GREEN on c09c140 (612/612, host 984/1000) — ratified on that evidence. Scope ratified; implementation falsifier still pending (M0 engineering).
