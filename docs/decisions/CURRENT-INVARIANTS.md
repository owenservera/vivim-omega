# Current Invariants — the one-page law snapshot

<!-- invariants: pass 4 · as-of D-422 · regenerated 2026-09-20 (D-422 ratified; the process gate stage added under the still-open D-423; pass 3 was as-of D-421) · stages: anvil-loc anvil-surface attest bun-surface compositions decisions forge-surface fresh-tree host-loc import-surface invariants-freshness os-surface process tests -->

**Pass #4 (2026-09-20, the process self-model).** Refreshed on the D-415
stage-drift trigger — a gate stage was added: `process` (report-only, placed
right after `invariants-freshness`), the process self-model of `D-423`
(`tooling/gates/process.ts`, `omega:process`). The stage reports gate
color/staleness, board open/blocking, docscan findings and the ledger home from
the existing readers and never fails on their content; only a derivation throw
fails. `D-423` is still open on the board at this pass, so this page states the
stage as landed tooling, not as ratified law; the runtime-visible follow-on is
the open `D-424`. Pass #3 below stands unchanged.

**Pass #3 (2026-09-20, the course-correction round).** Refreshed on its own
D-415 trigger — a wave closed (the Core Phase: D-416), the identification
pass landed and lifted the register (D-417), a gate check was added
(SHIPPABLE_FENCE, D-420), and four directive records landed (D-418..D-421).
Pass #2 covered D-364 + the D-365…D-415 records; the full decision log
(`docs/BUILD-DECISIONS.md`) remains the audit trail; this page is what a
fresh reader (human or agent) reads INSTEAD of it to state present-day law.

