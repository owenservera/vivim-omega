# VIVIM-Ω — Architecture Notes: Where We Are, What's Next

> **ARCHIVED 2026-09-18 — superseded; do not act on this as a live spec.**
> This was a planning snapshot baselined at `597d567`. Every decision it lists as
> "open for the owner" (D-313…D-318) is now RATIFIED — the live state of §7 is carried
> by the decision records themselves, and present-day law is
> `docs/decisions/CURRENT-INVARIANTS.md` (read that INSTEAD of this file). Moved here
> per the 2026-09-18 independent recommendation report §5; RATIFIED decision records
> that cite this document's sections now find it at `docs/archive/ARCHITECTURE-NEXT-STEPS.md`
> (records are never edited — see `docs/archive/README.md`). Content below is verbatim as archived.

**Author posture:** principal architect, writing for the owner and the upgrade agent.
**Baseline:** `omega` @ `597d567` — gate green (`bun test` 516/516, `omega:gate` ok:true), host 834/1000 LOC, D-312 ratified.
**Scope of this doc:** planning reference only. It ratifies nothing and builds nothing.
**Revision note (post external review):** an independent review (`upgrades/New/PROPOSED-NEXT-STEPS.md`,
plus `VIVIM-OMEGA-INDEPENDENT-REVIEW.md`)
verified this doc's claims against source, corrected one factual error (verification *is* wired
in `discovery-mind.json` — see G1), and its adopted recommendations are folded in below
marked **[review-adopted]**. Points where this doc deliberately differs are marked **[differs]** with reasons.
Decision records D-313–D-321 carry the live state of §7; this prose is the summary.

---

## 1. Honest inventory

What exists, stated by what it can and cannot do today:

| Layer | Can | Cannot (yet) |
|---|---|---|
| µhost + law + vault + run (Ω0–4) | Route, gate, persist, schedule with proofs | Grow — host is 834/1000 LOC; treat 1000 as a wall, not a budget |
| Packs/providers (Ω5, SIMULATOR only) | Email/file round-trips | No API_NATIVE or BROWSER_MEDIATED provider exists |
| Surfaces (Ω6, Ω13) | CLI/MCP/console over the same gate | Console assumes a cooperative local user |
| Discovery (Ω7–9) | Perceive → observe → infer → map → verify → heal, all evidence-backed | Write `RealizationStatus` anywhere; promote `Variation`s (new) |
| Mind/director/NLCL (Ω10–12) | Derive worlds, fire rules from data, parse deterministically | Survive its own race conditions without the Windows hardening (done, `ea88a1f`) |
| Contracts G0/Ω14.0 (vocabulary, provider facade) | Give every track one vocabulary | Enforce DB-track conformance (no mechanism) |
| Control plane v0 (D-309–312) | Mint governed agent/behavior/decision *records* | Run an agent: identities never act, principals never call |

The pattern: **vocabulary leads implementation by roughly one wave.** That is deliberate and good — but the bill is coming due. The system now has names for at least four things with no runtime behind them (realization lifecycle, agent execution, MENU_PATH channels, `verified` behavior state). Next work should be *closing loops*, not *naming loops*.

---

## 2. Load-bearing insights (do not regress these)

1. **The rename is the boundary.** Every durability claim (recipe pins, CAS blobs, changelog) reduces to atomic rename. The Windows EPERM episode proved the boundary was load-bearing *and* fragile at the edges — the retry fix preserves atomicity while tolerating the OS. Any future storage work must keep write-tmp→rename and never "optimize" it into direct writes.
2. **Ledgers prevent re-fires, never first fires.** The director tick semantics (refused = ledgered, unmatched-with-zero-rules = retried, disabled = ledgered suppression) are now pinned by tests on all three branches. This is the subtlest invariant in the codebase. Any touch to `tick.ts` step 7 must re-run director + web suites, not just director.
3. **Ports-only is real.** The B2 law survived contact with a large generated batch that tried to violate it three ways (cross-plugin import, fictional `ctx.invoke`, host-token minting). It held because tests boot real compartments. Keep it that way: any proposal containing a relative import across plugin dirs is rejected at review, no matter how pure the target module is. Vendoring (with provenance headers) is the sanctioned pattern.
4. **Grants are opt-in per composition.** Adding a contract to a manifest never breaks existing compositions — but forgetting to grant it in the composition under test fails closed at routing. The `law.json` + `law.forbidden.set@1` incident is the template: new op → grant it where it's exercised.
5. **The gate is the spec.** 516 tests are not coverage theater; each recent bug (fixturesDir, `\t` path, disjoint check, tick race) was caught by a *specific* pinned assertion. Budgets were widened only where the falsifier measured the machine instead of the product (p99 stalls), never where it measured the product.

---

## 3. Gaps, ordered by architectural significance

