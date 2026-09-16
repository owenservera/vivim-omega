# Wave0 Arbitration — Does Omega Core Need Foundational Upgrades?

**Wave0 question:** can the turn-015 core absorb the full legacy (163K lines, ~200 Prisma models, 16 providers, 30-file NLCL corpus, Next.js + Tauri, scheduler/tunnel/p2p/observability) as plugins/packs/plugins-of-plugins with **zero host growth** — or does the core need foundational upgrades first?
**Arbitration answer:** **yes — 7 bounded upgrades, all below the host, each with a named D-record, falsifier, and owner.** None expands trust silently. Each is sized to land inside one gate cycle. Wave0 closes when all 7 are specified (PROPOSED with matrices) and the two mechanical pieces (conformance net + index probe) are green — the remaining five may ratify alongside Wave1's first harvest, but none may be skipped.

## Upgrade 1 — Composition generation rule (unblocks all migration composition design)

**Gap:** 16-spec freeze (D-370) + D-316 flagship question still PROPOSED. Migration needs ~10–20 new compositions (per-stratum pilots + per-domain packs). Today's rule ("delete or generate one") is social, not mechanical.
**Ruling (proposed D-37X):** compositions are **generated** from a checked-in generator (inputs: plugin set + grant matrix + dataDir spelling), never hand-edited; the W1/G9 conformance net (Upgrade 6) is the mechanical gate. Flagship vs N-first-class stays deferred (D-316) — the net serves either answer.
**Falsifier:** generator emits `chat` + `browser` byte-identical to committed specs (modulo signatures); a drifted hand-edit fails the gate stage.
**Why Wave0, not later:** every subsequent wave adds compositions. Without the rule, each wave re-litigates placement (the A0 mistake).

## Upgrade 2 — Vault index + retention with numbers (unblocks conversation/memory stratum)

**Gap:** L-4 (chat history scan is total-ns, cap enforced post-filter) + D-335 retention OPEN with an unmeasured revisit trigger ("message latency or compaction pressure in benchmarks").
**Ruling (proposed D-37X):** (a) per-conversation index for ns `chat` (writer-maintained `conv:<id>:idx` row or equivalent — design in record, not here); (b) retention windows per ns in `VAULT-NAMESPACES.md` with numbers (chat/email/automation/discovery/agent/behavior/decision/providers/law/resolve/control); (c) compaction interaction stated (refs honored, changelog forever, cold fallback).
**Falsifier:** append-latency vs ns-size bench (1K/10K/100K messages) shows bounded history-read; `CHAT_HISTORY_CAP` refuses at cap fail-closed (already does — extend the test to indexed path).
**Why Wave0:** Wave3 writes years of chat history. An index designed after the rows exist is a migration, not a feature.

## Upgrade 3 — Sharing model ruling (unblocks multi-user harvest)

**Gap:** L-11 (single-principal scope, no sharing path — second-principal input fails closed by absence) + GAP-4 (sharing taxonomy deferred to M17) + legacy T-11 (workspaces, sessions, per-user keys across ~17 harvestable models).
**Ruling (proposed D-37X):** Wave0 does NOT build sharing. It **rules the Phase-1 boundary**: single `user:<id>` attribution + credentials spine + no cross-principal reads, with the exact refusal shape for second-principal input + the trigger that reopens GAP-4 (first sharing-adjacent feature). Workspace/session/key shapes land as **attributed rows**, never as shared objects.
**Falsifier:** second-principal read attempted against a `user:<id>` conversation is refused + ledgered; test pins the refusal code (REFUSED, not DEGRADED).
**Why Wave0:** Wave3 will otherwise smuggle a sharing model inside "session bookkeeping" without a ruling.

## Upgrade 4 — Provider launch mode + stealth admission (the only trust-surface expansion)

**Gap:** D-301 (attach-only) + D-300 (Bun WS+fetch, no client lib) + T-07 (12 stealth engines, selective admission open) + T-08 (governor restructure) + byte-identical rule (G5/C0: canonicalization vs volatile allowlist undefined).
**Ruling (proposed D-37X):** (a) define "byte-identical" FIRST (canonical form + volatile allowlist); (b) scope launch mode (per-OS lifecycle via `platform/`, packaging, budgets) as a Wave2 wave, not a Wave0 build — Wave0 only writes the bar (fence/attached/PROMOTED/pin extended to launched processes + day-one forbidden entries); (c) T-07 file-by-file admission list (each stealth file: admit with law reason or refuse with reason — no bulk import).
**Falsifier:** substitution test (live capture substitutable for `webmail-inbox/page.json` modulo allowlist, zero classifier changes) + forbidden-domain navigation refused + ledgered through the browser realization.
**Why Wave0:** this is the largest trust surface in the plan (D-338). Scope + bar in writing before Wave2 code, or the pilot fakes its own mechanism.

