# D-406 — Omega Forge Wave 0 landing: pack.builder, forge.author self-hosting, forge-surface, the wire (D3+D4+D5+D6)

## Status

RATIFIED

## Context

Wave 0's charter: the Author Forge can emit itself. The construction packet demands a frozen forge.* op wire declared as data (a pack, not code), a self-hosting plugin that reproduces `plugins/forge-author/` byte-identically outside explicit authored regions on a REAL boot, a mechanical gate over the whole Forge boundary, a synthetic second mine so the APIs cannot harden Vivim-shaped, and zero host lines (host was 1500/1500, zero slack, at wave start). Three claims had to be true at once: emission confers no authority; every refusal is named; nothing about the boot changes.

## Options

| Criterion | (a) Land the full D0–D6 stack as specified (recommended) | (b) Land pack.builder + gate only, defer self-hosting | (c) Prototype in tooling, no plugin |
|---|---|---|---|
| The keystone proof | Real boot self-hosting falsifier | Deferred to Wave 1 | No plugin, no boot, no proof |
| Wire freeze | Declared + gate-enforced from day one | Same | Convention only |
| Risk | One wave, many files | Lower surface, wave split | Nothing lands |

## Decision

**Decision:** (a) — the full Wave 0 stack, one wave: pack.builder, forge.author with the self-hosting falsifier, the forge-surface gate, the synthetic mine skeleton, LAW_POLICY_V1 1.5.0 row, and the composition `forge-author.json` via the D-377 matrix path.

## Consequences