### G1. The status lifecycle has readers but no writers (most important) — SPIKE LANDED, loop half-closed
As written, `RealizationStatus` transitions were specified (`vocabulary.ts`, `provider.ts`
facade, G0 ownership table) and written nowhere. The D-319 spike (RATIFIED) closed the
happy path: ns `providers` records exist, verification writes PROMOTED / REQUIRES_REDISCOVERY /
TESTING, the registry reads them for real (end-to-end fixture test green). REMAINDER (still
open): healing writes DEGRADED / TESTING-probation (A4) — the status vocabulary is whole
on the promotion side, unwritten on the healing side. D-307 conformance stays vacuous until
at least one live drift writes DEGRADED.

Verified concrete shape of the gap **[review-adopted]**: the three providers ops are self-labeled
placeholders in source (`{ entries: [] }`, "would read from vault"); `deriveRegistry()` is fully
typed with **zero callers tree-wide**; `vivim.providers` ships in **no** composition and has **no**
tests. Correction to an earlier draft of this doc: `discovery.verification` *is* wired in
`discovery-mind.json` (infer→map→verify already share one pipeline composition) — so the
composition question for Phase A is narrower than "where does verification live": it is where
`vivim.providers` joins and where realization writes get routed (decision: extend
`discovery-mind.json`, not a new file — see Phase A).

### G2. Agents are data, not actors
Control plane v0 mints identities, but nothing ever *acts as* an agent principal: `meta.from` is always a plugin id or root, and `forbiddenActions` therefore has enforcement machinery with no real traffic (its only exercise is tests). Two coherent futures: (a) an **agent runtime** — a compartment or surface that calls with `principal: agent:<id>`, making the whole v0 apparatus live; (b) an explicit decision that agents stay descriptive records and enforcement moves to composition grants. The worst outcome is the current middle: machinery that looks alive. Recommend (a), scoped to a single `agent.exec`-style loop with the existing consent/fired-ledger discipline — but it is a real wave, not a patch.

Refinement **[review-adopted]**: split the first slice to B1a — one op replaying a single
already-PROMOTED realization against a fixture under `principal: agent:<id>`, existing grant
grammar only, result ledgered like a director tick. Note what B1a actually proves: *not*
principal traversal (a non-plugin principal already traverses `law.check@1` end to end —
the D-310 integration test does exactly this with `agent:forbidden-probe`), but
**realization→execution wiring**: a PROMOTED record causing a gated op call under an agent
principal. Frame B1a's test around the chain, not the traversal.

