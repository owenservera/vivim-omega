# vivim_omega_core → VIVIM-Ω parity map

Layer by layer, mapped to the Rust genesis kernel (`vivim_omega_core/src/*.rs`). Each
section: what the Rust layer guarantees, what Ω has today, the gap, and the concrete
change. Ordered the way they'd actually need to land — graph before centrality, genesis
before graph consumers — not the alphabetical order of the Rust source files.

Legend: 🔴 missing outright · 🟡 present but narrower/different scope · 🟢 already at parity

---

## 1. `graph.rs` → the capability graph — 🔴 missing

**Rust guarantee.** One `CapabilityGraph`: every principal and every capability is a node
in the same `DiGraph`. A grant is an edge `to -> capability`, carrying a `SignedGrant` as
its weight. `who_offers(cap)` is a plain incoming-neighbor query. "Global" is not a special
case — it's an edge to the `everyone` node, indistinguishable in the graph from any scoped
grant.

**Ω today.** `host/src/ports.ts` — `PortRouter.opRoute` is a flat `Map<op, pluginId>`,
one owner per op, built once in `buildRoutingTable()` from the signed `Recipe`
(`contracts/src/recipe.ts`). There is no node/edge structure, no capability-as-object, and
no `everyone` principal — every grant is `entry.id` hardcoded into a `CompositionSpecEntry`
in a `compositions/*.json` file.

**Why it matters.** This is the layer everything else in the Rust core depends on
(`who_offers` for #6, `centrality::sweep` for #7, `ToolRegistry` generations for #9 could
also live as edge metadata). Without it, "who currently answers X" is a question only the
Recipe author can answer, at compile time, by name — not a question the runtime can answer
by query. Atomizing a coarse plugin into five later means hand-editing every composition
spec that referenced the old owner, not a resolver automatically finding the new offerors.

**Change.** New module, `host/src/graph.ts`, additive alongside `ports.ts` (does not
replace the Recipe as grant source of truth — the graph is *compiled from* the Recipe at
boot, the same way `opRoute` is today):

```ts
export type NodeId = string;
export type NodeKind = "principal" | "capability";

export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  granularity?: "coarse" | "atomic"; // principals only
  extractionCandidate?: boolean;
}

export interface GraphEdge {
  to: NodeId;         // holder
  capability: NodeId;
  grant: SignedGrant;  // see audit.md — never an edge without one
}

export class CapabilityGraph {
  upsertNode(n: GraphNode): void;
  grant(from: string, to: string, capability: string, grant: SignedGrant): void; // refuses unsigned/unverified
  whoOffers(capability: string): NodeId[];   // incoming principal-neighbors of a capability node
  fanIn(id: string): number;
  blastRadius(id: string): number;           // BFS downstream of a node's grant edges
  allNodes(): NodeId[];
  allPrincipals(): NodeId[];
}
```

`buildRoutingTable()` in `host/src/ports.ts` becomes a thin wrapper: for each
`CompositionEntry`, `upsertNode` the entry as a principal, `upsertNode` each routed op as a
capability, `grant()` the edge. `PortRouter.dispatch` changes from `this.opRoute.get(op)` to
`graph.whoOffers(op)` (today's compositions only ever produce a single offeror per op, so
behavior is unchanged until a second offeror is registered — this is the seam that makes
atomization additive instead of a breaking edit).

`EVERYONE` becomes a real, always-present node minted at boot (see genesis, §2), so a
future "make this capability globally available" is `graph.grant(KERNEL, EVERYONE, cap, …)`
— an ordinary signed edge, not a new code path.

---

## 2. `genesis.rs` → the closing bootstrap — 🟡 present, narrower

**Rust guarantee.** `Genesis::bootstrap()` is the *entire* hardcoded surface of the system:
five nodes (`SCHEMA`, `KERNEL`, `EVERYONE`, `STATE_ARBITRATOR`, `CAP_SELF_DESCRIBE`) and two
self-referential grants that close the "who defines the definer" regress into a cycle
(Smalltalk-metaclass style) instead of leaving an implicit, undeclared root somewhere in
the code. Every later plugin/tool/grant is ordinary data on top of this closed set.