- **pack.builder** (`packs/builder/`): the seven zod artifact schemas (capture-receipt … generality-stamp), FORGE_OP_CATALOG (24 ops → risk, the frozen wire), FORGE_PLUGIN_IDS, assayBoundaryIssues/shapeBlueprintIssues/validateArtifact; `builder.policy@1` (ten policy rows); 24 forge.* contract contributions in plugin.json (catalog risk declared per op — pack.builder spans classes BY DESIGN because a pack declares the wire while plugins implement partitions; FORGE_CLASS_SPAN exempts packs, one class per PLUGIN stands); generality: speculative.
- **forge.author** (`plugins/forge-author/`): `forge.author.init@1` MUTATION; caps `port:vault.append@1/get@1/law.check@1` (each with a real call-site: append+read-back ledger, the law self-check); granularity coarse, seams spec/scaffold/self-host; generality speculative. The spec travels as PAYLOAD (pure function); the validation chain refuses in order — unknown fields, four forbidden requests (output scope / signing / grants / product membership, each its own named rule), plugin-id mismatch, unpinned command list, malformed structure, path escape, spec-hash mismatch, content-pin mismatch, existing target, law refusal — and only then writes: files to scratch, one `ProposalArtifact` (authority: "none", schema-pinned) row per file to ns `proposal`, read back byte-identical or SPEC_LEDGER_REFUSED. Refusals are refusal-as-data (D-379 pattern): ok:true carrying {refused, error: REFUSED, rule, detail}.
- **Self-hosting layout**: 4 generated files (plugin.json, package.json, README.md, src/index.ts — the GENERATED header pins the spec's inputHash; src/index.ts also carries one AUTHORED region) + 4 authored files with recorded justification (spec/self.json — a recorder cannot emit its own recording; compare.ts + the two test files — a falsifier emitted by the defendant is not a falsifier). The input hash covers the spec BODY (files project to {path, template} only): contentHash is a function of the inputHash (it lives in the rendered GENERATED header), so covering it would be circular; content-pin tampering is caught one step later by render-verify. The {{SPEC_HASH}} token is built by concatenation in source so a generated file survives its own rendering rule.
- **forge-surface gate** (`tooling/gates/forge-surface.ts`, stage 5d): FORGE_IN_PRODUCT (forge.* routes in builder compositions only — `forge-*.json` family), FORGE_CLASS_SPAN (one risk class per forge PLUGIN, READ included), FORGE_EMIT_SCOPE (catalog risk match + justification declares proposal-only + src ns literals all "proposal"), FORGE_NO_REFUSAL_TEST (every declared op named in test/refusal/*.test.ts), FORGE_CONTRACT_DRIFT (manifest ↔ FORGE_OP_CATALOG exact + pack fixtures validate/refuse correctly), GEN_LEVEL_MISSING (hard for forge.*/pack.builder). 14 red/green falsifiers in tooling/gates/test/forge-surface.test.ts.
- **LAW_POLICY_V1 1.5.0**: exact row `forge.author.init@1` → MUTATION (vault-internal proposal emission, class family of vault.*; catalog-parity, never default-riding) — the D-351 parity net holds the manifest gate-trigger and the policy gate-truth to one answer, proven by the new composition.
- **compositions/forge-author.json**: 18th spec, matrix-authored (vivim.law law.json-shape, vivim.vault standard grant, forge.author with scratchDir passthrough `${TMP}/omega-forge-author/emission`); ns `proposal` row lands in docs/VAULT-NAMESPACES.md same-commit.
- **fixtures/mines/synthetic-v0/**: 42-file offline Python kitchen log (append-only JSONL + derived indexes, workflows as data, stdlib only) — un-Vivim-shaped by charter, hash-pinned by its own MANIFEST.json (rootHash), its 10-test suite green. Wave 1 task recorded (BACKLOG): run forge.mine.capture@1 against it.
- **sdk**: granularity/internalSeams mirror fields (+2 LOC inside the D-404 allowance) — forge.author is the first shipped manifest to carry them; host untouched (1500/1500 flat, verified by every gate run).
- Deferred with named reasons (BACKLOG.md): forge.mine.capture's partition split from its READ siblings (Wave 1, with the mine itself); wave/caller tracking for GEN_SPECULATIVE_STALE; the other seven forge plugins (wire declared, unimplemented by design).

## Evidence

- `bun test plugins/forge-author/` — 31/31: real-boot self-hosting (run 1 reproduces the checked-in tree outside authored regions, rules 1–6 green), run 2 byte-identical (outputHash pin), commandList pins the real boot's input+output hashes, generated manifest passes sdk validateManifest, authority:'none' rows read back from ns proposal, scratch-outside-vault/buildDir, five hand-edit red cases with named diffs (SPEC_BYTE_DRIFT with first-diff offset, AUTHORED-region immunity, forged-header SPEC_HASH_MISMATCH, SPEC_UNDECLARED_FILE, SPEC_FILE_MISSING, EMIT_FILE_MISSING), op-level tamper refusals leaving zero bytes, config.scratchDir honored.
- `bun test plugins/forge-author/test/refusal/init-refusals.test.ts` — the eight packet refusals (SPEC_UNKNOWN_FIELD, SPEC_OUTPUT_SCOPE, SPEC_SIGNING_FORBIDDEN, SPEC_CAPABILITY_GRANT_FORBIDDEN, SPEC_COMPOSITION_MEMBERSHIP_FORBIDDEN, SPEC_PLUGIN_ID_MISMATCH, SPEC_COMMAND_LIST_UNPINNED, SPEC_TARGET_EXISTS) + SPEC_MALFORMED_INPUT, SPEC_PATH_ESCAPE, SPEC_SPEC_HASH_MISMATCH, SPEC_CONTENT_PIN_MISMATCH, SPEC_LAW_REFUSED (forbidden-overlay proof that "every write is law-gated" is data, not promise) — each NAMED, each leaving zero bytes.
- `bun test packs/builder/test/schema.test.ts` — 24/24; `bun test tooling/gates/test/forge-surface.test.ts` — 14/14; `bun test plugins/vivim-law/` — 51/51 (parity net green through the 18th composition); `bun run omega:quick` — all stages green including forge-surface.
- Two consecutive full gates green at ratification (numbers in the ratify row).

- Ratified: landed in `0763556`; two consecutive full gates green (1056/0 ×2, attest green, forge-surface green: 1 forge plugin / 18 compositions / 24 catalog ops / 14 pack fixtures; host flat 1500/1500 all wave). Wave 0 evidence: `docs/forge/wave0-evidence.md` (green 10, red 11, hand-fix tally: zero hand-edits to generated bytes).
