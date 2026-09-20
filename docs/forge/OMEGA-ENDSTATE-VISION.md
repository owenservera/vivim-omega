# OMEGA ENDSTATE VISION — Vivim Ω: The Sovereign Canvas

> **North star for the ideal end product.** Vivim as inspiration; Ω as muse.
> Adopted by **D-407** (directive). **Precedence:** this document *extends*
> `OMEGA-FORGE-ARCHITECTURE.md` / `_plus.md` — where they conflict, they win;
> where the gate and this document disagree, the gate wins. It is a direction,
> not a backlog: every claim below lands through a wave, a falsifier, and a
> decision record — or it does not land.
>
> **Corpus (stored for all future rounds under `/home/z/my-project/reference/`):**
> two strategic chat exports (`chats/`), the vivim docs bundle (`vivim-docs/`,
> incl. the manifesto and vivim-next MASTER-SPEC), the source atlas
> (`source-atlas/`, L0–L4, 2,424-file inventory), and the full Vivim tree
> (`vivim-full/`; re-measured 2026-09-20: 1,043 src TS files · 186 flat
> engines · 30 routers · 201+ Prisma models · 16 provider manifests ·
> ProviderRegistry singleton · v1 execution substrate = Chrome master/slave).

---

## 0 · The one sentence

> **A local-first operating environment whose visible face is an infinite canvas, where every object is a live, capability-scoped composition — backed by real sessions, healed when the world changes, stamped with provenance you can see — and buildable by anyone who can describe what they want.**

The canvas is the visible half. The product is the invisible half — refusal, proof, provenance, memory, healing, self-extension. The canvas is only its most faithful projection. That single inversion is the difference between this and every "AI canvas" that will ship this decade: those are drawing surfaces with a chatbot stapled on; this is a constitutional kernel with a spatial projection. Remove the canvas and the system still runs, headless and complete. Remove the vault, the law, and the compositions and there is nothing left to project.

---

## 1 · The shift that makes it possible

We are done with archaeology. The old tree is not reconciled, preserved, or mourned — it is *measured*, and the measurement is already banked: the atlas (L0–L4, the provider pilot table, the 137-file NLCL verdicts, the 67-contract store→vault mapping) is the assay input, and the pain it documents is the requirements list. The old Vivim is the first **mine** — the ore the Forge proves itself against — never the blueprint.

- **Vivim as inspiration** — the problems it solved are real and measured: browser-mediated providers with rotting selectors, a singleton registry nobody could substitute, 201 models nobody could name owners for, four hand-built surfaces nobody could keep in parity, docs that drifted from the code they described. That pain is the left column of the 100x table (§11) and it is *load-bearing*.
- **Ω as muse** — the principles that answer it: refusal-first, provenance as the honesty contract, the Forge as a role not a toolkit, no privileged path for anyone (including us), and the event as the atom everything else orbits.

The dream is not a port. **The dream is what the port pays for.** Wave 0 already proved the sharpest tool in the shed: a Forge that emits itself, byte-identical, on a real boot, and refuses to lie about a single hand-edit. Every paragraph below is that same discipline, pointed at the product.

---

## 2 · The philosophy — the Sovereign Mirror, held

The old Vivim manifesto named the Mirror Paradox: AI is a mirror of humanity, but the hands holding the glass built it from harvested attention and sold-back personal data — making every user a technically free, practically captive participant in their own reflection. The vision documents answered with "digital self-determination." Ω answers with *architecture*, because intent without architecture is a wish:

- **Local-first, network-optional.** The kernel boots hermetic; network is a plugin capability, never a boot assumption. There is no account, no login server, no telemetry, no attention metric anywhere in the product's shape.
- **The mirror in the user's hands.** External intelligence (ChatGPT, Claude, Gemini, DeepSeek, Qwen, Ollama, Grok) connects as **substitutable, revocable realizations** — each verified before promotion, each stamping `realizationRef` on every row it produces. The user can pull any one of them like a plug.
- **Memory belongs to its owner.** One vault, append-only, content-addressed, with a named retention rule for every namespace and a sole writer for every row. Nothing is remembered that cannot be named, audited, or refused.
- **Honesty is the differentiator.** Documentation systematically lies about what is production-ready. This product *prints the truth* — on every tile, in plain words, from data that cannot be hand-written.

