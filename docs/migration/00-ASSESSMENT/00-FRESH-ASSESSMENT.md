# Fresh Comprehensive Assessment — Legacy → Omega Migration (V15 base)

**Date:** 2026-09-16 · **Base:** `vivim-omega-turn-015-RECOVERED/clone-omega` @ `61d1a41` · **Supersedes as planning base:** `vivim-kernel-auto/MASTER/Migration/` (M-plan + M-TRIAGE-01 + agent brief).
**Method:** read-only inventory of both trees. Nothing in either tree was touched. Gate/bench numbers below are committed evidence in the base, not new runs.
**Verdict up front:** the old M-plan's *direction* (Omega wins, harvest-don't-port, pilot-then-scale) survives intact. Its *substrate assumptions* (M0/M1 unbuilt, storage/auth/resolution undecided, 612 tests, host 984/1000) are **stale by one full re-land wave**. The new base already closes M0–M4 as code. Wave0's job is therefore **not** "build streaming/browser/storage/auth/resolution" — it is **"arbitrate the 7 gaps that only appear at migration scale, and prove the core can absorb the legacy as plugins-of-plugins without growing the host."**

---

## 1. What changed between the two bases (why a fresh assessment was required)

| Axis | Old plan base (Sep 13) | New base (turn-015 recovered, Sep 16) | Planning consequence |
|---|---|---|---|
| Tests / gate | 612 pass, `hostLoc` 984/1000 | ~733 pass, host **911/1100** (budget raised D-365, then platform extraction D-372 freed ~88 lines) | Headroom exists again, but B5 freeze means it is **not spendable** without same-commit removal. Wave0 must be host-zero. |
| M0 browser | D-338 RATIFIED, **no code** (attach vs launch open, authority story unwritten) | **D-357 re-landed**: `plugins/provider-browser/src/{index,session,parsers}.ts`, sessions-by-reference (redact-before-vault), 4 fail-closed bars (fence/attached/PROMOTED/pin), replay over D-352 chunk shape, `compositions/browser.json` | M0-build is done. Migration-scale remainder: **launch mode** (D-301 deferred), 15 more providers, stealth-corpus admission (T-07), byte-identical fixture rule. |
| M1 streaming | D-339 RATIFIED, **no code** | **D-352 re-landed**: `StreamChunk {streamId,seq,data,final}` + `checkStreamSeq`, host relay `callAsRootStream` (only host surface), shim `meta.emit` strict-seq, sdk `streamRootCall`, `echo.stream@1` falsifier green | Primitive exists. Remainder: provider streaming end-to-end for every provider class (SSE harvest T-04), flood guard already in D-369 (1000 chunks). |
| M2 storage | D-335 RATIFIED as ruling (vault as-is), **no writer** | **D-358 landed**: `contracts/chat.ts`, `plugins/vivim-chat` first writer of ns `chat` (`conv:*`, `msg:*` with seq + realizationRef/streamRef), `chat.complete@1` line-chunk hook, `compositions/chat.json`, ns row same-commit | Pilot storage exists. Remainder is **scale**: L-4 total-ns scan (no per-conversation index), retention OPEN (D-335 revisit trigger unmeasured), 200-model Prisma harvest still ahead. |
| M3 principal | D-336 RATIFIED as ruling, **no code** | **D-353 landed**: `PrincipalKind`/`principalKind` (TOTAL, unknown strings stay legal), `law.describe@1`, `ConsentTable.listFor`, law 0.2.0, granted in 13 law-carrying compositions | Single-principal works. Remainder: **sharing model** (L-11: no second-principal path, GAP-4), workspace/session/API-key shapes from legacy T-11. |
| M4 resolution | D-337 RATIFIED as ruling, **no code** | **D-359 landed**: `contracts/surface.ts` (`surfaceOpMeta` + `capabilityNamesFromRouted`), `chat.resolve@1` (deterministic half in chat, ambiguous half via SHARED `resolve.classify@1`), MCP refactored to shared derivation | Resolution wired. Remainder: 30-file legacy NLCL corpus mapping (T-09 split), calibration corpus GAP-1, no end-to-end SLOs GAP-2. |
| Credentials | Not in M-plan scope | **D-356 landed**: `credential.put@1` (MUTATION + require-consent, sim-synthetic only), `credential.use@1` (READ, capability-dead), `credential.redact@1` + REDACTION_POLICY_V1, `compositions/credentials.json` | Migration gains a spine it didn't plan for: per-user API keys / browser profiles ride this, not ad-hoc vault rows. |
| Parsers | T-05 fixture wish | **D-354 + D-355 landed**: parser isolation tier (B2 compartment, zero-cap, deadline-BUDGET) + parser governance (`CONTRIBUTION_KINDS += parser`, NOT routable, `parserPins` on realizations, signed + version-pinned) | Harvest has a governed landing zone: legacy SSE/import parsers (T-04/T-05) arrive as **data**, not code. |
| Risk / law | Forbidden overlay memory-only (G8) | **D-351 risk parity** (LAW_POLICY_V1 1.1.0→1.3.0, fail-closed parity net) + **D-325 durability** (vault ns `law`, reload) + `law.describe` | Authority model is migration-ready for single-principal. Multi-principal overlays still unproven. |
| Runtime / OS | Bun assumed, `/tmp` literals scattered | **D-361** (runtime-neutral prod tree, one sqlite adapter) + **D-371** (Windows takeover) + **D-372 Phases 1-2** (`platform/` seam, `os-surface` gate, `${TMP}` spelling, 10 compositions portable) | D-372 Phases 3-5 + macOS lane still PROPOSED. Migration touches OS (Chrome lifecycle, tunnel, p2p, FS) — seam must finish first. |
| Ops / process | Gate 6 stages, status.json hand-compared | **D-360 watchdog** (13/14 green, 2.9s/3.7s walls) + **D-362 reproducibility** (`verify-status.ts`, required jobs) + **D-363 boot 27→10ms** + **D-364 classes/cooling-off** + **D-367 fast-path** + **D-368 lanes/quick** + **D-370 16-spec freeze** | DevOps substrate is stronger than the M-plan assumed. The 16-spec freeze is now the binding constraint on migration composition design. |
| Packs / providers | Email/file round-trip (SIMULATOR only) | `provider-llm` (simulator + live), `provider-email-file` v0.2.0 (`message.receive@1`), `packs/domain-email`, 6 discovery engines, `vivim-providers` registry, `vivim-credentials`, `vivim-chat` | Strata exist as thin slices. 15 legacy providers + all non-email packs are still ahead. |

