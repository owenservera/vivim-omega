# D-405 — The generality axis: what an artifact has been PROVEN against (Omega Forge Wave 0, D2)

## Status

RATIFIED

## Context

The Forge will mint plugins from mines. Nothing in the current manifest vocabulary says what a plugin has actually been proven against: a plugin harvested from one mine, a plugin generic across two mines, and a speculative plugin written in the hope of future mines are epistemically different artifacts, and the difference is exactly what a promote decision needs to see. ProvenanceTier (lifecycle.ts) answers WHO VOUCHES; the missing axis answers WHAT IT HAS BEEN PROVEN AGAINST. The packet demands the axis be additive (existing manifests validate unchanged), that honesty validators — not schema — decide who must declare, and that the failure codes be named and machine-checkable.

## Options

| Criterion | (a) Manifest field + sdk validators with four named codes (recommended) | (b) zod-strict schema enforcement | (c) Out-of-band evidence file only |
|---|---|---|---|
| Additivity | Optional field, old manifests unchanged | New required shape breaks every manifest | No manifest signal |
| Honesty | Validators judge level discipline; patterns stay law (illegal fixtures must REACH the validator, not die at parse) | Parse rejects what law should judge | Nothing checks |
| Promote decisions | level + evidence refs ride the manifest | Same but brittle | Decisions grep a sidecar |

## Decision

**Decision:** (a) — `GeneralityStamp` in contracts (level: speculative/harvested/generic; mine, originPaths, harvestClass, evidence), `GeneralitySchema` + atoms (GENEROSITY_LEVELS, MINE_PATTERN, EVIDENCE_REF) in the sdk, and `validateGenerality()` with four named codes; zod carries the SHAPE, the validators carry the LAW.

## Consequences

- Failure codes: `GEN_LEVEL_MISSING` (hard for forge.*/pack.builder/new manifests — caller stance encoded as ctx.hard), `GEN_MINE_UNPINNED` (harvested without pinned `<repo>@<sha>`, empty originPaths, or invalid harvestClass), `GEN_UNPROVEN` (generic with <2 resolvable evidence refs or none independent of the declared mine), `GEN_SPECULATIVE_STALE` (report-only in Wave 0: live caller with no promotion evidence, or caller-less past the wave threshold — wave/caller tracking lands later).
- EVIDENCE_REF grammar: `ledger:` / `fixture:` / `mine:` / `composition:` / `decision:` refs — independence = a ref that is not the declared mine and not a fixture whose path carries that mine's repo name.
- HARVEST_CLASSES (8): ALGORITHM, SHAPED, SCHEMA, FIXTURE, POLICY, TEST, TOOLING, OTHER.
- The anvil carries the validators (inside D-404's allowance); the forge-surface gate runs GEN_LEVEL_MISSING hard for forge.*/pack.builder.
- Eight fixtures (two per level boundary + invalid shapes) under `sdk/test/fixtures/generality/`, hash-pinned by `pin.ts`; mirroring exports `GeneralityLevel`/`HarvestClass` are consumed by pack.builder's schemas (D-332 call-site law).

## Evidence

- `bun test sdk/test/generality.test.ts` — 15/15 green; sdk suite 68/68 no regression; anvil 856/860 after the +133.
- Forge-surface gate red fixture: forge.plugin without generality fails GEN_LEVEL_MISSING (tooling/gates/test/forge-surface.test.ts).
- Vivim legacy manifests (report-only stance, hard:false) list findings without failing — the phase-in policy is caller stance, not schema luck.

- Ratified: landed in `0763556`; two consecutive full gates green (1056/0 ×2; generality 15/15, sdk 68/68, anvil 856/860, forge-surface GEN_LEVEL_MISSING red/green in the same tree).