The business of this product is the user's sovereignty. That is not a slogan; it is the reason the refusal gate, the provenance stamps, and the generality labels exist at the kernel's edge rather than in a settings page.

---

## 3 · The core inversion (constitutional)

```
WRONG MODEL (how every similar product dies):
   Canvas → widgets → each widget talks to some service → state in React
   (the canvas is the product; everything else is plumbing)

END-STATE MODEL:
   Ω Kernel → Vault → Law → Plugin → Composition → Evidence → Forge → Surface
   (the machinery is the product; the canvas is one projection of it)
```

| | Visible half | Invisible half |
|---|---|---|
| **What it is** | Infinite canvas, live tiles, spatial memory | Kernel, vault, law, compositions, evidence, forge, healing |
| **Fails how** | Canvas becomes the product, state leaks into the renderer, tiles go stale | Provenance invisible, healing unproven, refusals opaque |
| **Design rule** | The canvas is a *projection with no authority* | The machinery is *constitutional* and canvas-agnostic |

**Falsifier of this section (F1):** the system is fully usable with zero pixels. CLI, MCP, and daemon answer every question the canvas could render — the canvas makes it *legible*, never *alive*. Spatial state is vault data (`ns canvas`), not renderer state, so the layout survives the app, the device, and the decade.

---

## 4 · The atom — the law-gated, provenance-stamped event

Strip every layer away and one thing remains, because removing it removes the product itself:

> **A single conversation event.** *"This turn happened. Through this realization. Gated by this law. Vouched for by this principal. With this retention. Citing this evidence."*

Everything else orbits it: surfaces **present** the event; providers **produce** it; engines **shape** it; automation **sequences** it; memory **accumulates** it; the capability graph **attributes** it; the law **gates** it; provenance **stamps** it. The W5 falsifier states it as one bite — *a person types, a real streamed response comes back through the law gate, ledgered and queryable* — and that sentence is the exit gate of the very next wave.

Three contract shapes hold from the first row (cheap now, a migration each later):

1. **Refusals are sentences.** Every refusal payload carries `{ code, sentence }` — the system says no *out loud, in a sentence a human understands*, rendered as an ordinary boring event. A stack trace is a bug; a sentence is a product.
2. **Ledger rows answer "why."** Every row cites evidence (refs with byte offsets) and a reason. "Why does this work this way?" is a *query*, not an archaeology project.
3. **Both badges on every row, from row one.** `ProvenanceTier` (who vouches) × `generality` (what it has been proven against) are stored together on every realization/artifact row from the first write. Pixels come later; data that never existed without its badges cannot retroactively grow them.

---

## 5 · The live object — the 5-tuple, and the four choicepoints resolved

The atom of the *spatial* half is the live object (the tile). It is a **5-tuple**, nothing more:

| Field | Meaning | Lives in |
|---|---|---|
| **identity** | stable across sessions, devices, and upgrades | the object model |
| **composition** | the running, signed, capability-scoped thing | `compositions/` |
| **vault binding** | where its state is, who writes it, retention | `ns <domain>` |
| **spatial placement** | position, size, z-order, zoom — versioned, restorable, synced | `ns canvas` |
| **provenance badge** | who vouches · what it is proven against | both axes, on the row |

A tile is *live* because a real composition runs underneath it — a real logged-in Gmail session in a Chrome instance the user never sees — streaming rows into the vault, and the tile re-renders when the vault changes. **The tile never polls. It observes.** The four open choicepoints from the end-state design are resolved here (directive D-407; each resolution owes its falsifier to the wave that builds it):

### CP-1 · The object-model substrate

**Decision: the vault watch is the substrate. CRDT is a merge discipline folded over the log — never a second source of truth.**
The authoritative object graph is a fold over the append-only vault log (event-sourced). Multi-device sync syncs *vault facts*, never derived state. Inside `ns canvas`, placement updates carry CRDT semantics (per-object last-writer-wins registers; commutative placement ops), so concurrent edits from two devices merge deterministically when logs reconcile. Yjs/Automerge-style engines may appear as *payload shapes inside namespace rows*; the ledger itself stays one vault, sole writer per namespace, append-only, retention-named. **Why not CRDT-as-substrate:** it would put a second truth beside the vault, and Ω's constitution has exactly one.
*Falsifier owed (canvas wave): two devices diverge → logs reconcile → both converge to identical layout, zero lost non-spatial rows, one named merge record in the ledger.*

