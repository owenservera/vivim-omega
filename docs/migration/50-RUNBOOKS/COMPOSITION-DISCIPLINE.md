# Runbook — Composition Discipline (until the W0 generator lands)

1. 16 specs, no new spec without deleting or generating one (D-370). New harvests extend an existing composition (default: `discovery-mind.json` per D-318) or wait for the generator.
2. Grants are opt-in per composition. New op → grant it where it's exercised, same commit, or boot fails closed (correct direction — fix the grant, not the gate).
3. DataDir spelling `${TMP}/…` (portable); code uses `omegaTmp()`/`resolveDataDir`/`ownerOnly` from `@vivim/omega-platform` with the `workspace:*` dep edge.
4. Risk rows: every new MUTATION/EXTERNAL_MUTATION contract needs an exact LAW_POLICY_V1 row same-commit (D-351 parity net covers from first boot).
5. Namespaces: new ns → `VAULT-NAMESPACES.md` row same-commit (owner, shapes, writers, retention). Undocumented ns = uncompactable ns.
6. After the W0 generator lands: specs are emitted, never hand-edited; the conformance net (W0-1) is the arbiter; drift allowlist carries intentional scope differences with reasons.