## Upgrade 5 — Pack authoring workflow (proves packs generalize)

**Gap:** one pack (`domain-email`) — possibly a snowflake. No documented path for "add the second pack."
**Ruling (proposed D-37X):** second pack is **chat-adjacent or provider-adjacent** (Wave1 builds it), but Wave0 writes the checklist the second pack must satisfy: SCHEMA (vault ns row same-commit) + CONTRACT (append-only versioning, `Outcome<T>`, risk rows) + POLICY (LAW_POLICY exact rows + forbidden entries where applicable) + TEST (fixtures + real-boot falsifier + bench line). Parser contributions ride D-355 (data, not ops).
**Falsifier:** checklist applied to `domain-email` retro-passes (gap list, if any, filed as pack debt); Wave1's pack passes it clean.
**Why Wave0:** without the checklist, each domain pack invents its own shape and the "layered cake" becomes 16 snowflakes.

## Upgrade 6 — Conformance net (mechanical teeth for all of the above)

**Gap:** G9 (13→16 compositions drifting — `law.json` incident template) + D-332 (zero-callsite types) + D-351 parity (manifest risk vs policy classification) — three partial nets, no single stage.
**Ruling (proposed D-37X):** one read-only gate stage (zero blast radius): every shipped composition's granted contracts/ports resolve against manifests; cross-composition grant drift flagged (allowlist for intentional scope differences); new exported contract types with zero call sites flagged; manifest risk vs LAW_POLICY classification parity checked. Land BEFORE Wave1 touches compositions.
**Falsifier:** stage green on current tree; a seeded drift (remove one grant / add one undeclared risk) fails the stage with a named diagnostic.
**Why Wave0:** the net is valuable under every later decision (D-316 flagship, generator, pack scale-out). It is also the cheapest upgrade here — land it first.

## Upgrade 7 — Observability spine (what "ledgered and queryable" means at scale)

**Gap:** legacy T-18 (observability/logger/resilience) marked REMOVE-patterns-only, but Omega has no prod observability plugin — only bench/demo/status/watchdog evidence. `vivim.mind` derives WorldModel but migration traffic (16 providers × streaming × multi-user) has no stated query story.
**Ruling (proposed D-37X):** `vivim.mind` + vault query + journal stream are the spine (no new metrics sidecar); Wave0 specifies the query set (per-conversation history, per-realization status, per-decision resolve trail, per-eviction watchdog journal) + the SLO gap (GAP-2: objectives follow measurement — Wave6 publishes them, Wave0 names the walls to watch: boot, RTT, spawn, append-latency, eviction walls).
**Falsifier:** mind-query round trip over a seeded multi-provider vault (history + status + resolve trail + evictions) green on a real boot; BENCHMARKS walls extended with append-latency vs ns-size.
**Why Wave0:** every wave's falsifier claims "ledgered and queryable." Without the spine spec, each wave means something different by it.

---

## What Wave0 explicitly does NOT build (deferred with named owners)

| Deferred | Owner wave | Why not now |
|---|---|---|
| Launch-mode code | Wave2 | Bar + scope now, lifecycle code when first launched provider needs it |
| Per-conversation index code (beyond probe) | Wave3 | Rule + probe now, full index with the rows it indexes |
| Sharing implementation | Post-GAP-4 | Ruling now, mechanism when first sharing feature demands it |
| Full NLCL corpus port | Wave4 | Split rule now (deterministic data vs probabilistic tail), files when intelligence stratum opens |
| Next.js/Tauri work | Wave5 | Pointer default stands; rebuild only on proven shape mismatch |
| SLO envelopes | Wave6 | Walls now, objectives after measurement (GAP-2 discipline) |
| Legacy archive | Wave7 | Coverage parity proof first, archive last |

## Wave0 gate criteria (all must hold to close Wave0)

1. 7 D-records PROPOSED with matrices + criteria (filed in `clone-omega/docs/decisions/`, index + board regenerated).
2. Conformance net stage landed + green (Upgrade 6 falsifier).
3. Index probe + append-latency bench landed (Upgrade 2 falsifier, even if full index defers to Wave3).
4. Byte-identical definition written (Upgrade 4, doc-only is acceptable — code defers).
5. `bun run omega:gate` green, `hostLoc` unchanged (911/1100 — Wave0 adds zero host lines), `build/status.json` refreshed with citations.
6. `40-EVIDENCE/` here carries the gate JSON + bench delta + boot log.