### CP-2 · Where tiles execute

**Decision: trust-tiered execution — first-party at `worker-thread`; every user-forged tile at `process` (ndjson via `vivim.run`) under watchdog budget and capability grants; `wasm` is the sealed endgame tier, forward-declared until a real tile earns it.**
Nothing user-forged ever shares the primary runtime. The anvil never grows a line for tile execution — the process tier already exists (D-374) and the supervisor already restarts-or-stops-loud (D-397). Sandboxing is not a feature we add; it is a refusal we inherited.
*Falsifier owed (tile wave): a forged tile that infinite-loops is killed by the watchdog with zero host LOC and a named refusal; a forged tile touching an ungranted capability is refused — with a sentence.*

### CP-3 · Spatial state ownership

**Decision: `ns canvas` is first-class vault data. Sole writer: the canvas surface plugin. Retention: versioned, restorable snapshots. Rows reference object identity — they never duplicate object state.**
This is what makes layout *forge-able*: diffable, replayable, healable like any other row, and "remembers exactly where you left everything, across devices" falls out of the vault being append-only and synced — it is not a sync feature, it is a consequence.
*Falsifier owed: delete the canvas app → reinstall → layout restored exactly from the vault; a layout write from any writer but the canvas surface is a named refusal.*

### CP-4 · The first forgeable tile

**Decision: a local, provider-free, vault-backed tile first — the Ω Ledger Lens** ("show me what happened, live": a live query over the vault as a tile). It exercises the full 5-tuple, vault-watch liveness, the law gate, the badge lifecycle (`speculative` → `harvested`), and the consent surface with **zero external rot**. The healing-loop provider tile (Gmail-style) is deliberately *second*: prove the substrate before the storm. A canvas that cannot survive without a browser fleet has no substrate at all.
*Falsifier owed: a non-programmer forges the Lens from one sentence, consents in one tap, sees live data with both badges; kill the canvas and the CLI answers the same query.*

---

## 6 · The stack, instantiated

| Layer | Ω role | End-state realization | Compresses (measured, old Vivim) |
|---|---|---|---|
| **Kernel** | boot, capability ABI, refusal | the anvil (sdk 856/860, host 1500/1500 — both frozen flat) | C12 bootstrap glue → **removed** |
| **Vault** | append-only, CAS, retention | **one vault, ~16 namespaces**, owner/writers/retention per row; `ns canvas` included | 201 Prisma models across 2 DBs · 67 store contracts |
| **Law** | consent, refusal, policy | `vivim.law` gates every streamed response; refusal = sentence | C7 resilience/trust — pattern, not code |
| **Plugin** | capability-scoped unit | providers, domain, lens, and **forge** plugins — realization rows, never singletons | 186 flat engines · 16 manifests · ProviderRegistry |
| **Composition** | signed, running set | **every tile is a composition**; no product composition carries `forge.*` | — |
| **Evidence** | ledger, replay, proof | every row cites evidence; L-FORGE replay discipline | 2 databases → 1 ledger |
| **Forge** | the role that builds plugins | self-extension + healing at two scales; third-party Forges through the same door | the tooling-absorption pipeline |
| **Surface** | derived, never hand-built | **one `surfaceOpMeta` derivation** → canvas, CLI, MCP, daemon, web | 30 routers · 37 MCP tools · CLI · Next.js (4 divergent surfaces) |

The old tree kept four hand-built surfaces in parity by discipline; Ω keeps N derived surfaces in parity by *construction*. That single line is worth more than any port.

---

## 7 · A day on the Sovereign Canvas

The end state is easiest to see as one day in the life of five people who have never read a line of our code.

