Understood. If the team gets **only** `OMEGA-FORGE-ARCHITECTURE.md` plus what I generate now, and the implementer is reasonably intelligent but not omniscient, then my job is to remove judgment gaps before they happen.

Below is the implementation-ready supplement. It is written as **construction orders**, not commentary. It pre-decides ambiguities, names the traps, and makes “done” mechanically checkable.

---

# OMEGA FORGE — WAVE 0 CONSTRUCTION PACKET

Companion implementation brief to `OMEGA-FORGE-ARCHITECTURE.md`.

If the master architecture document and this packet conflict, the master document wins. If this packet is ambiguous, stop, record the ambiguity in the wave evidence file, and use the default decision in §10.

---

## 0. Mission

You are not porting Vivim in Wave 0.

You are landing **Step 1** of Omega Forge:

> The anvil, the Builder Pack, the generality axis, the Forge surface gate, and the self-hosting Author Forge.

The keystone falsifier for Wave 0 is:

> `forge.author.init@1` reproduces `plugins/forge-author/` byte-identical from its recorded spec, excluding only explicitly marked `AUTHORED` regions.  
> A hand-edit outside those regions fails the gate with a named diff.

Until that falsifier is green on a real boot, everything else is a claim.

---

## 1. Prime directives

These are non-negotiable.

1. **No host LOC spend.**  
   If a task appears to require host code, stop and file a Forge defect. Do not patch the host.

2. **No new contribution kind.**  
   Forges are plugins. Packs are packs. Compositions are compositions. Do not invent `tool`, `forge`, `sdk`, or `builder` kinds.

3. **No privileged developer path.**  
   A Forge has no capability that cannot be expressed as:
   - `port:<op>@<v>`, or
   - one of the existing host capabilities.

   If a needed capability cannot be expressed, it does not exist. Stop and record the gap.

4. **Proposal-only emission.**  
   Forge emission confers no authority. Forge-generated artifacts do not sign, commit, grant, or boot.

5. **No Forge op in a product composition.**  
   `forge.*` ops may appear only in builder compositions.

6. **One risk class per plugin.**  
   No plugin may declare ops in more than one risk class.

7. **Every Forge op ships a refusal test.**  
   Happy path alone is not coverage.

8. **Fixtures before code.**  
   Recorded fixtures only. No live network. Fixtures must be byte-identical across two runs and hash-pinned.

9. **Hand-fixing is a bug report.**  
   Every time you want to manually fix something, record it in the wave evidence file. That count is the Forge backlog.

10. **Do not start the Vivim port.**  
   Wave 0 does not run the real mine except as reference material.

---

## 2. Minimal vocabulary

Use these terms exactly.

### Forge

A plugin whose purpose is to build, inspect, prove, stamp, or absorb Omega artifacts.

Forge ids use dots:

```text
forge.mine
forge.survey
forge.assay
forge.shape
forge.emit
forge.proof
forge.author
forge.tier
```

Forge directories use dashes:

```text
plugins/forge-mine/
plugins/forge-survey/
plugins/forge-assay/
plugins/forge-shape/
plugins/forge-emit/
plugins/forge-proof/
plugins/forge-author/
plugins/forge-tier/
```

### Anvil

The frozen pre-boot edge. It is not a Forge. It does not grow.

The anvil contains only the five frozen functions:

```text
parseManifest
validateManifest
signPluginDir
contentHashDir
createPortClient
```

If `createPortClient` is later renamed to `createForgeClient` or `createEdgeClient`, that rename must happen with all call sites updated in the same commit and a decision record.

### Builder Contract

The Builder Contract is not an op. It is a pack.

Canonical id:

```text
pack.builder
```

It declares:

```text
SCHEMA
CONTRACT
POLICY
TEST
```

### Generality

Generality is the additive axis that answers:

> What has this artifact been proven against?

Values:

```text
speculative
harvested
generic
```

Generality is orthogonal to existing `ProvenanceTier`.

Do not rename, reuse, or collide with `ProvenanceTier`.

### L-FORGE

The replay discipline for Forge-generated structure.

L-FORGE binds generated structure, not authored logic.

Generated structure must replay byte-identically. Authored logic is excluded only via explicit markers.

### Product composition vs builder composition

Builder compositions are named:

```text
compositions/forge-*.json
```

All other compositions are product compositions for the purpose of Wave 0 gates.

`forge.*` ops may never route in a product composition.

---

## 3. Wave 0 scope

### In scope

1. Doc-drift remediation.
2. Decision records for anvil freeze, generality axis, and L-FORGE.
3. Freeze the anvil with a hard LOC gate.
4. Land the additive `generality` manifest block.
5. Land the four generality validators.
6. Land `pack.builder`.
7. Land `forge.author` with the self-hosting falsifier.
8. Land the `forge-surface` gate stage.
9. Create the synthetic second mine skeleton.
10. Create the Wave 0 evidence file and hand-fix tally.

