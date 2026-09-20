# pack.builder — the Builder Contract (Omega Forge Wave 0, D-406)

> **No SDK above Omega. Only Forges inside Omega.**

`pack.builder` is a PACK — a plugin whose manifest bundles the four pack
responsibilities as declarations. It is the contract every Forge implements:

| Responsibility | Where | What |
|---|---|---|
| **SCHEMA** | `plugin.json` schema contributions + `src/schemas.ts` (zod) | The seven Forge artifact shapes: capture receipt, inventory row, assay verdict, shape blueprint, proposal artifact, proof report, generality stamp |
| **CONTRACT** | `plugin.json` contract contributions + `src/schemas.ts::FORGE_OP_CATALOG` | The frozen `forge.*` op wire — 24 ops across 8 Forges, risk per op. Op names are frozen wire; renaming is amendment-class |
| **POLICY** | `plugin.json` policy contribution + `policy/builder-policy.md` | The ten Wave 0 policy rows: proposal-only emission, refusal-tested ops, one risk class per plugin, boot never reads ns proposal… |
| **TEST** | `test/` | Pack conformance: fixtures validate, the manifest catalog equals the code catalog, everything hash-pinned |

## The laws this pack encodes

1. **Emission is proposal-only.** Forge-generated artifacts do not sign, commit,
   grant, or boot. `proposal-artifact.authority` is the literal `"none"` — any
   other value fails schema validation, not review.
2. **A pack declares; a Forge implements.** Compositions grant `forge.*` ops to
   implementing plugins in `compositions/forge-*.json` (builder compositions),
   never to this pack.
3. **No `forge.*` op routes in a product composition.** The `forge-surface` gate
   stage enforces it (`FORGE_IN_PRODUCT`).
4. **One risk class per plugin.** Risk-class boundaries are compartment
   boundaries (`FORGE_CLASS_SPAN`). Note `forge.mine.capture@1` is
   `EXTERNAL_MUTATION` while its sibling mine ops are `READ` — when `forge.mine`
   lands, capture splits into its own compartment; the catalog declares the
   WIRE (risk per op), plugins declare the PARTITION.
5. **Every Forge op ships a refusal test** (`FORGE_NO_REFUSAL_TEST`) and every
   plugin and pack declares **generality** (`GEN_LEVEL_MISSING`, hard for
   `forge.*` and this pack).

## The eight Forges (the catalog's consumers)

| Forge plugin | Directory | Ops (risk) | Class |
|---|---|---|---|
| `forge.mine` | `plugins/forge-mine/` | capture (EXTERNAL_MUTATION) · verify/diff/list (READ) | 3 / 1 |
| `forge.survey` | `plugins/forge-survey/` | run · render (READ) | 1 |
| `forge.assay` | `plugins/forge-assay/` | run · distill (READ) | 1 |
| `forge.shape` | `plugins/forge-shape/` | map · budget · validate (READ) | 1 |
| `forge.emit` | `plugins/forge-emit/` | plugin · pack · composition · fixture · record (MUTATION) | 2 |
| `forge.proof` | `plugins/forge-proof/` | conform · replay · refusal · secondmine (READ) | 1 |
| `forge.author` | `plugins/forge-author/` | init (MUTATION) | 2 — the Wave 0 keystone |
| `forge.tier` | `plugins/forge-tier/` | stamp · promote · docs (MUTATION) | 4 (root-principal constraints) |

Wave 0 lands **only** `forge.author` (plus this pack). The rest of the catalog
is declared wire — the partition and landing order are recorded in
`docs/forge/wave0-evidence.md` and the master architecture document.

## References

- `docs/forge/OMEGA-FORGE-ARCHITECTURE.md` — the master design (governs on conflict)
- `docs/forge/OMEGA-FORGE-ARCHITECTURE_plus.md` — the Wave 0 construction packet
- `contract/forge-ops.md` — the human-readable frozen wire
- `policy/builder-policy.md` — the ten policy rows in prose
