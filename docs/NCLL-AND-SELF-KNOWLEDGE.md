# NCLL & Self-Knowledge — the language waves (Ω10–Ω13)

**Owner directive (verbatim, 2026-09):** *"Continue and finished the full planned omega, the
discovery and healing etc should be state of the art designed as core engine plugins so we can
upgrade them - if there are any core primitives needed in the core ensure you properly segment -
if pure plugins is best that's ok - from here on out use your best design recommendation and
assume I approve - don't wait for me - the other pieces I am not sure I see and are fundamental is
the self knowledge core design, the deterministic NLP and nclc as a core upgradable plugin -
ultimate goal is BACKEND IS FULLY REPROGRAMMABLE BY NON TECHNICAL USERS USING NATURAL LANGUAGE
ASSISTED BY THE PLUGINS AND INTELLIGENT SYMBOLIC FEEDBACK SYSTEMS HELPING TO NARROW THE INEVITABLE
GAP FROM USER TO MACHINE DURING COMMAND TYPING - MY IDEA IS THAT WE HAVE CORE PRIMITIVE COMMAND
SYMBOLIC FAMILIES THAT ARE ALREADY WIDELY USED LIKE #, @, /, BUT WE COILD EXPAND TO OTHER
UBIQUITOUS SYMBOLS, !,?,+,-,&,$,*,%<∆✓=^~ ETC - I am thinking like user types 'send this to Peter'
the deterministic engine fully parses and as the user types there is instant interpreted feedback"*

The first half of the directive (discovery + healing as upgradable core engine plugins) is
already satisfied by Ω7–Ω9: every discovery/healing engine is an ordinary ENGINE-contribution
plugin, swappable through the standard recipe re-compile + atomic pin swap with zero host
changes. This document designs the missing second half.

## 0. The segmentation ruling (the question the owner asked explicitly)

"Are any core primitives needed in the core?" — **No. The µhost stays untouched (822 LOC).** *(Host size era-true at writing, 2026-09-era; present law: host 1500/1500 flat, zero headroom — B5, D-391. The ruling itself — nothing moves into the host — stands.)*

| Concern | Placement | Why |
|---|---|---|
| Self-knowledge | **plugin** `vivim.mind` (Ω10) | A self-model is a *capability*, not a boot law. Derived views only: registry + vault + journal are the evidence; a wrong mind never corrupts them (falsifiable). Swapping mind = smarter self-knowledge, zero host changes. |
| Deterministic NLP / NCLL | **plugin** `vivim.nlcl` (Ω11) wrapping a **dependency-free pure package** `nlcl-pure` | The language engine must be hot-upgradable as a unit (D-216). The pure core has zero imports — same bytes run in the compartment, in the web surface, and in the browser for keystroke-latency feedback. |
| Reprogrammability | **plugin** `vivim.director` (Ω12) | Teaching, rules and consent grants are DATA (vault objects + law ops). No code is ever generated. |
| Symbolic families | **lexer primitives in nlcl-pure** (code) + **lexicon data** (upgradable) | The 17 glyphs are grammar; what each family *means in words* is data (D-217). |
| Language frames | **data inside nlcl-pure**, keyed by op id | Frames version with the language plugin = one atomic upgrade. Learned frames live in the vault (survive swaps). Post-v1 path: a `lang` contribution kind owned by packs (contract grammar change = amendment-class event). |
| Web surface | **surface** `surfaces/web` (Ω13) + sandbox launcher | Surfaces are outside-compartment root principals (D3 law); the console is a view, never an executor. |

**If pure plugins is best — it is. Everything above is a plugin. The core stays boring.**

## 1. Ω10 — vivim.mind (self-knowledge)

The system's model of itself, **derived, never authoritative**:

```
law.registry@1 (who is alive)  ┐
vault.query/get@1 (what exists) ├─►  mind.snapshot@1  ─►  WorldModel
config projections (how to see) ┘                              (the NCLL grounding target)
```

- `mind.snapshot@1` (READ): assembles the **WorldModel** — kernel/plugins, routable ops with
  risk + provider, projected entities (messages), derived contact entities, taught lexicon,
  rules, context refs. Deterministic: same vault state + same registry → same WorldModel.
