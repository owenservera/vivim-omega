# What else is missing: scalability ceilings beyond the nine kernel requirements

`RUST-CORE-PARITY.md` covers the nine requirements from the design conversation — graph,
genesis, state arbitration, audit, contracts, resolution, centrality, manifest, generation
pinning. Those are correctness/architecture gaps: without them Ω can't *become* the
hundred-plugin system the owner directive describes, no matter how much capacity it has.

This doc is the other half: assuming the graph/genesis/state layer lands, what in Ω's
**current, working, tested code** stops it from actually running at that scale? These are
measured from what's on disk today (worker.ts, ports.ts, db.ts, canon.ts, BENCHMARKS.md),
not hypothetical — each section names the file and the number.

Read together with the design-chat concern that motivated the Rust core in the first
place: *"we can't understand now the atomic level design of the core since we are
migrating into omega the full vivim surface that could potentially become hundreds of
plugins just to get to base state functionality."* The concern was never "can Ω boot a
demo composition of 8 plugins" — it already does that in 27ms. It's "does anything break
between here and hundreds."

---

## 1. One worker thread per plugin — no pooling ceiling, no resource enforcement

**What's there.** `host/src/worker.ts` spawns one `node:worker_threads` `Worker` per
compartment. `BENCHMARKS.md` measures worker-thread creation at **p50 26.5ms** (n=10,
max 34.5ms) — that's the *creation* cost alone, before the plugin's own init work. The
file's own comment is direct about the other half of the problem:

> "a 32MB-capped worker grew to 217MB heap without error on Bun... memory/CPU EXHAUSTION
> by a compartment is NOT bounded on this runtime (`resourceLimits` are not enforced by
> Bun)... Do not rely on this layer against an actively adversarial plugin."

Every `PluginManifest.runtime.budget: { cpuMs?, memMB? }` (`contracts/src/manifest.ts`) is
declared, parsed, and defaulted to `{}` if absent (`host/src/recipe.ts`) — but never
enforced anywhere. It's schema, not policy.

**Why this is a scale problem, not just a security one.** At 8 plugins, 26.5ms × 8 spawns
in parallel is invisible. At "hundreds of plugins," even with D-331 lazy activation
(dormant-until-first-touch, already landed) deferring *creation* until first call, the
**live working set** — however many compartments are actually active at once in a running
composition — has no ceiling. Nothing stops N simultaneously-active compartments from
each independently growing past their declared `memMB` and taking the whole process down
together, because "isolated against each other" (true, separate V8 heaps) is not the same
guarantee as "isolated against starving the shared process" (false, per the file's own
comment).

**What's missing.** Two separable things, currently both absent:
1. A **live-compartment ceiling** — a configured max on simultaneously-active (not just
   registered) compartments, with a genuine eviction/backpressure policy for what happens
   at the ceiling (queue the call? force-terminate the least-recently-used dormant-eligible
   compartment? refuse with a typed error the caller can retry against?). None of these
   three options exists today — there is no ceiling, so there is no policy for hitting it.
2. **Actual resource enforcement**, or an honest, loud substitute for it. The file's
   comment defers this to a "watchdog design" that doesn't exist yet
   (`docs/decisions/D-321-resource-limits.md` is the named decision record — check its
   current status before starting; if it's still open, this is the same problem being
   tracked, not a new one). At minimum, `vivim-run`'s existing crash-loop quarantine
   (which already covers crashes) should have a resource-pressure sibling — a compartment
   caught growing past 2–3× its declared `memMB` gets proactively terminated and
   quarantined the same way a crash-looping one does today, rather than being allowed to
   pull the whole process down.