### Out of scope

Do not do these in Wave 0:

1. Do not port Vivim.
2. Do not implement the full eight-Forge pipeline unless required by the self-hosting falsifier.
3. Do not implement ChatGPT/browser provider behavior.
4. Do not build UI.
5. Do not create a registry singleton.
6. Do not add host capabilities.
7. Do not add a new contribution kind.
8. Do not bulk-import anything.
9. Do not hand-generate a large plugin batch.
10. Do not promote anything to `generic` unless the evidence rules are mechanically satisfied.

---

## 4. Deliverables in dependency order

Do not reorder these without recording a reason.

```text
D0  Doc drift + decision records
D1  Anvil freeze
D2  Generality block + validators
D3  pack.builder
D4  forge.author self-hosting
D5  forge-surface gate stage
D6  Synthetic second mine skeleton
```

---

# D0 — Doc drift remediation and decision records

## Objective

Make the written freeze match the enforced freeze. A stale freeze stops being a freeze.

## Required outputs

1. A decision record for doc-drift remediation.
2. Updated documentation so that:
   - host budget text matches the enforced gate constant;
   - composition count text matches the enforced composition freeze.
3. A decision record explicitly amending or reaffirming the composition freeze.

## Default decision

If docs say one number and the gate enforces another:

> Update the docs to match the enforced gate constant, and record the amendment.

Do not silently reduce or expand the freeze.

If the composition count is stale:

> Record the measured count. If the extra composition is real and needed, amend the freeze. If it is accidental, remove it. Do not leave the freeze silent.

## Acceptance

- Documentation no longer contradicts gate constants.
- A decision record exists for each drift remediation.
- The wave evidence file lists the measured values.

---

# D1 — The anvil freeze

## Objective

Freeze the pre-boot edge as an immovable wall.

## Frozen functions

The anvil consists of exactly:

```text
parseManifest
validateManifest
signPluginDir
contentHashDir
createPortClient
```

No builder logic belongs here.

No Forge logic belongs here.

No capability taxonomy belongs here.

No registration logic belongs here.

No permissions host belongs here.

## LOC budget

1. Measure the current anvil LOC using the house LOC-counting method.
2. Add a one-time allowance for the Wave 0 generality validators.
3. Record the final number in a decision record.
4. Enforce that number with a hard gate.
5. After Wave 0, the rule is remove-to-add.

## Default budget rule

Use:

```text
anvil_budget = measured_baseline + wave0_validator_allowance
```

The exact number is less important than the wall. The gate must fail if the budget is exceeded.

## Required tests

1. Green test: anvil LOC is at or under budget.
2. Red test: adding one non-blank, non-comment line without removing another fails the gate.
3. Red test: adding a new exported function from the anvil surface fails a surface-shape test unless accompanied by a decision record.

## Acceptance

- Anvil LOC gate exists.
- Budget constant is derivable from a gate or config file.
- Decision record records the budget.
- The anvil exports no Forge-specific behavior.

---

# D2 — Generality block and validators

## Objective

Add the generality axis without touching `ProvenanceTier`.

## Manifest shape

Additive block:

```json
{
  "generality": {
    "level": "speculative | harvested | generic",
    "mine": "<repo>@<sha>",
    "originPaths": ["<path>", "<path>"],
    "harvestClass": "ALGORITHM",
    "evidence": []
  }
}
```

### Level values

```text
speculative
harvested
generic
```

### `mine`

Format:

```text
<repo>@<sha>
```

SHA length must be at least 7 and at most 64 hex characters.

Example:

```text
vivim-final-program@4a5eb84
```

### `originPaths`

Non-empty array of paths inside the pinned mine.

### `harvestClass`

Initial allowed values:

```text
ALGORITHM
SHAPED
SCHEMA
FIXTURE
POLICY
TEST
TOOLING
OTHER
```

Extension requires a `pack.builder` amendment.

### `evidence`

Array of evidence refs.

Evidence ref format:

```text
ledger:<namespace>/<row-id>
fixture:<path>@<sha>
mine:<repo>@<sha>
composition:<composition-id>@<sha>
decision:<decision-id>
```

Evidence refs must be resolvable.

## Validators

Implement four validators.

### `GEN_LEVEL_MISSING`

Every plugin and pack declares `generality.level`.

Wave 0 phase-in rule:

- Hard error for all `forge.*` plugins and `pack.builder`.
- Hard error for newly created or modified manifests.
- Report-only for existing non-Forge manifests until the retrofit batch is complete.

Do not boil the ocean in Wave 0. But do produce the full missing-generality report.

### `GEN_MINE_UNPINNED`

