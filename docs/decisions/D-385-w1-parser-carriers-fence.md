# D-385 — W1 discovery-mind parser carriers + the governed parser-pin fence

## Status

RATIFIED

## Context

W1 (harvest infra) lands the T-04/T-05 parsers as D-355 parser contributions
(`parser:chat.complete:llm@1`, `parser:history.import:{chatgpt|claude|gemini}@1`
— governance data, NOT routable) and its falsifier boots the real
`discovery-mind.json` composition. Two problems surfaced, both caught by the
repo's own gates:

1. **The falsifier's compile ceremony could not sign the parser manifests.**
   `discovery-mind.json` did not carry `provider.llm` / `vivim.chat`, so the
   booted composition had no signed manifest declaring the governed parsers
   (`host.manifests.get("provider.llm")` was absent). Adding the entries with
   their usual grants would have been wrong — the discovery mind never routes
   chat ops — so the entries carry deliberately EMPTY grants: the plugins
   participate in the ceremony (manifest signed, content-hash pinned) and are
   never spawned (D-331 dormant registration never activates them; parser
   contributions register no op). The compositions stage then (correctly)
   flagged cross-composition grant drift for both plugins — variance is
   watched, not free; the sanctioned escape is a `DRIFT_ALLOWLIST` row with a
   D-record pointer (this record).
2. **The genealogy fence was missing.** `discovery.verify@1` validated
   `provider.parserPins` structurally (D-355 `asParserPin`, dup-check,
   provider-id match) but accepted ANY well-formed pin — a caller could pin
   `parser:history.import:generic@1`, a parser identity with no signed
   contribution anywhere, and the gate would write PROMOTED realizations
   carrying the invented pin. Fail-closed genealogy requires the CLOSED set of
   governed parsers to be nameable by the gate itself.

## Options

| Criterion | (a) Carriers + allowlist + registry-as-data fence | (b) Converge grants (grant chat ops in discovery-mind) | (c) Hardcode governed pins in the engine |
|---|---|---|---|
| Correctness | Falsifier boots; fence refuses ungoverned pins BEFORE any vault write | Grants ops the composition must never route; contradicts D-355 "NOT routable" | Works, but governance data becomes a code constant — the promotion policy's own law forbids it |
| Process | Uses the sanctioned drift escape (allowlist + D-pointer) | No drift, wrong semantics | No drift, wrong layer |
| Evolution | New parser ships = parser contribution + registry row together, one reviewed change, content-hash pinned | Every new carrier re-argues grants | Engine edit per parser (code change to change governance) |

## Decision

**Decision:** (a) —

1. `discovery-mind.json` (via `_matrix.json`, regenerated, byte-identical
   check green) carries `provider.llm` + `vivim.chat` at bootPhase 1 with
   EMPTY grants — PARSER-contribution carriers only, never spawned.
2. `DRIFT_ALLOWLIST["provider.llm"]` / `["vivim.chat"]` rows in the
   compositions stage point at this record; any NEW shape of grant drift for
   these plugins still fails until allowlisted.
3. The governed parser set is POLICY DATA:
   `discovery.parser-registry@1` (POLICY contribution in the
   discovery-verification manifest) lists exactly the five shipped pins —
   `parser:message.send:browser@1`, `parser:chat.complete:llm@1`,
   `parser:history.import:{chatgpt|claude|gemini}@1`. Loaded fail-closed by
   `loadGovernedParserRegistry` (missing/empty/duplicate/malformed registry →
   the gate refuses to run pinned verifications at all).
4. The fence fires in `discovery.verify@1` BEFORE any vault write: a run
   carrying a pin outside the registry REFUSES with a named error naming the
   pin and the registry source — no promotion event, no realization row, no
   partial state. Absent provider/pins behave exactly as before (verify is
   unchanged for unpinned runs).
5. The W1 falsifier's swap-safety leg performs the real consent ceremony for
   the consent-gated `vault.roundtrip@1` (refusal names the consent id →
   `law.consent.grant@1` → retry) — the roundtrip op stays gated; the test
   documents the ceremony instead of bypassing it.

## Consequences

- Parser governance is a closed, reviewed set: a parser that is not signed
  manifest data cannot become the verified genealogy of a realization, and
  adding one requires shipping the contribution + the registry row in the
  same reviewed change (the manifests' content hashes move together).
- `discovery.verify@1`'s refusal happens pre-write, so the audit log never
  records a promotion that was refused for genealogy reasons (the refusal is
  the caller's error, attributable at the boundary).
- The composition matrix regenerates cleanly (D-377 byte-identity); the two
  carrier entries add zero runtime surface to the discovery mind (dormant,
  empty grants, never routed).
- T-06 identification (W1 task 2) is filed mechanically from the pinned mine:
  `40-EVIDENCE/W1/T-06-descriptor.json` + the PROPOSED ledger patch
  (`T-06-ledger-patch.md`) — 14 capability boundaries over 22 verified files
  at `vivim-final-program@4a5eb84`; verdicts change only by reviewer action.

## Evidence

- Landing: eb1c573 (PROPOSED: code + falsifiers + records; this record + the
  index row flipped in the ratify commit per the house shape). First gate run
  on the PROPOSED state: GREEN — structural stages + full suite 830/830 +
  attest (host-loc 1039/1100, zero host diff across W1).
- W1 falsifier green on the REAL discovery-mind boot
  (`plugins/vivim-chat/test/harvest.test.ts`, 9/9): recorded SSE + import
  fixtures as vault evidence; promotions carrying the pins; M1 envelopes
  lawful; harvest-evidence row surviving `vault.roundtrip@1` through the REAL
  consent ceremony (refusal → `law.consent.grant@1` → retry);
  `providers.realization.get@1` serves the pin-carrying PROMOTED rows
  (mind-queryable, D-382 item 2); the fence refuses
  `parser:history.import:generic@1` pre-write.
- Fixture pipeline: `omega:fixtures:check` — 4 recorded rows verified (hash +
  shape + determinism) against the canonical MANIFEST.
- D-355 registry unit tests (verify.test.ts): closed set = exactly the five
  shipped pins; wrong-version/unpinned/missing/empty/duplicate/malformed
  registry all refuse.
- Matrix byte-identity: `omega:generate composition --check` — 16/16 specs
  identical from `_matrix.json` (D-377); the compositions stage GREEN with the
  two allowlist rows (any NEW drift shape still fails).
- Second gate run post-flip: GREEN (recorded at ratification — see
  `build/gates.log` in the board/status refresh commit).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
