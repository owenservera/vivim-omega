# W1 — Harvest Infrastructure

**Objective:** the pipeline that harvests everything else. Parser landing zone live, fixture pipeline honest, triage automation mechanical, second-pack checklist enforced.
**Consumes:** T-04, T-05, T-06 (identified, not yet restructured), GAP-M5 checklist, GAP-S1.
**Touches:** `tooling/` (triage splitter, fixture importer), `plugins/provider-browser/src/parsers.ts` (governed pins, D-355), `discovery-mind.json` (verify placement per D-318 — no new composition), pack #2 scaffold.

## Tasks

1. Land T-04 (SSE framing) + T-05 (import fixtures) as **signed version-pinned parser data** (NOT routable ops). Each pin: `parserContributionId` + `pinMatches` + envelope test.
2. Identify T-06 (CDP mechanics) file-by-file against the frozen legacy tree; strip authority/DI coupling per `30-TRIAGE/HARVEST-PATTERN.md`; do NOT restructure the governor yet (that's T-08/W2).
3. Fixture pipeline: recorded sessions only (never live network); substitution-shape check against the W0 byte-identical definition.
4. Triage splitter tool: subsystem row → capability-boundary rows (one op = one surface); output is a ledger patch for `30-TRIAGE/TRIAGE-LEDGER.md`, never a verdict change without a reason a reviewer can check.
5. Pack #2 scaffold satisfying the W0 checklist (SCHEMA+CONTRACT+POLICY+TEST); retro-pass gap list on `domain-email` filed as pack debt.

## Falsifier

One legacy SSE stream + one import fixture parsed through governed pins on a real boot; `realizationRef`/`parserPins`/provenance surviving the vault round trip; `mind`-queryable.

## Non-goals

No provider beyond fixtures. No chat writes beyond probe rows. No governor restructure. No new composition.