If `generality.level` is `harvested`, then:

- `mine` is present;
- `mine` matches `<repo>@<sha>`;
- `originPaths` is non-empty;
- `harvestClass` is present and valid.

If `generality.level` is `generic` and `mine` is present, the mine must also be pinned.

### `GEN_UNPROVEN`

If `generality.level` is `generic`, then:

- `evidence` contains at least two resolvable refs;
- at least one evidence ref is independent of the harvested mine.

Independence rule:

> If the generality block declares `mine: x@sha`, at least one evidence ref must not be `x@sha` and must not be derived solely from `x@sha`.

Acceptable independent evidence kinds:

```text
second-mine fixture
independent consumer composition
conformance green with mine-specific fixture removed
```

### `GEN_SPECULATIVE_STALE`

If `generality.level` is `speculative`, report if:

- it has a live caller but no promotion evidence; or
- it has no caller after three waves.

In Wave 0, this validator may be report-only. It becomes hard when wave/caller tracking exists.

## Required fixtures

Create:

1. Valid speculative manifest.
2. Valid harvested manifest.
3. Valid generic manifest.
4. Invalid manifest missing level.
5. Invalid harvested manifest with unpinned mine.
6. Invalid harvested manifest with empty `originPaths`.
7. Invalid generic manifest with one evidence ref.
8. Invalid generic manifest where both evidence refs are the same mine.

Pin all fixtures.

## Acceptance

- `generality` is additive.
- `ProvenanceTier` is untouched.
- Validators reject all invalid fixtures.
- Validators accept all valid fixtures.
- A `forge.*` plugin without generality fails hard.

---

# D3 — `pack.builder`

## Objective

Stand up the Builder Contract as a pack.

Canonical id:

```text
pack.builder
```

Directory:

```text
packs/builder/
```

## Pack contents

At minimum:

```text
packs/builder/
  package.json
  plugin.json
  README.md
  schema/
    capture-receipt.ts
    inventory-row.ts
    assay-verdict.ts
    shape-blueprint.ts
    proposal-artifact.ts
    proof-report.ts
    generality-stamp.ts
  contract/
    forge-ops.md
  policy/
    builder-policy.md
  test/
    schema.test.ts
    fixtures/
      valid/
      invalid/
```

If the house pack convention differs, follow the house convention, but preserve the four pack responsibilities:

```text
SCHEMA
CONTRACT
POLICY
TEST
```

## Schemas required

`pack.builder` must define the following artifact shapes.

### 1. Capture receipt

Normative fields:

```ts
{
  schemaVersion: "1",
  op: "forge.mine.capture@1",
  mineId: string,            // repo@sha
  mineRoot: string,
  capturedAt: string,        // UTC ISO timestamp
  fileCount: number,
  rootHash: string,
  files: [
    {
      path: string,
      hash: string,
      bytes: number,
      casRef: string
    }
  ],
  refusals: [
    {
      path: string,
      reason: string
    }
  ]
}
```

### 2. Inventory row

Normative fields:

```ts
{
  schemaVersion: "1",
  path: string,
  hash: string,
  bytes: number,
  language: string | null,
  exports: string[],
  imports: string[],
  models: string[],
  headings: string[]
}
```

Optional arrays may be empty. Do not invent required fields not declared here.

### 3. Assay verdict

Normative fields:

```ts
{
  schemaVersion: "1",
  subjectPath: string,
  disposition: "PORT" | "DISTILL" | "REMOVE" | "DEFER",
  harvestClass: string | null,
  clusters: string[],
  boundaries: [
    {
      op: string,
      rationale: string,
      refusable: boolean,
      substitutable: boolean,
      provable: boolean
    }
  ],
  risks: string[],
  evidence: string[]
}
```

A boundary is admissible only if:

```text
refusable === true
substitutable === true
provable === true
```

If any is false, the assay verdict must not propose it as an op.

### 4. Shape blueprint

Normative fields:

```ts
{
  schemaVersion: "1",
  namespaces: [
    {
      name: string,
      writer: string,
      readers: string[],
      retention: string
    }
  ],
  plugins: [
    {
      id: string,
      ops: string[],
      writtenNamespace: string | null,
      generality: GeneralityStamp
    }
  ],
  compositions: [
    {
      id: string,
      members: string[]
    }
  ],
  mappings: [
    {
      source: string,
      targetOp: string,
      reason: string
    }
  ]
}
```

Every namespace must have exactly one writer.

Lens plugins may have `writtenNamespace: null`.

### 5. Proposal artifact

Normative fields:

```ts
{
  schemaVersion: "1",
  targetPath: string,
  artifactKind:
    | "manifest"
    | "package"
    | "source"
    | "fixture"
    | "composition"
    | "record"
    | "doc",
  contentHash: string,
  generatedBy: string,       // op id, e.g. forge.emit.plugin@1
  ledgerRef: string | null,
  authority: "none",
  justification: string
}
```