**Net:** the M-plan's Phase 2 (M0–M4 substrate waves) is **~85% landed as code**. Re-running it as build work would be waste. The fresh plan starts *after* it.

---

## 2. The migration in one page (waves)

```
WAVE0  ARBITRATION ......... 7 core upgrades ruled + specified, host-zero, gate green  [THIS FOLDER: 10-WAVE0/]
WAVE1  HARVEST INFRA ....... parser landing zone live, fixture pipeline, triage automation as plugins
WAVE2  PROVIDER STRATUM .... 16 providers as realizations (API_NATIVE first, BROWSER_MEDIATED second), launch mode, stealth admission
WAVE3  CONVERSATION/MEMORY . sessions/workspaces/keys on credentials+chat spine, per-conversation index, retention ruling with numbers
WAVE4  INTELLIGENCE ........ NLCL corpus split, capability taxonomy, director rules, calibration corpus GAP-1
WAVE5  SURFACES ............ web console -> Next.js pointer, CLI/MCP parity, Tauri shell decision, multi-user auth
WAVE6  OPS ................. observability/resilience/scheduler/tunnel/p2p/onboarding as plugins, SLOs GAP-2
WAVE7  CUTOVER ............. coverage parity proof, legacy archive, retention/compaction steady-state
```

Each wave spec lives in `20-WAVES/`. Each gates on `omega:gate` + `omega:bench` + its named falsifier, same as every Omega wave. No wave starts until the prior wave's falsifier is green on a real boot.

**Why strata, not legacy subsystems:** legacy subsystems are coupled along EventBus/DI/Prisma lines that have no destination in Omega (M-TRIAGE-01 T-12–T-15 REMOVE). Strata are coupled along **capability lines** (one op = one plugin surface), which is the only boundary Omega enforces. Harvesting by stratum lets each wave prove one authority/storage/streaming question cleanly instead of dragging the whole monolith's transport along.

---

## 3. Wave0 answer in brief (double-click lives in `03-WAVE0-ARBITRATION.md`)

Omega needs **7 bounded foundational upgrades** before it can absorb the full migration — **none of them host code**, all of them plugin/pack/tooling/composition-level:

1. **Composition generation rule** (replaces the 16-spec freeze with a mechanical alternative — D-316 net + generator).
2. **Vault index + retention ruling with numbers** (per-conversation index for ns `chat`, retention windows per ns, compaction interaction — closes L-4 + D-335 open trigger).
3. **Sharing model ruling** (second-principal semantics before any multi-user harvest — closes L-11/GAP-4).
4. **Provider launch mode + stealth admission** (D-301 reversal scope + T-07 file-by-file bar — the only trust-surface expansion in the plan).
5. **Pack authoring workflow** (second pack proves the first wasn't a snowflake — generalizes `domain-email`).
6. **Conformance net** (W1/G9 gate stage: grant drift + contract call-sites + risk parity across all shipped compositions).
7. **Observability spine** (ledgered, queryable `vivim.mind` story for migrated traffic — what "ledgered and queryable" means at 16-provider scale).

If any one of these is skipped, a later wave fakes its own mechanism (the exact failure mode the M-plan §8 forbids). Wave0's falsifier is: **all 7 specified as D-records (PROPOSED with matrices + criteria), the conformance net + one index probe landed, gate green, host LOC unchanged.**

---

## 4. What this assessment does NOT do

- It does not re-triage 2,398 files. M-TRIAGE-01's subsystem cut (T-01–T-18) stands; `30-TRIAGE/TRIAGE-LEDGER.md` continues it per-wave.
- It does not redesign Omega. B1–B5, the Decision Contract, the LOC freeze, and the 16-spec freeze all hold until Wave0's specified replacements ratify.
- It does not authorize code. Every upgrade below is a **PROPOSED spec** until its D-record + falsifier + gate run say otherwise.
