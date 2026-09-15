# D-352 — M1 re-land: the additive streaming primitive (D-339 engineering, third lineage)

## Status

RATIFIED

## Context

D-339 ratified the streaming scope — "additive `port.stream` shape with cold
fallback; `echo.stream@1` falsifier first" — and its record states the
falsifier was "still pending (M1 engineering)". That engineering was landed
once (first lineage, turn-007) and destroyed with the second sandbox reset
(RESET-NOTE: D-340–D-349 retired; landed-lost rows need fresh D-records and a
fresh gate). The capability map's begin order (M1+M3 → M0 wave → chat pilot,
from D-352) makes this re-land the first code wave of the third lineage.
The chat pilot (M2) and every streaming provider are blocked on exactly this
shape: `port.call` is single request → single response, and there is no way
to express partial results through the Port Protocol at all.

## Options

| Criterion | (a) Re-land the additive shape (recommended) | (b) Poll-based chunk reads over `port.call` | (c) Full-duplex protocol rewrite |
|---|---|---|---|
| Protocol risk | Additive — non-streaming callers observe nothing (D-322 precedent); terminating `PortResult` stays the single authoritative outcome | No protocol change, but N round trips per message and a permanent latency tax | Every existing caller re-proves; violates the boredom budget |
| Host budget (G11 wall, 984/1000 at wave open) | +5 net host LOC (chunk relay + one call shape) — the D-329 interface/hook split holds the wall | Zero host change, permanent tax | Unbounded |
| Falsifier first | `echo.stream@1` proves ordered delivery on a real boot before any provider touches the primitive | Same test, worse numbers | No small falsifier exists |
| Re-land fidelity | Mirrors the lost first-lineage design (worklog 7-b) adapted to the D-351 parity net (new READ ops are outside its domain) and the D-332 call-site net (every new export carries real call sites) | Diverges from the ratified record | Diverges further |

## Decision

**Decision:** (a) Re-land the additive streaming shape exactly as D-339
ratified it — a second call shape delivering ordered chunks, designed so
non-streaming callers observe nothing, falsifier-first:

1. **Contracts** (`contracts/src/port.ts`): `StreamChunk {streamId, seq, data,
   final}` — seq 1-based contiguous, the vault's rev discipline; `StreamEmit`;
   `STREAM_SEQ_START`; and `checkStreamSeq` (pure, TOTAL) so both the producer
   and the consumer check the same rule.
2. **Host** (`host/src/ports.ts`, +5 net LOC): chunk relay in the pending
   table — forward to the call's sink, or drop when absent (cold fallback);
   `callAsRootStream(op, payload, onChunk, deadlineMs)` returns
   `{streamId, result}` and is the ONLY host surface added (D-329 placement
   law). The stream id IS the delivering call's causation id — one stream per
   call, by construction.
3. **Shim** (`shim/src/index.ts`): per-delivery `meta.emit` — strict seq,
   close-once; emitting after `final` throws, and the handler-promise catch
   converts that into a DEGRADED return (fail-closed producer side: an
   out-of-discipline stream never masquerades as a good result).
4. **SDK** (`sdk/src/stream.ts`): `streamRootCall` — ordered queue +
   sequence-checked `AsyncGenerator` ending at the `final` chunk or at call
   settlement, drain-then-stop on failing results; `StreamRouter` is
   satisfied by both the real router and the testkit FakeHost.
5. **Testkit** (`testkit/src/fake-host.ts`): differential mirror —
   `CallOptions.onChunk`, causationId pre-mint, same emit discipline, same
   relay-or-drop cold fallback.
6. **Falsifier**: `echo.stream@1` (CONTRACT/READ, no provider involved) on
   plugin-echo 0.2.0, granted uniformly in demo/law/run/spine; the falsifier
   suite boots the real demo composition and proves: ordered end-to-end, cold
   fallback, empty stream, BUDGET mid-stream (ordered prefix survives, tail
   dropped), DEGRADED on violateAfterFinal, interleaved independent streams.

## Consequences

- The port protocol has its second call shape; M0's parser pins already emit
  M1-shaped envelopes (`compileSendReplay`), so the browser wave consumes this
  primitive as-is, and M2's `Message` record gets its `streamRef` target
  (ordered chunk refs → assembled content) without a new store.
- Cold fallback is structural, not a mode: a caller that never asks to stream
  observes nothing — the terminating result remains the single authoritative
  outcome, and chunks are advisory prefixes of it.
- `violateAfterFinal` stays in the shipped echo as a permanent falsifier hook:
  the DEGRADED register for producer-side violations is load-bearing evidence,
  not an error path to remove.
- The consumer generator throws on sequence violations (fail-closed) — a
  reordered or gapped stream is never silently accepted.
- M0/M7 re-land next per the begin order; XC-2's write side
  (`credential.put@1` re-land) follows the D-351 parity net from day one.

## Evidence

- Lost-lineage precedent: worklog turn-007 §7-b (the identical design, proven
  612 → 625 on base 4a108d7; destroyed with reset 2 — documented in
  RESET-NOTE.md and deliverables/INDEX-HEADER.md).
- `docs/decisions/D-339-streaming-primitive.md` — the ratified scope this
  record lands ("Scope ratified; `echo.stream@1` falsifier still pending").
- M-Pilot Part 1 §M1 (`upload/M-PILOT-MISSING-CORE.md` lines 43–66) — the
  shape list this re-land implements one-for-one.
- Falsifier: `sdk/test/stream-boot.test.ts` (6 tests, real boot of
  compositions/demo.json) + `sdk/test/stream.test.ts` (7 unit tests) +
  `testkit/test/fake-host.test.ts` D-352 mirror (3 tests). Full
  `bun run omega:gate` GREEN on this wave (651/651, host 989/1000).
- Ratification: owner directive 2026-09-15 ("Setup here the DevOps hub and
  continue developing" — the map's begin order names M1+M3 from D-352); landed
  PROPOSED in 1d966dc; full `bun run omega:gate` GREEN on 1d966dc
  (651/651, host 997/1000, all stages) — ratified on that evidence.