`authority` must always be `"none"`.

If an implementation tries to emit `"authority": "granted"` or any other value, validation must fail.

### 6. Proof report

Normative fields:

```ts
{
  schemaVersion: "1",
  subject: string,
  op: string,
  result: "pass" | "fail",
  checks: [
    {
      name: string,
      result: "pass" | "fail",
      diff: string | null
    }
  ],
  replayHash: string | null,
  refusalResults: [
    {
      name: string,
      result: "pass" | "fail"
    }
  ]
}
```

### 7. Generality stamp

Normative fields:

```ts
{
  schemaVersion: "1",
  level: "speculative" | "harvested" | "generic",
  mine: string | null,
  originPaths: string[],
  harvestClass: string | null,
  evidence: string[]
}
```

## Contract

`pack.builder` must name the canonical Forge ops.

Use the catalog in §5.

Do not rename ops casually. Op names are frozen wire.

## Policy

`pack.builder` policy must state all of the following:

1. Emission is proposal-only.
2. Emission confers no authority.
3. Capture is read-only and refuses unpinned trees.
4. Every Forge op has a refusal test.
5. Every plugin and pack declares generality.
6. No `forge.*` op may appear in a product composition.
7. No plugin may span multiple risk classes.
8. Class-2 emission writes only to `ns proposal` or a gate-designated scratch proposal path.
9. Boot never reads the proposal path.
10. Generated structure is replayable; authored logic is excluded only by explicit markers.

## Tests

For every schema:

1. One valid fixture.
2. At least one invalid fixture.
3. Hash-pinned fixture manifest.
4. Determinism test: same input twice produces byte-identical output.

## Acceptance

- `pack.builder` exists.
- All seven schemas are implemented.
- Valid fixtures pass.
- Invalid fixtures fail.
- Policy document exists.
- Contract names match the Forge op catalog.

---

# D4 — `forge.author` and the self-hosting falsifier

## Objective

Land the keystone:

> The Author Forge can emit itself.

## Plugin directory

```text
plugins/forge-author/
  plugin.json
  package.json
  README.md
  src/
    index.ts
  spec/
    self.json
  test/
    happy/
      self-host.test.ts
    refusal/
      init-refusals.test.ts
```

## Manifest

Use the corrected Omega manifest grammar.

Do not include:

- invented capability strings;
- plugin-level `risk`;
- top-level `tier`;
- an `ops` array;
- `process.spawn` as a capability.

Example manifest:

```json
{
  "manifestVersion": "1",
  "id": "forge.author",
  "version": "0.1.0",
  "description": "Class 2 — emits plugin scaffolds from recorded specs. Proposal-only: confers no authority, signs nothing, commits nothing.",
  "entry": "src/index.ts",
  "publisher": {
    "keyId": "",
    "signature": ""
  },
  "contributions": {
    "contract": [
      {
        "kind": "contract",
        "id": "forge.author.init",
        "version": "1",
        "risk": "MUTATION"
      }
    ]
  },
  "capabilities": {
    "requested": [
      "port:vault.append@1",
      "port:vault.get@1",
      "port:law.check@1"
    ],
    "justification": "Reads recorded specs and writes provisional scaffold artifacts. Every write is law-gated; nothing is signed; boot never reads the proposal path."
  },
  "runtime": {
    "tier": "worker-thread",
    "budget": {
      "cpuMs": 2000,
      "memMB": 256
    }
  },
  "granularity": "coarse",
  "internalSeams": [
    "spec",
    "scaffold",
    "self-host"
  ],
  "generality": {
    "level": "speculative",
    "mine": null,
    "originPaths": [],
    "harvestClass": null,
    "evidence": []
  },
  "contentHash": ""
}
```

If `validateManifest` rejects any field, correct the manifest to match the validator. Do not weaken the validator.

## Recorded spec

The Author Forge must have a recorded spec:

```text
plugins/forge-author/spec/self.json
```

The spec must contain:

```ts
{
  schemaVersion: "1",
  pluginId: "forge.author",
  version: string,
  manifest: object,
  files: [
    {
      path: string,
      template: string,
      contentHash: string
    }
  ],
  authoredFiles: string[],
  authoredRegions: [
    {
      file: string,
      markers: {
        begin: string,
        end: string
      }
    }
  ],
  commandList: [
    {
      op: "forge.author.init@1",
      inputHash: string,
      outputHash: string
    }
  ]
}
```

Defaults:

- `authoredFiles` should be empty unless unavoidable.
- Every authored file must have a justification in the spec.
- Authored regions are preferred over authored files.

## Generated and authored markers

Use these exact markers.

