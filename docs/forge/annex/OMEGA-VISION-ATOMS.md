# THE SOVEREIGN ENVIRONMENT — ATOMIZATION

> **Companion to `OMEGA-ENDSTATE-VISION.md`** — the separated working copy as
> amended at commit `18d0ea8` (D-408 PROPOSED, parked outside the omega repository).
> Status: working artifact, **pre-decisioning**. Per owner direction 2026-09-20:
> *"not yet at build decisioning; keep omega and the vision separate; atomize the
> end-state vision first; then think through deeply if there is any more core omega
> work needed — structurally, not tactically."* Nothing in this file is a decision.

---

## 0 · Why atomize

The vision is a single continuous argument — written to be read, not audited.
Arguments are hard to check against a codebase; atoms are easy. This document
decomposes the vision into atomic end-state claims so each can be independently
verified against the omega core: *does the substrate structurally support this
claim, or does it not?* The companion analysis (`OMEGA-CORE-STRUCTURAL-ANALYSIS.md`)
runs that check; this file only defines the units it runs against.

Atomization also protects the vision from a subtler failure: gravity toward the
sections that already have machinery. A 713-line document read as prose invites
the reader to glide over the sentences whose machinery does not exist yet. Read
as atoms, every claim weighs the same — one row, one falsifier, one verdict owed.
And because every atom cites the vision's own falsifiers (F1–F12, the CP
falsifiers) wherever they exist, the atom set doubles as a completeness check on
the vision itself: every register row, every capability-map row, and every
section must land on at least one atom — or the vision has a claim it cannot cash.

## 1 · Rules of an atom

1. **Present tense, end-state.** Atoms describe the system as it *is* at arrival. Path language ("will", "should", "needs") is forbidden inside an atom.
2. **Exactly one claim.** A sentence that conjoins two independently checkable claims is two atoms.
3. **Falsifiable as written.** Every atom names — or inherits from the vision — the observation that would prove it false. Where the vision already owes a falsifier, the atom cites it rather than inventing a competing one.
4. **Substrate-tagged.** Every atom carries surface tags (§2) naming the core structures it leans on — the bridge to the structural analysis.
5. **Direction, not backlog.** Atoms are destination claims; they bind wave planning exactly as the vision's Parts II and III do — nothing lands without its falsifier and its record, or it does not land.

## 2 · Surface tags

