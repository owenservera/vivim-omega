# D-340 — Kernel-layer placement: host-critical vs. plugin-queryable split (Option C)

## Status

RATIFIED

Includes the first-ever amendment of one of the ten laws (B5's number, 1,000 → 1,400).
Ratified on the D-339 precedent: landed PROPOSED, ratified on a green full gate with
the landed SHAs in Evidence.

## Context

`vivim_omega_core` (the Rust genesis kernel built from the owner's nine-requirement
design conversation) specifies six modules needed for Ω parity: `graph`, `genesis`,
`state`, `audit`, `centrality`, `contract`. Sized against the Rust originals, they cost
an estimated ~545 LOC. `host/src/` sat at 976/1000 LOC (984 by the gate's
`split("\n")` math) against the hard-gated B5 law ("the µhost is boring and may not
grow"). There were 24 LOC of headroom. Something had to give, decided once,
deliberately, before code — not discovered when the gate went red mid-implementation.

Three options were framed (`LOC-BUDGET-RESOLUTION.md`): A — raise the B5 ceiling to
fit everything; B — move the whole layer into a new phase-0-adjacent plugin
(`vivim.kernel`); C — split the six modules by dispatch-path criticality. They were
scored against a five-axis KPI system derived from concerns already load-bearing in
the repo (B3 integrity 30, hot-path latency 25, LOC-budget honesty 20, ceremony cost
15, precedent consistency 10 — each traced to an existing law, benchmark, or
`ports.ts`'s own comments, none invented post-hoc).

## Options

| Criterion | A — raise ceiling to ~1,600 | B — full plugin split, `vivim.kernel` at a structural phase | C — split by dispatch-path criticality |
|---|---|---|---|
| B3 integrity (30) | 9 — all host-side | 5 — `who_offers` for EVERY op becomes a compartment reply | 8 — write path stays host-side; only read-only derived views move out |
| Hot-path latency (25) | 10 — zero new round-trips | 3 — every dispatch gains a compartment hop, not just risky ones | 8 — `whoOffers`/`resolve` never leave the host process |
| LOC honesty (20) | 2 — declares the pressure moot | 10 — host stays 976 | 6 — still needs a smaller B5 move |
| Ceremony (15) | 2 — first-ever law amendment, undefined process | 6 — new structural boot-phase rule | 5 — module-by-module classification + smaller B5 move |
| Precedent (10) | 3 — contradicts the `vivim.law` split | 6 — matches the shape, overextends it | 10 — IS the `vivim.law` host-mechanism/plugin-policy split, one level deeper |
| **Weighted total /1000** | **620** | **575** | **735** |

C wins by a clear margin — the only option that sacrifices no single non-negotiable
axis (B3 or latency) to solve the LOC problem, and the only one that extends rather
than contradicts a pattern Ω has already shipped and proven.

## Decision

**Decision:** Option C — split the six modules by dispatch-path criticality.

Host-side (`host/src/`, competes for the moved B5 budget): `graph.ts`
(`upsertNode`/`grant`/`whoOffers`), `genesis.ts`, `state.ts`, `audit.ts` — `record()`
+ chain building, called inline by `grant()` — and `contract.ts`:
`ToolRegistry.resolve()` sits on the hot dispatch path exactly like `whoOffers`;
`publish()` is the rare administrative action, but the registry stays one unit, not
split mid-module. Plugin-side: a new `vivim.kernel-lens` plugin — a read/derived-data
lens in the `vivim.mind` tradition, NOT a second gate — carries `centrality.ts` (pure
function over a graph snapshot) and the audit-chain verify query surface. B5 moves
1,000 → 1,400 — the honest number: the host-critical modules landed at 1,400 gate
math EXACTLY (1,383 at first landing; the dormant-registration idempotence fix and
effective-op resolution closed the slack to zero) — zero slack is deliberate: the
next host-side byte must evict one; a smaller, better-argued movement than Option
A's full version, with the justification written down here for whoever owns law
amendments.

## Consequences

- `host/src/` gains `audit.ts` · `graph.ts` · `genesis.ts` · `state.ts` ·
  `contract.ts`; `ports.ts` dispatch resolves through the graph with
  generation-aware fallback; `boot.ts` attaches the genesis kernel before any Recipe
  entry registers (5 nodes, 2 closing grants — the only hardcoded identities).
- New host ops + guarding capabilities, same token law as all host ops:
  `host.state.acquire@1` / `host.state.release@1` under `host.state.arbitration`;
  `host.graph.snapshot@1` / `host.audit.chain@1` under `host.kernel.lens`.
- New plugin `vivim.kernel-lens`: `kernel.centrality@1` and `kernel.audit.verify@1`
  (both READ); it holds NO write capability — the lens reports, never authors.
- The manifest schema gains `granularity` / `internalSeams` / `extractionCandidate`
  as DATA (requirement #5), and `validateManifestHonesty()` refuses dishonest
  self-reporting at compile time — the `manifest.rs::validate` port. Note: the
  earlier parity analysis claimed §8 was already at parity; the fields were not on
  disk. Now they are, with enforcement.
- The Recipe remains the only grantor (law 7): the graph is compiled FROM the Recipe
  at registration; runtime grant-authority ops are deliberately NOT added.
- Implementation deltas vs. the proposed record, so a future contributor doesn't
  re-derive them: (a) offers-vs-holds adjacency are distinct — the sketch's single
  incoming map would misroute dispatch once capability-request edges land in it, and
  `fanIn` counting both is exactly the load-bearing signal requirement #7 needs;
  (b) generation fallback fires only for callers that DECLARED a dependency —
  undeclared callers keep v1 REFUSED semantics, fail-closed preserved; (c) the chain
  verdict is computed host-side — one canonical `verifyJson`, never duplicated into
  a compartment; (d) blast radius walks grant edges both directions, one definition
  shared by host and lens.
- `tooling/gates/gate.ts`'s `host-loc` budget moved to 1,400 in the same commit as
  the first byte of `graph.ts` — never after the fact.

## Evidence

- `RUST-CORE-PARITY.md` · `SCALABILITY-CEILINGS.md` · `LOC-BUDGET-RESOLUTION.md` (the
  analysis chain this record resolves) and the owner's nine-requirement design
  conversation with the `vivim_omega_core` Rust crate as reference implementation.
- `host/src/ports.ts` — dispatch's `Map.get` routing (what `whoOffers`/`resolve`
  replace) and the "no policy lives in the host" comment this decision extends.
- Landed in c45602b (kernel + B5 amendment + this record, PROPOSED) and 5c8d27b
  (kernel-lens + kernel.json + the six Rust scenario ports + the ghost pressure
  suite): host 1,400/1,400 gate math, `bun test` 650/650, full `bun run omega:gate`
  GREEN on 5c8d27b — ratified on that evidence.
- Sustained-load ceilings measured post-landing (D-341 wave, 7883922): law gate
  4,331 ops/s, vault 1,777 writes/s, graph-routed dispatch Δp50 ~9µs vs the v1
  Map.get — the latency axis this decision scored by estimate, now on record as
  measurement in `BENCHMARKS.md`.
- Owner directive 2026-09-18: "you are the omega agent and own everything."