Generated block:

```ts
// FORGE:GENERATED-BEGIN schema=plugin-file@1 spec-hash=<sha>
// FORGE:GENERATED-END
```

Authored block:

```ts
// FORGE:AUTHORED-BEGIN
// FORGE:AUTHORED-END
```

For non-TS files, use the comment syntax appropriate to the file type, but preserve the token strings:

```text
FORGE:GENERATED-BEGIN
FORGE:GENERATED-END
FORGE:AUTHORED-BEGIN
FORGE:AUTHORED-END
```

## Comparison rule

The self-hosting gate compares:

```text
generated scratch output
```

against:

```text
checked-in plugins/forge-author/
```

Comparison rules:

1. Bytes outside `FORGE:AUTHORED-BEGIN` / `FORGE:AUTHORED-END` must match exactly.
2. Bytes inside authored regions are ignored.
3. Files listed in `authoredFiles` are ignored whole-file.
4. Any file present in the checked-in plugin directory but not declared in the spec fails the gate.
5. Any file declared in the spec but missing from the checked-in plugin directory fails the gate.
6. Any generated block whose header hash does not match the spec fails the gate.

No other exclusions are allowed.

If someone wants to exclude anything else, that is backlog, not a gate exception.

## Required happy test

Run:

```text
forge.author.init@1
```

against:

```text
plugins/forge-author/spec/self.json
```

Output to a gate-designated scratch proposal path.

The test must assert:

1. The command succeeds.
2. The output tree is byte-identical outside authored regions.
3. The generated manifest is valid.
4. The output path is not readable by boot.
5. The output confers no authority.

## Required refusal tests

At minimum, `forge.author.init@1` must refuse:

1. A spec with unknown fields.
2. A spec requesting output outside the scratch/proposal path.
3. A spec requesting signing.
4. A spec requesting capability grants.
5. A spec requesting a product composition membership.
6. A spec with a plugin id that does not match `forge.author` during self-hosting.
7. A spec with no hash-pinned command list.
8. A spec attempting to overwrite an existing non-scratch target.

Each refusal test must assert a named refusal, not a generic error.

## Real boot requirement

The self-hosting falsifier must pass on a real boot.

Real boot means:

- the host boots a builder composition;
- law and vault phases run;
- `forge.author` is loaded as a plugin;
- the op is routed normally;
- no direct import of the handler is used.

Use the house’s ordinary boot path. Do not create a bespoke bypass.

## Acceptance

- `forge.author` boots in `compositions/forge-author.json`.
- `forge.author.init@1` emits the Author Forge into scratch.
- The self-hosting comparison is green.
- A hand-edit outside authored regions makes the gate red with a named diff.
- All refusal tests pass.

---

# D5 — `forge-surface` gate stage

## Objective

Make the Forge boundary mechanically enforceable.

## Location

Implement as a gate stage in the existing gate tooling.

If the house has `tooling/gates/`, place it there.

Do not implement this as a runtime plugin if the existing gate stage is the house pattern.

## Required checks

### `FORGE_IN_PRODUCT`

Rule:

> No `forge.*` op may route in any product composition.

Default classification:

- compositions matching `forge-*.json` are builder compositions;
- all other compositions are product compositions.

Red fixture:

```text
a product composition containing forge.emit.plugin@1
```

Must fail.

### `FORGE_CLASS_SPAN`

Rule:

> No plugin may declare contract contributions in more than one risk class.

Red fixture:

```text
one plugin declaring forge.survey.run@1 as READ and forge.emit.plugin@1 as MUTATION
```

Must fail.

### `FORGE_EMIT_SCOPE`

Rule:

> Class-2 Forge emission may write only to `ns proposal` or the gate-designated scratch proposal path.

Checks:

1. `forge.emit.*` contributions must be `MUTATION`.
2. Manifest justification must declare proposal-only behavior.
3. Tests must prove no other namespace is written.
4. Boot must never read the proposal path.

Red fixture:

```text
forge.emit writing to ns config
```

Must fail.

### `FORGE_NO_REFUSAL_TEST`

Rule:

> Every `forge.*` op must have a refusal test.

Convention:

```text
test/refusal/<area>.<verb>.test.ts
```

Example:

```text
plugins/forge-author/test/refusal/author.init.test.ts
```

If no refusal test exists, the gate fails.

### `FORGE_CONTRACT_DRIFT`

Rule:

> Every Forge op’s payload/result shape must match `pack.builder`.

Implementation:

1. Load `pack.builder` contract declarations.
2. Load Forge op fixtures.
3. Validate fixtures against the declared schema.
4. Fail if any Forge op fixture is absent, invalid, or structurally drifted.

## Gate output

The gate must emit a machine-readable report and a human-readable diff.

For every failure, include:

