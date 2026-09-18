# The host-LOC budget fork: where does the graph/genesis/state layer actually live?

`RUST-CORE-PARITY.md` proposes six new modules (`graph.ts`, `genesis.ts`, `state.ts`,
`audit.ts`, `centrality.ts`, `contract.ts`) as additions to `host/src/`. That's the
natural home by the Rust precedent — `vivim_omega_core`'s own modules are all
kernel-level, all non-optional, all in the one crate. But Ω's host isn't an unconstrained
crate. It's under a **hard, gate-enforced 1,000-LOC ceiling** (`tooling/gates/gate.ts`,
law B5: *"The µhost is boring and may not grow"*), currently at **976/1000**. This doc
exists because that fact changes the implementation plan for doc 1, and the team needs to
decide which path before writing code, not discover the collision mid-implementation.

This is exactly the tension the original design conversation predicted and then
deliberately chose not to resolve in favor of a flat kitchen — the transcript's third
exchange: *"the uncomfortable implication: the 'perfect kitchen' isn't actually flat — it
has one privileged layer... that's held to a much higher stability bar than everything
built on top of it."* Ω already made that call once, concretely, as B5: the µhost is the
privileged layer, and it's kept deliberately small specifically so it stays hand-verifiable
— which is the same motivation behind the Rust genesis kernel being "5 nodes, 2 grants,
hand-verifiable." B5 and Rust's genesis-closure requirement are the *same instinct*,
independently arrived at. The question this doc answers is just: given that instinct is
already law in Ω, where do six new modules actually go without violating it.

---

## Sizing the actual additions

Rough LOC estimates, based on the Rust originals (which are compact — `graph.rs` is 189
lines including doc comments, `genesis.rs` 135, `state.rs` 75, `audit.rs` 128,
`contract.rs` 93, `centrality.rs` 57) and typical TS-vs-Rust density for equivalent logic
(TS tends slightly shorter for this kind of code — no explicit lifetime/ownership
annotation, no `impl` block boilerplate — but add back type-guard/error-shape code Ω's
existing modules consistently include, e.g. `host/src/recipe.ts`'s explicit per-field
validation):

| Module | Rust LOC | Estimated TS LOC | Notes |
|---|---|---|---|
| `graph.ts` | 189 | ~150 | No `petgraph` equivalent — a hand-rolled adjacency map is simpler in JS than the Rust `DiGraph` wrapper, offsetting some doc-comment loss |
| `genesis.ts` | 135 | ~90 | Mostly a fixed literal seed; shrinks in TS since there's no explicit `Arc`/ownership ceremony |
| `state.ts` | 75 | ~70 | Nearly 1:1 — this is the simplest module in the Rust core |
| `audit.ts` | 128 | ~110 | ed25519 signing already exists in `host/src/canon.ts` (`signJson`/`verifyJson`) — this module reuses that, not reimplements it, so it should come in *under* the Rust original |
| `centrality.ts` | 57 | ~45 | Pure function over graph.ts, smallest addition |
| `contract.ts` | 93 | ~80 | `ToolRegistry`/`GenerationPin` — no `Arc` ceremony in TS |

**Total estimate: ~545 LOC.** Against a budget with **24 LOC of headroom remaining**
(1000 − 976), even the most conservative version of this addition overshoots by roughly
**520 LOC** — more than half the entire current host size. This isn't a "trim some
comments" gap. It's a structural mismatch between where the Rust design naturally wants
to live and where Ω's law currently allows host-side code to grow.

---

## Three real options, not two

### Option A — Raise the B5 ceiling

Treat B5's 1,000-LOC number as a tuning constant, not an immutable law, and raise it to
accommodate the graph layer (e.g. to ~1,600, with headroom).