- `mind.query@1` (READ): focused views (`{kind: "ops"|"entities"|"rules"|"lexicon", filter}`).
- **Entity projection is composition config** (data): `{ns, metaType, entityType, label, names,
  fields}` templates; the mind stays domain-agnostic. **Contact derivation** is a built-in
  derivation kind (`derive: "contacts"` over address fields) — the system *learns who you
  correspond with* from message history; contacts are derived facts, not stored authority.
- Bounded: entities capped (default 200), latest-first. The mind is a lens, not a warehouse.
- Evidence law: every entity name it claims traces to a vault revision (`evidence.rev` flows
  from vault.get). A hallucinated self-model is impossible by construction — there is no other
  input path.

## 2. Ω11 — vivim.nlcl (the Natural Command Language Layer)

**Determinism law (N1):** `interpret(text, world) → Interpretation` is a pure function.
Same text + same WorldModel + same nlcl version ⇒ same interpretation, always, everywhere
(compartment, server, browser). No clocks, no randomness, no LLM in the path.

**The pipeline (every stage traced — explainability is a feature):**

```
text ─► scan ─► lex ─► symbol-parse ─► frame-match ─► ground ─► resolve ─► project
      (spans) (words,   (explicit     (verb+slot     (entity     (scored    (feedback:
               quotes,   families)     grammar over   mentions →   candidates, tokens,
               arrows)                 frames)        WorldModel)  ambiguity) canonical,
                                                                     reading, effects,
                                                                     suggestions, gaps)
```

**Symbol families (17 — D-217).** Lexer primitives; NL expansions are lexicon data:

| Family | Name | Meaning | NL triggers (examples) |
|---|---|---|---|
| `/` | command | invoke an op | verbs ("send", "list") |
| `@` | reference | grounded entity mention | names, "this", "that", "it" |
| `#` | tag | label / categorize | "tag", "as", "label" |
| `!` | force | execute now, skip confirm | "now", "immediately", "just do it" |
| `?` | query | interrogate the world | "what", "who", "help", "list" |
| `+` | add | include / create | "add", "with", "also", "new" |
| `-` | remove | exclude / delete / disable | "without", "remove", "disable" |
| `&` | combine | and / then | "and", "then", "also" |
| `$` | value | variable binding | "set X to", "save as" |
| `*` | wildcard | all / every | "all", "every", "everything" |
| `%` | config | parameter tuning | "set … to", "configure" |
| `∆`/`Δ` | delta | change an existing thing | "change", "update", "make it" |
| `✓` | confirm | approve pending | "yes", "confirm", "do it" |
| `=` | assert | definition / teaching | "means", "is", "equals" |
| `^` | priority | escalate | "urgent", "important", "first" |
| `~` | approximate | fuzzy mode | "about", "roughly", "like" |
| `→`/`->`/`>` | direction | slot routing | "to", "into", "for" |

**Frames are data** (`pure/frames.ts`, keyed by op id): verbs, slot roles with kinds
(`entity`/`text`/`content`/`enum`/`rest`), prepositions, patients, examples. Learned words
(`world.lexicon`, taught via the vault) merge over builtin verbs with provenance.

**Confidence is a deterministic score** (additive: verb match class + required-slot fill ratio +
entity match class + context resolution − unknown words − unresolved slots − ambiguity ties;
floored 0, capped 0.99). Status: `ok ≥ 0.75` · `partial 0.4–0.75` · `ambiguous` (surviving
alternatives) · `unknown` (no verb → teach prompt + closest verbs) · `invalid` (symbol syntax
error) · `empty`.