**Ω today.** Ω has a real analog for *one* piece of this: `verifyCompositionInvariants()`
in `host/src/recipe.ts` hardcodes that `bootPhase 0` must be exactly `vivim.law` — a
structural, non-plugin root, enforced at verify time. That's a genuine genesis-style rule.
But there's no closed set of primitive *nodes* (no `EVERYONE`, no self-describing schema
node, no explicit `STATE_ARBITRATOR` identity) and no self-referential closing grant —
"vivim.law is phase 0" is a rule about the Recipe shape, not a graph fact.

**Change.** Extend `ensureVault()` / `bootComposition()` in `host/src/boot.ts` to seed the
new `CapabilityGraph` (§1) with a fixed genesis set before the Recipe's own entries are
added:

```ts
// host/src/genesis.ts
export const SCHEMA = "genesis:schema";
export const KERNEL = "genesis:kernel";
export const EVERYONE = "genesis:everyone";
export const STATE_ARBITRATOR = "core:state-arbitrator"; // see §3
export const CAP_SELF_DESCRIBE = "cap:self-describe";

export function bootstrapGenesis(graph: CapabilityGraph, audit: AuditLog): void {
  // upsert the 5 nodes, record+grant the 2 closing edges (KERNEL→KERNEL, KERNEL→SCHEMA
  // over CAP_SELF_DESCRIBE) — mirrors genesis.rs almost verbatim, this part of the Rust
  // design doesn't need reinterpreting for TS, it's already language-agnostic.
}
```

`vivim.law`'s existing phase-0 requirement stays as-is (it's a genuinely different,
complementary rule: Rust genesis fixes *identities*, Ω's phase-0 rule fixes *boot order for
the gate* — keep both). What's new is that `vivim.law` itself becomes a `Principal` node
registered *after* the fixed 5, same as every other composition entry — genesis stays the
kernel's own hardcoded surface, not extended per-composition.

---

## 3. `state.rs` → state arbitration — 🟡 present, narrower scope

**Rust guarantee.** `StateArbitrator` is a system-wide lock table keyed by arbitrary
string, exclusive-vs-shared holders, callable by any principal, created once under the
fixed `STATE_ARBITRATOR` identity and excluded from extraction/atomization *by
construction* (not by a policy flag someone could later loosen).

**Ω today.** `plugins/vivim-vault/src/db.ts` — a single-writer promise queue that
serializes writes *within the vault compartment*, over vault-record keys only. It is real
and it works, but its scope is narrower on two axes: (a) it only arbitrates vault-backed
state, not arbitrary shared state some other plugin might hold (e.g. two plugins racing on
an in-memory resource outside the vault); (b) it isn't reachable as a general capability —
nothing outside vault code can ask "is key K currently held, by whom, in what mode."

**Why this one can't wait.** Same as the Rust README's framing: this is the one
non-negotiable non-plugin. Everything else in Ω can be atomized or swapped; the arbiter
cannot, or two plugins racing on the same declared state key silently corrupts it — the
exact failure mode the whole capability-graph design exists to prevent.

**Change.** A new host-level (not compartment-level) primitive, reachable via a port op
like every other capability, but implemented in the µhost itself rather than as a
plugin — so it's not just narrower-scoped, it's also not currently *ambient* the way
`state.rs` is:

```ts
// host/src/state.ts
export type LockMode = "shared" | "exclusive";

export class StateArbitrator {
  tryAcquire(key: string, principal: string, mode: LockMode): Result<void, string>;
  release(key: string, principal: string): void;
  holdersOf(key: string): Array<{ principal: string; mode: LockMode }>; // audit/debug only
}
```

Registered in `genesis.ts` (§2) under `STATE_ARBITRATOR`, with `extractionCandidate: false`
hardcoded and never settable via manifest — mirrors the Rust comment that this exclusion is
"by construction," not "by policy that could later be relaxed by mistake." Exposed as a
capability-gated op (`state.acquire@1` / `state.release@1`) so `vivim-vault` and any future
non-vault stateful plugin arbitrate through the same primitive instead of each rolling its
own lock, which is the actual fix for the narrower-scope gap — not replacing vault's
internal queue (keep that; it's a correct, cheap optimization for the vault's own writes),
but giving everything *outside* the vault the same guarantee vault already gives itself.

