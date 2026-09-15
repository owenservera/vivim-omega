# D-355 — M7 re-land: the parser as governed, version-pinned data

## Status

RATIFIED

## Context

M7 (M-PILOT-MISSING-CORE-PART2 §M7): stream-response parsing (raw
browser/CDP bytes → M1's chunk envelope) must be swappable per provider and
per provider version, but it cannot be inline, un-versioned code — that
violates I4 (everything is a plugin) and P-D2 (version-pinned execution) the
same way an un-manifested hardcode would. The engineering was landed once
(first lineage, turn-008, D-348) and destroyed with the second sandbox reset
(RESET-NOTE: D-340–D-349 retired; landed-lost rows need fresh D-records and a
fresh gate). The capability map's begin order names this the M0 wave's first
code record, from D-354 — the isolation ruling that must precede parser code
— with the D-351 parity net inherited (a `parser` kind is NOT routable and
therefore never enters the net's domain) and the D-332 call-site net
inherited (every export below carries real call sites in the same wave).

## Options

| Criterion | (a) Parser as signed, version-pinned contribution data (recommended) | (b) Inline parse functions in the provider | (c) `logic_code` string interpreted at runtime |
|---|---|---|---|
| I4 / P-D2 | Same signing/verification path as every contribution; version pin on the realization | Un-manifested hardcode — the exact violation M7 names | Eval ≈ arbitrary code with no manifest, no audit |
| Falsifier | Recorded event-group replay asserts the envelope matches fixture chunks — the standard op falsifier shape | No seam to falsify (the provider IS the parser) | Nothing static to prove |
| Discovery lineage | Pins give a provider DOM break a name (version mismatch), not a mystery | Breaks silently | Breaks silently, unattributable |

## Decision

**Decision:** (a) Re-land the parser governance vocabulary exactly as
D-348 first landed it, adapted to the third lineage:

1. **Contribution kind** (`contracts/src/manifest.ts`): `CONTRIBUTION_KINDS
   += "parser"` — declared in a provider's `PluginManifest`, same
   signing/verification path as every other contribution. NOT routable:
   registers no op, absent from `routableOps()`/`riskyOps()` — governance
   data, not a surface (and outside the D-351 parity net's domain by
   construction).
2. **Parser contract** (`contracts/src/parser.ts`, NEW): `ParsedChunk
   {data, final}` — the only rows a parser may produce; `ParserPin
   {providerId, archetypeSlug, version}`; `parserContributionId` (the
   `parser:<archetype>:<provider>` grammar); `asParserPin` (total
   validation, fail-closed on junk); `pinMatches` (exact-cover check); and
   `buildChunkEnvelope` (registry-side mechanical assembly of ordered rows
   into M1 `StreamChunk` envelopes: streamId = the delivering call's
   causation id, seq 1-based contiguous, exactly one final row — throwing
   on an empty parse or a non-final tail BEFORE the shim's emit law ever
   sees a violating sequence). The transform's job is narrowly "produce
   M1's chunk rows" — nothing else — so it cannot smuggle side effects.
3. **Version pin on the realization** (`contracts/src/provider.ts`):
   `ProviderRealization.parserPins?: ParserPin[]` — optional, so pre-D-355
   records are untouched; consumers treat absence as "unpinned" and the
   D-357 realization bar refuses a send that needs a pin the record lacks.
4. **The writer is the standard lifecycle**
   (`plugins/discovery-verification`): `discovery.verify@1`'s provider
   input gains `parserPins?` — total-validated (`asParserPin`), dup-checked
   per (providerId, archetypeSlug), providerId-cross-checked against the
   provider identity (fail-closed genealogy), and written onto EVERY
   realization row the run produces.
5. **Discovery-derived, not hand-written**: a pin's evidence trail is the
   run's promotion event (M5's discovery.observe evidence is what a parser
   transform cites). The browser falsifier (D-357) replays one recorded
   event group through the pinned parser and asserts the envelope matches
   the fixture's expected chunks — the identical falsifier shape as every
   other op.

## Consequences

- Provider DOM changes surface as pin mismatches (REFUSED, bar 4 of D-357),
  never as silent runtime failures.
- A parser version bump is a manifest change with a realization re-verify
  through the standard lifecycle — no code path forks.
- The `parser` kind is inert until a plugin declares it and a realization
  pins it; no shipped composition changes behavior by this record alone.
- M13's containment suite (D-354) covers the execution tier; this record
  covers only the data grammar.

## Evidence

- M-PILOT-MISSING-CORE-PART2 §M7 (the shape; falsifier = event-group replay).
- D-348 (first lineage, retired — this record re-lands its engineering).
- D-354 (the isolation tier this code runs under — landed first, by design).
- D-351/D-332 (the inherited nets: `parser` is outside the parity domain;
  every parser.ts export gains call sites in the same wave — verification's
  writer, provider-browser's registry, and the falsifier suites).
- Landed in this wave: `plugins/discovery-verification/test/` (22 pass incl.
  the pin-validation rows), `plugins/provider-browser/test/parsers.test.ts`
  (envelope discipline, determinism, fail-closed derivations).
- Ratification: owner directive 2026-09-15 ("Continue working on the items
  in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
- - Gate evidence: full `bun run omega:gate` GREEN on the wave tree (1dc96ee): 691/691 tests, host 997/1000, host-loc/fresh-tree/decisions/compositions/attest all pass; attest commit 6e15aa7.
- Ratification: owner directive 2026-09-15 ("Continue working on the items in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
