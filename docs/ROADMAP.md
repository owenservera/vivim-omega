# VIVIM-Ω — Roadmap (the road from setup day to cutover)

**Posture:** planning reference only. It ratifies nothing and builds nothing — every phase
below lands through the normal path: PROPOSED wave commit → green `omega:gate` → falsifier
evidence → RATIFIED D-rows (`docs/decisions/README.md`). Where a wave already has an
authority doc, that doc wins over this summary; this file is the map, not the law.
**Baseline (setup day, 2026-09-18):** `main` @ `cb022ad` + setup remediation — gate GREEN
(903/903 tests, all stages), host **1039/1100** (B5 held), 16 compositions (D-370 freeze,
matrix-managed), 13 vault namespaces, 21 plugin dirs, W0 + W1 **CLOSED**, migration tracker
(`docs/migration/STATUS.md`) current. See §2 for what setup changed and why.

---

## 1. Design and intent, absorbed (what this roadmap optimizes for)

Vivim-Ω is a rebuild of the legacy Vivim monoliths (~954/1051 source files, 201 Prisma
models, 40+ routers, EventBus/DI singletons) on an all-plugin architecture: one boring
µhost that verifies, spawns, routes, and enforces — and everything else (constitution,
storage, runtime, language, surfaces) as plugins behind signed manifests and a user-signed
Recipe. The intent (`docs/migration/INTENT.md`) is precise about what "better" means:
**a smaller core, stronger guarantees, and a cheaper next addition** — any legacy capability
re-entering as a plugin, pack, or orchestrator plugin in days, with zero host growth and
proof on every wave. The legacy repos are frozen mines to harvest data and algorithms from
(SHA-pinned: `vivim-final-program@4a5eb84`, `vivim-final-enhanced@afebe00`), never code to
port: EventBus/DI/Prisma wiring stays dead.

The sequencing discipline that emerges from the decision log and that every phase below
inherits:

1. **No vocabulary without writers (D-332).** A contract ships with a producer, a reader,
   and a real-boot test in the same commit — or it is allowlisted loudly with a D-record
   pointer as an explicit reservation (the D-373 storage.kv and D-389 plan/saga patterns).
   Naming loops before closing loops is this program's documented failure mode.
2. **Existence = booted proof.** The gate is the spec; claims carry no weight. Every wave
   lands its falsifier (a named test or probe that could have failed) before ratification,
   and `build/status.json` refreshes only from a green run (D-362).
3. **The host does not grow (B5, D-365 frozen).** `host/src` ≤ 1,100 LOC with removal in
   the same commit for any new surface. At 1039, headroom is 61 lines — treat the wall as
   a design smell detector, not a budget.
4. **Fail closed, ledger everything.** Unknown ops REFUSED, over-budget BUDGET, broken
   handler DEGRADED, oversized captures refused (never truncated); refusals and evictions
   are queryable rows, never silent.
5. **Wave boundary law.** W3-owned work does not ride W2 commits (the D-388 disposition of
   L-4 is the template); deferrals cross waves only with a named trigger in a D-record.
6. **Append-only law.** RATIFIED records are never edited; supersede instead. The one
   sanctioned exception is checker-demanded evidence repair (D-384 → D-388 → D-390
   precedent): additive, mechanical, authorized by a directive record.

---

## 2. Setup day — Phase R remediation (DONE, awaiting owner ratification)

The clone of `main` @ `cb022ad` arrived with a red gate: `omega:quick` failed the
`decisions` and `compositions` stages, one host-lane test (the decisions checker
self-hosting on the real tree) failed, one surfaces-lane test failed, and two plugin-lane
errors came from `vivim-intent`. Root causes and the lawful fixes, all evidenced by the
setup-day green gate run (2026-09-18T14:00Z, 903/903):

| # | Finding | Root cause | Fix (this workspace) |
|---|---|---|---|
| 1 | `plugins/vivim-intent` tests: `Cannot find module '@vivim/omega-contracts'` | The D-389 commits shipped the plugin without `package.json` — the D-377 authoring checklist's `bun install` step was skipped, so the workspace never linked it | Added `plugins/vivim-intent/package.json` on the sibling pattern (`@vivim/omega-shim` + `@vivim/omega-contracts`, both `workspace:*`); 17/17 intent falsifier tests now resolve and pass |
| 2 | SDK manifest suite failure | `vivim-intent/plugin.json` carried `"contentHash": "sha256:PROPOSED"` — not a legal hash shape (`sha256:<hex>` or `""` pre-compile) | Set to the honest pre-compile empty value; sdk schema suite green |
| 3 | `decisions` stage red: D-389 record illegal (status prose, missing Options/Consequences, no index row) | The record landed out of the checker's contract shape | Amended into the legal six-section form (PROPOSED records may be amended — substance unchanged) + index row added |
| 4 | `decisions` stage red: 20 RATIFIED records with unresolvable Evidence SHAs | The 2026-09-18 history re-base (`f780d06` adoption → `6d6a3ad` main) stranded pre-reset landing SHAs; `git cat-file` cannot resolve them | **D-390 filed** (directive, PROPOSED): authorizes a mechanical, additive Evidence re-citation line per orphaned record, citing adoption commit `f780d06` as the attestation; originals preserved verbatim; checker law unchanged. Pass executed (script in the setup commit message), 20 records re-cited, 48 correctly skipped |
| 5 | `compositions` stage red: 4 D-389 exports with zero call sites (`PlanTemplate`, `PlanStepTemplate`, `PlanTemplateV2`, `SagaEvidenceRef`) | The plan/saga wire vocabulary landed ahead of its consumers — deferred by design in D-389, but not allowlisted per D-332 | Allowlisted loudly in `tooling/gates/contract-sites.ts` with D-389 pointers (same posture as the D-373 storage.kv reservations); entries come out the day the exports gain call sites |

