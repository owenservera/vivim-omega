# D-381 — W0-6 parser landing bar: parsers as data, never routable code hooks

## Status

RATIFIED

## Context

W0-6: the legacy mines bring SSE framing (22 KB stream-parser, stream-align,
streaming adapters), import fixtures (`seeds/parsers/`, `engines/parsers/`),
CDP mechanics, and selector healers. The documented trap is
`plugin-system.onParse` — parsers as CODE HOOKS in the hot path. Omega
already has `contracts/src/parser.ts` + the `ParserPin` shape and the parser
isolation tier (D-354) with deadline-BUDGET. Wave0 rules the bar; Wave1 runs
the proof (one legacy SSE stream + one import fixture parsed through pins on
a real boot, `realizationRef`/`parserPins` surviving the vault round trip).

## Options

| Criterion | (a) Parsers as DATA: pins + version-pinned signed blobs, executed in the isolation tier (this row) | (b) Port onParse-style code hooks | (c) Rewrite parsers by hand per wave |
|---|---|---|---|
| Hot-path risk | Zero — parsers are not routable ops, cannot be invoked by peers | Re-creates the exact trap the legacy record warns about | Slow, unmeasured |
| Governance | Pins are versioned, signed, auditable data; deadline-BUDGET enforced | Untz | n/a |

## Decision

**Decision:** (a) Parsers land as DATA — `ParserPin` rows + fixture blobs,
version-pinned and signed, executed ONLY in the parser isolation tier with
deadline-BUDGET; never as routable ops, never as hot-path hooks. Wave1
proves the bar with the legacy SSE stream + one import fixture through pins
on a real boot (its falsifier is Wave1's; Wave0 owns the rule). Selector
healers and CDP mechanics may enter only as pin DATA + isolated-tier
executors under the same admission discipline as D-380's stealth list.

## Consequences

- The legacy `onParse` architecture is DEAD on arrival: any harvest PR that
  routes a parser as an op refuses at review + the import-surface stage.
- Wave1's falsifier text is fixed now: same parser input + same pin version
  → same extraction on a real boot, `parserPins` surviving the vault round
  trip, deadline-BUDGET observable on a stalled parser.

## Evidence

- W0-6 need text; D-354 (parser isolation tier) and D-355 (parser
  governance) are the existing law this bar slots into. Landing: 193dc61 —
  gate GREEN (structural stages + full suite; the second run followed
  ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
