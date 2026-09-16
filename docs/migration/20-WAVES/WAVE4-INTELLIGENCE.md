# W4 — Intelligence Stratum (NLCL, capabilities, director)

**Objective:** legacy intelligence as data + deterministic engines, never as a parallel resolver.
**Consumes:** T-09 (30 NLCL resolvers, split), T-10 (capability bootstrap seed), GAP-S3, GAP-1 seed.
**Touches:** `plugins/vivim-nlcl` (+ pure package), `plugins/vivim-director` (rules/teachings/tick), `plugins/vivim-agent` (taxonomy rows), `discovery-mind` + `agent` + `chat` compositions.

## Tasks

1. T-09 split: deterministic resolvers (classifier/intent/fuzzy/tfidf/layered, minus LLM tails) → rules + lexicon data (ns `nlcl` + `automation`); `llm-slave` + `semantic` → PROBABILISTIC tail via shared `resolve.classify@1` only. Router-as-a-unit is NOT ported.
2. T-10 seed: default capabilities + taxonomy/binding/intent/program shapes as agent/behavior rows (lineage refs must resolve at write).
3. Director proof: migrated intents fire data-only rules through the tick (refused = ledgered, zero-rules = retried, disabled = suppression — tick-step-7 discipline; director+web suites on any tick touch).
4. Calibration corpus GAP-1 seeded (promotion thresholds become measured constants or stay visibly unmeasured — no silent constants).
5. `chat.resolve@1` deterministic-half coverage extended to migrated intent shapes; ambiguous half stays the director's row (D-359 — no parallel logic).

## Falsifier

Deterministic intents resolve with zero provider consult (ledgered DETERMINISTIC); ambiguous intents consult PROBABILISTIC with confidence, never silently; scorecard arithmetic exact over seeded decisions; tick ledger branches pinned.

## Non-goals

No acting loop beyond B1a. No auto-routing. No CONTRADICTED status. No corpus/ontology layer beyond seeded calibration.
