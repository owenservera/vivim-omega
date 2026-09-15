# D-357 — M0 re-land: the BROWSER_MEDIATED realization (D-338 engineering)

## Status

RATIFIED

## Context

D-338 ratified the browser realization's scope and authority bar — and its
record states the implementation falsifier was "still pending (M0
engineering)". That engineering was landed once (first lineage, turn-008,
D-349) and destroyed with the second sandbox reset. The capability map's
begin order (the M0 browser wave, from D-354) makes this the wave's
capstone: M7's governance (D-355), M13's tier (D-354), and XC-2's spine
(D-356) all exist precisely so this record's four fail-closed bars can be
real code instead of aspiration. The first lineage's falsifier also caught a
pre-existing upstream bug at exactly this seam (the G0 evidence gap) — the
falsifier-first discipline is the point, and this re-land runs it again.

## Options

| Criterion | (a) provider-browser through the standard lifecycle, four fail-closed bars (recommended) | (b) Wrap legacy ChromeGovernor as-is | (c) Defer browser; API-native only |
|---|---|---|---|
| Authority | Day-one forbidden entries through `law.forbidden.set@1`; sends gated by `law.check@1` (pack-declared EXTERNAL_MUTATION) | 30 KB of pre-omega control logic trusted on arrival | No browser risk, but the flagship product surface never falsifies |
| Realization | PROMOTED only through discovery.verify@1 — never self-declared; D-355 pins give parser drift a name | No lifecycle | n/a |
| Falsifier | One real message from a fixture-recorded session, on one real boot of a shipped composition — the D-338 ship-blocker, satisfied | Same falsifier, unearned trust | None possible |

## Decision

**Decision:** (a) Land `plugins/provider-browser` (0.1.0) — the fixture
realization (in-sandbox the session is a RECORDED capture; the CDP leg is
owner-machine-only future work and never silently simulated):

1. **Sessions by reference.** `browser.attach@1` redacts the capture FIRST
   (M12/D-356: `credential.redact@1` before any vault call; the integrity
   hash is computed over the already-redacted bytes — the only bytes that
   exist), appends the capture row (ns `providers`, `capture:<uuid>`), then
   the session row (`session:<uuid>`) citing it BY REFERENCE — the session
   never embeds capture bytes. `browser.release@1` appends the RELEASED
   revision; a released session fails bar 2 forever after.
2. **Four fail-closed bars on every send** (`message.send@1`, in order):
   (1) the day-one fence holds — forbidden entries for the pilot principal
   (`credential.use@1`, `browser.navigate@1`, `browser.eval@1`) registered
   through `law.forbidden.set@1`; sends fail closed while registration has
   not succeeded; (2) the session is ATTACHED, provider browser, archetype
   message.send; (3) the realization is PROMOTED through discovery.verify@1
   and BROWSER_MEDIATED — never self-declared; (4) a verified pin covers the
   parser version (D-355's `pinMatches` over BOTH the session's and the
   manifest's parser version).
3. **The replay rides D-352.** The pinned parser's rows assemble into M1
   `StreamChunk` envelopes (`buildChunkEnvelope`: streamId = causation id,
   seq 1-based contiguous, exactly one final) and emit through `meta.emit` —
   the shim's sequence discipline and cold fallback apply unchanged.
4. **The message lands pack-schema-exact.** ns `email`, meta.type message,
   flags materialized in state sent (draft: false), provenance meta + refs
   (session + capture) — the browser writes exactly the row the email
   ontology declares, nothing beside it.
5. **`compositions/browser.json` (shipped):** vault-durable law (D-325
   shape — the fence persists), vault, pack.domain-email, the perceive→
   infer→map→verify pipeline, vivim.credentials, provider.browser.
6. **The G0 seam fix (the falsifier caught it again).** Perception emitted
   evidence refs as casRef-only `{ref, span}`; inference's fail-closed
   `normalizeEvidence` requires `{ns, id, rev}` — the perceive→infer seam
   produced ZERO evidenced candidates end-to-end (never exercised upstream;
   the first lineage's falsifier caught the same bug). Fixed root-cause:
   perception + observation evidence refs now carry the `{ns, id, rev}`
   triple with the casRef DERIVED (the contract of record — the
   `discovery.evidence-ref@1` SCHEMA — updated in the same commit), all
   discovery suites re-proven.

## Consequences

- The M0 row's falsifier is satisfied: the D-338 ship-blocker test is green
  on a real boot — one real message through a BROWSER_MEDIATED realization
  from a fixture-recorded session, gated exactly like every other op.
- Gate-vs-bars ordering is now explicit and tested: the law gate fires
  BEFORE the handler bars (dispatch law.checks before delivery), and the
  bars fire BEFORE any replay or vault write.
- The browser never requests `port:credential.use@1`; the fence denies it
  to the pilot principal on day one and the plugin holds no such capability.
- Parser drift (a provider DOM change) now surfaces as a pin mismatch —
  REFUSED at bar 4 — never as a silent runtime failure.

## Evidence

- D-338 (the ratified scope + bar this record implements), D-354/D-355/D-356
  (the wave records the bars build on), M-PILOT-MISSING-CORE-PART2 §M0/M7 +
  360-REVIEW-ADDENDUM A1 (the fate split that put the spine in this wave).
- Landed in this wave: `plugins/provider-browser/test/browser-falsifier.test.ts`
  (10 tests on one real boot), `test/parsers.test.ts` (11 unit),
  `test/m13-containment.test.ts` (3, the D-354 falsifier), the G0 fix re-proven
  across all discovery suites (123 tests), gate GREEN on the wave tree.
- Ratification: owner directive 2026-09-15 ("Continue working on the items
  in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
- - Gate evidence: full `bun run omega:gate` GREEN on the wave tree (1dc96ee): 691/691 tests, host 997/1000, host-loc/fresh-tree/decisions/compositions/attest all pass; attest commit 6e15aa7.
- Ratification: owner directive 2026-09-15 ("Continue working on the items in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
