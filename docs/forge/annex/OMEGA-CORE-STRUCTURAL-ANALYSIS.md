# OMEGA CORE vs THE SOVEREIGN ENVIRONMENT — STRUCTURAL ANALYSIS

> **Status: working analysis, pre-decisioning.** Per owner direction 2026-09-20:
> *"not yet at build decisioning; keep omega and the vision separate; atomize the
> end-state vision first; then think through deeply if there is any more core omega
> work needed to support the end vision (work required structurally, not
> tactically)."* This document answers that question and nothing else. It is not a
> backlog, not a wave plan, not a decision record, and it authorizes nothing.
>
> **Inputs:** `OMEGA-ENDSTATE-VISION.md` (the separated working copy, 713 lines, as
> amended at `18d0ea8`) · `OMEGA-VISION-ATOMS.md` (94 atoms) · a read-only structural
> inventory of `/home/z/my-project/vivim-omega` verified 2026-09-20 against the
> parked tree (`476be50`, quick gate green 03:24:44Z; full gate 1056/0 at the
> ratified tip) · the reference corpus under `/home/z/my-project/reference/`.

---

## 0 · The question, precisely

The owner's question has a sharp form: *does the end-state vision require more
core omega work — changes to the substrate itself — or is the remaining distance
tactical, buildable on top of what Wave 0 and the D-3xx decisions already paid
for?* The distinction matters because the two kinds of work fail differently.
Tactical work deferred is work owed — annoying, but the price stays flat.
Structural work deferred compounds: every row written, every surface shipped,
every policy row added against a weak contract raises the cost of fixing the
contract later. The whole discipline of this analysis is to find the places
where the vision's weight rests on contracts that have not yet been cut, before
volume accretes against their absence.

The answer, previewed honestly before the evidence: **the vision stands almost
entirely on a substrate that already exists. The retrofit-cost test leaves two
hard seams and one open choicepoint.** Two of the three are half-cut already —
assets sit in the tree, declared and unwired. The deep finding is not that much
core work is needed; it is that the little core work that *is* needed is
load-bearing for the vision's most constitutional claims, and its price rises
with every wave that lands before it.

## 1 · Method — the retrofit-cost test

**Structural work** = substrate change whose deferral raises later cost
superlinearly. Four triggers, any one of which makes a gap structural:

