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
| **B5** | The µhost is boring and may not grow: `host/src` ≤ 1,100 LOC, hard gate, FROZEN D-365 (sole owner — no new host surface without removing old surface in the same commit). Creep moves into plugins or out-of-tree tooling (the watchdog and the pool both live outside, injected). | gate `host-loc` (999/1100 at this snapshot) |

## The architecture laws (Ω)

- `bootPhase 0` belongs to `vivim.law`, enforced at verify time.
- Every routed op has exactly one implementation (duplicate routed op refused at boot).
- Risk gating is DATA (manifest CONTRACT risk declarations → law.check@1); the host embeds no policy.
- Data lives in the user's vault; persistence goes through the vault's namespaces with same-commit
  registry rows (`VAULT-NAMESPACES.md`); forbidden persistence is refused (D-325).
- Computation is routed, never vendored: resolution ≠ execution (D-323/D-337/D-359).
- Everything else is a plugin. The host is transport, not policy.

## Runtime surfaces and the adapter inventory (D-361)

- The production tree (`host`, `shim`, `contracts`, `sdk`, `testkit`, `plugins/*`, `surfaces/*`)
  contains **zero** runtime-specific APIs except ONE declared adapter:
  `plugins/vivim-vault/src/db.ts` (`bun:sqlite`). A Node build swaps that single module.
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
- **Composition freeze (D-370):** 16 specs, no new spec without deleting/generating one (social discipline until the D-316 net mechanizes it).
- Consolidation pass: every ~30 ratified decisions, refresh this page. The full log is never
  pruned or rewritten (append-only, supersede never edit).

## Acknowledged limits

Every residual the tree knowingly carries lives on one page with its detector
and revisit trigger: `docs/KNOWN-LIMITS.md`. A limit leaves that page only by
being fixed (with its falsifier) or superseded (with a D-record pointer).
