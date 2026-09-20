# forge-ops.md — the frozen forge.* wire (pack.builder CONTRACT, D-406)

Op names are frozen wire. Renaming one is amendment-class and ripples into every
manifest, grant, recipe and recorded fixture. The machine-readable mirror is
`src/schemas.ts::FORGE_OP_CATALOG`; the pack test proves it equals the
`plugin.json` contract contributions exactly.

Risk mapping (the four builder classes onto the three `RiskClass` values):

```text
Class 1 read/report       → READ
Class 2 proposal/emission → MUTATION
Class 3 external capture  → EXTERNAL_MUTATION
Class 4 governance        → MUTATION with principal constraints
```

## The catalog

| op | risk | payload → result |
|---|---|---|
| `forge.mine.capture@1` | `EXTERNAL_MUTATION` | `{mineRoot, mineId}` → capture receipt — the ONE filesystem seam; read-only; refuses unpinned trees, root escape, symlink escape |
| `forge.mine.verify@1` | `READ` | `{mineId}` → proof report (receipt vs re-walk) |
| `forge.mine.diff@1` | `READ` | `{mineA, mineB}` → proof report |
| `forge.mine.list@1` | `READ` | `{}` → pinned mines |
| `forge.survey.run@1` | `READ` | `{mineId}` → inventory rows — pure: pinned snapshot → inventory |
| `forge.survey.render@1` | `READ` | `{inventory}` → atlas markdown — pure |
| `forge.assay.run@1` | `READ` | `{inventory}` → assay verdicts (clusters, boundaries, risks, harvest classes) |
| `forge.assay.distill@1` | `READ` | `{verdicts}` → PORT / DISTILL / REMOVE / DEFER rulings |
| `forge.shape.map@1` | `READ` | `{verdicts}` → shape blueprint |
| `forge.shape.budget@1` | `READ` | `{blueprint}` → sizing report vs the house heuristics |
| `forge.shape.validate@1` | `READ` | `{blueprint}` → proof report (three-axis + one-writer) |
| `forge.emit.plugin@1` | `MUTATION` | `{spec}` → proposal artifacts — Class 2; writes ONLY ns `proposal` / the scratch proposal path |
| `forge.emit.pack@1` | `MUTATION` | `{spec}` → proposal artifacts — Class 2 |
| `forge.emit.composition@1` | `MUTATION` | `{spec}` → proposal artifacts — Class 2 |
| `forge.emit.fixture@1` | `MUTATION` | `{spec}` → proposal artifacts — Class 2 |
| `forge.emit.record@1` | `MUTATION` | `{spec}` → proposal artifacts — Class 2 |
| `forge.proof.conform@1` | `READ` | `{subject}` → proof report vs pack.builder shapes |
| `forge.proof.replay@1` | `READ` | `{subject}` → proof report (byte-identical regeneration outside AUTHORED regions) |
| `forge.proof.refusal@1` | `READ` | `{subject}` → proof report (every refusal path executed) |
| `forge.proof.secondmine@1` | `READ` | `{subject}` → proof report (the synthetic second mine run) |
| `forge.author.init@1` | `MUTATION` | `{spec}` → scaffold artifacts + ns-proposal ledger rows — Class 2; the self-hosting keystone |
| `forge.tier.stamp@1` | `MUTATION` | `{subject, level, evidence}` → generality-stamp proposal — Class 4 posture |
| `forge.tier.promote@1` | `MUTATION` | `{subject, evidence}` → promotion proposal — decision-record-class; root principal only |
| `forge.tier.docs@1` | `MUTATION` | `{subjects}` → both-axes listing proposal |

## Partition note (the catalog ≠ the compartments)

The catalog declares the WIRE (one risk per op). The PLUGIN partition obeys "one
risk class per compartment": `forge.mine.capture@1` (`EXTERNAL_MUTATION`) cannot
share a compartment with `forge.mine.verify@1` (`READ`). When `forge.mine`
lands, capture splits into its own plugin (e.g. `plugins/forge-mine-capture/`)
or the family lands as separate compartments — that partition decision belongs
to the wave that implements it; this pack only freezes the names and risks.

## Process-tier note

A Forge needing process execution declares `runtime.tier: "process"` with
`runtime.process {cmd, stdio: "ndjson"}` (D-374, brokered by `vivim.run`) — it
never requests a `process.spawn` capability. Capability requests follow
`port:<op>@<v>` or one of the five host capabilities, nothing else parses.
