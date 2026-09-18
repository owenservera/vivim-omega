# D-376 — W0-2 conformance net: risk parity + matrix conformance in the compositions stage

## Status

RATIFIED

## Context

W0-2 (WAVE0-NEEDS-FROM-CODE) asked for one read-only gate stage tying the three
partial nets together before Wave1 touches compositions. The `compositions`
stage already carried grant-vs-manifest, the bootPhase-0 law invariant, the
D-325 vault pairing, cross-composition drift (allowlisted loudly), and the
D-332 zero-call-site check. Two gaps remained: manifest-declared risk vs
LAW_POLICY classification parity existed ONLY as a test file
(`plugins/vivim-law/test/policy-parity.test.ts`) — a deleted or skipped test
file would silently retire the net — and nothing caught a hand-edited
composition spec once the generator (D-377) makes `_matrix.json` the source of
truth. The owner directive for the W0 close-out delegated ratification.

## Options

| Criterion | (a) Fold both checks into the `compositions` stage (this row) | (b) New dedicated gate stage | (c) Keep parity test-only + matrix check in CI only |
|---|---|---|---|
| Blast radius | Zero (stage already runs in quick + gate) | One more stage to explain/maintain | None |
| Drift caught at | Every quick run (seconds) | Every quick run | Full CI only |
| Honesty | Same checker for test + gate, one diagnostic format | Two surfaces, two formats | Test file rot is exactly the failure mode W0-2 names |

## Decision

**Decision:** (a) Fold both checks into the `compositions` stage — check 6
(D-351 risk parity at the gate layer): every ROUTED op whose manifest declares
non-READ risk must classify identically in `LAW_POLICY_V1` (imported through
the `@vivim/plugin-vivim-law` workspace dep; policy.ts is import-safe — no
shim, no boot); check 7 (matrix conformance): every shipped spec must
regenerate byte-identical from `compositions/_matrix.json` via the D-377
emitter, with the first differing line named in the diagnostic; `_`-prefixed
files are skipped as non-specs. The seeded-drift falsifier
(`tooling/gates/conformance-drift-seed.ts`, copied to `40-EVIDENCE/W0/`) proves
the net GREEN on the real tree and RED with named diagnostics on a seeded lost
grant (chat.json loses `resolve.classify@1`) and a seeded undeclared risk
(`law.check@1` flips to MUTATION with no policy row).

## Consequences

- The D-351 parity test file stays (regression pin at test level); the gate
  stage becomes the mechanically enforced copy — belt and braces, one truth.
- A hand-edited spec now fails `omega:quick` in seconds with the file, the
  first diff line, and the fix command in the diagnostic.
- Temp scaffolds (unit tests) without a matrix record
  `matrixConformance: "absent (scaffold)"` — loud, never silent.

## Evidence

- Falsifier: `bun run tooling/gates/conformance-drift-seed.ts` — scenario 0
  baseline GREEN (16 specs, 66 entries, 42 parity ops, matrix green);
  scenario 1 names `port:resolve.classify@1 … no routed implementation`;
  scenario 2 names `law.check@1 manifest declares MUTATION but LAW_POLICY_V1
  classifies EXTERNAL_MUTATION`. Unit-pinned in `tooling/gates/test/compositions.test.ts`
  and `tooling/gates/test/generate.test.ts`. Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