**Morning — Alice becomes an extender in nine seconds.** She needs a tile of her GitHub PRs filtered by a label she just invented. She doesn't know TypeScript. She right-clicks the canvas and *says* what she wants. The system proposes a tile — what it does, what it can access (her GitHub, read-only), what it has been proven against (**nothing yet; the badge says `speculative`**), who vouches (her local signature). She taps **"Yes, forge this."** The tile appears, live, pulling real data from her session. Three days later someone forks her tile, adds a CI-failing filter; the system proposes the upgrade; she approves; the badge has begun to earn `harvested`. *The gap between "user" and "extender" never existed — it was a door, and the door is gone.*

**Midday — Bob's provider heals itself.** Gmail redesigns; his inbox tile breaks. The system detects drift against the **canonical shape** (roles, structure, states, transitions — not selectors), runs the loop — observe, detect, propose, prove — and *asks*: "Gmail changed. Here is the repair, here is the proof. Approve?" Bob taps approve; the tile is v2; the badge now reads *proven against Gmail v1 and v2*; the repair publishes as a harvested Forge and someone else's Gmail tile quietly offers the same upgrade. *Nothing auto-healed into production unreviewed. The quietness is UX; the authority is never quiet.*

**Afternoon — Carol's Forge builds plugins.** Carol ships `forge.notion-toolkit`, a Forge whose purpose is helping people build Notion plugins. Dave installs it — the badge says `third-party · speculative · no independent consumers yet`, plainly. Dave asks it for a Notion database tile; it proposes; he consents; it runs. When Notion changes their API, *her* Forge detects, proposes, proves, and Dave ratifies. Her Forge's badge begins to earn. *A Forge built Forges. Depth-N self-extension, through the exact same door as `forge.author` — no privileged path, refusal tests required, emission conferring no authority.*

**Evening — Eve never opens the canvas.** She forges a legacy app from the CLI — capture, assay, propose, sign, execute, prove — and gets a composition, a ledger, and two badges. Then she asks the vault: *show me all rows written by providers in the last 24 hours.* The vault answers. *Headless completeness is not a fallback mode; it is the proof that the canvas is a projection.*

**Night — Frank asks "why?"** A tile behaves strangely. He opens its provenance: the three plugins it composes, each badged; the composition forged by `forge.author` on such a date; three healings (Gmail v1→v2→v3) each with its diff, proof report, and signature; `provider.llm-ollama` shown as `harvested`, shaped by Vivim; the synthetic second mine shown for what it is — a 42-file app that deliberately resembles nothing. *Every level of "why?" has an answer, and the answer is a row, not a memory.*

---

## 8 · The capability map (ten verbs, one object each)

| Capability | The sentence it makes true |
|---|---|
| **Forge anything** | any object from a description — "show me my PRs with label X" → tile |
| **Heal anything** | any provider survives the world changing under it |
| **Extend anything** | any plugin can build plugins — the role is open to all |
| **Badge anything** | every object shows who vouches and what it is proven against |
| **Refuse anything** | the system can say no, out loud, in a sentence |
| **Query anything** | every row is queryable with evidence |
| **Sync anything** | spatial state, object state, provenance — across devices |
| **Replay anything** | every decision is replayable from the ledger |
| **Promote anything** | anything earns a better badge by being *proven*, not claimed |
| **Demote anything** | anything that breaks is demoted — labels can fall, loudly |

---

## 9 · The healing loop — the Forge turned outward

The deepest identity in this architecture: **provider self-healing and application forging are the same pipeline at two scales.** There is no second "healing engine" to build, and that is a *feature* — if the pipeline can heal a redesigned login page, it was never Vivim-shaped.

```
LOCAL CANONICAL PROVIDER   (roles · structure · states · transitions — never selectors)
        ↓
BEHAVIORAL CONTRACT        (capabilities · invariants · oracles)
        ↓
OBSERVATION ENGINE         (DOM · AX · NET · WS · runtime · events)
        ↓
DRIFT ENGINE               (structural · semantic · behavioral · protocol diff)
        ↓
REPAIR ENGINE              (correspondence · remapping · parser/protocol migration)
        ↓
VALIDATION ENGINE          (replay · contract tests · state machine · counterexamples)
        ↓
RATIFIER                   (vN → vN+1 · provenance · rollback · a human signs)
```