```text
check name
offending file or composition
offending op or plugin
exact reason
suggested fix
```

## Acceptance

- All five checks exist.
- Each check has at least one green fixture and one red fixture.
- The gate runs in CI or the house gate runner.
- A deliberate violation fails with a named diff.

---

# D6 — Synthetic second mine skeleton

## Objective

Prevent Vivim-shaped lock-in before the Forge APIs harden.

Wave 0 does not need the full second mine proven. It needs the skeleton and the acceptance rules.

## Location

```text
fixtures/mines/synthetic-v0/
```

## Required properties

The synthetic mine must:

1. Contain 35–45 files.
2. Not resemble Vivim’s cluster structure.
3. Not contain a capability graph.
4. Not contain CDP/browser automation.
5. Not contain Prisma.
6. Not contain a Next.js app.
7. Not contain chat/LLM provider logic.
8. Use a different persistence shape from Vivim.
9. Include at least one non-TypeScript file.
10. Include at least one workflow expressed as data, not code.
11. Be deterministic and hash-pinned.
12. Be checked into fixtures.

## Recommended shape

A small offline recipe or note tool:

```text
fixtures/mines/synthetic-v0/
  README.md
  manifest.json
  Makefile
  bin/
    run.sh
  src/
    main.py
    store.py
    query.py
    render.py
  data/
    recipes.json
  docs/
    design.md
  tests/
    test_store.py
```

This is only a recommendation. The important part is that it is deliberately un-Vivim-shaped.

## Acceptance

- Directory exists.
- File count is within range.
- Hash manifest exists.
- A short README explains why it is un-Vivim-shaped.
- A Wave 1 task is recorded to run `forge.mine.capture@1` against it.

---

## 5. Canonical Forge catalog for Wave 0

Use these names as the frozen wire.

| Forge plugin | Ops | Risk | Written namespace | Notes |
|---|---|---|---|---|
| `forge.mine` | `forge.mine.capture@1`, `forge.mine.verify@1`, `forge.mine.diff@1`, `forge.mine.list@1` | capture: `EXTERNAL_MUTATION`; others: `READ` | none in Wave 0 | capture is the one filesystem seam |
| `forge.survey` | `forge.survey.run@1`, `forge.survey.render@1` | `READ` | none | inventory and render |
| `forge.assay` | `forge.assay.run@1`, `forge.assay.distill@1` | `READ` | none | clusters, distillation verdicts |
| `forge.shape` | `forge.shape.map@1`, `forge.shape.budget@1`, `forge.shape.validate@1` | `READ` | none | namespaces, boundaries, blueprints |
| `forge.emit` | `forge.emit.plugin@1`, `forge.emit.pack@1`, `forge.emit.composition@1`, `forge.emit.fixture@1`, `forge.emit.record@1` | `MUTATION` | `proposal` | proposal-only |
| `forge.proof` | `forge.proof.conform@1`, `forge.proof.replay@1`, `forge.proof.refusal@1`, `forge.proof.secondmine@1` | `READ` | none in Wave 0 | returns reports |
| `forge.author` | `forge.author.init@1` | `MUTATION` | `proposal` or scratch proposal path | self-hosting keystone |
| `forge.tier` | `forge.tier.stamp@1`, `forge.tier.promote@1`, `forge.tier.docs@1` | `MUTATION` | `proposal` or governed ledger ns | root principal constraints |

Default risk mapping:

```text
Class 1 read/report       → READ
Class 2 proposal/emission → MUTATION
Class 3 external capture  → EXTERNAL_MUTATION
Class 4 governance        → MUTATION with principal constraints
```

If a Forge needs process-tier execution, declare:

```json
{
  "runtime": {
    "tier": "process",
    "process": {
      "cmd": ["..."],
      "stdio": "ndjson"
    }
  }
}
```

Do not request a `process.spawn` capability.

---

## 6. Example corrected emission manifest

Use this as a grammar reference.

