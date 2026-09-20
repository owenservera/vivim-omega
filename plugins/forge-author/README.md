<!-- FORGE:GENERATED-BEGIN schema=plugin-file@1 spec-hash=sha256:22a459a1070064920854843953df82182b62b9549ebb7efd82845af29470b41b -->
<!-- FORGE:GENERATED-END -->
# forge.author — the Author Forge (Wave 0 keystone)

Class 2 Forge plugin: emits plugin scaffolds from recorded specs, into the
gate-designated scratch proposal path. The whole point of Wave 0 is one
sentence: **the Author Forge can emit itself.**

What `forge.author.init@1` does:

1. Takes a recorded spec as payload (the same shape as `spec/self.json`).
2. Validates it against the frozen wire — unknown fields, forbidden requests
   (signing, capability grants, product composition membership, output outside
   the scratch path), plugin-id mismatch, unpinned command list, path escape,
   hash-pin mismatch, existing targets — every refusal is a NAMED refusal
   (`ok: true` carrying `{refused: true, error: "REFUSED", rule, detail}`),
   never a generic error.
3. Renders each declared file from its template (the `sha256:9ff03ba164341d819d46661fcc48bfb5332546cb5782f48a193bf3591704f39d` token
   substitutes the spec's own content hash), re-hashes the rendered bytes,
   and refuses fail-closed if they disagree with the spec's pinned
   `contentHash`.
4. Emits the tree into the scratch proposal path (`config.scratchDir`, a
   composition passthrough — never authority), appends one
   `ProposalArtifact` row per file to vault ns `proposal`, and reads each row
   back to verify the ledger took it.
5. Returns the input/output hashes so two runs can be compared byte-for-byte.

What it never does: sign anything, commit anything, confer any authority
(`authority: "none"` is schema-enforced in the pack.builder
`proposal-artifact` shape), or write anywhere outside the scratch proposal
path. Boot never reads the proposal path.

## Self-hosting layout

| Path | Status | Why |
|---|---|---|
| `plugin.json`, `package.json`, `README.md`, `src/index.ts` | GENERATED | Reproduced byte-identically from `spec/self.json` on every `forge.author.init@1` run. |
| `spec/self.json` | AUTHORED (whole file) | The spec is the INPUT to emission — a recorder cannot honestly emit its own recording (the contentHash would have to contain itself). |
| `test/compare.ts`, `test/happy/self-host.test.ts`, `test/refusal/init-refusals.test.ts` | AUTHORED (whole files) | The falsifier. A test suite emitted by the system under test cannot falsify it. |

`src/index.ts` carries both marker kinds: a `FORGE:GENERATED-BEGIN/END`
header (whose `spec-hash=` is checked against the spec by the comparison
gate) and one `FORGE:AUTHORED-BEGIN/END` region holding the human-maintained
design notes. Bytes inside authored regions are ignored by the self-hosting
comparison; every other byte must match exactly.

## Run it

```bash
bun test plugins/forge-author   # self-host falsifier + named refusals on a real boot
```
