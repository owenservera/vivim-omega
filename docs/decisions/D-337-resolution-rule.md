# D-337 — M4: deterministic-first resolution, ambiguous-only PROBABILISTIC fallback

## Status

RATIFIED

## Context

Legacy maps NL→capability with confidence scores, almost certainly LLM- or
embedding-driven. D-216 says NLCL stays deterministic and the LLM never sits
in the parse path. Same problem, opposite philosophies — and resolution is
the first thing a pilot user does, so the collision needs a ruling before
the pilot, not during it.

## Options

| Criterion | (a) Deterministic-first; genuinely ambiguous NL falls back to PROBABILISTIC via `resolve.classify@1` (recommended) | (b) LLM-first resolution | (c) Deterministic-only (refuse ambiguity) |
|---|---|---|---|
| D-216 | Holds absolutely (LLM never the sole path) | Reopens D-216 | Holds, plus refuses real user input |
| Machinery | Exists today (D-323 kinds + PROBABILISTIC branch) | New prompt/embedding path to gate | Exists, with a refusal cliff |
| Legacy fit | Deterministic resolvers port as evidence; `llm-slave`/semantic stay in the fallback branch | Ports the legacy philosophy whole, bypassing the law story | Discards the confidence signal entirely |

## Decision

**Decision:** (a) Deterministic-first, ambiguous-only PROBABILISTIC fallback — exact syntax and known capability names resolve deterministically; only genuinely ambiguous NL routes through the existing PROBABILISTIC branch, which may consult a provider realization with confidence attached and never silently.

## Consequences

- Reuses D-323 (`resolve.classify@1` kinds DETERMINISTIC/PROBABILISTIC/HUMAN) — no parallel resolution logic is built.
- Legacy deterministic resolvers (classifier/intent/fuzzy/tfidf per M-TRIAGE-01 T-09) are the evidence corpus for the deterministic half; `llm-slave-resolver` semantics live only in the fallback branch.
- Confidence stays a ranking signal under the D-303 precedent (never a promotion gate).
- The pilot exercises both paths: exact commands deterministically, one ambiguous utterance through fallback, both ledgered.

## Evidence

- D-216 (determinism law) + D-323 (`resolve.classify@1` + PROBABILISTIC branch, tested) + D-303 (confidence ranks, proof gates).
- `Migration/M-TRIAGE-01.md` T-09/T-10 (resolver split + capability taxonomy input).
- Ratification: owner directive 2026-09-13 (proceed on the record's recommendation); landed PROPOSED in c09c140; full `bun run omega:gate` GREEN on c09c140 (612/612, host 984/1000) — ratified on that evidence.