| # | Trigger | Meaning |
|---|---|---|
| R1 | Re-types ratified history | Closing the gap later requires migrating or re-shaping persisted rows that already exist (changelog, namespaces, journals, grants) |
| R2 | Reopens a frozen surface | The change touches the anvil (sdk 856/860, 45 frozen exports, D-404), the host LOC budget (1500 flat, B5), or the pinned `contracts/` wire types in a way that breaks their freeze discipline |
| R3 | Migrates persisted data | Existing stores must be rewritten rather than extended |
| R4 | Re-cuts a live input contract | A contract already in active use (the law gate's input, the capability grant shape, the policy doc schema) changes shape, invalidating accumulated dependents |

**Tactical work** = everything else: new plugins, new namespaces, new
compositions, new surfaces, new tooling — buildable at any time, on top, without
touching R1–R4. The test is deliberately mechanical so its verdicts are
arguable one by one rather than vibes.

Two clocks drive the compounding:

- **The volume clock** — rows, journal entries, consent grants, surfaces, and
  policy precedents accreting against a weak or missing contract. Structural
  cost is roughly proportional to this volume at the moment the contract is cut.
- **The freeze clock** — surfaces that harden as they ship (the anvil's freeze
  is the extreme case; live input contracts harden by dependents).

A gap is *urgent* only when both clocks run. A gap with a running volume clock
and no structural trigger is merely debt with interest. This is why "structurally
required" is not the same as "large" — the cheapest structural work in this
report is a seam cut before volume, measured in hundreds of lines, not
thousands.

## 2 · Ground truth — what omega IS today

A correction that governs every claim below: the workspace holds **two distinct
trees**, and the famous numbers live in the frozen one. `/home/z/my-project/vivim-omega`
is the fresh all-plugin Ω build — no Prisma, no CapabilityResolutionEngine. The
reference corpus (`/home/z/my-project/reference/`) holds the old Vivim tree
(`vivim-full/`: 200 Prisma models in the main schema plus 90 + 111 in the split
user/system schemas; 137 NLCL files across three directories, 54 of them shims;
the CapabilityResolutionEngine — which is a *UI-contract* resolver for provider
plan tiers, not an authorization engine), the docs bundle (MASTER-SPEC,
MASTER-BLUEPRINT with the intent-signal table: **capability-system 377 — the
single highest topic of 3,225 mined intent statements**), and the source atlas
(the 137/137 NLCL verdicts, the 67-contract store→vault mapping). The vision
cites these as *measurements of the mine* — which is exactly what they are.

What the Ω tree itself carries, verified with paths on the parked tip:

| Surface | State today |
|---|---|
| **Host / kernel** | µhost ≤ 1,500 LOC flat (B5, gate-enforced); `host/src/ports.ts` implements the dispatch order **token check → target resolution → law gate for risky ops → lazy spawn → deliver** — a refused call never pays a spawn (D-331); `host/src/graph.ts` + `audit.ts`: D-340 capability graph with signed (ed25519) hash-chained grant records — in-memory, exported via `HOST_OPS.auditChain` |
| **Anvil** | sdk 856/860 LOC, 45 frozen exports (D-404, gate-enforced at `tooling/gates/anvil.ts`) |
| **Law** | `plugins/vivim-law/src/index.ts` — the gate `law.check@1` consumes `{principal, op, payload, causationId}` and **`evalPolicy(doc, principal, op)` never inspects the payload**: typed on *who* and *which op*, blind to *what*. LAW_POLICY_V1 (versioned data, parity-tested), ConsentTable (D-384 cross-principal forgery refusal), ForbiddenTable overlay (D-325, persisted to ns `law`), ShadowAmendment divergence ledger. The law journal is `law-journal.jsonl` — an **unsigned, best-effort FILE** (`host/src/ports.ts:455`), boot-replayed, explicitly not covered by vault verification |
| **Capability** | `plugins/vivim-law/src/tokens.ts` — `Cap{scope, generation, parent}` with dot-scope grammar and `attenuate()` that **throws on broadening**; grants declared in `compositions/*.json`, compiled + signed into recipes; tokens minted at boot and checked host-side (B3) |
| **Vault** | `plugins/vivim-vault/src/` (D-373, behind the one declared driver seam) — append-only **hash-chained changelog** (`changelog.ts`, `entry_hash = sha256(seq\|causationId\|ns\|id\|rev\|cid\|prev_hash)`), content-addressed blobs (`cas.ts`, sharded by cid), latest-wins hot revisions + cold fallback, compaction that **never touches the changelog**, head→tail Merkle verification (`verify.ts`), full-copy roundtrip harness (`roundtrip.ts`). 19 namespaces at the 2026-09-20 snapshot (16 at this analysis's writing) in `docs/VAULT-NAMESPACES.md`, each with owner/writers/retention declared in the same commit that first writes them |
| **Intent** | `plugins/vivim-nlcl-pure/src/` — zero-import deterministic interpreter (determinism law N1): lexer/symbols/frames/grammar/ground/recognize/interpret; `Interpretation` (with `ir`, `canonical`, `reading`, `confidence`) is returned and **discarded**; the web console routes `call(ir.intent, ir.payload)` immediately. `contracts/src/intent.ts` carries the full D-389 IR — `IntentState` machine (submitted→…→cancelled), `IntentStep`, `payloadHash`, `planRef`, evidence refs — and `ns intent` + `ns intent-plan` are declared in namespace law with retention. But `vivim.intent` appears in **zero of the 18 compositions** (grep-verified), a `PendingIntent` type exists and is consumed by nothing, and the plugin carries a latent defect: `intent.cancel` references an undefined `stepId` inside a try/catch, so the compensation-evidence write **silently no-ops** (`plugins/vivim-intent/src/index.ts:233`) |
| **Runtime / resources** | D-331 dormant compartments (verified-but-unspawned, spawn on first gated call); watchdog (`tooling/watchdog/watchdog.ts`, D-360/D-366) — two-signal eviction (non-spoofable UNRESPONSIVE fast-kill + cooperative MEMORY graceful kill), budgets from manifest `runtime.budget.memMB`; per-compartment concurrency caps and deadline BUDGET refusals; run queue is pure scheduling data with **no timers**; the director tick is a 500 ms–1 h poll over ns `email` × ns `automation` with a no-refire ledger |
| **Identity** | Principals are **plain strings** (`agent:<id>`, `user:<id>` per D-336, reserved `root`/`µhost-gate`); consent grants, forbidden overlays, graph nodes, journal entries, and agent identities are all keyed by bare strings; the only cryptographic identity is the single vault root-of-trust ed25519 keypair (signs manifests, recipes, and the audit chain). No devices, no pairing, no recovery, no rotation |
| **Time** | No branches, no forks, no scheduler for delayed execution; the vault offers revision reads (`vault.get@1` with rev) — the projection substrate exists, the projection engine does not |
| **Exit / ingestion** | `vault.roundtrip@1` is a swap-safety harness (DB rows + CAS + FTS rebuild + chain-head comparison), not an open format; `packs/domain-import` is declarations-only; harvest fixtures exist (`fixtures/import/{claude,chatgpt,gemini}`) |
| **Gates** | Quick gate green on the parked tree (2026-09-20T03:24:44Z); full gate 1056/0 at the ratified tip; decisions checker green at 113 rows / 87 records / 86 ratified — the parked, consistent state |

---

## 3 · Seams already cut — the substrate the vision stands on

Before hunting gaps, credit what exists — because the vision's physics layer is
written as if it were all owed, and it is not. Five substrate decisions already
ratified into the tree carry most of the 94 atoms on their backs. Each item
below names the atoms it holds up and the caveat that must ride with it.

### 3.1 · The vault is a log, not a database — time, exit, and replay are projections

The changelog is append-only forever, hash-chained, over content-addressed blobs,
with latest-wins hot rows and cold fallback, and compaction that never touches
the changelog. That *is* the event-sourcing substrate. Time travel (CIV-22–25,
F9), the Exit Manifest (CIV-30/31, F10), decision replay (CON-18), and scope-undo
(CIV-24) are all folds over this log — new readers, no writers changed, no
migration, no frozen surface touched. R1–R4 all answer *no*.

**Caveat that must ride:** projections at arbitrary *T* require that compaction
never *deletes* a revision, only moves it hot→cold. The convention is stated
today (`VAULT-NAMESPACES.md`: compaction never deletes a revision cited by live
refs) but F9 needs the stronger form — never deletes, period. That is a one-line
invariant to hold explicitly as compaction evolves, not work.

### 3.2 · Objects are inert data; behavior lives in shared, lazy, budgeted compartments — the resource constitution is policy

"A thousand objects without a thousand active runtimes" (PHY-04) is not a
problem the vision poses the architecture — it is the architecture's founding
bet, already true: objects are vault rows; behavior is compartments, spawned
lazily *after* the gate (D-331), killed by a two-signal watchdog on manifest
budgets (D-360/D-366). The governor (F8), the ghost/dormant/hydrated/suspended
lifecycle (PHY-03), and resource profiles (PHY-02) are additive policy over
this: manifest fields and lifecycle-state extensions, not surgery. R1–R4: no.

### 3.3 · The capability algebra already encodes delegation — treaties have a substrate

`Cap{scope, generation, parent}` with `attenuate()` that throws on broadening is
deterministic narrowing — the mathematical core of "the right to delegate
deterministically" (CIV-19). Grants live in signed compositions; cross-principal
consent forgery already refuses with a sentence (D-384); scoped per-record token
revocation exists. What the sharing atoms still need — multi-instance trust,
network, treaty ceremony (CIV-28) — hangs on the *identity* seam (S2), not on
capability surgery. R1–R4: no.

### 3.4 · The trusted path is already LLM-free — F7's red line is half-met by construction

`vivim.nlcl-pure` is a zero-import deterministic interpreter (law N1); the live
path is interpret → routed call; no model sits in parse or execution. The
corpus's anti-pattern — the old tree's layered resolver admitting `'llm'` as a
resolution layer, the LLM silently in the parse path — is precisely what Ω's
determinism law refuses by design. What CON-05 and CON-07 still lack is not
"remove the LLM" but **persist what the deterministic path resolved** — which is
S1, not this seam.

### 3.5 · The governed-event shape is already generic — CON-14 is a discipline, not a migration

Changelog rows are `{seq, causationId, ns, id, rev, cid, prev_hash}` — generic
across actors and verbs; conversation is merely one writer (ns `chat`). The
D-408 generalization from conversation-event to governed-event describes what
the substrate already does. What it owes is the fold/replay projection and
branch pointers (tactical, Wave 4) and evidence unification (S3).

### 3.6 · The corpus de-risks the rest

The frozen tree proves the hard patterns are buildable: a typed ActionPlan IR
consumed by a policy-validation gate *before any side effect* (the old
`action-plan.ts` + `plan-validation-gate.ts` pair, MASTER-SPEC K0-03), a
device-pairing integration test, a first-party ContextAssemblyEngine. Ω rebuilds
these as law-gated vault machinery rather than porting them — the fresh-vs-port
verdicts of the vision's §28 stand — but the *existence proofs* lower the risk
on every tactical item in §5.

---

## 4 · The structural shortlist — the core work the vision actually requires

After §3, the retrofit-cost test leaves **two hard seams and one open
choicepoint** out of the 94-atom set. Both seams are already half-cut: assets
sit in the tree, declared and unwired. Neither is large; both are load-bearing;
both run on the volume clock.

### S1 · The canonical-intent seam (HARD — the Intent Layer's constitutional status is currently unfunded)

**The gap, verified.** The law gate is typed on *who* and *which op* and blind to
*what*: `evalPolicy(doc, principal, op)` never inspects the payload. The
deterministic interpreter resolves language into an `Interpretation` that is
returned and discarded; the live path collapses interpret→invoke into a single
step; only law decisions on risky ops are journaled. The full D-389 IR exists in
`contracts/src/intent.ts` — state machine, steps, `payloadHash`, `planRef`,
evidence refs — and `ns intent` / `ns intent-plan` are declared in namespace law
with retention rules. But the intent plugin is wired into **zero of 18
compositions**, the `PendingIntent` type is consumed by nothing, and the plugin
carries a latent defect (the `intent.cancel` compensation-evidence write silently
no-ops on an undefined `stepId`). The constitutional claim — *probabilistic
perception, deterministic intent, deterministic execution; the law consumes
canonical intent only* — currently has **no artifact for the law to consume**.

**Why structural (the R-trigger).** This is R4, the live input contract, with
the volume clock running on three fronts at once:

- Every policy row, consent grant, and law-journal entry written against untyped
  payloads is a dependent of the weak contract. LAW_POLICY_V1 is versioned data
  with parity tests — its shape hardens with use.
- The convergence claim (CIV-12/13: every surface converges on canonical intent)
  means each surface built pre-seam is a surface to re-route post-seam. Waves 1–2
  as planned — the W5 chat atom, the mind spine, memory namespaces — are
  precisely such surfaces.
- Seven atoms of the F7 family (CON-03–07, CON-13, PHY-14) all cash out at this
  one seam: without a persisted canonical artifact there is nothing to compare
  byte-wise, nothing for the gate to consume, nothing to replay, nothing to
  quarantine, and no four-state resolution (UNDERSTOOD / AMBIGUOUS / REFUSED /
  EXECUTED) to journal.

**What cutting the seam does NOT commit to — deliberately open.** Not the intent
engine's design (frame grammar, confidence model — Wave 3 tactical). Not the
plugin's wiring order or UI. Not the policy granularity (per-op rows can remain;
intent-typed policy can arrive additively). Not even the timing — the analysis
says the price rises with every pre-seam surface; when to pay it is the owner's
call, not this document's.

**Cheapest credible cut, offered as illustration, not prescription:** bind the
gate's input to the persisted artifact — law decisions cite `{intentRef,
payloadHash}`; give intents one canonical writer path (ns `intent` already
exists in namespace law); land the four-state resolution as rows. The corpus
precedent ran law over typed plans before any side effect touched the system —
the pattern is proven at a different scale, and Ω already owns the harder half
(the deterministic interpreter, law N1).

**Atoms served:** CON-03–08, CON-13, CIV-02, CIV-12, CIV-13, PHY-14; enables
F7 and half of F2's forge-from-a-sentence path. **Assets already in tree:**
`contracts/src/intent*.ts`, `vivim.intent` plugin, ns `intent`/`intent-plan`,
the deterministic interpreter, the gate in the right position (downstream of
resolution, upstream of execution and spawn).

### S2 · The principal-identity seam (MEDIUM-HARD — keys that survive the hardware)

**The gap, verified.** Principals are plain strings; consent grants, forbidden
overlays, capability-graph nodes, journal entries, and agent identities are all
keyed by bare strings; the single cryptographic identity is the vault's
root-of-trust ed25519 keypair. No devices, no pairing, no recovery, no
rotation.

**Why structural.** The identity atoms (PHY-08–12) and the sharing atoms that
depend on them (CIV-28, CIV-29, F11) require principals that are *stable,
non-reusable, and eventually key-bearing*. Late key-binding is possible only if
string principal IDs were never ambiguous and never recycled — an invariant
nothing currently enforces. The cheap insurance is an indirection cut now: a
principal record (an identity row with a non-reuse invariant), so that device
keys, quorum shares, and rotation rows attach to *records* later without
re-typing consent, grant, or journal history. That is R1/R3 avoidance in its
purest form — the classic "add identity later = migrate everything keyed by
identity" trap, closed for the price of one namespace discipline. The
cryptography itself — PAKE pairing, Shamir recovery, rotation — is **tactical on
top of the seam**, owed by the multi-device and ecosystem waves exactly as the
arc already assigns.

**What it does not commit to:** no crypto choices, no pairing UX, no
multi-device scheduling. **Atoms served:** PHY-08–12, CIV-28, CIV-29; de-risks
CP-1 and F11. **Corpus precedent:** the old tree's SyncPeer/User models and
device-pairing integration test prove the flow Ω would host.

### S3 · The evidence-store choicepoint (OPEN — an owner call to make later, with a closing window)

**The state, verified.** Three evidence stores with mismatched strengths: the
vault changelog (hash-chained, CAS, verified — but its rows are object state,
not governance narrative); the law journal (the governance narrative — decisions,
consents, refusals — but a plain unsigned best-effort **file** that vault
verification explicitly does not cover, acknowledged in `VAULT-NAMESPACES.md`
as "not a vault ns"); and the kernel audit chain (signed ed25519 — but
in-memory only, exported through a port, persisted nowhere).

**The tension.** The evidence atoms (CON-14, CON-16, CON-18) want governance
evidence to be as tamper-evident and replayable as everything else — and today
the most important narrative lives in the weakest store, while the strongest
signature machinery (the audit chain) evaporates on shutdown.

**The choice — recorded, not made.** (a) Fold law-journal rows into the vault
(ns `law` already exists and already persists the forbidden overlays), unifying
all evidence under the chain; or (b) keep the sidecar and give it a chain and a
signature of its own. Either way, the audit chain wants a persistence point.
The volume clock runs per gate decision journaled — the cost of unification
grows with every row, which makes this the one choicepoint where "cheap now"
has a literal expiry. This analysis deliberately renders no verdict: it is a
genuine open structural choice, and it belongs to the owner when decisioning
resumes.

---

## 5 · The tactical map — everything else, and what it hangs on

Every remaining atom cluster fails all four R-triggers: it adds plugins,
namespaces, compositions, tooling, or state enums *on top of* the substrate §3
describes, touching no ratified history, no frozen surface, no persisted
migration, no live contract. Deferred cost stays flat (or grows only linearly).

| Vision domain | Atoms | Hangs on | Why retrofit-safe |
|---|---|---|---|
| Mind spine · memory epistemics | CIV-14–18 (F12) | V, +S1 for intent-cited assembly | New memory namespaces (rows declare kinds; the namespace system is generic) + an assembly plugin; deterministic assembly is an implementation property tested by F12 |
| Surface derivation | MAC-05, CIV-11/12 | H policy, +S1 | `surfaceOpMeta` is tooling; surfaces are derived clients by rule. *Weak volume clock:* each hand-built surface adds parity debt, so the derivation wants to land before surface count grows — pressure, not structure |
| `ns canvas` · CP-3 | CON-02, CON-22, CIV-09/10 | V | New namespace; sole-writer law already exists. One design discipline must hold at creation (not code): canvas row shapes carry the CRDT-fold semantics from the first row — sloppy first rows cannot be retro-CRDT'd |
| Governor · tile lifecycle | PHY-01–07 (F8) | R (§3.2) | Lifecycle states extend the contracts union additively; profiles are manifest fields; the two-signal watchdog exists |
| Time travel · branches | CIV-22–25 (F9) | V (§3.1) | Fold/projection engine + branch pointers over the log; carry §3.1's compaction invariant |
| Sleeping compositions | CIV-26 | T, R | A scheduler surface (daemon/tick evolution); the queue already models deadlines and saturation refusal |
| Healing loop · canonical shapes | MAC-12/13 (F3) | V, C | New engines and additive shape schemas; the forge op set already covers the stages (§26 of the vision maps them one-to-one) |
| Ingestion airlock · salvage | PHY-19, MAC-15 | X | `forge.mine.capture` on the real mine; packs and fixtures exist; harvested rows are new writes, not migrations |
| Exit Manifest | CIV-30/31 (F10) | V (§3.1) | Serializer + importer + format document over changelog + CAS + heads; format versioning wraps the current shapes |
| Treaties · petnames · curators | CIV-27–29 (F11) | **S2**, C (§3.3) | After the identity seam: ceremony, network, and trust-graph rows — all additive |
| Failure vocabulary | PHY-15/16 | V, R | Named states mapping to existing machinery; the vocabulary begins in `contracts/src/lifecycle.ts` and extends additively |
| No docs that can lie | MAC-18 | V | Auto-librarian tooling reading tree + ledger |
| Refusal sentences everywhere | CON-15, MAC-10 | L | The pattern is already the repo's discipline (named refusals with reasons); extending it is per-surface work |
| W5 conversation atom | MAC-03, CON-14 (F6) | L, V, +S1 | Wave 1 as planned: chat streaming through the law gate, ledgered, queryable — the first specialization of the governed event |

## 6 · What would falsify this analysis

An analysis that cannot fail is a belief, not an analysis. The specific
observations that would prove this one wrong, clause by clause:

- **If Waves 1–2 land more than a handful of direct-call surfaces and op-paths**
  that must later re-route through canonical intent, S1's "cost grows with
  delay" was understated — the seam should have been cut before Wave 1, and the
  analysis erred by hedging its urgency.
- **If a principal string ID ever collides or is reused**, S2 was under-graded:
  the record indirection was mandatory insurance, not optional.
- **If compaction ever deletes (rather than moves) an uncited revision**, §3.1's
  verdict flips — time travel becomes a data migration, i.e. structural, and
  the tactical map's biggest row moves into the shortlist.
- **If law-journal volume grows past trivial before S3 is called**, the
  unification option silently prices itself out versus sidecar chaining — the
  choicepoint's window closes without anyone deciding anything, which is itself
  a decision.
- **If the anvil or host gates ever loosen to admit intent or identity
  machinery**, the "tactical on top" verdicts collapse wholesale — the freeze is
  precisely what keeps them cheap.

## 7 · Not decided

Nothing in this document schedules, scopes, classes, or records anything. The
atomization and this analysis are inputs to the owner's next deep pass. If core
work is warranted when decisioning resumes, S1, S2, and S3 — in that order of
load-bearing-ness — are its honest candidates; each is deliberately presented
with its non-commitments intact. Everything else the Sovereign Environment
dreams of is tactical on a substrate the project has already paid for, and the
tactical map above says what each cluster hangs on so that nothing lands on air.

The vision itself remains unratified and separate (`PARKED-STATE.md`): omega's
law is parked at its last ratified state (`476be50`, D-407), the amended vision
travels in this directory, and the D-408 record is restorable verbatim whenever
the owner chooses how — and whether — it lands.