### G3. The spawn-authority grammar seam is v0-grade
`port:<op>@<v>` grants vs `path:constraint` scopes are different namespaces joined by a mapping function (`portCapToScope`). It is correct, tested, and least-privilege — but it is also where a future misunderstanding will breed (e.g., someone assuming a port grant covers a scope it doesn't). If a third grammar ever appears, stop and unify rather than adding a third mapping. Watch item, not action item.

### G4. Variation channels are mostly defaults
Every derived Variation without explicit evidence is `UI_ELEMENT`/`DRAFT` by documented default. That honesty is correct, but it means Upgrade-1's headline case (keyboard + toolbar co-PROMOTED) has no producer yet: inference emits no channel evidence, perception's ontology beyond menu is deferred by design. The loop closes when a fixture exercises a real multi-channel capture — propose one fixture per channel before any channel-inference code.

### G5. Ω14.3 (CDP substrate) arrives into a system that is ready for it
D-300 (Bun-native WS+fetch) and D-301 (attach-only) fit the current shape well: observation already consumes fixtures *as if* they were CDP snapshots (`page.json` ≈ snapshot, `events.jsonl` ≈ trace). Recommendation for the receiving review: the first CDP provider should produce byte-identical shapes to the fixtures (a live capture must be substitutable for `webmail-inbox/page.json` with zero classifier changes). If it can't, the fixture format — not the provider — gets fixed first. Prerequisite **[review-adopted]**: write down what "byte-identical" means *before* the substitution test is coded — identical after canonicalization, or identical modulo a documented allowlist of volatile fields (timestamps, session ids, DOM ordering)? A live snapshot will differ from a static fixture for reasons unrelated to classifier correctness; debugging the test's definition of success instead of the provider is the failure mode to avoid.

### G6. Namespace sprawl needs a registry before it becomes folklore
Vault namespaces in live use: `email`, `automation`, `nlcl`, `discovery`, `probe`, `agent`, `behavior`, `decision`, (`providers` reserved, `variation` implicit via discovery). Ownership, retention, and compaction interaction per namespace currently live in scattered comments. One doc (`docs/VAULT-NAMESPACES.md`) with a row per namespace — owner plugin, object shapes, who writes, retention/compaction rules — prevents the next wave from guessing.

### G7. `Outcome<T>` is adopted only where it was born
Old ops still throw-into-DEGRADED for expected negatives. Do NOT retrofit wholesale (churn without need); DO require `Outcome<T>` for every new op and convert old ones opportunistically when their files are touched for other reasons. Record this as standing policy so the two styles don't look like an accident.

### G8. The forbidden overlay is memory-only
Restart drops it; re-registration depends on spawns re-occurring. Acceptable for v0 (documented in code), but the failure mode is *silent permissiveness*, which is the wrong direction to fail. Two mitigations in order: (1) log overlay cardinality at law boot so emptiness is visible; (2) when an agent composition boots, re-register from vault agent records (a boot-time reconciliation pass — small, deterministic). Durable policy remains recipe amendment.

### G9. Composition sprawl (13 files)
`law, vault, spine, email, discovery, discovery-mind, console, demo, agent, healing, llm, notes, run` — plus per-test inline specs (good). Risk: two compositions quietly diverging on the same plugin's grants (already happened once: `law.json` vs others on the forbidden op). Mitigation **[review-adopted, pulled forward to warm-up]**: a conformance check over all shipped compositions (each granted contract/port declared by the resolving manifest; cross-composition grant drift flagged with an allowlist for intentional scope differences), wired into the gate as a read-only stage. Zero blast radius, no dependencies — land it before Phase A so every composition touched later is born inside the net.

### G10. Test runtime and the flake budget
516 tests, ~90–150s per full run, green on Windows *with discipline* (explicit spawn budgets, platform-scoped p99). The budget is spent, not saved: the next timing-sensitive test must either be hermetic (fake ports, like mapping/variations) or carry its own ceiling. Prefer hermetic for all pure logic; reserve real boots for ceremony tests. Also: full-suite wall time will cross 5 minutes within two more waves — plan sharding (`--max-concurrency` discipline or file-group lanes) before it becomes a tax on every change.

### G11. Host headroom: 834/1000
166 LOC of headroom. The host hasn't needed to change in four rounds — keep it that way. If a proposal requires host changes, treat that as a design smell to be argued down, per the standing non-goal. The one exception to pre-authorize: nothing. No exceptions.

### G12. DB-track conformance has no mechanism
D-307 declares Omega's vocabulary the reference, but nothing checks conformance — not even a schema test importing the DB track's shapes (which live elsewhere). Options in increasing strength: (a) a `docs/DB-TRACK-CONFORMANCE.md` checklist, human-attested per wave; (b) a contract test that fixtures the DB track's status enum and asserts equality with ours; (c) a shared package. Recommend (b) as soon as the DB track publishes its first status write — which loops back to G1: our side must have writers first, or conformance is vacuous both ways.

---

## 4. Proposed sequencing

```
Warm-up (no dependencies — ships first, each green-gated alone)
  W1. Composition-conformance gate stage (G9): read-only check over all
      shipped compositions; new stage in omega:gate before tests.
  W2. Batch base-sha mechanization (§6.1): batches declare `assumes base`,
      checked mechanically. D-register linkage stays a norm (not mechanized —
      no well-defined mapping exists yet).
      **[differs: review proposed mechanizing both; the D-status linkage has no
      well-defined status.json mapping and would false-positive on docs-only
      commits — base-sha only]**

Phase A — close the realization loop (G1) — SPIKE LANDED (D-319 RATIFIED); A4 healing writes remain
  A0. Composition placement: DECIDED — extend discovery-mind.json (it already
      hosts infer→map→verify; a 14th file buys separation at the cost of a new
      drift surface). Revisit only if the W1 net exposes a collision.
      **[differs: review recommended A0b on the premise verification lives
      nowhere; source shows it wired at discovery-mind.json:44-51, which
      reverses the tradeoff]**
      Landed: entry added, boot canary green.
  A1–A3, A5-minimal, A6: landed (verify writes, registry reads, namespaces doc).
  A4 (healing DEGRADED/TESTING writes): specified, unwritten — next receiver of this loop.
  ( Landed detail lives in D-319's record; the pre-landing step list is not repeated here. )

Phase B — agent runtime v1 (G2)
  B1a. Single-op fixture replay under agent:<id> principal (existing grant
       grammar only); proves realization→execution wiring with ledgering.
  B1b. Wider acting loop (scheduling, retries, more op types) — only after B1a green.
  B2/B3. Boot-time forbidden re-registration; quarantine semantics — the latter
       is a HARD BLOCKER on B1a shipping past fixture-replay (not a sub-item):
       decide finish-task vs halt before scope widens.
        ↓ (independent of B, do in parallel)
Phase C — receive Ω14.3 / CDP (G5)
  C0. Define "byte-identical" (canonicalization vs volatile-field allowlist) first.
  C1. Substitution test: live capture for webmail-inbox fixture bytes.
  C2. Attach-only provider behind ProviderClass BROWSER_MEDIATED.
  C3. First real MENU_PATH variation from a live capture (closes one Upgrade-1 channel).
        ↓
Phase D — structural hygiene (G7, G10, G12; G9 already delivered as W1)
  D1. (delivered as W1)
  D2. DB-track conformance: human-attested checklist now; fixture test only when
      Phase A writers exist AND the other side publishes a status enum to diff.
  D3. Test-lane discipline when count crosses ~700 (wall time is machine-dependent).
```

Each phase gates on `omega:gate` + a D-row (PROPOSED → RATIFIED only on green), same as every prior wave.

---

## 5. Non-goals, reaffirmed (the plan was right — hold the line)

- No corpus/ontology/pattern-library layer until agents act (G2 precedes it, not the other way around).
- No fourth `ProviderClass` member until a harness provider exists in this repo (D-306 reservation stands).
- No full 14-kind perception ontology ahead of fixture evidence (D-311 stands; one fixture per kind, always).
- No `host/src` changes (G11; the wall holds).
- No second provenance graph (vault refs + Merkle already cover genealogy).
- No wholesale `Outcome<T>` retrofit (G7 opportunistic policy).

---

## 6. Process recommendations (earned the hard way)

1. **Batches declare their base.** Every upgrade batch arrives stale eventually. Require a header line — `assumes base: <sha>` — so misapplication is mechanically detectable (`git merge-base --is-ancestor`) instead of discovered mid-conflict. Three rounds in a row integrated stale specs by judgment; judgment doesn't scale. Agreed mechanization **[review-adopted]**: a gate/CI check enforcing the declaration (warm-up W2). D-register linkage stays a human norm — no well-defined status.json mapping exists to mechanize it against.
2. **Pre-flight is load-bearing, not ceremonial.** The one round that skipped nothing went green fastest. Keep the 10-check pattern and extend it per §3 of each new plan (exports map, op inventory, rev-type discipline).
3. **Windows is a first-class gate now.** The suite is green here *with* the portability fixes; any batch that hardcodes POSIX paths, `/tmp` semantics, or symlink assumptions will be caught locally before push. The upgrade agent should assume its output runs here, not just on its sandbox.
4. **D-register discipline held** (PROPOSED → RATIFIED on green, never pre-ratified) — keep it. The one deviation to avoid repeating: the round-3 batch arrived with statuses pre-filled RATIFIED; status is earned by the gate, not asserted by the author.
5. **`build/status.json` is evidence, not scratch.** It now records each green gate inline. Keep committing it with wave commits.

---

## 7. Open decisions for the owner

> Tracked as decision records under the Decision Contract (`docs/decisions/README.md`,
> enforced by the gate's `decisions` stage): D-313 agent runtime, D-314 DB conformance,
> D-315 quarantine, D-316 flagship, D-317 wall-time, D-318 placement. The prose below
> is the summary; the records are the contract.

1. **Agent runtime (G2):** registry-only (descriptive) vs acting loop (alternative (a)/(b) above)? B1a is scoped to produce evidence for this fork rather than debate it further — but the fork itself is still yours.
2. **DB-track conformance strength (G12):** recommend human-attested checklist
now, fixture test as soon as the DB side publishes something to diff (our-side
writers landed with D-319 — that precondition is met). Confirm the checklist
is sufficient for this wave.
3. **Quarantine semantics:** RESOLVED POSITION — hard blocker on B1a shipping past fixture-replay (finish-task vs halt must be decided before scope widens, not before B1a is written). Confirm or override.
4. **Composition flagship:** DEFERRED by agreement — W1's net serves either answer; no need to resolve before the safety net ships.
5. **Test wall-time budget:** RESOLVED POSITION — act at ~700 tests, not at a clock reading. Confirm.
6. **Composition placement for Phase A (new):** recommended A0a (extend `discovery-mind.json`, corrected premise above). RATIFIED as D-318 — implemented this wave; reversal remains one moved entry.

---

## 8. Top risks (if you read nothing else)

1. **Another vocabulary-without-writers wave.** The failure mode of this program is now naming-first, runtime-later. G1 must precede any new contract file.
2. **Tick-step-7-class invariants hiding in new code.** The late-rule race took a full debug cycle because the invariant lived in one `if`. New stateful loops (agent runtime, healing probation) need their ledger-equivalent stated *in the design* before code.
3. **Ambient-load flakes returning.** The Windows budgets cover today's box; a slower CI box or a busier laptop reopens them. Hermetic-by-default for pure logic is the durable fix.
4. **Stale-baseline integration.** Without base-declared batches (§6.1), a future round will mis-merge silently. Mitigation agreed (warm-up W2); until it lands, process, not code.
5. **Host LOC creep.** 166 lines of headroom with four rounds of "no host changes needed" behind us — the discipline is working; the risk is one plausible-sounding exception.
