# W1 — Harvest infra: close-out evidence

Date: 2026-09-17 · Landing: see STATUS.md / the ratify commits

## What landed (W1 tasks 1–5)

| Task | Artifact | Evidence |
|---|---|---|
| 1 — T-04/T-05 parser landing | `plugins/provider-llm/src/parsers.ts` (SSE framing, 197 LOC), `plugins/vivim-chat/src/parsers.ts` (import family chatgpt/claude/gemini, 307 LOC), `parser` contributions in both signed manifests (D-355 governance data, NOT routable) | envelope + pin falsifiers green (see suite); registry resolve fail-closed |
| 2 — T-06 identification | `T-06-descriptor.json` + `T-06-ledger-patch.md` (this dir): 14 capability boundaries over 22 mine files, every file verified to exist at the pin `vivim-final-program@4a5eb84`, line counts recorded file-by-file | mechanical: `tooling/harvest/triage-split.ts` refuses double-claimed files; patch is PROPOSED, never applied without a reviewer reason |
| 3 — fixture pipeline | `tooling/harvest/fixture-import.ts` (`omega:fixtures:import` / `omega:fixtures:check`), `fixtures/{sse,import}/` recorded bytes, canonical `fixtures/harvest/MANIFEST.json` | `omega:fixtures:check` — 4 recorded rows verified (hash + shape + determinism); substitution-shape law enforced at import AND check |
| 4 — triage splitter | `tooling/harvest/triage-split.ts` (`omega:triage:split`) | descriptor validation fail-closed; output is a ledger PATCH, never a verdict change |
| 5 — pack #2 + retro-pass | `packs/domain-import/` (schema ×3 + contract history.import@1 READ + policy + test — W0 checklist clean pass), `packs/domain-email/DEBT.md` (7 debt rows, none blocking) | pack conformance tests green |

## The falsifier (wave spec: "One legacy SSE stream + one import fixture parsed
through governed pins on a real boot; realizationRef/parserPins/provenance
surviving the vault round trip; mind-queryable")

`plugins/vivim-chat/test/harvest.test.ts` — real boot of
`compositions/discovery-mind.json` (REAL vivim.law phase 0 + vault + the three
discovery engines + vivim.providers):

1. recorded SSE stream + chatgpt import fixture land as vault evidence rows
   (ns probe, recorded bytes, the vault is the ground);
2. `discovery.verify@1` PROMOTEs `realization:chat.complete:llm` and
   `realization:history.import:chatgpt` carrying the parser pins, each citing
   the promotion event;
3. fixtures parse through the GOVERNED pins (fail-closed resolution) and
   assemble into lawful M1 envelopes (exactly-one-final, contiguous seq);
4. the W1 harvest-evidence row lands with realizationRef + parserPins +
   provenance (mine pins + fixture sha256s) and survives `vault.roundtrip@1`
   via the REAL consent ceremony (refusal names the consent id →
   `law.consent.grant@1` → retry — the gate stays gated);
5. MIND-QUERYABLE: `providers.realization.get@1` serves the pin-carrying
   PROMOTED realizations from the running registry (D-382 spine query set
   item 2);
6. THE FENCE (D-385): an unpinned/unknown parser identity
   (`parser:history.import:generic@1`) refuses `discovery.verify@1` BEFORE any
   vault write — no promotion event, no realization row; the in-memory
   registry refuses the same identity (double fence).

## Composition change (D-385)

`discovery-mind.json` (via `_matrix.json`, D-377 byte-identity green) carries
`provider.llm` + `vivim.chat` as PARSER-contribution carriers: empty grants,
never spawned, manifests signed by the same compile ceremony. Grant drift vs
chat/console/llm.json is allowlisted with the D-385 pointer. The governed
parser-pin registry is POLICY DATA (`discovery.parser-registry@1`) — the
closed set of five shipped pins; missing/empty/duplicate/malformed registry
refuses the gate.

## Verification digest

- W1 falsifier: 9/9 (vivim-chat harvest) + tooling harvest 13 + pack 5 + the
  D-355 registry unit tests 3 — see the suite counts in STATUS.md.
- `omega:fixtures:check`: 4 recorded rows verified (hash + shape + determinism).
- `omega:quick` GREEN (host 1039/1100 — zero host diff across W1; B5 held).
- Full gate GREEN ×2 (PROPOSED landing + post-ratification) — counts in
  STATUS.md; surfaces green (bun/os/import).
- Mines stay pinned: `vivim-final-program@4a5eb84`,
  `vivim-final-enhanced@afebe00` (W0-9a).

## Explicitly deferred (named, not lost)

- `cdp-discovery.ts` (774L) + `cdp-capability-registrar.ts` (224L) → T-10
  scope (capability discovery), NOT T-06 mechanics.
- `browser-automation/{agentic-loop,harness-actions,selector-healer,
  semantic-grounding}.ts` → T-07/T-09 adjacent, excluded from the T-06
  descriptor deliberately.
- T-06 RESTRUCTURE (the mechanics landing in provider-browser) is W2 per the
  ledger ("W1 identify, W2 use"); W1 only pins the identification.