**For:** Simplest to implement — these six modules genuinely are kernel-level by the same
logic that put `state.ts`'s arbitrator, `graph.ts`'s single-graph invariant, and
`genesis.ts`'s closed bootstrap in the *kernel* crate in Rust, not in some optional
extension. Splitting them into a plugin (Option B) risks exactly the thing B3 exists to
prevent — capability tokens must be verified **host-side, outside every compartment**
(law B3, `README.md` line 17). A `CapabilityGraph` that a plugin owns, where the *graph
itself* decides who-offers-what, is arguably capability-verification-adjacent logic
being pushed into a compartment — which is the isolation boundary law B3 was written to
keep on the trusted side.

**Against:** B5 exists for a reason stated explicitly in `README.md`'s ten laws — "the
µhost is boring and may not grow." Raising the number the first time a big feature wants
in is exactly the failure mode a hard gate exists to prevent; a budget that moves whenever
something big needs to fit isn't a budget. This also isn't a code change — it's a change
to one of the ten foundational laws in `README.md`, which should go through whatever
process the project already uses for law changes (check `docs/decisions/` for precedent —
D-321 through D-339 are all *decisions within* the law, not changes *to* the law itself;
if no prior decision has ever amended one of the ten laws, this would be a first, and
probably deserves more ceremony than a normal `D-3xx` entry).

### Option B — Split into a new phase-0-adjacent plugin, `vivim.kernel`