**Phase R exit:** the two PROPOSED records (D-389, D-390) ratify on the first owner-cited
green gate that includes the setup commit. The board (`docs/decisions/OPEN-QUESTIONS.md`)
was regenerated: exactly these 2 open.

---

## 3. The road: waves W2 → W7

Each wave: PROPOSED commit → green gate ×2 (D-364 cooling-off for evidence-class rows) →
falsifier evidence → RATIFIED. Wave docs in `docs/migration/20-WAVES/` are the authority
for mechanics; the entries below fix order, gate conditions, and the loops each wave closes.

### W2 — Provider stratum (NEXT) · authority: `WAVE2-PROVIDER-STRATUM.md` + D-380 bar

**Goal:** prove "providers as graded realizations" on real modalities — API_NATIVE wherever
a real API exists, BROWSER_MEDIATED where automation *is* the product. Order is fixed by
the wave doc: Ollama first (local, no auth quirks — the §3 pilot candidate), then the
least-defended browser surface per import-parser fixtures, then the remainder by fixture
availability, never live-network convenience.

- **W2-a · API_NATIVE pilot (Ollama or the email/API family per T-06 rows).** Realization
  row (ns `providers`) + handler + `ProviderClass` + stream config + LAW_POLICY exact rows.
  Harvest algorithms from the pinned mines; port none of the wiring. The D-380(1)
  byte-identical fixture rule applies from day one: post-parser canonical extraction
  identical modulo a per-provider volatile allowlist declared as data.
- **W2-b · BROWSER_MEDIATED via `provider-browser` (CDP substrate, D-338/D-357 lineage).**
  Attach-only first. Entry falsifier (folds the ARCHITECTURE-NEXT-STEPS Phase-C C0 step
  forward): write down what "byte-identical" means for live-vs-fixture captures BEFORE the
  substitution test is coded — identical after canonicalization, or identical modulo the
  documented volatile allowlist — then prove a live capture substitutes for a recorded
  fixture with zero classifier changes. If it cannot, the fixture format gets fixed first,
  not the provider.
- **W2-c · LAUNCHED processes.** Launch mode through `platform/` (D-380(2)), per-OS
  lifecycle, manifest budgets, watchdog coverage. **GATE CONDITION (D-386):** this slice
  requires `omega:containment` verdict `enforced` on the target OS or a recorded owner
  acceptance — the Windows Job Objects probe (§5, decision 3) is the named next slice to
  widen that path.
- **W2-d · Stealth admission + governor (T-07/T-08).** Each legacy stealth file admitted
  with a law reason or refused with one — never bulk; admitted files carry their
  forbidden-overlay entries in the same commit. The governor's control-loop logic rebuilds
  against capability tokens: concept preserved, authority replaced.

**Falsifier (per provider, all must hold):** one fixture-recorded message through the
realization, gated by `law.check@1`, streamed, ledgered, `vivim.mind`-queryable — plus one
forbidden action refused and ledgered (browser providers). No live-network calls in tests,
ever. `deriveRegistry()` gains real callers; `vivim.providers` ships in the compositions
that need it, via the generator under the D-370 freeze.

### W3 — Conversation/memory · authority: `WAVE3-CONVERSATION-MEMORY.md` + D-378/D-379

