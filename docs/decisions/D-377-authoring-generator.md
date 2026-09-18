# D-377 — W0-1 authoring path: the matrix as source of truth + omega:generate

## Status

RATIFIED

## Context

W0-1 named plugin authoring as the highest-leverage Wave0 gap: every harvest
re-litigates placement by hand against a 16-spec freeze (D-370), and nothing
mechanically connects a new plugin to its composition grant, its LAW_POLICY
rows, or its vault ns row. The falsifier bar was fixed in the need text: the
generator reproduces `chat.json` + `browser.json` byte-identical modulo
signatures; a drifted hand-edit fails the gate; a fresh `plugin-echo`-class
plugin boots in a generated composition on first try. All of it is tooling
and composition-level — zero host LOC (B5 preserved at 999/1100).

## Options

| Criterion | (a) Matrix source-of-truth + canonical emitter + scaffolder (this row) | (b) Generator from per-plugin default grants | (c) Keep hand-edited specs, validate-only |
|---|---|---|---|
| Byte-identity falsifier | Exact: emit → compare, first-diff line named | Approximate (defaults + per-comp overrides re-derive the same drift zoo the D-351 allowlist fights) | Not provable |
| Drift detection | Mechanical (spec ↔ matrix byte-compare, gate + CLI) | Mechanical but two-level (plugin defaults × composition subsets) | None |
| Authoring cost | Edit matrix → one command | Edit plugin dir → one command | Manual |
| Concept count | One file, one formatter, one command | Two grammars (defaults + override rules) | Zero new |

## Decision

**Decision:** (a) Matrix source-of-truth + canonical emitter + scaffolder —
`compositions/_matrix.json` carries all 16 specs' notes + entries (bootstrapped
from the shipped specs, JSON-content-identical, formatting canonicalized once
through the new emitter); `tooling/generate/format.ts` is THE canonical JSON
formatter (house style: containers inline when they fit 120 cols, scalars
always inline, two-space indent; `render∘parse` idempotent);
`tooling/generate/generate.ts` (`omega:generate`) provides `composition
[--check]` (emit/compare all specs from the matrix — `--check` is the gate
mode, default writes), `plugin <name>` (manifest + package.json + pure core +
shim entry + test + the authoring checklist: ns row, LAW_POLICY rows for
MUTATION ops, matrix grant, bun install, real-boot proof), and `pack <domain>`
(the SCHEMA+CONTRACT+POLICY+TEST declaration skeleton). The D-370 freeze is
untouched: the falsifier's generated boot composition lives in gitignored
scratch, no 17th spec ships.

## Consequences

- Spec edits happen in the matrix, then `bun run omega:generate composition`;
  hand-editing a spec fails the compositions stage (D-376 check 7).
- The 16 shipped specs changed formatting only (JSON-content verified
  identical at bootstrap; `run.json` also gained canonical key order — its
  `_note` text preserved verbatim, including the pre-existing truncated
  sentence, which remains run.json's named convergence follow-up).
- Bun resolves workspace imports only from workspace members — the fresh-boot
  falsifier therefore mirrors the REAL workflow (scaffold into `plugins/`,
  `bun install`, boot, then clean-restore the tree in `afterAll`); scaffolds
  into non-member dirs (e.g. dev-vault scratch) would NOT resolve, which is
  a documented Bun behavior, not an Omega bug.

## Evidence

- Falsifier 1: `emitCompositions(compositions, {write:false})` — all 16 specs
  `identical` (unit-pinned in tooling/gates/test/generate.test.ts).
- Falsifier 2: drifted hand-edit → `status: "drift"` + firstDiffLine > 0
  (same file the gate's check 7 uses).
- Falsifier 3: scaffolded plugin `first-try` passes `validateManifest` clean
  AND boots first-try in a generated composition on a real host
  (`first-try.ping@1` → `{pong, who}`), tree restored exactly after
  (scaffold removed, `bun.lock` checked out, `bun install` resync).
  Landing: 193dc61 — gate GREEN (structural stages + full suite; the second run followed ratification per D-364 cooling-off for the evidence-class rows).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