**The gap-narrowing feedback (the owner's "instant interpreted feedback"):** as the user types
`send this to Peter`, the pure engine returns, per keystroke:
- **token annotations** — every token labeled with family/role/meaning (rendered as live
  underlines in the console);
- **canonical symbolic form** — `/send @this → @peter-miller` (the machine's reading of the
  human's NL — the user *learns the symbol language by seeing it appear*);
- **NL re-reading** — "Send the latest message to Peter Miller" (the machine talking back);
- **grounded slot cards** — "@Peter → Peter Miller (contact) · 2 others match" with ranked
  alternatives;
- **effect preview** — op, risk class, *consent required* (from WorldModel ops — the law's
  surface, pre-announced);
- **suggestions** — next-slot completions, disambiguation picks, verb corrections
  (edit-distance), teach prompts, symbol hints ("try: /send @this → @peter").

**LLM at the edge only (N2):** `provider.llm` (chat.complete, simulator) is consulted by the
console *only when the deterministic engine returns unknown/low-confidence*, as an opt-in
"assistant suggestion" — marked probabilistic, never auto-executed. The deterministic engine is
never bypassed.

**Upgradability (N3):** swapping `vivim.nlcl` (recipe re-compile + atomic pin swap) replaces the
whole language engine — grammar, families, frames — as one signed unit. Taught lexicon lives in
the vault and survives the swap. `nlcl-pure` is a separate dependency-free package so surfaces
(and the browser) consume the exact same engine bytes as the compartment.

## 3. Ω12 — vivim.director (reprogrammability)

The owner's ultimate goal — *backend fully reprogrammable by non-technical users* — realized as
**data, never codegen**:

- **`director.rule@1`** — `when X, do Y` becomes a vault object (ns `automation`): trigger
  `{event: "message.received", from: contact}` + action IR `{op: "message.send@1", slots}`.
  A deterministic tick loop (500 ms) watches the vault (ns `email`, new/unseen inbox revisions),
  matches rules, executes actions **through the port** — rule actions run under principal
  `vivim.director`, so the LAW still gates them: creating a rule surfaces the exact consent the
  rule needs (one grant card at rule-creation time; the console pre-checks
  `law.check{principal:"vivim.director"}` for the action).
- **`director.teach@1`** — "blitz means send" → vault object (ns `nlcl`): word→op. Instantly
  changes future parses (mind surfaces it in `world.lexicon`).
- **`director.registry@1`** — list/enable/disable rules (`-` family), unteach.
- **Consent in NL** — grants happen through the normal execution flow: REFUSED carries the
  `consentId`; the console's confirm card (✓ family) calls `law.consent.grant@1`.

Everything the director writes is a vault revision: journaled, Merkle-chained, revertable
("disable the rule", "unteach blitz"). **No code is generated at any point.**

## 4. Ω13 — surfaces/web + the console

`surfaces/web` — a third surface (after cli/mcp): boots `compositions/console.json` (law + vault
+ mind + nlcl + director + email pack/provider + llm simulator) and serves:

- `GET /api/snapshot` — WorldModel (replicated to the browser; bumped+broadcast on change)
- `POST /api/interpret` — authoritative server-side interpretation (root principal)
- `POST /api/execute` — NL text → interpretation → router execution (the full Gate → Resolve →
  Execute loop; REFUSED surfaces `consentId` + principal)
- `POST /api/consent` — grant (the ✓ confirm card)
- `POST /api/assist` — the opt-in LLM edge (chat.complete through the port)
- `GET /api/health`
- socket.io (`path: "/"`, the sandbox gateway law) — live journal tail + world version pushes

The browser runs `nlcl-pure` locally against the replicated WorldModel: **keystroke-latency
feedback with zero network round-trips**; execution is always the server's authoritative parse.
Client parse ≈ server parse because they share the same pure bytes (N1).

The sandbox runs the surface via `mini-services/omega-engine` (launcher, port 3031, `bun --hot`)
— the service-folder law of the sandbox; the implementation lives here as a first-class surface.

## 5. Wave plan

| Wave | Deliverable | Gate evidence |
|---|---|---|
| Ω10 | vivim.mind — WorldModel from registry+vault+projections | tests: derivation, contacts, determinism, bounds, evidence refs |
| Ω11 | vivim.nlcl + nlcl-pure — 17 families, pipeline, feedback | tests: determinism, statuses, ambiguity, teaching merge, perf (<2 ms/keystroke class) |
| Ω11b | email pack/provider v0.2.0 — `message.receive@1` (+frames) | tests: receive → inbox → rule trigger substrate |
| Ω12 | vivim.director — rules/teach/registry + tick loop | tests: rule fires end-to-end under consent, teach changes parse |
| Ω13 | surfaces/web + console.json + mini-service launcher | tests: snapshot/interpret/execute/consent/WS round-trips |

All five land behind the existing gate law: booted composition + green tests, wave tags
`omega/w10`…`omega/w13`, status rows in `build/status.json`.