**Goal:** memory as vault, not database sprawl — the chat lane becomes the durable spine.
Mechanical retention enforcement (windows already declared in D-378's numbers), and the
L-4 full index build: enforcement + backfill + repair, retiring the legacy total-namespace
scan fallback for good. Everything stays behind the D-379 single-principal fence: one
principal per conversation, cross-principal reads refuse as a verdict envelope AND ledger.
The L-4 backfill is W3-owned — it does not ride a W2 commit (wave boundary law), and the
D-388 record already pinned that disposition.

### W4 — Intelligence · authority: `WAVE4-INTELLIGENCE.md` + D-313/D-323/D-327/D-389

**Goal:** close the acting loop under containment, deterministic-first. The agent acting
loop widens (B1b) only under the same D-386 gate condition as W2-c. Computation routing
(D-323: `resolve.classify` / `resolve.report` / `strategy.scorecard`) grows its first real
consumers from the W2 realizations — scoreboards inform, they never auto-decide; any
scoreboard-driven auto-routing stays blocked behind L-12/L-13 (calibration corpus + SLO
objectives) per the standing budget watch. The D-389 intent mechanism finds its consumers
here: the `vivim.intent` composition entry under the 16-spec freeze (generate-one or
delete-one), the `IntentContext` consumer, and the projection consumer (`plan:<type>@2`)
when a real workflow needs data-only input mapping and output chaining. Compensation stays
evidence-only — implying rollback without fresh consent is worse than stating the limit.

### W5 — Surfaces · authority: `WAVE5-SURFACES.md` + D-383 (surface pointer)

**Goal:** one derivation, many surfaces. The existing Next.js frontend points at Omega
surfaces over HTTP — no Prisma, no routes ported; the frontend becomes a client, not a
second platform. MCP tool generation rides the shared `surfaceOpMeta` derivation; Tauri
defers unless a proven shape mismatch. The console hardens to authenticated-user over
`user:<id>` + credentials (D-356 spine) + consent (D-379 fence as the mechanism); the
law-journal/world socket streams of the demo surface leave the single-principal boundary
exactly here, closing the L-11 note in KNOWN-LIMITS.

### W6 — Ops · authority: `WAVE6-OPS.md` + D-382 (observability spine)

**Goal:** from walls to objectives. BENCHMARKS walls (BOOT, RTT, SPAWN, APPEND-LATENCY,
EVICTION) gain SLO envelopes (Phase F-3, closes L-13); the spine's query set
(per-conversation history, per-realization status, per-decision resolve trail,
per-eviction journal) is productized on the console; runbooks reach on-call-able parity
with `docs/WINDOWS.md` as the pattern. Budget watch: the suite passed 903 on setup day —
re-check wall-time sharding at ~1,000 tests (D-317 discipline).

### W7 — Cutover · authority: `WAVE7-CUTOVER.md`

**Goal:** coverage parity on capabilities (not files) against the mines; every row
landed + tested + benchmarked, or explicitly deferred with a pointer; the legacy repos
archived read-only. The success test is INTENT.md §7 verbatim: any legacy capability
rebuilds as a plugin/pack in days via the authoring path, the team trusts adding more,
and each addition makes the system more legible, not larger.

---

## 4. Standing engineering debt (any-wave, opportunistic or trigger-driven)

- **Outcome\<T\> opportunistic conversion (G7 policy):** every new op; old ops convert only
  when their files are touched for other reasons. No wholesale retrofit.
- **L-16 Postgres driver slice:** unblocked by the W0-1 generator; the byte-identical-CAS
  falsifier (sqlite vs postgres) is written. Schedule when a driver consumer exists.
- **L-8 vault port deadlines** (trigger: tick refusal rate in the wild); **L-7** second
  `law` writer (transaction need); **L-9** cwd pinning; **L-10** fixed tmp roots — all
  trigger-driven, no scheduled work.
- **L-5/L-6 Windows soak:** sustained green soaks promote the MCP lane to required; a
  clean-slate L-6 repro becomes a Bun upstream report plus a gate guard.

## 5. Decision points ahead (owner forks, likely order)

1. **Ratify D-389 + D-390** — records ready; cite the setup-day green gate in the flip.
2. **`vivim.intent` composition entry** under the D-370 freeze — first real multi-step
   intent workflow picks the timing; matrix regen keeps byte-identity.
3. **Windows Job Objects containment probe** — gives W2-c/W4-B1b a second `enforced`
   verdict path (the D-386 named next slice).
4. **GAP-4 ruling** before any sharing-adjacent feature — the L-11 fence holds until the
   ruling exists (D-379 reopen rule); no pressure-based exceptions.
5. **Calibration corpus + SLO sequencing** (L-12 Phase-D chain, L-13 F-3) before any
   scoreboard-driven auto-routing is even drafted.

## 6. Non-goals, held (INTENT.md §5 + every review since)

No host features; no bulk imports of legacy wiring; no sharing implementation before the
GAP-4 ruling; no UI rebuild for aesthetics; no second platform; no sidecar databases; no
auth model outside law/consent; no fourth `ProviderClass` member until a harness provider
exists in-repo (D-306); no `CONTRADICTED` epistemic status until a conflict detector exists
to write it; no corpus/ontology layer ahead of agents acting. When in doubt, the standing
orders apply: smaller core, clearer boundary, stronger proof.