| Tag | Surface | Today's carrier (verified 2026-09-20) |
|---|---|---|
| **H** | host / kernel / anvil | µhost ≤ 1,500 LOC flat (B5); anvil sdk 856/860 + 45 frozen exports (D-404); `contracts/` pinned wire types |
| **V** | vault / object store | one vault (D-373) behind the driver seam: append-only hash-chained changelog, CAS blobs, 19 namespaces at the 2026-09-20 snapshot (16 at this doc's writing; the ns table is the count of record), latest-wins hot rows + cold fallback, `vault.roundtrip@1` swap harness |
| **L** | law / consent | `vivim.law` gate `law.check@1` (LAW_POLICY_V1 + ConsentTable + ForbiddenTable overlay + ShadowAmendment); `law-journal.jsonl` (unsigned, best-effort) |
| **C** | capability | `Cap{scope, generation, parent}` token algebra with attenuation (broadening throws); D-340 capability graph + signed audit chain; grants compiled into signed compositions |
| **I** | intent | `vivim.nlcl` + `vivim.nlcl-pure` (zero-import deterministic core, law N1); `contracts/src/intent*.ts` IR (D-389: IntentState machine, IntentStep, `payloadHash`, planRef); `vivim.intent` plugin — declared in wire, **unwired in all 18 compositions** |
| **M** | mind | `vivim.mind` (`mind.snapshot@1` WorldModel grounding); context assembly owed (F12) |
| **R** | runtime / resources | compartments; D-331 dormant lazy-spawn (post-gate); watchdog (D-360/D-366, manifest budgets, two-signal eviction); run queue (pure data, no timers) |
| **T** | time | vault revisions + changelog (the projection substrate); branches / scrubber / sleeping compositions owed (F9) |
| **K** | identity / keys | principal strings (`agent:` / `user:` / `root` / `µhost-gate`); one vault root-of-trust ed25519 keypair; pairing / recovery / rotation owed |
| **S** | sharing / sync | treaties, CRDT device fold, petnames / curators, decentralized indexes — owed (F11); the attenuation substrate for delegation exists |
| **X** | exit / ingestion | `vault.roundtrip@1` (swap harness, not an open format); `packs/domain-import` declarations + harvest fixtures; Exit Manifest owed (F10) |
| **J** | evidence / journal | vault changelog rows (hash-chained); law journal (unsigned JSONL); kernel audit chain (signed, in-memory); refusal sentences |

---

## 3 · PART I — THE CONSTITUTION (CON-01 … CON-23)

| ID | § | Atom — the end-state claim | Falsifier | S |
|---|---|---|---|---|
| CON-01 | 0·4 | The canvas is a projection with no authority: remove it and the system still runs, headless and complete. | **F1** — full usability with zero pixels; CLI, MCP, and daemon answer every question the canvas could render. | V·H |
| CON-02 | 0·6 | The canvas carries no state of its own — spatial state is vault data (`ns canvas`), so layout survives the app, the device, and the decade. | **CP-3** — delete the canvas app → reinstall → layout restored exactly from the vault; a foreign writer to `ns canvas` is a named refusal. | V·L |
| CON-03 | 2 | Natural language is a constitutional control plane — a peer of local-first, provenance, and refusal-first — operating the environment itself, not an NLP subsystem and not a cleanup. | **F7**; the *Say anything* capability: any operation invokable in language executes identically to CLI/MCP/canvas. | I·L |
| CON-04 | 2 | Probabilistic perception, deterministic intent, deterministic execution: the same intent against the same state, capabilities, and policy resolves to the same executable meaning. | **F7** — byte-identical canonical intents and identical operation plans on re-issue. | I·L·V |
| CON-05 | 2 | No raw model output crosses the law gate — the law consumes canonical intent only. | **F7** clause — zero LLM tokens in law-gate input; gate-input inspection. | I·L |
| CON-06 | 2 | Every utterance resolves to exactly one of UNDERSTOOD / AMBIGUOUS / REFUSED / EXECUTED; sub-threshold confidence asks, narrows, or refuses — never a silent guess. | **F7** clause — a sub-threshold input produces a named clarifying question or refusal, never a silent resolution. | I·L |
| CON-07 | 2 | LLMs are optional intelligence providers: remove every model and the system still resolves, gates, and executes — it loses synthesis, not control. | **F7** clause — the model-less resolve + gate + execute path is demonstrated. | I·L·R |
| CON-08 | 2·3 | The LLM, where used, is a substitutable, revocable realization stamping `realizationRef` on every row it produces. | Every row written by a model realization carries `realizationRef`; revoking the realization stops its writes cold. | V·C·I |
| CON-09 | 3 | Local-first, network-optional: the kernel boots hermetic; network is a plugin capability, never a boot assumption; there is no account and no login server. | Hermetic-boot test (F1 family); boot-path import audit shows zero network reaches. | H·C·S |
| CON-10 | 3 | No telemetry and no attention metrics — nothing measures the user's gaze; the ledger records system events, not human attention. | Code + runtime audit: no telemetry surface exists; the ledger schema has no attention-bearing fields. | H·V·J |
| CON-11 | 3 | External intelligence connects as substitutable, comparable, revocable realizations, each verified before promotion. | Promotion requires a proof event (ns `discovery`); any realization can be pulled like a plug, without residue. | V·C |
| CON-12 | 3 | One vault, append-only, content-addressed, with a named retention rule for every namespace and a sole writer for every row — nothing is remembered that cannot be named, audited, or refused. | Namespace-table completeness (every ns declares owner/writers/retention in the same commit that first writes it); chain verification passes. | V |
| CON-13 | 4 | The law gate sits downstream of canonical intent and upstream of execution — that ordering is the whole security story of natural-language control. | Live dispatch-order inspection; **F7**. | I·L·H |
| CON-14 | 5 | The atom of the system is the governed event — *something happened (requested, observed, produced, changed, approved, refused, or inferred), by a principal, through a capability, under a law, with provenance and retention* — one shape, many kinds; the conversation turn is the first specialization. | Every persisted event across all namespaces parses to the atom shape; kind-coverage audit; **F6** exercises the conversation specialization. | J·V·L·C |
| CON-15 | 5 | Refusals are sentences: every refusal payload carries `{code, sentence}`, rendered as an ordinary boring event — a stack trace is a bug, a sentence is a product. | Refusal-register tests: every named refusal renders a human sentence; zero raw error dumps reach a user surface. | L·J |
| CON-16 | 5 | Ledger rows answer "why": every row cites evidence (refs with byte offsets) and a reason — "why does this work this way?" is a query, not an archaeology project. | Why-queries over any row return citing rows; spot-checked citations resolve to bytes. | J·V |
| CON-17 | 5 | Both badges — `ProvenanceTier` (who vouches) × `generality` (what it is proven against) — are stored together on every realization/artifact row from the first write. | Unlabelled generality is a hard gate error; no first-write row exists without its badges. | V |
| CON-18 | 5·25 | Every decision — law, consent, healing, promotion, delegation — is replayable from the ledger. | Per-decision-class replay tests: each decision is re-derivable from rows alone. | J·V |
| CON-19 | 6 | The live object (tile) is a closed 5-tuple — identity, composition, vault binding, spatial placement, provenance badge — nothing more. | Tile model inspection: exactly five concerns; any hidden sixth field is a bug. | V·C |
| CON-20 | 6 CP-1 | The vault watch is the object-model substrate; CRDT is a merge discipline folded over the log — never a second source of truth; sync syncs vault facts, never derived state. | **CP-1** — two devices diverge → logs reconcile → both converge to identical layout, zero lost non-spatial rows, one named merge record. | V·T·S |
| CON-21 | 6 CP-2 | Trust-tiered execution: first-party at `worker-thread`, every user-forged tile at `process` under watchdog budget and capability grants — nothing user-forged shares the primary runtime. | **CP-2** — an infinite-looping forged tile is watchdog-killed with zero host LOC and a named refusal; an ungranted capability touch is refused with a sentence. | R·C·H |
| CON-22 | 6 CP-3 | `ns canvas` is first-class vault data — sole writer the canvas surface plugin, retention versioned restorable snapshots, rows referencing object identity, never duplicating object state. | **CP-3** — reinstall restores the layout exactly; any writer but the canvas surface is a named refusal. | V·L |
| CON-23 | 6 CP-4 | The first forgeable tile is the local, provider-free, vault-backed **Ledger Lens**, exercising the full 5-tuple with zero external rot. | **CP-4** — a non-programmer forges the Lens from one sentence, consents in one tap, sees live data with both badges; canvas killed → CLI answers the same query. | I·V·C |

---

## 4 · PART II — THE CIVILIZATION (CIV-01 … CIV-32)

| ID | § | Atom — the end-state claim | Falsifier | S |
|---|---|---|---|---|
| CIV-01 | 7 | To a person, Vivim is the place their digital world lives — one local environment holding their files, accounts, conversations, tools, agents, and automations as governed, composable objects. | World-inventory walk: every §8 inventory kind exists as a governed object in one environment. | V |
| CIV-02 | 7 | The world is operable in language, in space, or in code, with the same authority through each. | The same operation issued via language / canvas / CLI yields identical governance and the same ledger row (with CON-03, CIV-13). | I·L·C |
| CIV-03 | 7 | No separate developer mode: description, composition, inspection, and programming are one continuum — the consent tap that forges a tile and the decision record that amends the constitution are the same gesture at two scales. | Privileged-path audit: no principal (including first-party) has a door others lack. | L·C·H |
| CIV-04 | 7 | Nothing is above the user — nothing auto-heals, auto-updates, or auto-publishes past the user's signature. | Silent-promotion tests: healing and upgrading require ratification (**F3**); zero unreviewed production changes. | L·V |
| CIV-05 | 8 | The world inventory — people, files, applications, websites, accounts, conversations, messages, documents, tasks, memories, data, models, agents, automations, workflows, queries, views, dashboards, tools, plugins, compositions, evidence, events — exists as governed, composable objects in one local environment: one object discipline where the old world had a dozen incompatible containers. | Each inventory kind maps to a namespace object with the same atom shape (CON-14); cross-container query test. | V |
| CIV-06 | 8 | Objects are connectable across containers — an email is an observed event row, projectable beside the PR it answers and the task it creates; every object is queryable, replayable, connectable, shareable, and exportable with the same machinery. | Cross-namespace projection + query test over three different container kinds. | V·M |
| CIV-07 | 9 | The object kinds are exactly the ten: Source, View, Tool, Agent, Workflow, Conversation, Memory, Application, Service, Query — a closed set. | Enumeration in the object model; a projection outside the ten kinds is a bug. | V |
| CIV-08 | 9 | "Live" is defined and enforced: a live object observes authoritative state (vault watch, never polling), reacts to events, reflects its capability state, its failures, and its provenance, and can be acted upon — anything that cannot do all five is a picture, and the system says so. | Five-property test per object; a polling detector flags any "live" object that polls. | V·R |
| CIV-09 | 10 | Spatial memory is the user's memory of their digital life: workspaces are named, versioned regions of `ns canvas`, CRDT-merged across devices; the spatial vocabulary — workspace, scene, room, object, group, link, portal, view, timeline — is constitutional. | Vocabulary present in canvas row shapes; **CP-1** merge behavior. | V·T |
| CIV-10 | 10 | A workspace can become a desktop, a dashboard, a research environment, an automation control room, a knowledge graph, a project workspace, or a personal memory palace — the same first-class spatial rows, projected differently. | One row-set, seven projections test (F1 family — the projection is not the state). | V |
| CIV-11 | 11 | The interaction verbs are exactly the eighteen: SEE, ASK, CREATE, CONNECT, MOVE, OPEN, EDIT, RUN, DELEGATE, APPROVE, REFUSE, FORK, REPAIR, INSPECT, UNDO, REPLAY, SHARE, EXPORT — a closed verb algebra. | The surface derivation covers exactly this set; a product surface exposing an operation outside the algebra is a bug. | I·H·C |
| CIV-12 | 11 | Every verb is available through every surface — canvas, command palette, natural language, keyboard, CLI, MCP, API, automation, agent — because all surfaces converge on canonical intent. | Verb × surface matrix; surface parity by construction (Wave 3's falsifier). | I·H |
| CIV-13 | 11 | Multiple expressions, one implementation: the same operation through different surfaces produces the same canonical intent, the same event shape, and the same ledger row. | Cross-surface equivalence test on a representative verb set. | I·J |
| CIV-14 | 12 | Vivim owns the intelligence environment; models are replaceable engines inside it — the fabric decides, deterministically from ledger rows, which model, context, memory, tools, capabilities, evidence, privacy level, latency, local/remote policy, and cost, for any given task. | Fabric decisions are themselves governed events — queryable, replayable, refusable. | V·M·I |
| CIV-15 | 12 | The mind spine: context is a first-class assembled resource — deterministic semantic router over the vault, localized retrieval with evidence refs and byte offsets, named retention + eviction rules per namespace, assembly metered like any resource. | **F12** — the same query against the same vault assembles a byte-identical context window, every included memory carrying evidence refs and a named epistemic kind. | V·M·R |
| CIV-16 | 12 | The mind spine is deterministic and queryable — not a vibe and not an opaque cache; eviction is a named rule, never a silent truncation. | **F12** plus an eviction-naming audit: every excluded memory has a named rule row. | M·V |
| CIV-17 | 13 | Every remembered row declares both a human-facing semantic type (remembered, temporary, project memory, personal memory, derived knowledge, source material, working context, private, shareable, expiring) and an epistemic kind — FACT · SOURCE · OBSERVATION · INFERENCE · OPINION · SUMMARY · MODEL-GENERATED BELIEF · USER ASSERTION. | **F12** kind clause; a memory write without a named kind is refused — the vault refuses rumors. | V·M |
| CIV-18 | 13 | Model-generated beliefs are labeled as such and never silently promoted to facts; source material is pinned and re-fetchable; observations carry their evidence refs; inferences carry their derivations. | Promotion audit: the belief→fact path requires an explicit re-typing event; kind survives citation. | V·M |
| CIV-19 | 14 | Every agency edge — human → agent → composition → plugin → capability → resource — is a ledger row carrying principal, capability, scope, duration, approval mode, revocation, and evidence. | Chain inspection: every edge in a live delegation resolves to a row. | C·J·V |
| CIV-20 | 14 | Trusted radii: the user may grant scoped auto-approval zones ("auto-approve Gmail healings when the proof report passes"), and every radius is itself a governed object — named, scoped, expiring, revocable, on the ledger, INSPECTable. | Radius-row test: auto-approve fires within radius and ledgered; radius revoked → next attempt escalates. | L·C·V |
| CIV-21 | 14 | Escalation is single-shot: a request exceeding a radius surfaces one consent request with principal, scope, and reason, in a sentence — the system does not guess and does not nag. | Consent-fatigue test: a standing radius never re-asks; a supra-radius request asks exactly once, with a named reason. | L·I |
| CIV-22 | 15 | Real time travel: the canvas is a function of the log up to time *T* — scrub renders every object's state at *T*, and the ledger row underneath says why. | **F9** — 50 tiles deleted → scrub back 10 minutes → all reappear; the ledger shows the deletion, the scrub, and the branch; zero permanent loss. | V·T |
| CIV-23 | 15 | Rewind without erasure: rewinding never deletes history — it forks a branch the user may merge back or discard, and the ledger shows the deletion, the scrub, and the branch. | **F9** branch clauses; history integrity after a rewind. | V·T |
| CIV-24 | 15 | Scope-undo: "undo everything this agent did in the last hour" is compensation events filtered by principal + window — agency and time compose. | Scope-undo test: exactly the named principal's rows in the window are compensated, with a compensation event naming whose rows they were. | V·T·C |
| CIV-25 | 15 | Replay: re-run a workflow against the state of a past date — the vault still has it, byte-addressed. | Historical-revision replay test against a dated snapshot. | V·T |
| CIV-26 | 15 | Sleeping compositions: long-running headless compositions are event-driven or time-triggered, waking on vault events or timers, running to completion and ledgering as they go, independent of any canvas projection; WHEN *X* DO *Y* is a first-class composition, not a bolted-on script. | The four-hour headless run: a composition sleeps, wakes on events and timers, ledgers throughout, with no canvas attached. | T·R·V |
| CIV-27 | 16 | You share the machine, never the data: an exported composition carries its structure, its provenance, and its needs — never Alice's secrets, never Alice's state; the recipient grants their own capabilities and runs it on their own data. | Export byte audit: zero credentials, zero private state, structure + provenance + unbound capability requirements present. | S·V·C |
| CIV-28 | 16 | Two sovereigns, one canvas: no shared server and no merged identity — spatial state merges by CRDT fold; object state crosses the boundary only through explicit capability delegation under a temporary, mutually-signed treaty, scoped, expiring, revocable, mirrored on both ledgers. | **F11** — Alice and Bob edit offline → reconnect → logs reconcile deterministically → zero unauthorized capability crossings → the treaty expires exactly on schedule. | S·V·C·T |
| CIV-29 | 16 | Discovery without a store: Forges publish manifests and content hashes to decentralized indexes (transparency-log style); trust travels by petnames and curators — the badge grows a vouch line; a Forge with a valid signature but drifted code is rejected by the content-hash gate; an unvouched Forge is installable but says so, plainly. | Content-hash rejection test (valid signature, drifted bytes → refused); unvouched badge display test. | S·C·V |
| CIV-30 | 17 | The Exit Manifest: a full vault export in a documented, open format — the CAS blobs, the event log, the compositions, the canvas spatial state, the provenance — that a fresh Ω node or a third-party viewer ingests to reconstruct the user's environment byte-identically, minus execution capabilities. | **F10** — full export → machine wiped → fresh node imports the manifest → canvas, tiles, and ledger restored byte-identically. | X·V |
| CIV-31 | 17 | No essential user state exists in a format the user cannot export — machine migration, encrypted backup, restore, and schema migration run under the same openness guarantee. | Export-coverage audit across every namespace: each row kind round-trips through the open format. | X·V |
| CIV-32 | 17 | Sovereignty, fully stated: the user owns the memory (vault), the law (consent), the agency (delegation), the time (branches), the machine (budgets), the sharing (treaties) — and the exit. | Rollup: CIV-30 and CIV-31 green, and the ownership atoms across all seven domains green. | X |

---

## 5 · PART III — THE PHYSICS (PHY-01 … PHY-20)

| ID | § | Atom — the end-state claim | Falsifier | S |
|---|---|---|---|---|
| PHY-01 | 18 | The machine is sovereign territory too: CPU, RAM, GPU, disk, browser sessions, network bandwidth, model memory, and battery are governed resources, and the kernel is their OS-level scheduler — not just their capability router. | **F8** — 20 live tiles running, laptop unplugged, heavy tiles suspended deterministically within 2 seconds, system responsive, zero OOM kills. | R·H |
| PHY-02 | 18 | Every composition declares a resource profile (a Gmail tile: ~200 MB, network-poll 5m; a local-LLM tile: 4 GB, GPU); a forge proposal without a profile is refused — with a sentence. | Profile-less proposal → named refusal at the forge door. | R·L |
| PHY-03 | 18 | The tile lifecycle is visible and governed: **ghost** (layout + identity + vault watch only), **dormant** (light realization, paused), **hydrated** (full realization), **suspended** (governor-forced); off-viewport or idle for *N* hours sheds the realization and keeps the ghost watching the vault. | Lifecycle transitions observed on real tiles; a ghost still observes the vault watch. | R·V |
| PHY-04 | 18 | A thousand objects can exist in a workspace without requiring a thousand active runtimes. | 1,000-object workspace with a bounded, named count of active realizations. | R·V |
| PHY-05 | 18 | The budget watchdog makes physical events law: laptop unplugged → the Chrome fleet suspends within seconds while the vault, the ledger, and the Lens stay alive — no OOM kills, no silent death. | **F8** clauses; degradation is observable, not inferred. | R |
| PHY-06 | 18 | Degradation is never invisible — it is a badge state with a sentence ("Suspended to save battery. Tap to wake."); a quiet freeze is a lie of omission. | A suspended tile displays the badge state and its sentence; no silent freeze path exists. | R·V |
| PHY-07 | 18 | The context window is metered as a first-class scheduled workload — not a free river through the model. | Assembly appears in the scheduler's metering and budget rows (with CIV-15). | M·R |
| PHY-08 | 19 | The principal kinds are exactly the nine: human, local device, first-party forge, third-party forge, plugin, agent, provider, organization, signing key. | Closed enumeration in the contracts; every principal is kind-distinguishable at the gate. | K·C·H |
| PHY-09 | 19 | Pairing is local: Device A learns to trust Device B by PAKE-based local-network pairing, hardware security keys, or QR rituals — a local trust mesh, never a server. | Two devices pair with zero network authority (the multi-device wave's falsifier). | K·S |
| PHY-10 | 19 | A lost laptop is not a lost vault: recovery via socially-distributed key shares (Shamir-style, across trusted devices and people), encrypted exports, and rotation that re-keys without rewriting history — rotation adds a row, never edits one. | Key rotates → old rows still verify → the revoked key's next write is a named refusal. | K·V·X |
| PHY-11 | 19 | `ProvenanceTier` is assigned by the kernel, never claimed by the artifact — an untrusted plugin cannot impersonate a first-party one; badges print from ledger rows a non-writer cannot write. | Tier-forgery attempt → named refusal; badge source audit shows kernel-assigned rows only. | K·V·C |
| PHY-12 | 19 | The vault's locks are keys, not a service: namespace sole-writers imply access control lists managed entirely by local cryptography. | Cross-writer refusal test; ACL changes gated by key possession, no service in the loop. | K·V·L |
| PHY-13 | 20 | Untrusted data can inform a composition without gaining authority over it: a redesigned DOM, an injected email instruction, a model's confident hallucination may inform — none may authorize. | Prompt-injection suite: at worst a named refused draft, before the consent surface is ever reached. | I·L |
| PHY-14 | 20 | The intent airgap: the perception layer (LLM or otherwise) proposes a natural-language draft and a JSON schema; a deterministic compiler validates it against the `pack.builder` schemas; the consent surface shows the compiled, validated plan in plain words; the user signs that — never the model's output. **The LLM proposes; the compiler validates; the user signs.** | The consent surface never renders raw model output; an adversarial draft produces a named refusal pre-consent. | I·L·C |
| PHY-15 | 21 | Every failure is a named state — Paused · Degraded · Broken · Quarantined · Stale · Untrusted · Revoked · Repair available · Rollback available — each a state on the object, each a ledger row, each mapped to machinery that exists or is owed. | Failure injection across the vocabulary: each produces its named state + row + mapped machinery. | V·R·L |
| PHY-16 | 21 | Every failure leaves the user with a recoverable state — a crash is a bug; an unrecoverable crash is a constitutional violation. | Crash-recovery suite over the failure vocabulary; zero dead-end states. | V·T |
| PHY-17 | 22 | The lifecycle runs install → bootstrap → use → update → migrate → recover → uninstall over the trust staircase (immutable constitutional kernel → trusted runtime → first-party compositions → third-party treaty-gated → user speculative) — and nothing below the kernel may modify the kernel, ever. | Staircase audit: a below-kernel modification attempt is a named refusal. | H·C·L |
| PHY-18 | 22 | The kernel changes only through decision records and gates — the repo's own Wave 0 protocol *is* the upgrade mechanism, productized. | A kernel change without record + green gate is a gate failure (pattern already enforced). | H |
| PHY-19 | 22 | The ingestion airlock: the old tree is dead but its ore is real — a one-time, specialized Forge reads the frozen Vivim databases, maps the legacy 201 models into the Ω namespaces, and writes them as `harvested` legacy rows, *shaped by vivim@\<sha\>*, provenance retained — measured, not mourned, never the blueprint. | Harvested rows carry shape + provenance; the mapping is one-way and one-time. | X·V |
| PHY-20 | 22 | Uninstall is the exit protocol — export, verify, erase — and nothing phones home on the way out, because there is no home to phone. | Uninstall network observation: zero outbound calls; exit verification report present. | X·H |

---

## 6 · PART IV — THE MACHINE (MAC-01 … MAC-19)

| ID | § | Atom — the end-state claim | Falsifier | S |
|---|---|---|---|---|
| MAC-01 | 23 | The kernel stays frozen flat: the anvil at 856/860 sdk LOC with 45 frozen exports, the host at 1500/1500 — both gate-verified. | The LOC and anvil gates (B5 / D-404) — enforced today, green. | H |
| MAC-02 | 23 | One vault, ~16 namespaces, with owner/writers/retention declared per row in the same commit that first writes them — `ns canvas` included. | Namespace-table coverage; an undocumented namespace is refused. | V |
| MAC-03 | 23 | `vivim.law` gates every streamed response — no stream reaches a surface ungated, and refusal is a sentence. | **F6 / W5** — a person types, a real streamed response comes back through the law gate, ledgered and queryable. | L |
| MAC-04 | 23 | Every tile is a composition; no product composition carries `forge.*` capabilities; plugins are realization rows, never singletons. | Composition manifest audit (the forge-surface gate stage already enforces the no-`forge.*` clause today). | C·H |
| MAC-05 | 23 | One `surfaceOpMeta` derivation yields every surface — canvas, CLI, MCP, daemon, web, and language — N derived surfaces in parity by construction. | Surface parity by construction (Wave 3's falsifier); a drift test across surfaces stays green. | H·I |
| MAC-06 | 25 | **Forge anything**: any object from a description — the gap between "user" and "extender" never existed; it was a door, and the door is gone. | **F2** — a user says "forge this," consents in place, and a new tile is born badged — no privileged path. | I·V·C |
| MAC-07 | 25 | **Heal anything**: any provider survives the world changing under it. | **F3** — a provider drifts; the loop proposes + proves; a certifying principal ratifies vN→vN+1; rollback exists. | V·C |
| MAC-08 | 25 | **Extend anything**: any plugin can build plugins — the role is open to all; a third-party Forge passes the same gates as `forge.author` and is promotable to `generic`. | **F4** — a Forge built Forges, through the exact same door, refusal tests required, emission conferring no authority. | C·H |
| MAC-09 | 25 | **Badge / Promote / Demote anything**: everything earns a better badge by being proven, not claimed; anything that breaks is demoted — labels can fall, loudly. | **F5** plus promotion-requires-proof and demotion-is-a-named-event tests. | V·C |
| MAC-10 | 25 | **Refuse anything**: the system can say no, out loud, in a sentence — every register refusal is enforced by a gate, a label, or a law row, not by intention. | The refusal register (§7 below) — each of its 19 rows maps to machinery, not intention. | L |
| MAC-11 | 25 | **Query / Replay anything**: every row is queryable with evidence, and every decision is replayable from the ledger. | With CON-16 and CON-18: why-queries and per-decision-class replay tests, cross-namespace. | J·V |
| MAC-12 | 26 | Healing and forging are one pipeline at two scales — there is no second "healing engine": observe / detect / discover / propose / prove / ratify *are* the forge ops (`forge.mine.capture`, `forge.mine.diff`, `forge.survey.run`, `forge.shape.map`, `forge.emit.*`, `forge.proof.conform`, `forge.proof.refusal`, `forge.tier.promote`). | Stage→op mapping audit; the loop's falsifiers are **F3**/**F4**. | V·C·H |
| MAC-13 | 26 | No selectors as stored truth: the stored unit is the canonical shape (roles · structure · states · transitions); selectors are derived, disposable projections — regenerated the way a CLI command is regenerated from `surfaceOpMeta`. | Shape regeneration test: selectors regenerate from stored shapes; no stored selector is load-bearing. | V·H |
| MAC-14 | 27 | Provenance is the visible surface: both axes — `ProvenanceTier` × `generality` — always visible, in plain words, derived from data that cannot be hand-written; the axes never merge, never rename, never overload each other. | **F5** — every tile shows both axes; no object can hide who vouches for it; an axis-merge attempt is refused. | V |
| MAC-15 | 28 | The fresh-build default holds, with a deliberately tiny salvage list: the 7 stream parsers as pinned fixtures, the atlas as assay input, the measured pain as requirements, the manifesto as soul — nothing else is harvested from the old tree. | Harvest audit: the salvage list is exhaustive; any other old-tree byte in the product is a violation. | X·V |
| MAC-16 | 29 | No cloud account, ever required — local-first is a boot property, not a settings toggle; the marketplace is a web of sovereigns, not a mall. | Full-product walk (including sharing and discovery) with zero accounts and zero servers (with **F11** offline paths). | H·S |
| MAC-17 | 29 | No SDK above Ω: Forges are ordinary plugins — the tooling that builds the tooling passes the same doors as everything else. | Forge plugins' gate conformance (the forge-surface stage — one risk class per forge plugin, refusal tests, catalog-exact wire — enforced today). | H·C |
| MAC-18 | 29 | No docs that can lie: the auto-librarian generates documentation from the tree + the ledger — docs cannot lie, they can only be stale, and staleness is measured. | Generated-docs provenance test: every doc claim traces to tree/ledger data; staleness is a measured, named state. | V |
| MAC-19 | 30 | The end state arrives only when all twelve arrival falsifiers (F1–F12) and the per-choicepoint falsifiers are green on real boots — and each turns red when its claim is false. | The falsifier register itself, run against real boots. | all |

---

## 7 · The registers, mapped

The vision carries three registers whose rows are claims in their own right.
Each row below lands on at least one atom — the completeness check in both
directions: no register row without an atom, no atom orphaned from the vision.

### 7.1 · The falsifier register (F1–F12 + CP)

| Falsifier | Owed wave | Atoms |
|---|---|---|
| F1 · Headless | 4 | CON-01, CIV-10 |
| F2 · Self-forge | 4 | MAC-06, CON-23, CIV-03 |
| F3 · Self-heal | 5 | MAC-07, MAC-12, CIV-04 |
| F4 · Forges-build-Forges | 6+ | MAC-08, MAC-17 |
| F5 · Provenance at a glance | 4 | MAC-14, MAC-09, CON-17 |
| F6 · The W5 atom (conversation specialization) | 1 | MAC-03, CON-14 |
| F7 · Intent determinism | 3 | CON-03, CON-04, CON-05, CON-06, CON-07, CON-13, PHY-14 |
| F8 · The governor | 4 | PHY-01, PHY-03, PHY-05 |
| F9 · Temporal sovereignty | 4 | CIV-22, CIV-23, CON-20 |
| F10 · The exit | 6+ | CIV-30, CIV-31, PHY-20 |
| F11 · Two sovereigns | 6+ | CIV-28, PHY-09 |
| F12 · The mind spine | 2 | CIV-15, CIV-16, CIV-17 |
| CP-1 · Device convergence | 4 | CON-20, CIV-09 |
| CP-2 · Watchdog kill + capability refusal | 4 | CON-21 |
| CP-3 · Layout restore + sole-writer refusal | 4 | CON-02, CON-22 |
| CP-4 · One-sentence, one-tap Ledger Lens | 4 | CON-23, MAC-06 |

### 7.2 · The refusal register (19 rows)

| # | Refusal | Atoms |
|---|---|---|
| 1 | No cloud account, ever required | MAC-16, CON-09 |
| 2 | No telemetry, no attention metrics | CON-10 |
| 3 | No silent promotion | CIV-04, MAC-09 |
| 4 | No SDK above Ω | MAC-17 |
| 5 | No selectors as stored truth | MAC-13 |
| 6 | No docs that can lie | MAC-18 |
| 7 | No unlabelled generality | CON-17 |
| 8 | No privileged path | CIV-03 |
| 9 | No namespace without a retention rule | CON-12, MAC-02 |
| 10 | No raw model output across the law gate | CON-05 |
| 11 | No silent intent resolution | CON-06 |
| 12 | No LLM in the trusted execution path | CON-07 |
| 13 | No authority from data | PHY-13 |
| 14 | No resource without a budget | PHY-01, PHY-02 |
| 15 | No consent that cannot be zoned | CIV-20, CIV-21 |
| 16 | No sharing without a treaty — and never the data | CIV-27, CIV-28 |
| 17 | No remembered row without a named kind | CIV-17 |
| 18 | No lost device loses the vault | PHY-10 |
| 19 | No essential state the user cannot export | CIV-31 |

### 7.3 · The capability map (eleven rows)

| Capability | Atoms |
|---|---|
| Forge anything | MAC-06, CON-23 |
| Heal anything | MAC-07, MAC-12 |
| Extend anything | MAC-08 |
| Badge anything | MAC-09, MAC-14, CON-17 |
| Refuse anything | MAC-10, CON-15 |
| Query anything | MAC-11, CON-16 |
| Sync anything | CON-20, CIV-09 |
| Replay anything | MAC-11, CON-18, CIV-25 |
| Promote anything · Demote anything | MAC-09 |
| Say anything | CON-03, CON-04, CIV-12, CIV-13 |

---

## 8 · Coverage matrix — every section cashes out

| Vision § | Section | Atoms |
|---|---|---|
| 0 | The one sentence | CON-01, CON-02 |
| 1 | The shift | MAC-15, PHY-19 (the ore side: salvage + airlock) |
| 2 | The Natural Language Control Plane | CON-03 … CON-08 |
| 3 | The philosophy — the Sovereign Mirror | CON-09 … CON-12 |
| 4 | The core inversion | CON-01, CON-02, CON-13 |
| 5 | The atom — the governed event | CON-14 … CON-18 |
| 6 | The live object + CP-1…CP-4 | CON-19 … CON-23 |
| 7 | The human model | CIV-01 … CIV-04 |
| 8 | The world model | CIV-05, CIV-06 |
| 9 | The object model | CIV-07, CIV-08 |
| 10 | Spaces | CIV-09, CIV-10 |
| 11 | The interaction model | CIV-11, CIV-12, CIV-13 |
| 12 | The intelligence model | CIV-14, CIV-15, CIV-16 |
| 13 | The memory model | CIV-17, CIV-18 |
| 14 | The agency model | CIV-19, CIV-20, CIV-21 |
| 15 | The temporal model | CIV-22 … CIV-26 |
| 16 | The sharing model | CIV-27, CIV-28, CIV-29 |
| 17 | The sovereignty test | CIV-30, CIV-31, CIV-32 |
| 18 | The resource constitution | PHY-01 … PHY-07 |
| 19 | The identity constitution | PHY-08 … PHY-12 |
| 20 | The security constitution | PHY-13, PHY-14 |
| 21 | The failure vocabulary | PHY-15, PHY-16 |
| 22 | The lifecycle | PHY-17 … PHY-20 |
| 23 | The stack, instantiated | MAC-01 … MAC-05 |
| 24 | Days on the Sovereign Environment | narrative — embodies: Morning→F2 (MAC-06); Midday→F3 (MAC-07, CIV-20); Afternoon→F4 (MAC-08); Evening→headless + sleeping (CON-01, CIV-26); Night→F5 (MAC-14, CON-16); Saturday→F11 (CIV-28); Sunday→F9 (CIV-22, CIV-23, CIV-24) |
| 25 | The capability map | MAC-06 … MAC-11 (mapped §7.3) |
| 26 | The healing loop | MAC-12, MAC-13 |
| 27 | Provenance as the visible surface | MAC-14 |
| 28 | The 100x table | MAC-15 (salvage exhaustiveness; the FRESH verdicts are rubric, not atoms) |
| 29 | The refusal register | mapped §7.2 (every row → atoms) |
| 30 | Falsifiers of arrival | mapped §7.1; MAC-19 |
| 31 | The arc from here | **not atomized** — the road, not the destination: waves open on green falsifiers, not dates; its wave assignments are already carried by §7.1 |
| 32 | What this document is not | **not atomized** — meta |

**Counts:** 94 atoms — 23 constitution (CON), 32 civilization (CIV), 20 physics (PHY), 19 machine (MAC). Every vision section §0–§30 lands on at least one atom; §31–§32 are excepted with reason. Every falsifier (F1–F12, CP-1…CP-4), every refusal-register row (19), and every capability-map row (11) lands on at least one atom. No atom cites machinery the vision does not claim, and no atom invents a falsifier the vision does not owe.

**Next:** `OMEGA-CORE-STRUCTURAL-ANALYSIS.md` runs the only question these atoms exist to answer — for each surface the atoms lean on, does today's omega core already carry the structure, or is there core work that must be cut *now* because cutting it later means re-typing ratified history, reopening frozen surfaces, or migrating persisted data?