```json
{
  "manifestVersion": "1",
  "id": "forge.emit",
  "version": "0.1.0",
  "description": "Class 2 — generates plugin/pack/composition/fixture/record artifacts into ns proposal. Proposal-only: confers no authority, signs nothing, commits nothing.",
  "entry": "src/index.ts",
  "publisher": {
    "keyId": "",
    "signature": ""
  },
  "contributions": {
    "contract": [
      {
        "kind": "contract",
        "id": "forge.emit.plugin",
        "version": "1",
        "risk": "MUTATION"
      },
      {
        "kind": "contract",
        "id": "forge.emit.pack",
        "version": "1",
        "risk": "MUTATION"
      },
      {
        "kind": "contract",
        "id": "forge.emit.composition",
        "version": "1",
        "risk": "MUTATION"
      },
      {
        "kind": "contract",
        "id": "forge.emit.fixture",
        "version": "1",
        "risk": "MUTATION"
      },
      {
        "kind": "contract",
        "id": "forge.emit.record",
        "version": "1",
        "risk": "MUTATION"
      }
    ]
  },
  "capabilities": {
    "requested": [
      "port:vault.append@1",
      "port:vault.get@1",
      "port:law.check@1"
    ],
    "justification": "Reads the shape blueprint and writes provisional artifacts into ns proposal. Every write is law-gated; nothing is signed; boot never reads ns proposal."
  },
  "runtime": {
    "tier": "worker-thread",
    "budget": {
      "cpuMs": 2000,
      "memMB": 256
    }
  },
  "granularity": "coarse",
  "internalSeams": [
    "plugin-scaffold",
    "pack-scaffold",
    "composition-spec",
    "fixture",
    "record"
  ],
  "generality": {
    "level": "harvested",
    "mine": "vivim-final-program@4a5eb84",
    "originPaths": [
      "tooling/builder/src/builder.ts",
      "tooling/generate/generate.ts"
    ],
    "harvestClass": "TOOLING",
    "evidence": []
  },
  "contentHash": ""
}
```

If the actual validator rejects any field, fix the manifest, not the validator.

---

## 7. Test conventions

Every Forge op must have:

```text
test/happy/<area>.<verb>.test.ts
test/refusal/<area>.<verb>.test.ts
```

Examples:

```text
plugins/forge-author/test/happy/author.init.test.ts
plugins/forge-author/test/refusal/author.init.test.ts
```

Every fixture must be hash-pinned.

Every fixture must be recorded, never live.

Every generated artifact must be byte-identical across two runs.

---

## 8. Wave 0 red/green acceptance suite

Wave 0 is done only when all of the following are true.

### Green checks

1. `validateManifest` passes for:
   - `forge.author`
   - any other Forge plugins landed in Wave 0
   - `pack.builder`

2. Generality validators accept:
   - valid speculative fixture
   - valid harvested fixture
   - valid generic fixture

3. `forge.author.init@1` boots in a real builder composition.

4. `forge.author.init@1` reproduces `plugins/forge-author/` outside authored regions.

5. `forge-surface` gate passes on the real tree.

6. `pack.builder` schema fixtures pass.

7. Anvil LOC gate passes.

8. Doc numbers match gate constants.

9. Synthetic second mine skeleton exists and is hash-pinned.

10. Wave evidence file exists and includes the hand-fix tally.

### Red checks

Each of these must fail with a named diff or named refusal.

1. A `forge.*` plugin without a generality block fails.

2. A harvested manifest with an unpinned mine fails.

3. A generic manifest with only one evidence ref fails.

4. A generic manifest whose only evidence is the same mine fails.

5. A hand-edit outside `FORGE:AUTHORED` regions fails self-hosting.

6. A generated file with a mismatched spec hash fails.

7. A product composition containing a `forge.*` op fails `FORGE_IN_PRODUCT`.

8. A plugin spanning two risk classes fails `FORGE_CLASS_SPAN`.

9. A Forge op without a refusal test fails `FORGE_NO_REFUSAL_TEST`.

10. A Forge op whose fixture drifts from `pack.builder` fails `FORGE_CONTRACT_DRIFT`.

11. An anvil LOC increase without removal fails the anvil gate.

12. `forge.author.init@1` refuses all required invalid specs.

---

## 9. Pre-mortem: how a smart implementer will fail

Assume the implementer is competent. They will still fail in these predictable ways unless prevented.

### Failure 1: They build a mini-SDK

Symptom:

```text
sdk/forge.ts
forge.permissions.ts
forge.registry.ts
```

Prevention:

> There is no SDK layer. There are Forge plugins, `pack.builder`, and the frozen anvil.

---

### Failure 2: They invent capabilities

Symptom:

```json
"capabilities": ["proposal.write", "fs.read", "process.spawn"]
```

Prevention:

Only use:

```text
port:<op>@<v>
host.*
```

Process-tier execution is declared via `runtime.tier`, not capabilities.

---

### Failure 3: They put capture and emit in one plugin

Symptom:

```text
forge-port plugin containing capture, survey, assay, shape, emit
```

Prevention:

Risk class boundaries are compartment boundaries.

`forge-port` is a composition, not a plugin.

---

### Failure 4: They use `tier` for generality

Symptom:

```json
"tier": "harvested"
```

Prevention:

`ProvenanceTier` already exists. Use:

```json
"generality": {
  "level": "harvested"
}
```

---

### Failure 5: They make the Builder Contract an op

Symptom:

```text
forge.builder@1 with many ops
```

Prevention:

The Builder Contract is a pack:

```text
pack.builder
```

One contribution = one op.

---

### Failure 6: They let emission confer authority

