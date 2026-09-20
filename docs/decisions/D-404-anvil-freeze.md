# D-404 — The anvil freeze: sdk/src LOC wall + export surface (Omega Forge Wave 0, D1)

## Status

RATIFIED

## Context

The Omega Forge needs a pre-boot edge everything can be measured against: the code that runs BEFORE any plugin exists — manifest parsing, validation, signing, content hashing, the port client. That edge is `sdk/src` (the five frozen functions: parseManifest, validateManifest, signPluginDir, contentHashDir, createPortClient, plus their support surface). The Wave 0 packet calls it the anvil and demands it be frozen: what the Forge measures must not move while being measured. Baseline at Wave 0 start: 721 LOC. The generality axis (D-405) needed +133; the granularity/internalSeams manifest fields (needed by forge.author, the first shipped manifest to carry them) cost +2 more.

## Options

| Criterion | (a) Hard LOC budget + frozen export snapshot (recommended) | (b) Frozen exports only | (c) No freeze, convention only |
|---|---|---|---|
| Size creep | Caught at gate, named overage | Logic can bloat one function | Nothing caught |
| Surface creep | New/removed exports need a D-record | Caught | Convention ignored under pressure |
| Anvil honesty | Both walls, one record | Half a wall | None |

## Decision

**Decision:** (a) — the anvil gets the same two-wall treatment as the host: `ANVIL_BUDGET = 860` LOC (721 baseline + 135 Wave 0 allowance) and `ANVIL_EXPORT_SURFACE`, a 45-name export snapshot; both enforced at gate stage 1b (anvil-loc + anvil-surface), which also dynamic-imports the sdk to prove the anvil still loads every gate run.

## Consequences

- `tooling/gates/anvil.ts` exports `ANVIL_BUDGET`, `ANVIL_EXPORT_SURFACE` (45 names), `checkAnvilLoc`, `checkAnvilSurface`; the gate records loc/budget/exports in status.json.
- Current landing state: 856/860 (721 + 133 generality + 2 granularity mirror). Four lines of headroom; remove-to-add is the post-Wave-0 discipline.
- Adding or removing an sdk export fails the gate until `ANVIL_EXPORT_SURFACE` and a decision record change in the same commit — drift in both directions is a refusal.
- "The anvil is not a Forge": an anvil hygiene check forbids forge.* op handler wiring inside sdk/src — Forge logic lands in plugins/packs, never in the pre-boot edge.
- The two sdk additions Wave 0 did make (GENEROSITY/MINE/EVIDENCE_REF atoms, GeneralitySchema, validateGenerality; granularity/internalSeams mirror fields) are inside the allowance and are named here.

## Evidence

- `bun test tooling/gates/test/anvil.test.ts` — 9/9: budget derivable from the module, real tree under budget, one-line-over red, new-export red (named), removed-export red, hygiene green.
- `bun run tooling/gates/anvil.ts` → `{ok: true, loc: 856, budget: 860}`.
- Quick gate green with stage 1b present (`anvil-loc`, `anvil-surface` ✓ in every run).

- Ratified: landed in `0763556`; two consecutive full gates green (1056/0 ×2, anvil-loc 856/860 + anvil-surface 45 exports in every run).
