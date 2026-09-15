# D-354 — M13: the isolation tier for M7 parser execution

## Status

RATIFIED

## Context

M7 re-lands parser code this wave (D-355) — and the capability map's M13
trigger demands the isolation ruling land BEFORE any parser code does. The
question (M-PILOT-MISSING-CORE-PART4 §M13, recovered turn 11): parsers are
derived logic — potentially per-provider, potentially learned/generated —
less trusted than a vetted plugin but more constrained than arbitrary
agent-authored code. Two candidate tiers:

1. **WASM-grade isolation** — the quarantined reference repo has
   `plugin-kernel/sandbox/runner.ts` (QuickJS/WASM, host-function
   allow-list, step/memory budget). Importing it gives parser execution a
   second isolation technology alongside B2.
2. **The existing plugin compartment** (B2, worker_threads) — no new
   isolation technology; the signature on the parser becomes the boundary,
   which makes the parser-signing key plugin-publisher-grade power.

Neither is free, and the fork must be settled as a D-record, not a default.

## Options

| Criterion | (a) Plugin compartment + governed-parser discipline (recommended) | (b) Port the reference's QuickJS runner now | (c) Defer parsers until WASM exists |
|---|---|---|---|
| New isolation tech | None — B2 unchanged | A second runtime, second budget model, second escape surface to audit | Blocks the whole M0 browser wave |
| Honest boundary (D-321) | Same tier as every plugin; memory pressure is a documented exposure, not a claimed boundary | resourceLimits are NOT enforced even at worker tier (D-321, verified) — WASM-in-worker still needs brand-new budget machinery before the boundary it advertises is real | n/a |
| Trust category | Parser = plugin-grade BY CONSTRUCTION of M7: a signed, version-pinned manifest contribution derived from discovery evidence (never `logic_code` at runtime). The parser-signing key IS plugin-publisher-grade power — stated here out loud | Implies parsers are untrusted code — contradicting M7's own governance (signed contributions with an evidence trail) | n/a |
| Boredom budget | One pure-function registry + the existing compartment | A port + budget machinery + a second audit surface | Indefinite deferral of the pilot |
| Falsifier | Provable today: zero-capability transforms (nothing to allow-list because there is nothing granted), deadline BUDGET containment, attributable DEGRADED on throw | Budget machinery not built — the falsifier would test scaffolding | No falsifier |

## Decision

**Decision:** (a) Parser execution runs inside the existing B2 plugin
compartment under the governed-parser discipline. Concretely:

1. **Trust category, stated out loud:** parsers occupy the PLUGIN trust
   category. M7's governance (signed manifest contribution, version pin on
   the realization, discovery-derived with an evidence trail) is what buys
   this — the parser-signing key is equivalent in power to a plugin
   publisher key, and this record says so. If parser derivation is ever
   automated to the point where nobody vets the transform, that automation
   inherits exactly this authority and must revisit this record.
2. **The allow-list is zero capabilities.** Parser transforms are pure
   functions over their captured input: no capability tokens, no port
   handles, no host calls. There is nothing to allow-list because nothing
   is granted. Authority enters omega only through the owning plugin's
   law-checked ops — isolation tech never changes what the output carries.
3. **Outputs enter as M1 envelopes only.** A parser's entire output channel
   is an ordered `ParsedChunk[]` assembled (mechanically, registry-side)
   into `StreamChunk {streamId, seq, data, final}` envelopes and delivered
   through `meta.emit` — the same shim sequence discipline and the same
   law-checked routing as every other op (B2 boundary discipline preserved
   verbatim; D-352's emit-after-final → DEGRADED applies to parser output
   like any stream).
4. **Containment that is real today:** a stalling parser is contained by
   the call deadline (host resolves BUDGET for the caller, attributable to
   the op); a throwing parser surfaces as an attributable DEGRADED. Both
   are falsified in this wave (M13 containment suite on a real boot).
   Memory-bomb containment is NOT claimed: D-321 documents that worker
   memory budgets are unenforced (verified Bun behavior) — that exposure
   is shared with every plugin and is cited here as the honest boundary
   until the D-321 watchdog lands.
5. **Reserved, not abandoned:** the WASM tier and the M17 taxonomy
   extension (iframe/postMessage for agent-authored UI) belong to the
   eventual isolation-taxonomy ruling (map item 4). This record settles
   only M7's tier; nothing here pre-empts that ruling.

## Consequences

- M7 parser code (D-355) may now land, with the containment suite as part
  of its falsifier discipline.
- The parser-signing key is plugin-publisher-grade power — any future
  "auto-generated parser" pipeline must treat its output as publisher-
  authority code and route through re-review.
- The M13 containment suite is the standing proof: throw → attributable
  DEGRADED, stall → BUDGET at deadline. A future runtime change that breaks
  either breaks this record and must re-open it.
- WASM remains available for the taxonomy ruling with the reference's
  runner as prior art — imported, if ever, through its own D-record.

## Evidence

- M-PILOT-MISSING-CORE-PART4 §M13 (the fork named; decision-first, code-second).
- D-321 (resourceLimits honesty gap — the verified 217MB-in-32MB worker probe).
- D-339/D-352 (the stream envelope + emit discipline parser output rides).
- Landed in this wave: `plugins/provider-browser/test/m13-containment.test.ts`
  (throw → DEGRADED attributable; stall → BUDGET at deadline, caller freed)
  — green on the ratified tree.
- Ratification: owner directive 2026-09-15 ("Continue working on the items
  in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
- - Gate evidence: full `bun run omega:gate` GREEN on the wave tree (1dc96ee): 691/691 tests, host 997/1000, host-loc/fresh-tree/decisions/compositions/attest all pass; attest commit 6e15aa7.
- Ratification: owner directive 2026-09-15 ("Continue working on the items in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