Symptom:

```text
forge.emit signs manifests, grants capabilities, or edits compositions directly
```

Prevention:

Emission writes proposals only.

A human signs.

Boot never reads the proposal path.

---

### Failure 7: They exclude arbitrary files from replay

Symptom:

```text
"ignore": ["src/index.ts", "package.json"]
```

Prevention:

Only explicit `FORGE:AUTHORED` regions and explicitly declared authored files are excluded.

Anything else is backlog.

---

### Failure 8: They start porting Vivim early

Symptom:

```text
Work on chat, providers, browser fleet, or memory before self-hosting is green
```

Prevention:

Wave 0 ends at self-hosting.

No wave starts before the prior falsifier is green on a real boot.

---

### Failure 9: They hand-fix generated files

Symptom:

```text
Direct edits to generated manifests or composition entries
```

Prevention:

Hand-fixing is a bug report.

Record it, work around it, fix the Forge next wave.

---

### Failure 10: They treat the synthetic mine as optional

Symptom:

> “We’ll add the second mine after the pipeline works.”

Prevention:

Without the second mine, every generality claim is Vivim-shaped.

The skeleton must exist in Wave 0.

---

## 10. Default decisions

Use these defaults unless a ratified decision record says otherwise.

| Ambiguity | Default |
|---|---|
| Proposal namespace | `ns proposal` |
| Builder compositions | `compositions/forge-*.json` |
| Product compositions | all non-`forge-*` compositions |
| Capture risk | `EXTERNAL_MUTATION` |
| Survey/assay/shape risk | `READ` |
| Emit risk | `MUTATION` |
| Proof risk | `READ` unless persisting reports |
| Tier/promote risk | `MUTATION` with principal constraints |
| Generality validator rollout | hard for Forge/pack/new manifests; report-only for existing non-Forge manifests |
| `GEN_SPECULATIVE_STALE` wave threshold | 3 waves |
| Second mine file count | 35–45 files |
| Authored exclusion mechanism | `FORGE:AUTHORED-BEGIN` / `FORGE:AUTHORED-END` only |
| Whole-file authored exclusion | allowed only if explicitly declared in spec |
| Evidence ref format | `ledger:`, `fixture:`, `mine:`, `composition:`, `decision:` |
| Anvil budget | measured baseline plus recorded Wave 0 validator allowance, then remove-to-add |
| Doc drift | update docs to enforced gate constants with decision record |
| Forge op naming | `forge.<area>.<verb>@1` |
| Forge directory naming | `plugins/forge-<area>/` |
| Pack naming | `pack.builder` |
| CLI behavior | derived surface only; no hand-coded privileged sugar |

---

## 11. Required evidence file

Create:

```text
docs/forge/wave0-evidence.md
```

It must contain:

1. Wave start and end dates.
2. Measured anvil LOC baseline.
3. Final anvil budget.
4. Doc-drift remediation summary.
5. Decision records created.
6. Generality validator fixtures list.
7. `pack.builder` schema list.
8. Self-hosting falsifier result.
9. Named diff from the deliberate hand-edit red test.
10. Gate report for `forge-surface`.
11. Synthetic second mine skeleton hash.
12. Hand-fix tally.
13. Known gaps filed as Forge backlog.

The hand-fix tally is not failure. It is the product backlog.

---

## 12. Definition of Done

Wave 0 is done when:

1. The anvil is frozen and gated.
2. The generality block and validators are landed.
3. `pack.builder` exists with schemas, contract, policy, and tests.
4. `forge.author` exists.
5. `forge.author.init@1` emits itself byte-identical outside authored regions.
6. A hand-edit outside authored regions produces a named red diff.
7. The self-hosting falsifier passes on a real boot.
8. The `forge-surface` gate enforces all five checks.
9. The synthetic second mine skeleton is checked in and hash-pinned.
10. Doc drift is fixed and recorded.
11. The wave evidence file exists.
12. No host LOC was spent.
13. No new contribution kind was created.
14. No `forge.*` op exists in a product composition.
15. No emission confers authority.

When all of those are true, Wave 0 is green.

Only then does Wave 1 begin.

---

## 13. Handoff sentence for the team

Give the implementing team exactly this:

> Build Step 1 of Omega Forge as specified in `OMEGA-FORGE-ARCHITECTURE.md` and this construction packet. Do not port Vivim. Do not add host code. Do not create an SDK layer. Land the anvil freeze, generality validators, `pack.builder`, `forge-surface` gates, and the self-hosting Author Forge. Wave 0 is complete only when `forge.author.init@1` reproduces `plugins/forge-author/` byte-identical outside explicit authored regions on a real boot, and a hand-edit outside those regions fails with a named diff. Record every hand-fix temptation in the wave evidence file; that count is the Forge backlog.