Give the graph/genesis/state/audit/centrality/contract layer its own plugin, booted
alongside (not instead of) `vivim.law` at a new reserved early phase — say phase 0 stays
`vivim.law` exactly as today (B6/the phase-0 rule doesn't change), and a new rule reserves
phase `0.5` or an explicit second "structural" phase for `vivim.kernel`, verified with the
same rigor as `vivim.law` today.

**For:** Keeps the host at 976 LOC, no law change needed. Matches the precedent Ω already
has for "this is structurally special but still a plugin" — `vivim.law` itself is a
plugin, not host code, and its specialness comes entirely from the phase-0 boot-order rule
in `verifyCompositionInvariants()`, not from living inside `host/src/`. The same pattern
extends cleanly: `vivim.kernel` is a plugin whose specialness comes from a new,
analogous structural rule, not from special code location.

**Against:** Genuinely harder to get right than it sounds, for one specific reason: B3
says capability tokens are verified **host-side, outside every compartment** so that a
compromised or buggy compartment can never forge or bypass a grant. If `CapabilityGraph`
lives inside a `vivim.kernel` compartment, then `PortRouter.dispatch()` in
`host/src/ports.ts` — which is unambiguously host code — would need to call *into* a
compartment (`vivim.kernel`) to resolve `who_offers()` on every single dispatched op, the
same way it already calls into `vivim.law` for every risky op via `callLaw()`. That's not
a fatal problem (the `vivim.law` precedent proves the pattern works), but it does mean
**every op dispatch, not just risky ones, gains a compartment round-trip** — today,
non-risky ops resolve their route with a synchronous `Map.get` in-process; under Option B
they'd all pay whatever `vivim.law`-style IPC latency the demo composition already shows
(sub-millisecond per BENCHMARKS.md, but non-zero, and now on *every* call instead of only
risky ones). Whether that's acceptable depends on the throughput ceiling work already
flagged in `SCALABILITY-CEILINGS.md` §3 for `vivim.law` — this option effectively doubles
the number of single-threaded chokepoints in the hot path.

### Option C — Split by what's actually host-critical vs. queryable

Don't treat the six modules as one unit. Some of them are genuinely B3-adjacent
(capability verification-critical, must stay host-side); others are read-only derived
views that don't need to be in the trust boundary at all.

- **Host-side (stays in `host/src/`, competes for the 1,000-LOC budget):** `graph.ts`'s
  core `upsertNode`/`grant`/`whoOffers` (this *is* what `dispatch()` calls on every
  request — the B3 concern applies directly), `genesis.ts` (fixes identities the host
  itself relies on, e.g. `STATE_ARBITRATOR`), `state.ts` (already argued in
  `RUST-CORE-PARITY.md` §3 to need host-level, not compartment-level, placement, for the
  same non-negotiable-arbiter reason `StateArbitrator` is host-adjacent in Rust).
- **Plugin-side (a new `vivim.mind`-adjacent or standalone plugin, no dispatch-path
  dependency):** `centrality.ts` (pure function over graph state — needs *read* access to
  the graph, not write access, and nothing in the hot dispatch path calls it; it's closer
  to `vivim-mind`'s existing self-knowledge role than to routing), `audit.ts`'s
  `verifyChain()` query surface (the *recording* of a grant needs to happen wherever
  `grant()` is called, i.e. host-side per B3, but *verifying* the chain after the fact is
  a read-only audit operation with no dispatch-path urgency), `contract.ts`'s
  `ToolRegistry` (resolving a caller's version range could plausibly be a host-side
  lookup like `graph.whoOffers`, since it's on the dispatch path the same way — this one
  is genuinely ambiguous and worth a team discussion, not a unilateral call in this doc).

**For:** Minimizes both the LOC-budget pressure (only the true dispatch-path-critical
pieces compete for host space) and the round-trip-latency cost of Option B (only what
must be host-side pays no compartment hop; what's read-only/off-critical-path can afford
one). Matches the Rust design's own internal distinction more precisely than treating all
six modules as equally kernel-grade — the Rust README itself says *"requirements 1–3 are
structural... requirements 4-9 can evolve, be re-tuned, or swapped without touching the
kernel"* — which is functionally the same graph vs. queryable-derived-data split proposed
here, just not yet mapped onto Ω's host/plugin boundary.

**Against:** More design work up front — Option A and B are each a single clean decision;
this one requires the team to actually agree, module by module, on which side of B3's line
each piece falls, and `contract.ts` doesn't have an obvious answer without that
discussion. Splitting `graph.ts` and `state.ts`/`genesis.ts` into host-side still likely
costs somewhere in the 300–350 LOC range on its own (roughly graph + genesis + state from
the table above, minus audit/centrality/contract), which — against 24 LOC of headroom —
**still forces some version of Option A's law-change conversation**, just for a smaller
number. This option reduces the size of the B5 problem; it doesn't make it disappear.

---

## Recommendation shape (not a decision — this needs the owner/team, flagged explicitly)

Option C is the most consistent with how Ω has already drawn this exact line once before
(`vivim.law` is a plugin because law B3 doesn't require the *policy* to be host-side, only
the *token verification* — see `host/src/ports.ts`'s own comment: "Risk gating is
data-driven... no policy lives in the host; law.check is a plugin call"). The same split
— mechanism host-side, policy/derived-data plugin-side — is exactly what Option C proposes
for the graph layer. But Option C's host-side subset (graph core + genesis + state, ~300+
LOC) still very likely blows the remaining 24-LOC headroom on its own, which means **this
doc cannot avoid recommending some B5 ceiling movement** — the honest options narrow to
"Option C, plus a smaller, better-justified B5 increase than Option A's full amount" or
"Option B in full, accepting the added dispatch-path latency, with the throughput
question from `SCALABILITY-CEILINGS.md` §3 answered first."

**What needs to happen before any code is written:**
1. A `docs/decisions/D-3xx` entry (next available number after checking the current
   highest in `docs/decisions/`) making this call explicitly, following the existing
   decision-record format used for D-321 (resource limits) and D-331 (lazy activation) —
   this is the same class of foundational tradeoff those records already capture.
2. If the decision touches B5's actual number (Options A or the narrowed version of C),
   that's a change to one of the ten laws in `README.md`, not just a `docs/decisions/`
   entry — confirm whether the project has a distinct, higher-ceremony process for
   amending the ten laws themselves versus recording an ordinary build decision, since no
   existing `D-3xx` entry appears to have done this before (all current entries operate
   *within* the ten laws, not on them).
3. Whichever option is chosen, `tooling/gates/gate.ts`'s `host-loc` check should be
   updated in the same commit that adds the first byte of `graph.ts` — not after the
   budget is already blown and the gate is red. That check exists specifically so this
   kind of overshoot is caught immediately, not discovered at review time.
