# Harvest Pattern — how to strip legacy coupling (normative)

Every HARVEST row follows this pattern. If the harvested code still imports any item in the refuse list, it isn't harvested yet.

## The strip (algorithm out, transport off)

1. **Extract the pure function.** NLCL parse rule, SSE chunk framing, selector/endpoint data, resolution confidence rule, confirm-state machine — no imports from the refuse list.
2. **Re-express I/O as ports.** EventBus emit → `ctx.port.call`; ModuleRegistry lookup → recipe composition + `vivim.providers` read; Prisma read/write → vault ns append/get/query (same-commit ns row); direct FS → `platform/` helper.
3. **Govern the landing.** Parsers → D-355 pins (data, NOT routable, version-pinned, `pinMatches` test). Providers → realization rows (verify PROMOTEs, never self-admits). Secrets/keys → credentials spine (sim-synthetic REFERENCES, material refused). New ops → `Outcome<T>` + risk row + real-boot test + bench line, same commit.
4. **Prove provenance.** Every migrated row carries `realizationRef` (which realization produced it) and where applicable `streamRef`/`parserPins`/`evidenceRefs`. Round-trip test asserts survival through the vault.

## Refuse list (mechanical — grep before every harvest commit)

`EventBus` / `in-memory-bus` / `ModuleRegistry` / `plugin-router` (tar.gz lifecycle) / direct `prisma` client imports in engine code / `ProviderRegistry` singleton / relative imports across plugin dirs (B2 — vendor with provenance header instead) / `ctx.invoke` (only `ctx.port.call`/`port.stream`) / `Bun.*` outside the sqlite adapter / `/tmp/` literals + `process.platform` branches outside `platform/` / `host` imports from compartments.

## Shape guide (where each legacy shape lands)

| Legacy shape | Omega landing | Notes |
|---|---|---|
| Provider metadata/manifest/definition | ns `providers` realization rows + handler | Data-driven registration; recipe entry, not install |
| SSE/import parsing | D-355 parser pins | Fixture-recorded, never live network |
| CDP mechanics | `provider-browser` session/parsers (W1 identify → W2 restructure) | Authority wrapper replaced, mechanics kept |
| Stealth | Admitted files only (T-07 list) + forbidden entries same-commit | Bulk import refused |
| Governor loop | Restructured vs capability tokens (T-08) | Concept preserved, trust replaced |
| NLCL deterministic | Rules + lexicon (ns `automation` + `nlcl`) | LLM never in parse path |
| NLCL probabilistic tail | Shared `resolve.classify@1` only | No parallel resolver |
| Capability seed | Agent/behavior/decision rows (lineage must resolve) | B1a proves liveness |
| Conversations/messages/sessions | ns `chat` (`conv:*`/`msg:*` + index) + credentials rows | Attributed `user:<id>`, no sharing |
| Confirm/dialogue | Consent rows + director teachings | Stores become vault rows |
| Frontend/desktop | Pointer over HTTP (W5 default) | Rebuild only on proven mismatch |
| Observability/resilience/etc. | Mind spine + watchdog budgets + run ticks | Patterns, not code |
