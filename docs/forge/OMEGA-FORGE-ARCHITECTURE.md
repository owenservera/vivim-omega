# Omega Forge — the builder plugins, and the Vivim port that proves them

**Full architectural design, v2.** Supersedes `OMEGA-PORT-ARCHITECTURE.md` (v1), which
framed the builder tooling as an "SDK." That framing is retired here.

> **Superseded in part 2026-09-20 by D-418 (the v1 substrate call):** the
> round-one boundary table's row 4 (D-418) and the Ollama-pilot ordering
> rationale below are superseded — v1 is fully Chrome master/slave
> (`provider.browser`); no AI-API realization ships in v1. The design
> content (partitions, risk classes, the Builder Contract, the catalog)
> stands. **The measured numbers below are era-true snapshots** (written at
> Wave-0's start): present law is host **1500/1500 flat, zero headroom**
> (B5, D-391) and the **18-spec matrix freeze** (D-391/D-406) — the
> "13 lines of headroom" claims below describe a budget state that no
> longer exists.

Written against `vivim-omega@b8ba57d` (git bundle) and `source-atlas` v2.0 (2,424-file
Vivim inventory), both read in full. Every manifest shape, capability string, risk class
and host capability below was checked against the tree rather than assumed.

---

## Part I — The prompts, verbatim

> * "Attached is the larest full gi bundle omega repo, and a zipped mostly complete documentation of tye current vivim app - i need your help thinking about the proscess design - omega is our go forward infra for vivim"
> * "Zoom out fresh eyes - whats the best approach without thinking of the current plan. And how what are the first two or three first main steps and how do we map from one tothenotger etc given the new omega design we may find novel ways to do what vivim accomplishes but better"
> * "Makes sense, where i am getting stuck is in the partitioning, meaning like how broad or specifc shpuld the canonical first round plugins be, whatsa good boundary design etc"
> * "Makes sense, what other best practices or common sense pragmatic rules or guidelines would you recommebd"
> * "Now, take some more time to think about this conceptually top to bottom"
> * "Now, since we want vivim users to be able to easily build their own plugins - i want to use this massive merger process to natively build the tooling and methods etc so my vision would be that the omega sdk actually be the only tool that ultimately does the full work - within reasonable pragmatic - so there are several fnctikns what i am loosely calling the sdk needs to play here - does that make sense conceptuakky"
> * "Well more than that i think its like hey 'omega i have this application vivim i want you to port in'"
> * "That is the vision i want to use the vivim port as our sdk design lab"
> * "No we are doing multiple things at once, we are porting vivim as that in omega form will be our firt distributed product but while we do it i want tp take advantage and evolve omega and in this casethe plugin builder sdk"
> * "Yes" — confirming two-tier provenance (harvested vs. generic) on packs and plugins, so a future third party can tell what is proven-general from what is still Vivim-shaped.
> * "Generate an md wt my prompts at the top an your fresh comkete interpretation belw" ///////// generate the full architectural design
> * "Now think of the sdk also as having the same plugin shape system as omega, during my porting of vivim i might design toolkits that i will want the sdk to absorbe once proven valuable for example in the source atlas zip folders i sent you there are scripts that helped produce the valuable documentation, stuff like that i would eventuallg want standardized into the sdk as a pkugin"
> * "we are thinking sometig more like the attached" — the **Forge** proposal: kill the SDK as an architectural concept; replace it with builder plugins called Forges, governed by one Builder Contract, with capability risk classes and no privileged developer path.

---

## Part II — The design

### 0. Ground truth, measured

| Fact | Measured | Where |
|---|---|---|
| µhost size | **1,487 / 1,500 LOC** — 13 lines of headroom *(era-true at writing; present law: 1500/1500 flat, zero headroom — B5, D-391)* | `host/src/*.ts`, `gate.ts:55` |
| Capability grammar | `port:<op>@<v>` \| `host.*` — **nothing else parses** | `sdk/src/validate.ts:17` |
| Host capabilities | Exactly **five**: `host.compartment.admin`, `host.journal.append`, `host.tokens.revoke`, `host.state.arbitration`, `host.kernel.lens` | `contracts/src/lifecycle.ts:23` |
| Risk classes | `EXTERNAL_MUTATION` \| `MUTATION` \| `READ` — contract-kind only | `contracts/src/manifest.ts:15` |
| `ProvenanceTier` | **Already exists**: `untrusted \| signed \| verified \| first-party \| system` | `contracts/src/lifecycle.ts:6` |
| Granularity fields | `granularity`, `internalSeams`, `extractionCandidate` + an honesty validator | `contracts/src/manifest.ts` (D-340) |
| Runtime tiers | `worker-thread` \| `process` (ndjson via `vivim.run`) \| `wasm` (forward-declared) | D-374 |
| Ops per plugin | median **3**, range 1–13 | manifest scan, 25 manifests |
| Vivim source | 1,047 src files · 186 flat engines · **201 Prisma models** · 67 store contracts · 30 routers · 37 MCP tools | `source-atlas/L0`, `L1` |
| Existing builder tooling | `tooling/builder`, `tooling/generate` (D-377), `tooling/harvest`, `testkit/conformance`, `tooling/propose` (D-400) | repo |

Two numbers and one collision drive everything below.

- **13 LOC of host headroom.** No part of this may spend host code. Not "shouldn't" — *(era-true at writing; the freeze re-tightened to 1500/1500 flat with zero headroom at the Core Phase — B5, D-391. The rule below stands with zero, not 13.)*
  there is no room.
- **201 → 67 → ~16.** The port is a ~12:1 compression. The work is not moving code; it
  is deciding what collapses into what.
- **`ProvenanceTier` is taken.** See §5 — this forces a better design than the one I
  proposed in v1.

---

### 1. The verdict on the Forge proposal

**Adopted, with three corrections and one addition.**

The core move is right and I'd state the principle more strongly than the attached does:

> **No SDK above Omega. Only Forges inside Omega.**
> A Forge is an ordinary plugin whose ops inspect, shape, emit, prove, or promote other
> Omega artifacts. It has a manifest, requests capabilities in the one grammar, is granted
> by a user-signed recipe, is gated by the same law, journals to the same vault, and
> carries the same provenance. There is no developer path that is not the ordinary path.

Why this is better than "SDK," precisely: an SDK is a layer, and layers acquire
privileges. The moment builder tooling is architecturally distinct, every awkward
requirement — filesystem reach, host hooks, unsigned writes, skipping refusal tests —
has a natural home to be argued into. Forges have no such home. A capability a Forge
needs must be expressible as `port:<op>@<v>` or one of five host caps, or it does not
exist. That constraint is the whole value.

**What I'd keep from the attached, unchanged:** the name (Forges), the Builder Contract,
composition membership as the dev/product boundary, the capability risk classes, CLI as a
derived surface, proposal-only emission, the tiny frozen pre-boot edge.

**The three corrections** (§1.1), and **the addition** (§1.2), follow.

#### 1.1 Corrections against the actual manifest law

The illustrative manifest in the attached would fail `validateManifest` on six counts.
This matters more than pedantry: the Forges are the thing third parties read to learn the
manifest law. A Forge whose own manifest is invented is a tutorial that teaches the wrong
grammar.

| In the attached | Reality | Fix |
|---|---|---|
| `"name"`, `"kind": "plugin"`, `"ops": [...]` | Fields are `id`, `entry`, `publisher`, `contributions{}` | Ops are `contract` contributions: `{kind, id, version, risk}` |
| `"capabilities": ["vault.read", "cas.write", "proposal.write"]` | `CAP_PATTERN` accepts only `port:<op>@<v>` or `host.*`. `cas.write` and `proposal.write` do not exist | `["port:vault.append@1", "port:vault.get@1", "port:law.check@1"]` |
| `"process.spawn"` as a capability | Process-tier spawn is **not** a requested capability — it is `runtime.tier: "process"` + `runtime.process{cmd, stdio:"ndjson"}`, brokered by `vivim.run` (D-374) | Declare the tier, not a cap |
| `"risk": "dev"` | Risk enum is `EXTERNAL_MUTATION \| MUTATION \| READ`, and it lives on each contract contribution, not on the plugin | Map the four classes onto the three — §4.3 |
| `"tier": "harvested"` at top level | `ProvenanceTier` already exists and means something else (trust/signature) | Rename the axis to **`generality`** — §5 |
| `forge.builder@1` as one contract with ops "capture, survey, assay…" | In Omega an op **is** a contract. One contribution = one op | The Builder Contract is a **pack**, not an op — §4.4 |

None of these weaken the proposal. They make it land.

#### 1.2 The addition: the self-hosting falsifier

The attached leaves one question open, and it is the one that decides whether any of this
is real: **what forges the first Forge?**

The answer is the compiler bootstrap, and it comes with the best falsifier in the whole
design:

> **The Author Forge must be able to emit itself, byte-identical.**
>
> `forge.author` is created once by hand (or by today's `tooling/builder`), with its
> command list recorded. Thereafter, running `forge.author.init@1` against its own
> recorded spec must reproduce `plugins/forge-author/` byte-for-byte, excluding regions
> marked `// AUTHORED`. A drift fails the gate with a named diff.

Why this is worth more than it costs:

- It is a **single test that proves the entire concept**. If the Forge that builds plugins
  cannot build itself, the Forges are code generators with good branding.
- It makes the "no privileged path" claim **checkable** rather than aspirational. A
  self-hosting Forge demonstrably used no door a third party lacks — because it went
  through its own door.
- It is **cheap**. You already prove exactly this shape for compositions:
  `omega:generate composition --check` reproduces all 17 specs byte-identical from
  `_matrix.json`, and a hand-edit fails the gate with a named diff. Same harness, new
  target.
- It converts the hardest thing to sustain — dogfooding discipline — from culture into a
  red build.

This replaces v1's "L-PORT / Dogfood Law" with something sharper. The law stands:

> **L-FORGE.** No artifact enters the tree as part of the port except as the output of a
> Forge op, recorded in the ledger and reproducible by replay. If a step needs a human's
> hands, that is a Forge defect — file it, do not patch around it.

With the honest boundary: L-FORGE binds **generated structure** (manifests, package files,
composition entries, namespace rows, test scaffolds, fixtures, record stubs), not
**authored logic** (handler bodies). Humans write the parse rule; the Forge writes
everything around it. `// AUTHORED` regions are excluded from byte-comparison. If you find
yourself wanting to exclude something else, that is the backlog talking.

---

### 2. The reframe that all of this serves

You are not doing three things at once. You are doing **one** thing:

> **Build Omega Forge. Its first and hardest test fixture is Vivim.**

| Migration framing | Forge framing |
|---|---|
| Done = Vivim runs on Ω | Done = Ω can forge an app in, *demonstrated on* Vivim |
| Tooling is scaffolding, discarded | Tooling is the product; Vivim is its proof |
| Hand-fixing a port step is efficient | Hand-fixing a port step is a **bug report** |
| Provenance is bookkeeping | Provenance is the product's honesty contract |

The port pays for the Forges; the Forges pay for the port; and the third party you
eventually sell to walks the exact path you walked, with a ledger showing where it was
rough.

The sentence is now:

> *"Omega, forge this application in."*

---

### 3. Partitioning

#### 3.1 Spend specificity on ops, not compartments

Contracts are expensive — an op rename is amendment-class and ripples into every manifest,
grant, recipe and recorded fixture. Directories are cheap: a plugin splits in one commit
with zero wire change, and the manifest already has first-class support for exactly that
(`granularity`, `internalSeams`, `extractionCandidate`, plus `validateManifestHonesty`
which catches a coarse plugin that declares no seams).

So: **precise op names, coarse plugin bodies with declared seams, extraction scheduled by
measurement.** `kernel.centrality@1` already computes fan-in and blast-radius over the
host graph (defaults fanIn ≥ 5, blastRadius ≥ 20). Run it as a standing per-wave report.
When a coarse plugin's interior crosses the threshold, extraction is scheduled by data,
not by whoever is annoyed by the file size that week.

#### 3.2 The three-axis boundary test

A candidate boundary is admissible as an op iff all three hold. Fail any → merge it into
its neighbour.

1. **Refusable.** You can write one true sentence of the form *"the law may refuse X."*
   No distinct risk class, principal or consent at this edge → it is an implementation
   detail wearing a contract's clothes.
2. **Substitutable.** The implementation could be swapped (SIMULATOR ↔ API_NATIVE ↔
   BROWSER_MEDIATED) with no caller change. If swapping the backend changes the op shape,
   the op leaks its implementation.
3. **Provable.** One recorded fixture decides correct/incorrect without booting the rest
   of the world.

These are not arbitrary: they are the three things Ω actually does — gate, route, verify.
A boundary that does not participate in all three is not a boundary Ω can see.

#### 3.3 The partition invariant: one writer per namespace

The failure mode you are leaving has a name: `CapabilityEventBus` + `service-container` DI
+ `module-registry` + `ProviderRegistry` singleton. All four share one shape — **many
writers, one mutable surface.** That shape re-forms in Ω as "six plugins all appending to
ns `providers`" unless something forbids it.

> **Every vault namespace has exactly one writer plugin. Readers are granted; writers are
> singular. A second writer is an amendment-class event with a decision record.**

It is the cheapest structural rule here and does the most work: it makes the partition
decidable ("who writes the row?" has one greppable answer), it gives a natural plugin-count
target, and it makes the 201-model compression tractable — you are not mapping 201 models
to plugins, you are mapping them to ~16 namespaces and then asking who writes each.

`source-atlas/omega/03-store-vault-mapping.md` already did the hard half: 67 contracts →
16 candidate namespaces, with `WEAK-FIT` and `NEW-NS-PROPOSAL` flags rather than forced
fits. Those flags are the boundary conversation. Resolve them with the one-writer
question, never by fiat.

#### 3.4 Sizing heuristics

Grounded in the measured house shape (median 3 ops, range 1–8, `vivim.agent` at 13 the
outlier that proves the rule):

| Heuristic | Rule |
|---|---|
| Op count | 1–7 routable ops per plugin; 8+ requires a seam declaration |
| Namespace | Exactly one *written* namespace per plugin; zero for lenses |
| Grant co-travel | If two ops can never be granted separately in any realistic recipe, they belong together |
| Risk split | If one op needs two risk classes depending on input, **split the op** |
| Boot phase | One plugin = one stable boot phase |
| Capabilities | >6 requested is a smell; shipped median is 2–4 |
| Pack vs plugin | A **pack declares** (SCHEMA + CONTRACT + POLICY + TEST); a **plugin implements**. Never blur |

#### 3.5 The canonical first round

Resist one pack per Vivim cluster. That is a horizontal partition and horizontal
partitions cannot be falsified — you get twelve half-built layers and no product.

> **Pick the minimum boundary set that makes one vertical slice work end to end, and
> defer everything else explicitly, in writing.**

The slice is your own W5 falsifier: *a person types, a real streamed response comes back
through the law gate, ledgered and queryable.*

**Round one — five boundaries:**

| # | Boundary | Vivim source | Namespace (writer) | Shape | Ops |
|---|---|---|---|---|---|
| 1 | `pack.domain-conversation` | C3 | — (declares) | pack | `chat.open@1` `chat.append@1` `chat.history@1` |
| 2 | `vivim.chat` | C3 impl, `conversation-store`, `stream-block-store` | ns `chat` | coarse; seams `index`, `retention`, `compaction` | implements ↑ |
| 3 | `vivim.providers` | C1+C2 definitions, 16 manifests | ns `providers` | atomic | `providers.list@1` `providers.realize@1` `providers.status@1` |
| 4 | `provider.browser` | C2's streaming pilot — **superseded by D-418**: the pilot boundary is re-pointed; v1 ships no AI-API realization | — (reads) | atomic | `browser.attach@1` · `message.send@1` (D-357's four fail-closed bars) |
| 5 | parser pins (D-355) | C6, 7 harvested parsers | ns `parser` | data, non-routable | — |

**Superseded by D-418 (kept for the record):** the Ollama-over-ChatGPT pilot ordering
was the sequencing era's reasoning — local, no auth quirks, exercises streaming. The
provider table confirmed the alternative was worse — ChatGPT is `BROWSER_MEDIATED`,
`per_account`, fleet ports 9252–9280, CDP selectors that rot; proving the pipeline
against a moving target proves two things at once and learns neither. D-418 re-points
the Wave-1 atom's realization boundary to `provider.browser`: v1 is fully Chrome
master/slave, and the AI-API pilot ordering is void.

**Round two — deferred, named, with triggers:** C1 capability graph (after realization rows
have ≥2 writers) · C2 fleet/governor (after streaming proves out) · C4 memory (after
conversations exist to hang it on) · C5 automation (`vivim.director` holds the seam) ·
C7 resilience (**pattern only**, never a port) · C8 sync (genuinely defer) · C9
observability (`vivim.mind` spine) · C10 canvas (after the HTTP-pointer decision) · C11
config (with the config-schema contribution) · C12 bootstrap glue (**REMOVE**, verify
absent at cutover).

Of Vivim's 12 clusters, **two are REMOVE, three are pattern-only, five are deferred, two
are in round one.** That ratio will feel wrong for a while. It is correct — the 12:1
compression has to show up somewhere, and it shows up here.

---

### 4. Forges

#### 4.1 The catalog

Eight Forges, `plugins/forge-*/`, ids `forge.*`, ops `forge.<area>.<verb>@1`. Directory
uses dashes, ids use dots — the house convention, and `ID_PATTERN` requires it.

| Forge | Ops | Risk class | What it does |
|---|---|---|---|
| `forge.mine` | `forge.mine.capture@1` `forge.mine.verify@1` `forge.mine.diff@1` `forge.mine.list@1` | 1 read / **3 for capture** | Pins a foreign tree into the vault. The one filesystem seam |
| `forge.survey` | `forge.survey.run@1` `forge.survey.render@1` | 1 | Inventory + atlas render over a pinned snapshot |
| `forge.assay` | `forge.assay.run@1` `forge.assay.distill@1` | 1 | Clusters, boundaries, risks; harvest classes; the distillation verdicts |
| `forge.shape` | `forge.shape.map@1` `forge.shape.budget@1` `forge.shape.validate@1` | 1 | Namespaces, op names, plugin boundaries, composition membership |
| `forge.emit` | `forge.emit.plugin@1` `forge.emit.pack@1` `forge.emit.composition@1` `forge.emit.fixture@1` `forge.emit.record@1` | 2 | Generates artifacts into a **provisional** namespace. Proposal-only |
| `forge.proof` | `forge.proof.conform@1` `forge.proof.replay@1` `forge.proof.refusal@1` `forge.proof.parity@1` | 3 | Conformance, byte-replay, refusal paths, parity vs mine fixtures |
| `forge.author` | `forge.author.init@1` `forge.author.draft@1` `forge.author.test@1` `forge.author.compose@1` | 2 | The pleasant path for a new plugin author |
| `forge.tier` | `forge.tier.stamp@1` `forge.tier.promote@1` `forge.publish.docs@1` | 4 | Generality stamping and promotion; docs; packaging |

Op counts: 4/2/2/3/5/4/4/3 — all inside the 1–7 band from §3.4, and all coarse-with-seams
where they exceed 3.

#### 4.2 Risk classes determine the partition

The attached introduced four capability risk classes and then, in its worked manifest,
put capture, survey, assay, shape and emit into **one** `forge-port` plugin. Those two
ideas are incompatible, and the risk classes are the ones worth keeping.

> **A grant is per-plugin, not per-op. Putting a Class-1 op and a Class-3 op in the same
> compartment means one grant covers both.**

Grant `forge-port` the capability to read a foreign tree and it also has the capability to
spawn test processes and write proposals — forever, for every caller, in every composition
that includes it. That is precisely the "many writers, one surface" shape §3.3 forbids,
reintroduced in the tooling layer.

So: **risk class boundaries are compartment boundaries.** No plugin spans two classes.
That single rule produces the eight-Forge partition above, and it is why there is no
monolithic `forge-port` — "port" is a *composition*, not a plugin.

#### 4.3 Mapping the four classes onto the three real risk values

The law gate reads `RiskClass`, which has three members. The four classes must land on
them or they are documentation, not policy:

| Class | Meaning | Declared `risk` | Additional teeth |
|---|---|---|---|
| **1 · Report** | Reads pinned snapshots, emits reports | `READ` | None needed. Safest class to open to third parties |
| **2 · Propose** | Creates artifacts, provisional only | `MUTATION` | Writes confined to ns `proposal` by policy row; boot never reads it (D-400 precedent) |
| **3 · Execute** | Spawns processes, runs tests, touches scratch trees | `MUTATION` | `runtime.tier: "process"` where needed; watchdog budget; `omegaTmp()` scratch only |
| **4 · Govern** | Affects trust: promotion, publication, canonical tree | `EXTERNAL_MUTATION` | Law gate + explicit human signature; never grantable to a non-root principal |

`forge.mine.capture@1` sits at Class 3 despite "reading," because reading a foreign tree
is the single highest-risk act in the system — see §6.1.

#### 4.4 The Builder Pack

The attached proposes `forge.builder@1` as a contract with ops named capture/survey/assay.
In Omega an op **is** a contract, so that shape does not exist. The right vehicle is a
pack, which is exactly what packs are for:

```
packs/builder/            id: pack.builder
  SCHEMA    capture receipt · inventory row · assay verdict · shape blueprint ·
            proposal artifact · proof report · generality stamp
  CONTRACT  the canonical op names + payload/result shapes for all eight Forges
  POLICY    proposal-only emission · read-only capture · refusal test required ·
            generality declared · no forge.* op in a product composition
  TEST      conformance fixtures · refusal fixtures · replay fixtures ·
            second-mine fixtures
```

This is the answer to the attached's §14 danger, and it is a real danger: forty builder
plugins with forty artifact formats and forty proof systems is worse than one monolithic
SDK. The pack is what stops it. A third-party Forge that does not implement
`pack.builder`'s schemas is not a Forge — it is a script with a manifest.

#### 4.5 Compositions, not a layer

Forges are not a new primitive. The model is:

```
Omega Host
  + Plugins        runtime · domain · provider · lens · forge
  + Packs
  + Compositions   product compositions  ← no forge.* ops
                   builder compositions  ← forges only
```

```
compositions/forge-port.json      mine · survey · assay · shape · emit · proof
compositions/forge-author.json    author · emit · proof
compositions/forge-govern.json    tier · proof            (root principal only)
compositions/chat.json            product — asserts zero forge.* ops
```

New gate stage `forge-surface`, mechanically checkable:

| Check | Rule |
|---|---|
| `FORGE_IN_PRODUCT` | no `forge.*` op routes in any product composition |
| `FORGE_CLASS_SPAN` | no plugin declares ops in two risk classes |
| `FORGE_EMIT_SCOPE` | Class-2 ops write only to ns `proposal` |
| `FORGE_NO_REFUSAL_TEST` | every forge op ships a refusal test |
| `FORGE_CONTRACT_DRIFT` | every forge op's shape matches `pack.builder`'s declaration |

#### 4.6 A manifest that would actually validate

Corrected against `parseManifest` + `validateManifest`:

```jsonc
{
  "manifestVersion": "1",
  "id": "forge.emit",
  "version": "0.1.0",
  "description": "Class 2 — generates plugin/pack/composition/fixture/record artifacts into ns proposal. Proposal-only: confers no authority, signs nothing, commits nothing.",
  "entry": "src/index.ts",
  "publisher": { "keyId": "", "signature": "" },
  "contributions": {
    "contract": [
      { "kind": "contract", "id": "forge.emit.plugin",      "version": "1", "risk": "MUTATION" },
      { "kind": "contract", "id": "forge.emit.pack",        "version": "1", "risk": "MUTATION" },
      { "kind": "contract", "id": "forge.emit.composition", "version": "1", "risk": "MUTATION" },
      { "kind": "contract", "id": "forge.emit.fixture",     "version": "1", "risk": "MUTATION" },
      { "kind": "contract", "id": "forge.emit.record",      "version": "1", "risk": "MUTATION" }
    ]
  },
  "dependencies": [
    { "ref": "contract:forge.shape.map@1", "range": "1.x" },
    { "ref": "capability:vault.append",    "range": "*" }
  ],
  "capabilities": {
    "requested": ["port:vault.append@1", "port:vault.get@1", "port:law.check@1"],
    "justification": "Reads the shape blueprint and writes provisional artifacts into ns proposal. Every write is law-gated; nothing is signed; boot never reads ns proposal (D-400)."
  },
  "runtime": { "tier": "worker-thread", "budget": { "cpuMs": 2000, "memMB": 256 } },
  "granularity": "coarse",
  "internalSeams": ["plugin-scaffold", "pack-scaffold", "composition-spec", "fixture", "record"],
  "generality": {
    "level": "harvested",
    "mine": "vivim-final-program@4a5eb84",
    "originPaths": ["tooling/builder/src/builder.ts", "tooling/generate/generate.ts"],
    "harvestClass": "ALGORITHM",
    "evidence": []
  },
  "contentHash": ""
}
```

Note what is *absent*: no `process.spawn` capability (that is `runtime.tier`), no invented
cap strings, no plugin-level `risk`, no `tier` (see §5), no `ops` array.

---

### 5. Two axes of trust: `ProvenanceTier` and `generality`

`contracts/src/lifecycle.ts` already defines `ProvenanceTier = "untrusted" | "signed" |
"verified" | "first-party" | "system"`. Calling the harvested/generic axis "tier" would
collide with it, and worse, would conflate two genuinely different questions.

Keep them orthogonal. Together they are exactly what a third party needs:

| Axis | Question | Values |
|---|---|---|
| **`ProvenanceTier`** (exists) | *Who vouches for this?* | `untrusted` → `signed` → `verified` → `first-party` → `system` |
| **`generality`** (new, additive) | *What has it been proven against?* | `speculative` → `harvested` → `generic` |

A first-party plugin can be harvested. An untrusted third-party plugin can be generic.
Neither implies the other, and a reader who is only shown one of them is being misled.

#### 5.1 The generality levels

| Level | Meaning | Entry | Exit |
|---|---|---|---|
| **`speculative`** | Designed; no consumer yet | A decision record | A real caller, or deletion |
| **`harvested`** | Derived from a pinned mine; app-shaped; generality unproven | `mine@sha` + `originPaths[]` + `harvestClass` | Generality evidence |
| **`generic`** | Proven general | **≥2 independent consumers**, one not derived from the same mine — *or* conformance green with the mine-specific fixture removed | Demotion if the second consumer disappears |

`speculative` exists because your own architecture notes diagnose the condition: *"the
system now has names for at least four things with no runtime behind them."* That state
deserves a name rather than hiding inside `harvested`. Promotion is a decision record,
never a flag edit. Demotion is legal and expected — these are claims about current
evidence, not achievements.

#### 5.2 Gate teeth

New validators in `sdk/validate.ts` (or wherever the pure validator layer lands, §6.2):

| Code | Rule |
|---|---|
| `GEN_LEVEL_MISSING` | every plugin and pack declares a generality level |
| `GEN_MINE_UNPINNED` | `harvested` requires `<repo>@<sha>` and non-empty `originPaths` |
| `GEN_UNPROVEN` | `generic` requires ≥2 resolvable evidence refs |
| `GEN_SPECULATIVE_STALE` | `speculative` with a live caller must be promoted; with no caller after N waves, deleted or re-recorded |

#### 5.3 What the reader sees

`forge.publish.docs@1` and `omega plugins` emit both axes, in plain words:

```
pack.domain-conversation    first-party · generic
  Proven against Vivim and the synthetic second mine.

forge.emit                  first-party · harvested
  Shaped by one application (vivim-final-program@4a5eb84). May not fit yours.

com.example.notion          signed · speculative
  No independent consumers yet.
```

That is the single most valuable sentence an ecosystem can print, because it is the one
thing documentation systematically lies about.

#### 5.4 The recursion, and the cheap way out

The Forges are subject to their own rule. A Forge that has only ever run against Vivim is
**harvested**, whatever it claims. Waiting for a real second customer means everything
stays harvested for a year.

> **Build a synthetic second mine early.** A small, deliberately un-Vivim-shaped toy
> application — different idioms, different persistence shape, no capability graph, no
> CDP, ~40 files. Check it into `fixtures/mines/`. Run every Forge against it every wave.

Cost: about two days. Return: every Forge gets an honest genericity verdict continuously,
and the ones that only work on Vivim announce themselves loudly instead of quietly. This
is the highest value-per-hour item in the design and the one most likely to be cut. Do
not cut it.

---

### 6. Forge mechanics

#### 6.1 Forges read captures, not filesystems

This is the design problem that makes builder plugins non-obvious, and the answer is
already in your tree.

`build-atlas.ts` walks a directory with `readdirSync`. A compartment cannot: B2 gives it
no shared heap, `platform/` is the only OS-aware module, and the `os-surface` gate fails
any `/tmp/` literal or `process.platform` branch in plugin source. So either Forges get a
filesystem capability — a backdoor wearing a helpful face — or something else happens.

The something else already exists, for web pages:

> `discovery.perceive@1` loads a captured page, **appends the bytes to the vault as an
> evidence object**, then works on the vault copy, citing byte spans into it.

Apply it verbatim to source trees. **A codebase is a capture.**

```
  foreign tree on disk
      │
      │  forge.mine.capture@1     ← the ONE filesystem seam. Class 3. Platform-mediated.
      │                             Read-only by construction. Content-addressed.
      ▼
  ns `mine` : <repo>@<sha>        ← pinned snapshot + receipt
      │
      ├─► forge.survey.run@1      pure: snapshot → inventory
      ├─► forge.survey.render@1   pure: inventory → atlas markdown
      ├─► forge.assay.run@1       pure: inventory → harvest-classed boundaries
      ├─► forge.shape.map@1       pure: assay → blueprint
      └─► forge.emit.*@1          pure: blueprint → provisional artifacts
```

Everything after the capture is a **pure function of pinned bytes**. That buys:

- **Determinism structurally**, not by convention — the property `build-atlas --check`
  currently implements by hand.
- **Forges testable with no filesystem.** A fixture snapshot runs the whole chain on
  `FakeHost`.
- **Evidence spans that resolve.** The atlas's "every cell cites a line" becomes a
  `casRef` with byte offsets into pinned content.
- **One auditable FS seam** instead of N tools each with their own reach.

`forge.mine.capture@1` is therefore the most dangerous op in the system. Its contract:
refuses unpinned trees · refuses paths outside the declared mine root · refuses symlink
escape · read-only, never writes to the mine · emits a receipt (what was read, when, at
what hash) · supports replay. It is one op and it stays one op, in one plugin, in one
risk class.

#### 6.2 The pre-boot edge

Some things cannot be Forges, because they run *before* a host exists to route through.
You cannot boot a composition to validate the manifest of the composition you are booting.

The irreducible set: `parseManifest`, `validateManifest`, `signPluginDir`,
`contentHashDir`, `createPortClient`. Five functions. Pure, zero-boot, no manifest of
their own.

The attached suggests `omega-seed`. I'd push back gently on that specific word: "seed"
implies growth, and the one property this layer must advertise is that it does not grow.
If the metaphor is forges, the thing every forge strikes against and none of them reshape
is the **anvil**. `omega-anvil` signals immovable, which is the actual requirement. Name
is yours; the property is not negotiable:

> **The anvil gets a frozen LOC budget with remove-to-add, hard-gated, exactly as B5
> freezes the host.**

The host survived "just one more thing" pressure for one reason: the number was a wall.
Without a wall, every awkward Forge requirement gets argued into the pre-boot layer "just
for bootstrapping" until it is the SDK again and the Forge shape is decorative.

#### 6.3 Forges can be written in any language

`RuntimeTier` is already `worker-thread | process | wasm`, and `ProcessRuntime` already
specifies `cmd[]` + ndjson stdio + credentialRefs, brokered by `vivim.run` (D-374). A
Python analyser, a Rust parser, a shell pipeline — each is a `process`-tier Forge with a
manifest. **Nothing needs to change to absorb a toolkit written in another language.**

Worth stating loudly to contributors, because "plugin" reads as "TypeScript module" to
most people, and that misreading will cost you Forges.

#### 6.4 Absorption: scratch → canonical

Your original ask — *build a thing during the port, standardize it once proven valuable* —
needs explicit stages, or useful scripts either get absorbed too early (ceremony kills
experimentation) or never (the tree fills with orphan scripts nobody trusts).

| Stage | Lives in | Must satisfy | Gets |
|---|---|---|---|
| **S0 Scratch** | `tooling/scratch/` | **Nothing.** No manifest, no gate, no promises | Freedom. This stage exists so experimentation is cheap |
| **S1 Candidate** | `plugins/forge-*`, in **no** composition | Manifest · generality block · determinism test · conformance fixture · one risk class · `pack.builder` shapes | Gate coverage, a name, a version |
| **S2 Absorbed** | joins a `forge-*.json` composition | A `cli` contribution · generated docs · a real caller (D-332) · refusal test | Ships; appears in `omega forge --help` |
| **S3 Generic** | same | Proven on the second mine, or ≥2 independent consumers | The `generic` badge |

**The S1 bar**, all mechanically checkable: deterministic (same bytes in, byte-identical
out, twice) · pure past the capture · one op per boundary (§3.2) · one risk class (§4.2) ·
fail-closed with a named refusal · generality declared · refusal tested.

**The scratch expiry rule.** A script in S0 referenced by two or more waves must be
promoted to S1 or deleted. The gate can check it, since waves cite their tooling in
evidence files. Without this, S0 becomes where load-bearing infrastructure hides without
tests — the exact condition you are migrating away from.

**Defend S0.** It requires nothing on purpose. Absorption ceremony applied too early kills
the experimentation that produces things worth absorbing.

#### 6.5 Worked example: your two atlas scripts

`source-atlas/` ships two tools that are already closer to the bar than most house
tooling — you have been writing to this standard without a name for it.

**`compact-atlas.ts`** (17.8 KB): deterministic ordering; every file embedded verbatim
with CRLF normalised; per-file bytes/lines/SHA-256 in a manifest so any truncation is
detectable; collision-guarded sentinels built via `repeat()` so the file cannot collide
with itself; and `--verify` round-trips the bundle back to disk content and fails on any
mismatch.

That last property deserves the callout: **`--verify` is the L-FORGE replay falsifier in
miniature, independently invented.** You wrote a zero-data-loss proof for a documentation
bundle before there was a law requiring port artifacts to replay byte-identical. That is
evidence the discipline is native rather than imposed, and it makes this script the
obvious first absorption.

| Script | S1 verdict | Gap | Lands as |
|---|---|---|---|
| `compact-atlas.ts` | passes 5 / 7 | FS walk needs the capture seam; no refusal test | `forge.survey.bundle@1` · `forge.survey.bundle.verify@1` (Class 1) |
| `build-atlas.ts` | passes 4 / 7 | FS walk; **does two jobs in one entry point** — inventory *and* markdown generation | split: `forge.survey.run@1` · `forge.survey.render@1` (Class 1) |

The `build-atlas` split is §3.2 in miniature: inventory and render fail the
substitutability axis while fused — you cannot swap the renderer without touching the
walker. Split, they land in **different generality levels**: `forge.survey.run@1` is
almost certainly `generic` (every codebase has files, headers, exports), while
`forge.survey.render@1` stays `harvested` for a while because its output shape is
opinionated about what a Vivim-scale atlas should look like. Two levels inside one former
script — exactly the resolution the axis exists to express.

#### 6.6 Forges are the ecosystem on-ramp

Class-1 Forges are the **lowest-risk third-party contribution you can accept**:
READ-dominant, running against pinned snapshots rather than live systems, blast radius of
a wrong report, correctness checkable by replay. Compare accepting a third-party provider
plugin, which wants credentials and network.

So open the ecosystem here first. `omega add forge-<x>`, both axes shown, conformance run
locally before trust. Contributors learn the manifest, the capability grammar, the
conformance ceremony and the generality discipline on something where a mistake costs a
bad markdown file — and the ones who graduate are qualified to write runtime plugins.

---

### 7. The first three steps

#### Step 1 — The anvil, the Builder Pack, and self-hosting

*Two or three decision records, zero host LOC.*

- Freeze the pre-boot edge at a budgeted LOC wall (§6.2).
- Land `pack.builder`: schemas, contract shapes, policy rows, test fixtures (§4.4).
- Land the additive `generality` block + the four validators (§5.2).
- Land `forge.author` and the **self-hosting falsifier** (§1.2).
- Land the `forge-surface` gate stage (§4.5).

**Falsifier:** `forge.author.init@1` reproduces `plugins/forge-author/` byte-identical
from its recorded spec, excluding `// AUTHORED` regions. Hand-edit one generated line →
gate red with a named diff.

**Hands to Step 2:** a proven emission path and the ledger shape its evidence lands in.

#### Step 2 — The vertical slice, emitted only by Forges

Run `compositions/forge-port.json` against the real mine for the five round-one boundaries
(§3.5). Every artifact carries both provenance axes. Every artifact was emitted by a Forge
op, reviewed, and signed by a human.

**Falsifier (already written, W2 + W5):** one fixture-recorded message through its
realization — law-gated, streamed, ledgered, mind-queryable. Plus: `forge.proof.replay@1`
green for all five boundaries.

**The measurement that matters:** count every time you want to reach in and fix something
by hand. That count **is** the Forge backlog, and it is worth more than the slice. Keep
the tally in the wave's evidence file.

**Hands to Step 3:** a working pipeline and a measured defect list.

#### Step 3 — Extract the generic half

Run the identical composition against the synthetic second mine (§5.4).

- Survives unchanged → promote `harvested` → `generic` by decision record.
- Breaks → the honest Forge backlog, now named per component.
- Unreachable without Vivim-specific assumptions → stays `harvested`, labelled, shipped.
  Harvested is not a failure state; an unlabelled one is.

**Falsifier:** the second mine reaches `forge.proof.conform@1` green on at least one
boundary, using only ops the Vivim port also used.

**Output:** the first genuinely third-party-ready surface, plus a generality map of your
own tooling. This is where "Vivim users can build their own plugins" stops being a plan
and becomes a measured claim.

```
Step 1 defines the shape of evidence      →  schema
Step 2 produces the first complete row    →  instance
Step 3 proves the row generalizes         →  law
```

Each step's output is strictly the next one's input. None can be run early or skipped, and
each fails loudly. Same structure as your existing wave discipline, applied one level up —
to the tooling rather than the features.

---

### 8. Operating rules

1. **Contracts are expensive; directories are cheap.** Spend care on op names.
2. **One writer per namespace.**
3. **One risk class per compartment.** Grants are per-plugin.
4. **Every new name ships with producer + reader + test, same commit** (D-332). No export
   with zero call sites — the specific cure for "vocabulary leads implementation by a wave."
5. **Coarse plugins must name their seams.** `validateManifestHonesty` already catches the
   lie.
6. **Fixtures before code. Recorded only, never live network.** Byte-identical across two
   runs, hash-pinned; the parse must be a pure function of the bytes.
7. **Every op ships its refusal test.** The refusal path is the product.
8. **Bulk import is always refused.** File-by-file admission with a reviewer-checkable
   reason.
9. **Vendor with a provenance header; never import across plugin dirs.** B2 held against
   a large generated batch that tried three ways to violate it, because the tests boot
   real compartments.
10. **Measure before optimizing; revert what measures slower.** House precedent: the
    `liveRefs` prefilter was landed, measured slower, reverted.
11. **Emission confers no authority.** D-400 for recipes; identical posture for code.
12. **Supersede, never edit.**
13. **A port step that needs hands is a bug, not a task.** File it in wave evidence, work
    around it, fix the Forge next wave. Do not normalize the workaround.
14. **No wave starts before the prior falsifier is green on a real boot.**
15. **Refuse a namespace you cannot name a retention rule for.** 201 models became 16
    namespaces because someone decided what to forget.

---

### 9. Risks

| Risk | Signal | Mitigation |
|---|---|---|
| **Pre-boot edge creep** | "It belongs in the anvil, it's just bootstrapping" | Frozen LOC budget, remove-to-add, hard gate (§6.2) |
| **Capture becomes general FS access** | A second op wants to read a tree | One op, one plugin, one class; refuses unpinned trees and root escapes (§6.1) |
| **Forge sprawl without a contract** | Forty Forges, forty artifact formats | `pack.builder` + `FORGE_CONTRACT_DRIFT` (§4.4) |
| **Class span** | One Forge requesting both read-tree and spawn | `FORGE_CLASS_SPAN` gate (§4.5) |
| **Dev tools in product runtime** | A `forge.*` op routes in `chat.json` | `FORGE_IN_PRODUCT` gate |
| **Vocabulary outruns implementation** (your G1) | Contracts with readers, no writers; `deriveRegistry()` typed, zero callers | `speculative` level + D-332 + `GEN_SPECULATIVE_STALE` |
| **Forges only ever work on Vivim** | Every Forge's only test is the Vivim mine | Synthetic second mine (§5.4) — highest leverage item here |
| **Host creep under port pressure** | Any `host/src` diff | 13 LOC headroom, hard gate (era-true at writing; present law: 1500/1500 flat, zero headroom — B5, D-391). The constraint is physical |
| **Coarse plugins never extracted** | Seams declared, never cut | `kernel.centrality@1` as a standing per-wave report |
| **Ceremony kills experimentation** | Nobody writes scratch tools any more | S0 requires nothing. Defend it (§6.4) |
| **Doc drift** | `AGENTS.md` says host 1,100; gate enforces 1,500. D-370 says 16 compositions; there are 17 | Derive doc numbers from gate constants; re-amend or reduce. Silent drift in a *freeze* erodes every other freeze |

---

### 10. What "better than Vivim" means

The port is not a reimplementation. It is a **re-expression under refusal** — the same
capabilities, restated where each one can be denied, substituted and audited. Five things
get strictly better, stated as product claims:

1. **Providers become substitutable instead of singular.** Sixteen manifests, three with
   code, one `ProviderRegistry` singleton → N competing, comparable, revocable
   realizations, each verified before promotion, each stamping `realizationRef` on every
   row it produces.
2. **Language becomes deterministic-first.** ~70 NLCL files across two trees → rules and
   lexicon *data* plus one shared classifier. The LLM never sits in the parse path; it
   takes the ambiguous tail, with confidence attached, never silently.
3. **Memory becomes one vault.** 201 models across two databases → ~16 namespaces with
   owner, writers and retention declared in the same commit as the row.
4. **Provenance becomes constitutional, on two axes.** Every row cites evidence; every
   artifact declares who vouches for it and what it has been proven against.
5. **Surfaces come from one derivation.** CLI, MCP, daemon, web all fall out of
   `surfaceOpMeta`. The Next.js app becomes a client, not a second implementation.

And the sixth, which is the reason for the other five: **the path is reusable.** After
Vivim, the answer to "can Ω host my application?" is a composition, a ledger and two
badges — not a consulting engagement.

---

### Appendix A — Vivim cluster → Ω landing → round-one generality

| Cluster | Landing | Round | Initial generality |
|---|---|---|---|
| C1 capability graph | ns `capability`, `vivim.providers` | 2 | harvested |
| C2 provider fleet + Chrome | `provider.browser`, ns `fleet` | 1 defs / 2 runtime | harvested |
| C3 conversation + streaming | `pack.domain-conversation`, `vivim.chat`, ns `chat` | **1** | harvested |
| C4 memory + knowledge | ns `memory` | 2 | harvested |
| C5 workflow + automation | ns `automation`, `vivim.director` | 2 | harvested |
| C6 parsing + onboarding | D-355 parser pins, discovery engines | **1** (pins) | harvested → generic candidate |
| C7 resilience + trust | `vivim.law` + watchdog | pattern only | generic |
| C8 sync + P2P | ns `sync` | deferred | speculative |
| C9 observability | `vivim.mind` spine | 2 | generic candidate |
| C10 canvas + UI | surface contributions | 2 | harvested |
| C11 config + reprogrammability | `vivim.director`, config contributions | 2 | generic candidate |
| C12 bootstrap glue | **REMOVE** | verify absent at cutover | — |

### Appendix B — Terminology migration

| v1 term | v2 term | Why |
|---|---|---|
| The SDK | **Omega Forge** / Forges | No layer, therefore no privileges |
| `@vivim/omega-sdk` | the **anvil** (pre-boot edge) + `pack.builder` + `forge.*` plugins | Five pure functions, frozen; everything else is a plugin |
| L-PORT / Dogfood Law | **L-FORGE** + the self-hosting falsifier | Same law, now with a single test that proves it |
| `provenance.tier: harvested\|generic` | `generality.level: speculative\|harvested\|generic` | `ProvenanceTier` already exists and means trust, not generality |
| "port pipeline" | `compositions/forge-port.json` | It is a composition, not a program |
| `port.mine.capture@1` | `forge.mine.capture@1` | Namespace consistency |

### Appendix C — This week

1. Fix the two doc drifts (host budget 1,100 vs 1,500; composition freeze 16 vs 17). A
   freeze everyone knows is stale stops being a freeze.
2. Write the L-FORGE record and the additive `generality` block.
3. Build the synthetic second mine. Two days; it changes what every later claim means.
4. Stand up `pack.builder` with the schemas for capture receipt, inventory row, assay
   verdict, shape blueprint, proposal artifact, proof report, generality stamp.
5. Land `forge.author` **with the self-hosting falsifier**. This is the keystone — until
   it is green, everything else is a claim.
6. Absorb `compact-atlas.ts` as the first S1 candidate (§6.5). It already passes five of
   seven criteria; the only real work is the capture seam. Cheapest possible proof the
   absorption pipeline is real, and it retires a script you depend on.
7. Migrate the CLI's hand-coded `msg send|list|search` sugar into the email pack's own
   `cli` contribution. It is the last privileged built-in, and a third party will check
   exactly this to see whether the house plugins get a private door.
