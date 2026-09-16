# Migration DevOps — Omega as Target Substrate (V15)

> **2026-09-16 REBUILD (code-only):** prior `00-ASSESSMENT/10-WAVE0/20-WAVES/` docs are
> **stale history** (kept, not deleted). Authority is now **`FACT-BASE-2026-09-16.md`**
> (disk-measured ground truth: mines @`4a5eb84`/`afebe00`, 954/1051 src files, 201 Prisma
> models, 13+8 provider manifests, Omega host 911/1100) → **`STRATEGY-OMEGA-PLUGIN-REBUILD.md`**
> (plugin-pure rebuild, strata W0–W7) → **`10-WAVE0/WAVE0-NEEDS-FROM-CODE.md`** (9 Wave0 needs
> with falsifiers). Mines live read-only in `vivim-old-repos/`.
>
> **Foundation track (Wave0):** `10-WAVE0/FOUNDATION-DRAFT-001-MULTI-RUNTIME-DATA-LAYER.md`
> documents the owner's first draft (verbatim) for multi-runtime support (`process` tier for
> Python/OS-process plugins) and the unified pluggable data layer (`storage.kv` capability,
> SQLite/Postgres driver plugins). Status: DRAFT-001 UNVERIFIED — the doc also carries the
> law-conflict arbitration list (B5 host growth, D-361 sqlite adapter, D-372 OS seam,
> credentials spine, 16-spec freeze) and the falsifier set required before landing.

**Home for the full legacy → Omega migration.**
**Old plan base:** `vivim-kernel-auto/MASTER/Migration/` (M-plan, M-TRIAGE-01, agent brief — Sep 13 baseline: 612 tests, host 984/1000, M0/M1 unbuilt).
**New base (this assessment):** `V15/vivim-omega-turn-015-RECOVERED/clone-omega` @ `61d1a41` (D-372 Phases 1-2, ~733 tests, host 911/1100 after platform extraction, M0/M1/M2/M3/M4 all re-landed).
**Doctrine:** D-210 + D-333 hold. Legacy repos are frozen mines. Omega is the sole target. Everything migrates as a **plugin**, a **pack**, or a **plugin-of-plugins** (orchestrator plugin holding `port:` caps to child ops) — never as host code, never as a fork.

## How to use this folder

| Dir | What lives here | When you touch it |
|---|---|---|
| `00-ASSESSMENT/` | Fresh assessment. Read-first. The layered cake, the base delta, Wave0 arbitration, full wave map, gap registry. | Start here. Re-read before every wave kickoff. |
| `10-WAVE0/` | Wave0 arbitration work: core-upgrade proposals, gate criteria, decision stubs to file in `clone-omega/docs/decisions/`. | Wave0 only. Closes when core upgrades land + gate green. |
| `20-WAVES/` | One spec per migration wave (W1–W7). Each names its falsifier, its compositions, its triage IDs. | Kick off waves in order. No skipping. |
| `30-TRIAGE/` | Harvest ledger (T-series continuation of M-TRIAGE-01) + harvest pattern (how to strip EventBus/DI/Prisma coupling). | Updated by every wave that harvests. |
| `40-EVIDENCE/` | Gate runs, boot logs, benchmark deltas. Append-only. | Every wave appends its `omega:gate` + `omega:bench` output. |
| `50-RUNBOOKS/` | Daily loop, fresh-boot, composition discipline. | Operator procedures. Keep short. |
| `STATUS.md` | Single-line wave tracker. | Update on every ratify. |

## The one-paragraph plan

**Wave0 arbitrates the core** (does Omega need foundational upgrades before it can absorb 163K lines as plugins?). Answer in this assessment: **yes — 7 bounded upgrades, zero host growth, all plugin/pack/tooling-level** (composition generation, vault indexing, sharing model, provider launch mode, pack authoring, conformance net, observability spine). **Waves 1–7 then harvest in strata** (infra → providers → conversation/memory → intelligence → surfaces → ops → cutover), each proving itself on a real boot with a falsifier, same discipline as every Omega wave before it.

## Non-goals (hold these)

1. No host growth. B5 frozen (1100 LOC, D-365). Wave0 proposes no `host/src` change.
2. No legacy writes. Read-only harvest. Fresh-tree guard stays.
3. No bulk port. One provider / one capability proves the pattern before scale-out repeats it.
4. No new vocabulary without writers. Every new contract ships with producer + reader + test in the same commit.
5. No composition sprawl. 16-spec freeze (D-370) holds until Wave0's generation rule replaces it with a mechanical alternative.

## Entry points

- New to this? Read `00-ASSESSMENT/00-FRESH-ASSESSMENT.md` then `00-ASSESSMENT/02-LAYERED-CAKE.md`.
- Ready to arbitrate? Read `00-ASSESSMENT/03-WAVE0-ARBITRATION.md` then work `10-WAVE0/`.
- Ready to build? Pick the lowest un-closed wave in `20-WAVES/` + its triage rows in `30-TRIAGE/`.
