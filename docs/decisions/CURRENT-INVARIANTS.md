# Current Invariants — the one-page law snapshot

**D-364 consolidation pass #1 + D-365/367/370 owner amendments.** Generated as-of the remediation wave (D-360…D-364) plus the owner wave PROPOSED (D-365…D-370), branch
`owner-wave-001`. The full decision log (`docs/BUILD-DECISIONS.md`) remains the audit trail;
this page is what a fresh reader (human or agent) reads INSTEAD of it to state present-day law.
Regenerated every ~30 ratified decisions (or one per wave-set, whichever comes first).

## The boot-security laws (B1–B5)

| Law | Invariant today | Policed by |
|---|---|---|
| **B1** | No code executes unless a signed manifest entry in the user-signed Recipe references its content hash. Manifests are requests; the Recipe is the only grantor. | boot verify (fail-closed), gate `fresh-tree`, adversarial 1–12 |
| **B2** | One `worker_threads` compartment per plugin — separate V8 isolates, shared-nothing. Every message crosses the Port Protocol. Isolation is against **coupling, not exhaustion** (D-321: `resourceLimits` are NOT enforced on Bun — re-verified on Linux, 130MB in a 32MB cap). The D-360 watchdog bounds *detection* time of a consuming compartment (adversarial 13/14); exhaustion within a sample window remains open until a process-per-compartment tier exists (flagged, not built — D-360). | host/src/worker.ts header, gate `bun-surface` (runtime-neutral prod tree), adversarial 13/14 |
| **B3** | Capability tokens are verified host-side, outside every compartment. Token records are order-independent (alias keys and guarding caps resolve to the same effective cap). Revocation is a generation bump (attributable REVOKED register). | host/src/ports.ts `checkToken`, token-law tests |
| **B4** | Any verification failure refuses the composition; boot falls back to the pinned recipe; the rename is the atomic durability boundary (stale tmp cleaned, mid-swap crash drills green). | recovery.ts, adversarial 8/9/12, B4 drill |
| **B5** | The µhost is boring and may not grow: `host/src` ≤ 1,500 LOC, hard gate, re-frozen by D-391 (the D-365 1,100 freeze was amended ONCE, loudly, for the D-340 genesis kernel's host-critical subset — graph/genesis/state/audit/contract, 411 lines, itemized in the record; the same no-exceptions rule carries: no new host surface without removing old surface in the same commit). Creep moves into plugins or out-of-tree tooling (the watchdog and the pool both live outside, injected). | gate `host-loc` (1,450/1,500 at this snapshot) |

## The architecture laws (Ω)

- `bootPhase 0` belongs to `vivim.law`, enforced at verify time.
- Every routed op has exactly one implementation (duplicate routed op refused at boot).
- Risk gating is DATA (manifest CONTRACT risk declarations → law.check@1); the host embeds no policy.
- Data lives in the user's vault; persistence goes through the vault's namespaces with same-commit
  registry rows (`VAULT-NAMESPACES.md`); forbidden persistence is refused (D-325).
- Computation is routed, never vendored: resolution ≠ execution (D-323/D-337/D-359).
- Everything else is a plugin. The host is transport, not policy.

## Runtime surfaces and the adapter inventory (D-361 as rewritten by D-373)

- The production tree (`host`, `shim`, `contracts`, `sdk`, `testkit`, `plugins/*`, `surfaces/*`)
  contains **zero** runtime-specific APIs except the vault DRIVER LANE:
  `plugins/vivim-vault/src/drivers/bun-sqlite.ts` (`bun:sqlite`). A Node build swaps the ONE
  lane import (`./db.ts` → `./db.node.ts`, which binds `node:sqlite`) — proven byte-identical
  by the cross-runtime conformance parity suite, not by trust (D-373).
- Sync sleep is `Atomics.wait`-based (`sleepSync` exported from the shim; host-local in canon.ts).
- The daemon listens via `node:net`; spawns via `node:child_process`; surfaces read specs via `node:fs`.
- Dev/test toolchain is Bun (≥ 1.3.14 pinned), stated in README's Run section. The gate's
  `bun-surface` stage enforces the inventory mechanically; the node `--test` canon canary proves
  the core logic stays runtime-neutral (CI, D-362).

## Watchdog policy (D-360, hardened D-366 PROPOSED)

- Lives in `tooling/watchdog` (out-of-tree, D-329 placement law), attaches to a booted router,
  probes raw workers on an interval. Termination goes through the sanctioned host op
  `host.compartment.terminate@1` as root (`{fast}` flag: unresponsive→fast hard-kill 500ms cap via `terminateFast`; memory→graceful); evictions journal (principal `watchdog`).
- Two-signal enforcement per compartment: **unresponsive** (N consecutive unanswered probes — NON-SPOOFABLE, a wedged loop cannot answer) and **memory** (N consecutive answered samples over the manifest's declared `runtime.budget.memMB` — COOPERATIVE-ADVISORY, self-reported heap can be lied about; see D-366 spoof note).
- Thresholds are manifest data, not code. Missing budgets fall back to `defaultMemMB` with journal audit (`requireBudget`/`onDefaultBudget`) — declare budgets fail-closed. Honest bounds: detection is interval×N bounded;
  this is containment, not a security boundary.

## Boot readiness (D-363)

- Readiness rides the router's `ready` message: `PortRouter.waitActive(id, timeout)` resolves
  the event path (immediate if already active; rejects on degraded/timeout). Boot polls nothing.
  Demo boot: 27ms (polling) → 10ms (event-driven).

## Process law (D-364, simplified D-367 PROPOSED)

- Every decision ≥ D-313 has a record (six sections, options matrix, Decision line, evidence);
  statuses agree between index and record; RATIFIED requires a resolvable commit SHA.
- Index rows from **D-360** on carry a class tag: `· evidence` (backed by a probe/test falsifier)
  or `· directive` (owner call) — the gate checker enforces the tag.
- **Cooling-off for B1–B4 evidence-class decisions**: the falsifier (named test/probe) must be
  IN the record before RATIFIED, and a second gate run must follow ratification (same-day
  ratification stays legal for directive-class rows — solo-owner speed, honestly labeled).
- **Directive fast-path (D-367):** directive rows ratify same-day on gate green by default; evidence B1–B4 keeps full cooling-off.
- **Composition freeze (D-370, amended D-391):** 17 specs (the kernel witness rig joined via the
  D-377 matrix path — the freeze's target was hand-maintained drift, and matrix rows carry none),
  no new spec except through the matrix/generator (mechanized
  by the D-376 conformance net + D-377 matrix/generator). Composition stance (D-316, closed
  2026-09-18): **N first-class compositions — no flagship**; grant variance is handled per-row
  by DRIFT_ALLOWLIST with D-pointers, never by a privileged spec.
- Consolidation pass: every ~30 ratified decisions, refresh this page. The full log is never
  pruned or rewritten (append-only, supersede never edit).

## Acknowledged limits

Every residual the tree knowingly carries lives on one page with its detector
and revisit trigger: `docs/KNOWN-LIMITS.md`. A limit leaves that page only by
being fixed (with its falsifier) or superseded (with a D-record pointer).

## The storage driver lane (D-373)

- The vault's byte-persistence sits behind one structural `SqliteDriver` seam (`sql.ts` +
  `drivers/`); drivers are dumb byte stores — the spine owns CAS, Merkle changelog, refs and
  compaction discipline, exactly as before. Every driver passes the SAME conformance workload;
  a driver that diverges on the digest is broken by definition.
- `(ns, id, rev)` and the refs edge list are load-bearing driver-contract fields; a driver
  that decides what is live, or prunes history, is not a driver — it is a fork of the spine.

## The polyglot process tier (D-374)

- Compartments are worker-threads OR declared process pools. Process pools exist ONLY in
  signed composition config (`config.processPools`); the broker REFUSES unknown pools and
  undeclared ops; the caller can never name a command. B2 holds literally at the OS boundary:
  shared-nothing, Port Protocol over ndjson stdio, fail-closed everywhere.
- Malformed IPC is bounded (BUDGET, never a hang); deadlines fast-kill at 500ms cap (D-366
  discipline); stderr is journaled, never inherited. Process budgets are advisory at spawn
  (KNOWN-LIMITS) — the watchdog bounds detection; the OS-process boundary itself is the
  containment upgrade over worker tiers (the D-360 exhaustion residual's sanctioned hatch).
- `wasm` is forward-declared vocabulary only (D-354 reserve) — no shape, no implementation,
  no trust claims until its own record.
- **Containment probe (D-386):** `omega:containment` measures whether the kernel actually
  bounds a process-tier child (cgroup v2 today; Windows Job Objects probe is the named next
  slice). Enforcement is claimed ONLY from kernel-side measurements; `unavailable` is the
  honest answer wherever the OS refuses the probe. GATE CONDITION: B1b and any Wave2 LAUNCHED
  provider require verdict `enforced` on the target OS — or a recorded owner acceptance.

## Budget watch (owner-directed, 2026-09-18 independent recommendation §8)

Tracked explicitly so none of these is discovered late:

- **Host LOC headroom is thin:** 1,450/1,500 (50 lines) under the re-frozen D-391 budget with
  no-exceptions enforcement. Any host-touching change must name its equal-or-greater removal
  BEFORE the code is written (B5: removal in the same commit — the removal cannot be partial).
- **Test count crossed the sharding trigger** (D-317 ~700; D-368 lanes + quick gate were the
  response). Per D-317's own discipline: re-check wall-time once the suite nears ~1,000
  (currently 847).
- **Single-principal boundary (L-11) is a fence, not a bug:** the first sharing-adjacent
  feature requires the GAP-4 ruling first (D-379's reopen rule) — hold the line under scope
  pressure.
- **Calibration corpus + SLOs (L-12/L-13):** promotion thresholds remain unmeasured constants;
  benchmarks carry walls, not envelopes. These must NOT become load-bearing for consequential
  decisions (e.g., agent auto-routing) before Phase D / F-3 lands — sequence accordingly.

## The W0 close-out layer (D-376…D-383, the migration-readiness laws)

- **Conformance net (D-376):** the `compositions` gate stage is the one read-only net —
  grant-vs-manifest, bootPhase-0 law, D-325 pairing, allowlisted grant drift, zero-call-site
  contracts, risk parity (manifest-declared risk === LAW_POLICY classification, gate-layer),
  and matrix conformance (specs regenerate byte-identical from `compositions/_matrix.json`).
  Seeded drift fails with named diagnostics (`conformance-drift-seed.ts`).
- **Authoring path (D-377):** `_matrix.json` is the source of truth for compositions; edit the
  matrix, run `omega:generate composition`; hand-edited specs fail the gate. `omega:generate
  plugin|pack` scaffolds with the authoring checklist (ns row, LAW_POLICY rows, matrix grant,
  bun install, real-boot proof). New readers author via the generator, never by hand.
- **Vault index + retention (D-378):** vivim.chat maintains per-conversation index rows
  (`idx_<hex>`, bounded by CHAT_HISTORY_CAP); history/cap/seq ride the index (legacy scan is
  the fallback; corrupt index refuses fail-closed). Retention windows per ns are DECLARED
  (numbers in the D-378 record + VAULT-NAMESPACES chat row); mechanical enforcement is Wave3.
  The probe (`omega:probe`) owns the append-latency + bounded-read numbers.
- **Single-principal fence (D-379):** one principal per conversation; cross-principal reads
  REFUSE as a verdict envelope and LEDGER (`refusal_*` rows, ns chat); sharing reopens only
  by a new decision record. Provider bar (D-380), parser bar (D-381), observability spine
  (D-382), and the surface pointer default (D-383) are the Wave1+ bars — read those records
  before harvesting anything.
