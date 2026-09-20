# Runbook — Composition Discipline

> **Updated 2026-09-20 (the doc-logic pass):** the W0-1 generator landed
> (D-377) — the parenthetical in the old title is retired. The freeze is the
> **18-spec matrix era** (D-370 → D-391/D-406): `_matrix.json` is the source
> of truth; new specs go through the matrix + `omega:generate composition`,
> never by hand (rule 6 below is the operating rule, no longer future
> tense).

1. 18 specs (D-391/D-406; was 16 under D-370), no new spec without deleting or generating one. New harvests extend an existing composition (default: `discovery-mind.json` per D-318) or go through the generator.
2. Grants are opt-in per composition. New op → grant it where it's exercised, same commit, or boot fails closed (correct direction — fix the grant, not the gate).
3. DataDir spelling `${TMP}/…` (portable); code uses `omegaTmp()`/`resolveDataDir`/`ownerOnly` from `@vivim/omega-platform` with the `workspace:*` dep edge.
4. Risk rows: every new MUTATION/EXTERNAL_MUTATION contract needs an exact LAW_POLICY_V1 row same-commit (D-351 parity net covers from first boot).
5. Namespaces: new ns → `VAULT-NAMESPACES.md` row same-commit (owner, shapes, writers, retention). Undocumented ns = uncompactable ns.
6. After the W0 generator lands: specs are emitted, never hand-edited; the conformance net (W0-1) is the arbiter; drift allowlist carries intentional scope differences with reasons.