| Healing stage | The Forge op it already is |
|---|---|
| observe | `forge.mine.capture@1` / `forge.mine.verify@1` |
| detect | `forge.mine.diff@1` |
| discover / propose | `forge.survey.run@1` / `forge.shape.map@1` / `forge.emit.*@1` |
| prove | `forge.proof.conform@1` / `forge.proof.refusal@1` |
| ratify | `forge.tier.promote@1` (Class-4 Govern — never grantable to a non-root principal) |

Selectors — the rotting truth of v1 — become **derived, disposable projections of a shape**. The stored unit is the canonical shape; the selector is regenerated the way a CLI command is regenerated from `surfaceOpMeta`. The healing loop is also the ultimate generality test for the Forges themselves: the synthetic mine breaks them today; a healed Gmail breaks them tomorrow; what survives both was generic all along.

---

## 10 · Provenance as the visible surface

Two orthogonal axes, always visible, in plain words, derived from data that cannot be hand-written:

```
vivim.chat                 first-party · generic
   Proven against Vivim and the synthetic second mine.

forge.emit                 first-party · harvested
   Shaped by one application (vivim@<sha>). May not fit yours.

com.example.notion         signed · speculative
   No independent consumers yet.
```

> The single most valuable sentence an ecosystem can print — because it is the one thing documentation systematically lies about.

ProvenanceTier (who vouches) and generality (what it has been proven against) never merge, never rename, never overload each other. A tile that says `harvested` is telling a stranger the truth: *this works perfectly for the application that shaped it, and your app might break it.* That honesty is the product's differentiator — not a docs page, but a badge on the object, at a glance, forever.

---

## 11 · The 100x table — why fresh wins

The old tree measured: 1,043 src files · 186 flat engines · 201+ Prisma models across two DBs · 67 store contracts · ~70–137 NLCL files · 16 manifests around one ProviderRegistry singleton · 30 routers + 37 MCP tools + CLI + Next.js · v1 substrate = a Chrome master/slave loop (fleet ports 9252–9280, per-account profiles, CDP selectors that rot). The verdict on each, by the fresh-vs-port rubric (default FRESH; bytes must *earn* harvesting):

| # | Old Vivim reality | The ideal product | Verdict |
|---|---|---|---|
| 1 | 201 Prisma models, two databases | ~16 namespaces derived from the one-writer question; owner/writers/retention declared in the same commit as the row | **FRESH** |
| 2 | ProviderRegistry singleton | N substitutable, comparable, revocable realization rows, each stamping `realizationRef`, each verified before promotion | **FRESH** |
| 3 | ChatGPT = browser-mediated, per-account, rotting selectors | Ollama pilots the spine (local, deterministic); Chrome becomes one quarantined realization — *and the healing loop's proving ground* | **FRESH / DEFER** |
| 4 | ~70 NLCL files, LLM silently in the parse path | rules + lexicon data + one shared classifier; the LLM takes only the ambiguous tail, confidence attached, never silently | **FRESH** |
| 5 | 4 hand-built surfaces kept in parity by discipline | one `surfaceOpMeta` derivation; every surface is a client | **FRESH** |
| 6 | 186 flat hardcoded engines | realization rows and manifest data; engines as declarations, not code files | **RE-EXPRESS** |
| 7 | C12 bootstrap glue | removed; verified absent at cutover | **REMOVE** |
| 8 | C7 resilience/trust code | the *pattern* is the asset (law + watchdog exist in Ω already) | **PATTERN** |
| 9 | 7 harvested stream parsers, battle-tested | salvage the **bytes as pinned fixtures** (D-355), never the wiring | **HARVEST** (the only bytes) |
| 10 | memory + observability, generic-shaped | vault spine + mind spine, built fresh — the best `generic` candidates | **FRESH** |
| 11 | docs written by hand, drifting | auto-librarian: docs generated from the tree + ledger; they *cannot* lie, they can only be stale — and staleness is measured | **FRESH** |
| 12 | the user↔extender gap | closed by construction: the consent tap *is* the signature; the same door for everyone | **FRESH** |

**What 100x means here** — not 100x features; *100x leverage*: one derivation instead of four surfaces; one substitution seam instead of a god-object; one honest badge instead of lying docs; one healing proposal instead of an outage; one tap instead of a developer platform. **The salvage list is deliberately tiny:** the 7 parsers (as fixtures), the atlas (as assay input), the measured pain (as requirements), and the manifesto (as soul). Everything else is built fresh — the gut feeling was correct, and the rubric now proves it mechanically.