---

## 4. `audit.rs` → signed, hash-chained provenance — 🟡 present, not chained

**Rust guarantee.** Every `SignedGrant` is ed25519-signed over a canonical payload that
includes `prev_hash` — the hash of the previous entry. `verify_chain()` walks the whole log
and fails if any hash link or signature is wrong, so tampering with *any* past entry is
detectable by anyone holding the public key, without trusting the process's memory.

**Ω today.** Real signing exists (`host/src/canon.ts` — `signJson`/`verifyJson`, ed25519,
used for manifests and the Recipe itself). Runtime *decisions*, though, go to
`host/src/ports.ts`'s `journal()` and `plugins/vivim-law/src/index.ts`'s `journal()` —
append-only JSONL (`law-journal.jsonl`), explicitly best-effort ("journal append failure —
decision stands, journaling skipped"). No `prev_hash`, no chain, no `verify_chain()`. A
journal entry can be silently truncated or edited without anything detecting it.

**Why the gap is real but shouldn't be closed by making the journal load-bearing.** The
Rust design deliberately keeps signing decoupled from graph mutation (`audit.rs` "knows
nothing about `graph.rs`"), and the README says explicitly this audit log is meant to sit
*underneath* a heavier governance/Merkle layer, not replace it. Ω's journal being
best-effort is a considered choice too (`vivim-law`'s comment: "a law decision is never
blocked by a journal failure") — don't lose that fail-open-on-journaling property.

**Change.** Add a parallel, append-only, hash-chained log specifically for graph
mutations — grants, revocations, generation bumps (§9) — distinct from the free-form
decision journal, and *not* on the critical path of a `law.check` decision the way the
journal correctly isn't:

```ts
// host/src/audit.ts
export interface GrantPayload { from: string; to: string; capability: string; seq: number; prevHash: string; }
export interface SignedGrant { payload: GrantPayload; signature: string; signerKeyId: string; }

export class AuditLog {
  record(from: string, to: string, capability: string): SignedGrant; // signs + chains
  verifyChain(): boolean;
  length(): number;
}
```

`CapabilityGraph.grant()` (§1) requires a `SignedGrant` produced by this `AuditLog`, exactly
as `graph.rs` requires one from `audit.rs` — so an edge with no provenance is structurally
impossible to add, not just discouraged by convention. This is additive to the existing
`law-journal.jsonl`, which keeps doing what it does today.

---

## 5. `contract.rs` → versioned interface vs. implementation — 🟡 present, not range-resolved

**Rust guarantee.** `Contract { name, version }` is the interface; `ToolRegistry<T>` keeps
*every* published `GenerationPin` for a tool name; `resolve(name, req: VersionReq)` returns
the newest generation matching a caller's declared range. A caller holds an `Arc` to
exactly the generation it resolved, even after a newer incompatible one publishes.

**Ω today.** `contracts/src/manifest.ts` already separates concept from implementation
reasonably well — `Contribution { kind: "contract" | "engine" | "provider", id, version }`
plus `routableOps()`/`riskyOps()` do distinguish a declared interface from what offers it.
But `DependencyRef.range` (`contracts/src/recipe.ts` doesn't show it, it's on the
manifest — `dependencies: DependencyRef[]` with `{ ref, range }`) is resolved once, at
**compile time**, in `compileComposition()` (`host/src/recipe.ts`) — not per-caller, and
there's no multi-generation registry. Whatever satisfied the range when the Recipe was
compiled is the only implementation that will ever exist for the life of that Recipe.
Changing implementation means recompiling and rebooting the whole composition.

**Change.** Layer a `ToolRegistry`-equivalent on top of the graph (§1) rather than
replacing manifest/recipe compilation, since Ω's compile-time resolution is a legitimate
and cheap default for the common case (composition doesn't change mid-flight today):

```ts
// host/src/contract.ts
export interface GenerationPin<T> { version: string; impl: T; } // impl: e.g. a compartment/handle ref

export class ToolRegistry<T> {
  publish(name: string, version: string, impl: T): void; // never removes prior generations
  resolve(name: string, range: string): GenerationPin<T> | undefined; // newest match ≤ range
  latest(name: string): GenerationPin<T> | undefined;
  generationCount(name: string): number;
}
```

This is the mechanism `PortRouter` needs before it can support a live plugin upgrade
without a full recompose — see §9, since range-resolution and generation-pinning are one
feature split across two Rust files for separation of concerns, and should probably land
together in Ω rather than as two separate migrations.

---

## 6. `graph.rs::who_offers` → resolution by query — 🔴 blocked on §1

**Rust guarantee.** Already covered above — `who_offers` is a plain graph query, so a
caller asking for a capability never knows or cares whether one coarse plugin or five
atomized ones currently answer it.

**Ω today.** `PortRouter.dispatch()` calls `this.opRoute.get(op)` — one static string
lookup against a table built once at boot from the Recipe. There is exactly one possible
answer per op, decided by whoever authored the composition spec, and it cannot change
without a reboot.

**Change.** This has no independent module — it *is* `CapabilityGraph.whoOffers()` from
§1, consumed by `PortRouter.dispatch`. Called out separately here only because it's a
distinct Rust requirement with its own test
(`a_coarse_plugin_wraps_legacy_surface_honestly`) and its own failure mode if skipped: even
after §1 lands, if `dispatch` keeps reading `opRoute` directly instead of switching to
`graph.whoOffers(op)`, the graph becomes a parallel structure that's *true* but never
*consulted* — the same ambient-authority-adjacent trap the original design conversation
flagged for "global by default." The concrete change is exactly one line in
`host/src/ports.ts`'s `dispatch()`: swap the `Map.get` for a `graph.whoOffers()` call (today
returning a single-element array in all existing compositions, so no behavior change until
a capability gets a second offeror).

---

## 7. `centrality.rs` → computed load-bearing status — 🔴 missing

**Rust guarantee.** `Centrality { fanIn, blastRadius }`, `isLoadBearing()` (fan-in ≥ 5 or
blast radius ≥ 20, tunable), and `sweep()` walks every node in the graph and reports which
ones currently cross the threshold — recomputed live, not assigned once by a person. One
metric drives two decisions: promote a node to tool-tier audit rigor, and flag a coarse
plugin's internal seam as a genuine extraction candidate.

**Ω today.** Nothing computes this. The only related signal is
`PluginManifest.extraction_candidate` / `internal_seams` — Ω's manifest schema *does*
support self-reported coarseness (this part is already at parity with `manifest.rs`, see
§8) — but nothing measures actual fan-in against the routing table to check whether that
self-report is still honest, or whether some *other*, undeclared capability has quietly
become load-bearing.

**Change.** Pure function over the graph from §1, no new state:

```ts
// host/src/centrality.ts
export interface Centrality { fanIn: number; blastRadius: number; }
export function isLoadBearing(c: Centrality): boolean; // fanIn >= 5 || blastRadius >= 20, tune per deployment
export function compute(graph: CapabilityGraph, nodeId: string): Centrality;
export function sweep(graph: CapabilityGraph): Array<[string, Centrality]>;
```

Natural attach point: expose as a new `law.centrality@1` op (READ-risk, same tier as
`law.registry@1` in `plugins/vivim-law/src/index.ts`) so both a human and `vivim-mind`
(Ω's self-knowledge plugin) can query "what's load-bearing right now" the same way
`law.registry@1` reports consent/generation state today. Run it after every batch of grants
rather than on a schedule, matching the Rust doc comment's intent.

---

## 8. `manifest.rs` → granularity-agnostic schema — 🟢 already at parity

**Rust guarantee.** One schema for a coarse legacy-wrapping plugin and a future atomic
plugin; `validate()` catches an atomic manifest still declaring `internal_seams` (lying
about having already extracted) and a manifest flagged `extraction_candidate` with an empty
seam list (flagging intent without doing the cheap work of naming the seams).

**Ω today.** `contracts/src/manifest.ts`'s `PluginManifest` already treats granularity as
data, not a schema fork — `contributions`/`dependencies`/`capabilities` are declared
identically regardless of how large the plugin is. This is a genuine match to requirement
#5 and needs no structural change.

**Gap worth closing anyway, small.** There's no TS equivalent of `PluginManifest::validate()`
— the two dishonesty checks the Rust test `manifest_catches_dishonest_self_reporting`
exercises aren't enforced anywhere in Ω's manifest parsing (`parseManifest()` in
`host/src/recipe.ts` checks structural shape, not this kind of self-consistency). Worth a
follow-up `validateManifestHonesty()` in `contracts/src/manifest.ts`, called from
`compileComposition()` alongside the existing structural checks — but this is a validation
addition, not an architectural change, and doesn't block anything else in this doc.

---

## 9. `contract.rs::GenerationPin` → per-execution version pinning — 🔴 missing

**Rust guarantee.** A caller resolves against a `VersionReq` and gets a live reference to
exactly that generation. A tool upgrade never yanks an in-flight caller to a newer,
possibly-incompatible build — new callers see the new generation, old callers finish
against the old one, and nothing needs to stop the world to publish an upgrade.

**Ω today.** `host/src/ports.ts`'s `generation` field is a single global integer, bumped
wholesale by `HOST_OPS.tokensRevoke` — an all-or-nothing revocation switch, not a
per-tool/per-caller version pin. There is exactly one live implementation per op for the
life of a boot; "upgrading" an implementation means recomposing and rebooting, during which
every in-flight call fails with `DEGRADED`, not a graceful generation handoff.

**Change.** This is the payoff of §5's `ToolRegistry`: once implementations are held as
`Arc`-equivalent references (a compartment handle wrapped, e.g., in a ref-counted or
simply-retained JS object — no GC pressure concern at Ω's scale) behind
`resolve(name, range)`, a caller's `PortResult` dispatch path in `PortRouter.dispatch()`
resolves its target generation *once per call* against its own declared range (from
`DependencyRef.range` in its manifest) rather than against whatever `opRoute` currently
points at. Publishing a new generation becomes `ToolRegistry.publish()` plus a new
compartment spawn (D-331's lazy-activation machinery in `host/src/boot.ts` already knows
how to spawn a compartment on first touch — this reuses that path for a *second*
compartment answering the same capability under a newer contract version, instead of only
ever supporting one). The existing `generation` counter in `PortRouter` keeps doing its
current job (blanket token revocation) — it doesn't need renaming, just stops being asked
to also do version pinning, which was never really its job.

---

## Build order

The dependency chain the modules above actually have on each other, not the Rust file
order:

1. **`host/src/audit.ts`** (§4) — no dependencies, needed by graph before graph accepts an edge.
2. **`host/src/graph.ts`** (§1) — depends on audit.ts for `SignedGrant`.
3. **`host/src/genesis.ts`** (§2) — depends on graph.ts + audit.ts; seeds the fixed 5-node set.
4. **`host/src/state.ts`** (§3) — depends on genesis.ts for the `STATE_ARBITRATOR` identity.
5. **Wire `PortRouter.dispatch`** to `graph.whoOffers()` (§6) — the one-line swap that makes
   §1–§3 load-bearing instead of parallel-and-unconsulted.
6. **`host/src/centrality.ts`** (§7) — pure function over graph.ts, no dependencies of its own.
7. **`host/src/contract.ts`** (§5) + generation-aware dispatch (§9) — depends on graph.ts
   existing as the thing tool-generation edges attach to.
8. **`contracts/src/manifest.ts` validation addition** (§8) — independent, can land anytime.

Steps 1–3 correspond exactly to the Rust README's "requirements 1–3 are structural, not
retrofittable" claim — they're first here for the same reason. Everything from step 4
onward can, per that same README, "evolve, be re-tuned, or be swapped without touching the
kernel" once 1–3 exist.
