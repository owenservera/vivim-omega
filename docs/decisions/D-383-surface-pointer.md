# D-383 — W0-8 surface contract first: the pointer default (no frontend port)

## Status

RATIFIED

## Context

W0-8: the legacy `frontend/` is a full Next.js+Tauri product with its own
Prisma client and 40+ server routers behind it. The trap is porting that data
layer into Omega. Omega already has `surfaces/{cli,daemon,mcp,web}` + `sdk/` +
`surfaceOpMeta` (one derivation, N consumers — A2/D-359). Wave0 rules the
default so waves 1–4 build against a stable surface shape; Wave5 proves it
(a person types into the existing frontend and gets a real streamed response
from one real provider through the law gate, ledgered + mind-queryable).

## Options

| Criterion | (a) Pointer default: existing Next.js points at Omega surfaces over HTTP (this row) | (b) Port the frontend into Omega | (c) Rebuild the UI in Omega's image |
|---|---|---|---|
| Prisma/route handlers in Omega | Zero — the legacy data layer stays behind the pointer | 40+ routers + a Prisma client inside a capped-core tree | Same cost, new paint |
| Tool generation | MCP tools via the shared derivation — no second derivation | Second derivation | Second derivation |
| Wave5 falsifier | CLI-as-stand-in until the pointer is wired, then the real frontend | Same, after a port wave nobody priced | Same, after a rebuild nobody priced |

## Decision

**Decision:** (a) Pointer default — the existing Next.js frontend points at
Omega surfaces over HTTP; MCP tool generation rides the shared
`surfaceOpMeta` derivation (no second derivation); the Tauri shell decision
DEFERS to Wave5 and only on a proven shape mismatch; console's
cooperative-local-user assumption hardens to authenticated-user over
`user:<id>` + credentials + consent (the D-379 fence is the mechanism the
frontend will call with). No UI rebuild for aesthetics is in migration
scope; until Wave5 wires the pointer, the CLI is the sanctioned stand-in for
the falsifier.

## Consequences

- Waves 1–4 never block on frontend work; the surface shape they code
  against is `surfaceOpMeta` + the existing surfaces' op set.
- The Wave5 falsifier text is fixed now — a person types, one real provider
  answers through the law gate, the exchange is ledgered + mind-queryable.

## Evidence

- W0-8 need text; D-359 (shared derivation) is the A2 law this pointer
  rides. Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
