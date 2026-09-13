# D-339 — M1: additive streaming primitive with cold fallback

## Status

RATIFIED

## Context

`port.call` is single request → single response; a chat product is
fundamentally token-by-token and there is no way to express partial results
through the Port Protocol at all. The primitive must be designed the way the
daemon was — additive, with cold fallback — and measured against the LOC wall
the same way D-329's pool was, or streaming becomes the excuse that breaches
the host budget.

## Options

| Criterion | (a) Additive `port.stream` shape + cold fallback; `echo.stream@1` falsifier first (recommended) | (b) Poll-based chunk reads over `port.call` | (c) Full-duplex protocol rewrite |
|---|---|---|---|
| Protocol risk | Additive (non-streaming callers observe nothing) | No protocol change, N round trips per message + latency tax | Every existing caller re-proves |
| Host budget | Growth only if structurally unavoidable (D-329 interface/hook split precedent) | Zero host change, permanent tax | Unbounded |
| Falsifier first | Ordered chunks with a real boot before anything provider-shaped | Same test, worse numbers | No small falsifier exists |

## Decision

**Decision:** (a) Additive streaming shape with cold fallback — a second call shape delivering ordered chunks, designed so non-streaming callers observe nothing; `echo.stream@1` proves ordered delivery on a real boot before any provider touches it; host-side growth follows the D-329 placement precedent (interface in host, machinery outside).

## Consequences

- Falsifier: fixture-driven streaming echo delivering ordered chunks end-to-end; provider streaming builds on it, not beside it.
- Harvest: legacy `sse-parser.ts` (65 lines, M-TRIAGE-01 T-04) supplies chunk framing; legacy `StreamBlock`/`ProviderStreamConfig` shapes inform persistence of partials.
- M0 and M1 run in parallel (independent); both block a browser-pilot, M1 alone blocks any streaming pilot including `API_NATIVE`.
- Non-goal held: no full-duplex rewrite, no polling tax baked into the protocol.

## Evidence

- `Migration/M-TRIAGE-01.md` T-04 (sse-parser harvest) + T-03 (stream-config shapes).
- D-329 placement precedent (interface/hook split held the wall at 984/1000) + D-322 additive-with-fallback precedent.
- Ratification: owner directive 2026-09-13 (proceed on the record's recommendation); landed PROPOSED in c09c140; full `bun run omega:gate` GREEN on c09c140 (612/612, host 984/1000) — ratified on that evidence. Scope ratified; `echo.stream@1` falsifier still pending (M1 engineering).