**Concrete next step.** This is a `vivim-run` change (lifecycle policy already lives
there, per `worker.ts`'s own header comment: "the host owns TRANSPORT only; lifecycle
policy belongs to vivim.run"), not a host change — so it doesn't compete with the host's
1,000-LOC budget (see `LOC-BUDGET-RESOLUTION.md`). Add a periodic memory-sample tick
(Bun exposes per-worker `resourceUsage()` even though it doesn't *enforce* limits) to
`plugins/vivim-run/src/health.ts`, feeding the same quarantine path `pool.ts` already has
for crashes.

---

## 2. Per-boot content hashing is O(n) synchronous disk I/O, every boot

**What's there.** `host/src/canon.ts`'s `contentHashDir()` does a synchronous full
directory walk (`readdirSync`/`statSync` recursively) and reads and hashes **every file's
full bytes** for a plugin's content dir. This isn't compile-time-only: `verifyEntryWithRoot`
in `host/src/recipe.ts` calls it again on **every single boot**, for every composition
entry, to verify `contentHash` against what's on disk before that compartment is allowed
to spawn — which is exactly correct for B1 (no code executes unless its hash matches a
signed manifest), but it means boot time scales linearly with total plugin source size,
synchronously, on the critical path, for the *whole* composition before any compartment
(even bootPhase 0) can start.

**Why this is a scale problem.** At today's plugin count and source sizes this is inside
the noise (27ms full boot in the Ω0 benchmark). At hundreds of plugins — especially if any
of them carry non-trivial `node_modules` or asset content inside their content dir — this
becomes the dominant boot-time cost, and it's **synchronous**, so it blocks the event loop
for its full duration rather than yielding.

**What's missing.**
1. **Hash caching keyed by mtime+size**, invalidated only when a file's mtime or size
   actually changes — this is D-330's content-hash cache decision record
   (`docs/decisions/D-330-content-hash-cache.md`), already partially landed per
   BENCHMARKS.md's "compile skipped on warm" note for the *compile* path. Confirm whether
   that cache also covers the **boot-time re-verification** path in `verifyEntryWithRoot`,
   or only the compile path — the benchmark note is ambiguous on this, and if it's
   compile-only, the boot-time re-hash is still paying full cost every time.
2. **Parallelizing the walk** across composition entries — `verifyComposition` in
   `host/src/boot.ts` currently verifies entries in whatever order `recipe.composition`
   iterates; nothing stops running `contentHashDir` for independent entries concurrently
   (they touch disjoint directories), which turns an O(total plugin bytes) serial cost
   into O(largest single plugin's bytes) wall time.

**Concrete next step.** Audit whether D-330's cache already covers boot-time
re-verification (read `docs/decisions/D-330-content-hash-cache.md` first — this may
already be solved and just needs a benchmark entry confirming it). If not, that's the
first fix, ahead of parallelization — caching removes the cost for anything that didn't
change; parallelizing only helps for what actually did.

---

## 3. `vivim.law` is a single-threaded serial chokepoint for every risky op, system-wide

**What's there.** `host/src/ports.ts`'s `dispatch()`: any op with a declared `risk` (from
`riskyOps()` in `contracts/src/manifest.ts`) round-trips through `callLaw()`, which
`deliver()`s to **one specific compartment id** — whichever entry is `bootPhase 0` — and
awaits its reply before the actual op is dispatched. `vivim.law` runs in exactly one
worker thread (same one-compartment-one-thread model as every other plugin, per
`worker.ts`). Every plugin's every risky call funnels through that one thread, serially,
regardless of how many other compartments are otherwise idle.

**Why this is architecturally forced, not accidental.** This isn't a bug — it's the
correct read of the genesis-closure requirement (`RUST-CORE-PARITY.md` §2): there must be
exactly one non-negotiable gate, and Ω's `bootPhase 0` rule enforces exactly that. The
Rust core has the same shape for `StateArbitrator` — one arbiter, on purpose. The
question isn't "should this be single," it's "does the current implementation's
throughput hold up when there are hundreds of plugins generating risky-op traffic against
it."

**Why it's a real ceiling at scale.** `vivim-law`'s own `index.ts` does non-trivial
synchronous work per check — `evalPolicy()`, consent-table lookups, forbidden-overlay
checks — plus an `await` out to `vivim.vault` for persistence on some ops
(`law.forbidden.set@1`). At 8 plugins with occasional risky calls, this is invisible
(BENCHMARKS.md's RTT numbers are all sub-millisecond to low-single-digit-ms). At hundreds
of plugins generating risky-op traffic concurrently, `vivim.law`'s single thread becomes
the system's throughput ceiling for *any* mutating or externally-visible operation,
because there is exactly one queue and it's FIFO through one JS event loop.

**What's missing.** Not a redesign of "one gate" — that's correct and shouldn't change.
What's missing is **visibility into whether this ceiling is actually being approached**,
and a considered answer for what happens under sustained load:
1. **Queue depth / latency metrics on `vivim.law`'s inbound deliver queue** specifically
   (not just the general compartment `stats.delivered`/`calls` counters in
   `worker.ts` — those exist per-compartment already, but nothing surfaces "the law gate's
   queue is currently N deep and growing" as a distinguishable signal from general
   compartment health).
2. **A decision, written down, on whether the law gate can ever be sharded** (e.g. by
   principal, so two unrelated plugins' risky calls don't serialize behind each other) —
   or whether the design intentionally accepts one global gate as the throughput ceiling
   forever, in which case that's a capacity-planning number the owner should see stated
   explicitly (something like "the gate handles ~X risky-ops/sec sustained, measured"),
   not discovered under load.

**Concrete next step.** This doesn't need code yet — it needs a `docs/decisions/D-3xx`
entry making the "one gate is intentional, here's the measured ceiling and here's what
happens past it" call explicit, following the same pattern as D-325 (forbidden
durability) and D-336 (human principal) already in `docs/decisions/`. Benchmark
`vivim.law` under synthetic concurrent load (N compartments hammering risky ops
simultaneously) the same way `BENCHMARKS.md` already benchmarks boot and RTT, before
deciding whether sharding is needed.

---

## 4. `vivim.vault` is a single SQLite writer for the whole system's state

**What's there.** `plugins/vivim-vault/src/db.ts`: one `bun:sqlite` connection, one
compartment, one worker thread, a single in-worker promise queue (`enqueueWrite()`) that
every mutating vault op serializes through. The file's own comment is explicit that this
is deliberate — "single-writer law... so concurrent op deliveries serialize multi-statement
transactions" — and it's the right call for **correctness** (this is effectively §3's
`StateArbitrator` concern, solved narrowly for vault-backed state, as already flagged in
`RUST-CORE-PARITY.md` §3).

**Why it's a scale concern distinct from the correctness one already flagged.** Even once
`RUST-CORE-PARITY.md`'s `StateArbitrator` primitive exists for arbitrary shared state
outside the vault, the vault itself remains a single physical SQLite file behind a single
worker thread. If "hundreds of plugins" means hundreds of plugins doing meaningful,
frequent state reads/writes — not just occasional config reads — every one of those writes
still serializes through this one queue, and reads share the same single connection
(the comment notes reads aren't queued behind writes, which helps, but they're still one
connection, one thread, competing for the same CPU core as the write queue).

**What's missing.**
1. **A measured write-throughput ceiling for the vault**, analogous to what's requested
   for `vivim.law` in §3 above — BENCHMARKS.md has no vault-specific write-throughput
   number today, only boot/RTT numbers for the demo composition.
2. **A namespace-sharding strategy, at least on paper**, for if/when that ceiling is hit —
   `docs/VAULT-NAMESPACES.md` already exists and should be the natural home for this; check
   whether it currently addresses concurrent-writer scaling or only logical namespacing
   (organization of `ns` values), since those are different problems that could look
   similar from the doc title alone.

**Concrete next step.** Read `docs/VAULT-NAMESPACES.md` first — this may already be scoped
or explicitly deferred there. If it only covers logical namespacing, add a
write-throughput benchmark (concurrent writers, sustained ops/sec, same methodology as
`BENCHMARKS.md`'s existing entries) before deciding whether sharding is needed, following
the same "measure, don't guess" discipline the rest of the repo already uses (see
`tooling/bench/bench.ts`).

---

## 5. The flat op-namespace has no plugin-scoped collision boundary

**What's there.** `contracts/src/manifest.ts`'s `routableOps()` registers every
contract/engine/provider contribution as `<id>@<version>` in one **global** string
namespace — `host/src/ports.ts`'s `opRoute: Map<string, string>` has no per-plugin
prefixing or scoping. `verifyCompositionInvariants()` in `host/src/recipe.ts` does check
for collisions ("routed op conflict: X granted to both A and B") — so a collision is
caught and refused at boot, fail-closed, which is correct and good. But it's caught as an
**error**, not prevented by construction.

**Why this becomes a real problem at hundreds of plugins.** At 8–20 hand-curated plugins
(today's `compositions/*.json` scale), op-name collisions are rare and easy to spot by
eye when they happen. At hundreds of plugins — especially once third parties are
authoring manifests independently, which is exactly the `com.example.gmail`-style case
`contracts/src/manifest.ts`'s own doc comment anticipates ("`vivim.law` | `vivim.vault` |
`omega.echo` | `com.example.gmail`") — namespace collisions stop being a rare authoring
mistake and become a routine occurrence: two unrelated third-party plugins independently
choosing `message.send@1` is entirely plausible, and today that's a **boot-time refusal
of the whole composition**, not a resolvable conflict.

**What's missing.** A convention or enforcement layer above what exists today:
1. Either **enforced ID-namespacing by publisher** (the `com.example.gmail`-style
   reverse-DNS convention already shown in the doc comment could be *required*, not just
   suggested, for the `id` field inside `contributions`, not just the plugin's own
   top-level `id`) — turning "collision is possible and caught late" into "collision is
   structurally hard to cause."
2. Or, once the capability graph from `RUST-CORE-PARITY.md` §1 lands, **multiple offerors
   for the same capability become a legitimate, resolvable case** (via `who_offers`
   returning more than one, with the caller or a policy picking) rather than always a
   fatal conflict — this is actually the same `who_offers`/graph work already scoped in
   doc 1, called out here because it has a second payoff (namespace collision tolerance)
   beyond the one already documented (atomization transparency).

**Concrete next step.** This mostly falls out of `RUST-CORE-PARITY.md` §1 and §6 already
being built — worth noting here explicitly so the team doesn't schedule a separate
namespace-collision fix that the graph work makes partially moot. The one piece that
doesn't fall out of the graph work: whether publisher-scoped ID namespacing should be
enforced at manifest-parse time (`parseManifest()` in `host/src/recipe.ts`) regardless of
the graph, as defense in depth for third-party-authored plugins specifically.

---

## 6. The host's own growth budget is nearly exhausted by *existing* functionality

**What's there.** `host/src/` is **976 LOC** against the hard-gated 1,000 LOC budget
(`tooling/gates/gate.ts`'s `host-loc` check, law B5). That's before any of the
`RUST-CORE-PARITY.md` additions (graph, genesis, state arbitrator, audit chain,
centrality, contract registry) are written.

This is significant enough, and specific enough to how doc 1's changes get built, that
it has its own document: **`LOC-BUDGET-RESOLUTION.md`**. Read that alongside this one —
it's not optional context, it's the fork in the road that determines whether doc 1's
changes are even buildable as host-side code without either lifting B5's ceiling
(a constitutional change, not a code change) or moving those primitives into a plugin
that the host merely trusts structurally (the same pattern `vivim.law`'s bootPhase-0 rule
already uses).

---

## Summary table

| # | Ceiling | Where measured | Status |
|---|---|---|---|
| 1 | Live-compartment resource limits | `worker.ts` comment, BENCHMARKS.md thread-spawn numbers | No enforcement; needs a D-321 status check + `vivim-run` quarantine extension |
| 2 | Content-hash cost on every boot, not just compile | `canon.ts::contentHashDir`, `recipe.ts::verifyEntryWithRoot` | Possibly already solved by D-330 for compile path; unconfirmed for boot-time re-verify |
| 3 | `vivim.law` single-thread serial gate | `ports.ts::dispatch`/`callLaw`, one bootPhase-0 compartment | Architecturally intentional; needs measured ceiling + explicit decision record |
| 4 | `vivim.vault` single SQLite writer | `db.ts` single-writer queue comment | Correct for correctness; unmeasured for throughput; check `docs/VAULT-NAMESPACES.md` scope |
| 5 | Flat global op-namespace | `ports.ts::opRoute`, `recipe.ts::verifyCompositionInvariants` collision check | Caught late (boot refusal); resolved mostly by the graph work in doc 1 |
| 6 | Host LOC budget vs. doc-1 additions | `tooling/gates/gate.ts`, 976/1000 today | Forces an explicit architectural decision — see `LOC-BUDGET-RESOLUTION.md` |