**Refresh policy (D-415): on trigger, not calendar** — regenerate when a wave
closes, a B-law or gate stage is added or amended, or 30 ratifications
accumulate, whichever comes first. The gate's `invariants-freshness` stage
computes staleness (the marker's as-of vs ratified rows past it; the marker's
stage inventory vs the gate's registry) and **reports** — report-only by
design; the flip to failing is a future record's call after one green wave of
reports (the D-368→D-402 adopt-observe-enforce pattern). The wave-closure
trigger is deferred with a named trigger: no mechanical wave registry exists
yet — implement when the first forge wave closure lands with one.

## The boot-security laws (B1–B5)

| Law | Invariant today | Policed by |
|---|---|---|
| **B1** | No code executes unless a signed manifest entry in the user-signed Recipe references its content hash. Manifests are requests; the Recipe is the only grantor. | boot verify (fail-closed), gate `fresh-tree`, adversarial 1–12 |
| **B2** | One `worker_threads` compartment per plugin — separate V8 isolates, shared-nothing. Every message crosses the Port Protocol. Isolation is against **coupling, not exhaustion** (D-321: `resourceLimits` are NOT enforced on Bun — re-verified on Linux, 130MB in a 32MB cap). The D-360 watchdog bounds *detection* time of a consuming compartment (adversarial 13/14); exhaustion within a sample window remains open until a process-per-compartment tier exists (flagged, not built — D-360). | host/src/worker.ts header, gate `bun-surface` (runtime-neutral prod tree), adversarial 13/14 |
| **B3** | Capability tokens are verified host-side, outside every compartment. Token records are order-independent (alias keys and guarding caps resolve to the same effective cap). Revocation is a generation bump (attributable REVOKED register). | host/src/ports.ts `checkToken`, token-law tests |
| **B4** | Any verification failure refuses the composition; boot falls back to the pinned recipe; the rename is the atomic durability boundary (stale tmp cleaned, mid-swap crash drills green). | recovery.ts, adversarial 8/9/12, B4 drill |
| **B5** | The µhost is boring and may not grow: `host/src` ≤ 1,500 LOC, hard gate, re-frozen by D-391 (the D-365 1,100 freeze was amended ONCE, loudly, for the D-340 genesis kernel's host-critical subset — the same no-exceptions rule carries: no new host surface without removing old surface in the same commit). **At the freeze since the Core Phase: 1500/1500 flat, zero headroom** — any host-touching change names its equal-or-greater removal BEFORE the code is written. Creep moves into plugins or out-of-tree tooling. | gate `host-loc` (1500/1500 at this snapshot) |

## The architecture laws (Ω)

- `bootPhase 0` belongs to `vivim.law`, enforced at verify time.
- Every routed op has exactly one implementation (duplicate routed op refused at boot).
- Risk gating is DATA (manifest CONTRACT risk declarations → law.check@1); the host embeds no policy. Manifest risk and LAW_POLICY classification must agree — catalog parity, never default-riding (D-351's drift class, mechanized by the conformance net D-376; LAW_POLICY_V1 now at 1.8.0).
- **Shippable-v1 fence (D-420):** the shippable-v1 composition named by D-420 (`browser`, the D-357 M0 GATE composition — succeeding it is a D-420 amendment) carries the `SHIPPABLE-V1 (D-420)` marker, and NO composition carrying that marker boots an AI-API realization; v1 is fully Chrome master/slave (D-418).
- Data lives in the user's vault; persistence goes through the vault's namespaces with same-commit registry rows (`VAULT-NAMESPACES.md`); forbidden persistence is refused (D-325). **Compaction never deletes a revision, period** — explicit namespace law (D-410's item C, the stronger F9 prerequisite).
- Computation is routed, never vendored: resolution ≠ execution (D-323/D-337/D-359).
- Everything else is a plugin. The host is transport, not policy.

## The Core Phase seam laws (D-411/D-412 — canonical intent + principal identity)

- **Canonical intent (D-411):** intents persist through one canonical writer path with a **real sha256 payloadHash** and the interpretation summary on the row; `intent.resolution@1` writes the four-state rows (UNDERSTOOD = the intent row; AMBIGUOUS/REFUSED/EXECUTED = `:res` rows in ns `intent`, `amb:<hex>:res` for ambiguous attempts); **law decisions cite `{intentRef, payloadHash}`** — evidence binding, not new policy; callers without citations journal exactly as before. The console live path routes interpret → persist → gate-with-citation → execute → resolve. `intent.cancel` reports its compensation write (never silently swallowed).
- **Principal identity (D-412):** ns `principal` identity rows, **retention forever** — retired is forever (`PRINCIPAL_REUSED` on re-registering a retired id; the string can never become a different record). The consent ceremony resolves through the record when law holds vault caps (fail-closed rollback, the D-325 pattern); existing keyed history is NOT re-typed — the record is the indirection, not a migration.

## The Omega Forge constitution (Wave 0, D-403…D-406)

- **The anvil freeze (D-404):** `sdk/src` ≤ 860 LOC + a 45-name frozen export surface (the five: parseManifest, validateManifest, signPluginDir, contentHashDir, createPortClient + support) — remove-to-add after Wave 0; a new or removed export needs a decision record + snapshot amendment in the same commit. 856/860 at this snapshot; the gate dynamic-imports the sdk every run to prove the anvil still loads.
- **The generality axis (D-405):** `GeneralityStamp` in contracts (speculative/harvested/generic; mine, originPaths, harvestClass, evidence) + validators in the sdk with four named codes — zod carries the SHAPE, the validators carry the LAW; **mandatory (hard)** for forge.* and pack.builder.
- **The frozen wire (D-406):** `FORGE_OP_CATALOG` — 24 forge.* ops → risk, frozen; manifest ↔ catalog EXACT match (drift fails); **one risk class per forge PLUGIN** (packs span classes by design — `FORGE_CLASS_SPAN` exempts packs, a decision not a gap); ns `proposal` + scratch only for Class-2 emission; every forge.* op refusal-tested (`FORGE_NO_REFUSAL_TEST`); refusals are refusal-as-data (ok:true carrying {refused, rule, detail} — the D-379 pattern).
- **Self-hosting stance (D-406):** `forge.author.init@1` serves pluginId `forge.author` only (a deliberate refusal, not a TODO); AUTHORED files = 4 with recorded justification (a recorder cannot emit its own recording; a falsifier emitted by the defendant is not a falsifier).
- **The mine (D-406):** `fixtures/mines/synthetic-v0/` — 42 offline hash-pinned files (MANIFEST.json rootHash), un-Vivim-shaped by charter, waiting for `forge.mine.capture@1` (Wave 1, OPEN — the register lifted per D-417; first receipts are the mine wave's work).
- The gate's `forge-surface` stage polices the boundary (5 checks + generality); red/green falsifiers live in `tooling/gates/test/forge-surface.test.ts`. The comparison walker excludes `node_modules` under the host `contentHashDir` precedent — machine state, not plugin bytes (recorded, revisit only if plugin dirs ever ship vendored deps that ARE plugin bytes).

## The program law (D-408…D-421 — vision, partition, sequencing, tooling, the course-correction round)

- **The Sovereign Environment (D-408, ratified):** the amended end-state vision is law — the governed event as atom, the NL control plane a constitutional peer (probabilistic perception, deterministic intent, deterministic execution; no raw model output crosses the law gate; the LLM is a replaceable realization, never the resolver of record), Part II (the civilization) + Part III (the physics) added, the arc amended. The vision is direction: waves land through the constitution as ever.
- **The capture-vs-READ partition (D-409, DECIDED):** split-plugin — `forge-mine-capture` is EXTERNAL_MUTATION in its own directory; READ siblings live separately. Implementation lands with Wave 1 (OPEN — the register lifted per D-417); the decided shape stays decided.
- **Core-first re-sequencing (D-410):** the Core Phase (S1 → S2 → S3) preceded all plugin work; plugin design was parked until core-omega-ready. **S3 was called and landed (D-416) — THE CORE PHASE IS CLOSED; core-omega-ready reached; the plugin-identification pass (D-417) enumerated the lanes and LIFTED the register — parallel work is OPEN.** (The pass-2 text here said S3 awaited the owner — resolved 2026-09-20.)
- **The evidence-store fold (D-416, ratified):** law's narrative journal rows ride vault ns `law` (id family `journal:<boot>-<seq>`) wherever `port:vault.append@1` is granted; the legacy host sidecar is the transition artifact; best-effort either way (a law decision is never blocked by a journal failure — the row is lost loudly); the recursion guard: the journal never narrates its own writes; `law.audit.drain@1` persists the kernel's signed audit chain whole into ns `audit` (the console drains at close); the registry absorbs vault journal rows live; zero host LOC.
- **The parallel era (D-417, ratified):** the core needed ZERO new plugins (the seams rode existing machinery); the lanes are 8 forge plugins covering the 23 unimplemented frozen-catalog ops (Wave 1: forge-mine-capture + forge-mine, the DECIDED D-409 shapes; Wave 1+: survey, assay, shape, emit, proof, tier) plus the Wave-2 assembly plugin (the mind-spine carrier — **distinct from `vivim.mind` (Ω10, self-knowledge/WorldModel, live)**: it owns context assembly, not world-model grounding). Identify, never design; the catalog stays frozen.
- **The v1 substrate call (D-418, directive — the owner's verbatim call, 2026-09-20: "We need to remove the ollama references everywhere its not how we will build this the shipable first product has no ai api connected and is fully chrome master slave"):** Chrome master/slave (`provider.browser`) is the shippable-v1 substrate; **no AI-API realization ships in v1**; the vision doc's Ollama-first passages (§28 row 3, §24's Frank badge, §31's Wave-1 boundary) are superseded with D-418 markers; `provider.llm`'s code and D-338/D-380/D-381 stand as historical record.
- **The CDP-substrate lane (D-419, directive):** `provider.browser`'s CDP substrate is an explicit parallel lane, attach-only first, sequenced ALONGSIDE the forge mine wave; entry falsifier = ARCHITECTURE-NEXT-STEPS §G5 adopted whole (write down what "byte-identical" means for live-vs-fixture captures BEFORE the substitution test is coded — a live capture substitutes for `webmail-inbox/page.json` with zero classifier changes, or the fixture format is what's wrong, not the provider).
- **The shippable-composition fence (D-420, directive):** `compositions/browser.json` is formally the shippable-v1 composition (tagged `SHIPPABLE-V1 (D-420)` in its matrix note); the compositions gate stage enforces the fence (three named refusals: SHIPPABLE_V1_MISSING / SHIPPABLE_V1_UNTAGGED / AI_API_IN_SHIPPABLE — no AI-API realization boots in a shippable-tagged composition; the AI-API set is data: `provider.llm` today). The proving compositions (console/llm/chat/discovery-mind) keep `provider.llm` untouched and untagged.
- **The governor scoping (D-421, directive, Blocks Wave 4):** tile-lifecycle scheduling (§18 ghost/dormant/hydrated/suspended, the 2-second unplug duty) presumes plugin-side living over existing `platform/` process-lifecycle capabilities + the out-of-tree watchdog placement (D-329) — the host does nothing new; a Wave-4 design record claiming a host primitive must name the equal-or-greater removal BEFORE code (B5, unconditional). F8 stays the judge.
- **The generated-row era (D-413):** records from D-413 on carry `## Index` and their BUILD-DECISIONS row is GENERATED and byte-checked; `omega:new-decision` scaffolds contract-passing records; the `Blocks:` field (checker-validated vocabulary) + blocking-first board; cross-track citations carry the naming law (bare `D-NNN` = THIS ledger; foreign ids track-qualified, `akb:D-389`; report-only lint).
- **The round-close automator (D-414):** `omega:round-close` — the ceremony as one fail-closed command (named preflight refusals; bundle cut + verify + sha256; the ledger row generated from git data; the next-round entry block derived from BACKLOG + the board). `build/status.json` carries the toolchain pin (`toolchain {bun, node, os, arch}`); `verify-status` reports drift, never fails on runner-shape. The close sequence: PROPOSED → gates ×2 → ratify → board refresh → close-out → `omega:round-close`.
- **This page's own law (D-415):** the trigger-based refresh policy in the header marker above; the report-only `invariants-freshness` stage.

## Runtime surfaces and the adapter inventory (D-361 as rewritten by D-373)

- The production tree (`host`, `shim`, `contracts`, `platform`, `sdk`, `testkit`, `plugins/*`, `surfaces/*`) contains **zero** runtime-specific APIs except the vault DRIVER LANE: `plugins/vivim-vault/src/drivers/bun-sqlite.ts` (`bun:sqlite`). A Node build swaps the ONE lane import (`./db.ts` → `./db.node.ts`, `node:sqlite`) — proven byte-identical by the cross-runtime conformance parity suite, not by trust (D-373).
- Sync sleep is `Atomics.wait`-based; the daemon listens via `node:net`, spawns via `node:child_process`; surfaces read specs via `node:fs`. Dev/test toolchain is Bun (≥ 1.3.14 pinned) — recorded per-run in status.json's toolchain pin (D-414). The `bun-surface` stage enforces the inventory; the node `--test` canon canary proves runtime-neutrality (CI, D-362).

## Watchdog policy (D-360, hardened D-366)

- Lives in `tooling/watchdog` (out-of-tree, D-329 placement law); attaches to a booted router, probes raw workers on an interval; termination through the sanctioned `host.compartment.terminate@1` as root; evictions journal (principal `watchdog`).
- Two-signal enforcement per compartment: **unresponsive** (N consecutive unanswered probes — NON-SPOOFABLE) and **memory** (N consecutive answered samples over the manifest's declared `runtime.budget.memMB` — COOPERATIVE-ADVISORY). Thresholds are manifest data; missing budgets fall back fail-closed with journal audit. Containment, not a security boundary — stated honestly.

## Boot readiness (D-363)

- Readiness rides the router's `ready` message: `PortRouter.waitActive(id, timeout)`. Boot polls nothing.

## Process law (D-364, simplified D-367; extended D-413/D-414)

- Every decision ≥ D-313 has a record (six sections, options matrix, Decision line, evidence); statuses agree between index and record; RATIFIED requires a resolvable commit SHA. Index rows from D-360 on carry a class tag (`· evidence` / `· directive`); from **D-413 on rows are generated** from the record's `## Index` (byte-equality enforced — the eras: `< D-313` index-only, `D-313..D-412` hand-typed, `D-413+` generated).
- **Cooling-off for B1–B4 evidence-class decisions:** the named falsifier IN the record BEFORE RATIFIED + a second gate run after; directive rows ratify same-day on gate green, honestly labeled.
- **Composition freeze (D-370, amended D-391/D-406):** **18 specs** — new specs only through `_matrix.json` + `omega:generate composition` (hand-edited specs fail the gate; the conformance net D-376 + matrix D-377 mechanize it). Composition stance (D-316): N first-class compositions, no flagship; grant variance per-row via DRIFT_ALLOWLIST with D-pointers.
- **Round protocol:** PROPOSED commit (code + records + index) → full gate green ×2 → Ratify (flip + regenerate row/board, cite landing SHA + gate numbers) → board refresh at the ratified tip → close-out (HANDOFF + BACKLOG) → `omega:round-close` (D-414) — the bundle, its sha256, and the ledger row are tool-generated from git data.
- Consolidation: this page regenerates **on trigger** (see the header policy). The full log is never pruned or rewritten — append-only, supersede never edit.

## The W0 close-out layer (D-376…D-383, the migration-readiness laws)

- **Conformance net (D-376):** the `compositions` gate stage — grant-vs-manifest, bootPhase-0 law, D-325 pairing, allowlisted drift, zero-call-site contracts, risk parity, matrix conformance (specs regenerate byte-identical from `compositions/_matrix.json`).
- **Authoring path (D-377):** the matrix is the source of truth; `omega:generate plugin|pack` scaffolds with the authoring checklist. New readers author via the generator, never by hand.
- **Vault index + retention (D-378):** per-conversation index rows bounded by CHAT_HISTORY_CAP; retention windows per ns DECLARED (numbers in the D-378 record + VAULT-NAMESPACES rows); mechanical enforcement is Wave3.
- **Single-principal fence (D-379):** one principal per conversation; cross-principal reads REFUSE as verdict + LEDGER; sharing reopens only by a new decision record. Provider bar (D-380), parser bar (D-381), observability spine (D-382), surface pointer default (D-383) are the Wave1+ bars — read those records before harvesting anything.

## The storage driver lane (D-373) and the polyglot tier (D-374)

- The vault's byte-persistence sits behind one structural `SqliteDriver` seam; drivers are dumb byte stores — the spine owns CAS, Merkle changelog, refs, compaction. A driver that decides what is live, or prunes history, is not a driver — it is a fork of the spine.
- Compartments are worker-threads OR declared process pools (signed composition config only; the broker refuses unknown pools and undeclared ops). B2 holds literally at the OS boundary: shared-nothing, Port Protocol over ndjson stdio, fail-closed; malformed IPC is bounded (BUDGET, never a hang). The containment probe (`omega:containment`, D-386) claims enforcement ONLY from kernel-side measurements. `wasm` is forward-declared vocabulary only (D-354).

## Budget watch

- **Host LOC: 1500/1500 — AT the freeze, zero headroom.** Any host-touching change names its equal-or-greater removal BEFORE the code is written (B5: same-commit removal, never partial).
- **Anvil: 856/860** — 4 lines of remove-to-add headroom, same rule.
- **Tests: 1147 (the D-421 tree), sharding trigger long crossed** — the quick gate + lanes hold it; re-check wall-time as the suite grows past ~1,200.
- **Single-principal boundary (L-11) is a fence, not a bug:** the first sharing-adjacent feature requires the GAP-4 ruling first (D-379's reopen rule).
- **Calibration corpus + SLOs (L-12/L-13):** promotion thresholds remain unmeasured constants — not load-bearing for consequential decisions before Phase D / F-3.

## Acknowledged limits

Every residual the tree knowingly carries lives on one page with its detector
and revisit trigger: `docs/KNOWN-LIMITS.md`. A limit leaves that page only by
being fixed (with its falsifier) or superseded (with a D-record pointer).
