# builder-policy.md — the ten Wave 0 policy rows (pack.builder POLICY, D-406)

The machine-readable copy rides the `builder.policy@1` contribution in
`plugin.json`. The forge-surface gate stage enforces the mechanically checkable
subset; the rest is review discipline whose proof is the refusal tests.

1. **Emission is proposal-only.** Forge-generated artifacts do not sign, commit,
   grant, or boot. Enforcement: `proposal-artifact.authority === "none"` is
   schema law (any other value fails validation) + `FORGE_EMIT_SCOPE` at the gate.
2. **Emission confers no authority.** A human signs; nothing a Forge emits is
   trusted until signed. Same enforcement — the authority field is pinned.
3. **Capture is read-only and refuses unpinned trees.** `forge.mine.capture@1`
   refuses unpinned trees, paths outside the declared mine root, and symlink
   escape; it never writes to the mine. Enforcement: the capture receipt's
   `refusals[]` + refusal tests when `forge.mine` lands.
4. **Every Forge op has a refusal test.** Happy path alone is not coverage.
   Enforcement: `FORGE_NO_REFUSAL_TEST` at the gate.
5. **Every plugin and pack declares generality.** Enforcement:
   `GEN_LEVEL_MISSING`, hard for `forge.*` plugins and `pack.builder`.
6. **No `forge.*` op may appear in a product composition.** Enforcement:
   `FORGE_IN_PRODUCT` at the gate (builder compositions are `forge-*.json`).
7. **No plugin may span multiple risk classes.** Grants are per-plugin.
   Enforcement: `FORGE_CLASS_SPAN` at the gate.
8. **Class-2 emission writes only to ns `proposal`** or the gate-designated
   scratch proposal path. Enforcement: `FORGE_EMIT_SCOPE` + per-plugin scope tests.
9. **Boot never reads the proposal path.** Provisional artifacts cannot boot
   themselves (D-400 precedent). Enforcement: the forge-author real-boot
   falsifier asserts the emission path is outside the vault/recipe read set.
10. **Generated structure is replayable; authored logic is excluded only by
    explicit markers.** `FORGE:AUTHORED-BEGIN/END` regions and explicitly
    declared `authoredFiles` are the ONLY exclusions from byte-comparison.
    Anything else is backlog, not a gate exception.