---

## 12 · The refusal register — what the dream itself refuses

The ideal product is defined as much by what it refuses as what it does — and every refusal below is enforced by a gate, a label, or a law row, not by intention:

- **No cloud account, ever required.** Local-first is a boot property, not a settings toggle.
- **No telemetry, no attention metrics.** Nothing measures the user's gaze; the ledger records *system* events, not human attention.
- **No silent promotion.** Nothing auto-heals, auto-updates, or auto-publishes into production unreviewed; the quietness is UX, the authority is never quiet.
- **No SDK above Ω.** Forges are ordinary plugins; the tooling that builds the tooling passes the same doors.
- **No selectors as stored truth.** Canonical shapes are the unit; selectors are disposable projections.
- **No docs that can lie.** Provenance and generality print from data; a claim without evidence is `speculative` and says so.
- **No unlabelled generality.** Harvested is not a failure state; an *unlabelled* one is — and it is a hard gate error.
- **No privileged path.** Not for first-party, not for the Forge, not for us.
- **No namespace without a retention rule.** If we cannot say what it forgets, we refuse the namespace.

---

## 13 · Falsifiers of arrival

The dream is done when these are green on real boots — and red when their claims are false:

1. **Headless (F1):** the system is fully usable with zero pixels.
2. **Self-forge (F2):** a user says "forge this," consents in place, and a new tile is born badged — no privileged path.
3. **Self-heal (F3):** a provider drifts; the loop proposes + proves the repair; a certifying principal ratifies vN→vN+1; rollback exists.
4. **Forges-build-Forges (F4):** a third-party Forge passes the same gates as `forge.author`, and is promotable to `generic`.
5. **Provenance at a glance (F5):** every tile shows both axes; no object can hide who vouches for it.
6. **The W5 atom (F6):** a person types, a real streamed response comes back through the law gate, ledgered and queryable.

Plus the per-choicepoint falsifiers owed by their waves (CP-1 device convergence; CP-2 watchdog kill + capability refusal of a forged tile; CP-3 layout restore + sole-writer refusal; CP-4 the one-sentence, one-tap Ledger Lens, alive headless).

---

## 14 · The arc from here

The road is walked one falsifier at a time; the shapes below are the *arc*, each wave's contents decided by evidence when it opens:

| Wave | The falsifier it owes | What it roughly lands |
|---|---|---|
| **1 (next)** | **W5 atom**: person types → streamed response through the law gate → ledgered → queryable | `forge.mine.capture@1` on both mines; the five vertical-slice boundaries (`pack.domain-conversation`, `vivim.chat`, `vivim.providers`, `provider.llm-ollama`, parser pins) |
| **2** | promotion earned: first `harvested` → `generic` against the synthetic mine | memory namespaces, realization rows, generality promotions |
| **3** | surface parity by construction: one op visible identically on CLI + MCP from one derivation | `surfaceOpMeta` derivation; refusal sentences `{code, sentence}` everywhere |
| **4** | F1 + CP-3 + CP-4: the canvas projection and the Ledger Lens | `ns canvas`, live objects, the consent surface (one tap, both badges) |
| **5** | F3: a provider heals end-to-end under ratification | canonical shape schemas; `provider.browser` as realization; the loop outward |
| **6+** | F4: a third-party Forge passes `forge.author`'s doors | the ecosystem: badges that earn, labels that fall, the honest marketplace |

Wave 0's keystone (self-hosting, byte-identical, named refusals) is the first mile of this arc and it is already green — the Forge that emits itself is the proof that the road exists.

---

## 15 · What this document is not

Not a backlog (that is `BACKLOG.md`), not a port plan (the rubric in §11 is), not a promise of pixels this wave (the canvas is Wave 4's falsifier), and not a schedule (waves open on green falsifiers, not on dates). It is the destination, drawn once and drawn well — so that every future wave, every decision record, and every hand-fix tally can be measured against *where we said we were going*.

The dream is the destination. The waves are the road. The falsifiers are the mile-markers. The hand-fix tally is the honest fare we pay on the way.

