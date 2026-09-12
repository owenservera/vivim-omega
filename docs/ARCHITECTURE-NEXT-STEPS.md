# VIVIM-Ω — Architecture Notes: Where We Are, What's Next

**Author posture:** principal architect, writing for the owner and the upgrade agent.
**Baseline:** `omega` @ `9be5877` — gate green (`bun test` 516/516, `omega:gate` ok:true), host 834/1000 LOC, D-312 ratified.
**Scope of this doc:** planning reference only. It ratifies nothing and builds nothing.

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

### G1. The status lifecycle has readers but no writers (most important)
`RealizationStatus` transitions (DRAFT→TESTING→PROMOTED→…) are specified in two places (`vocabulary.ts`, `provider.ts` facade, plus the G0 doc's ownership table) and *written* in zero places. No vault namespace holds realizations; `vivim.providers` defaults everything to `DRAFT` over an empty set; `discovery.verify@1` evaluates probes but records no status. **A vocabulary with no writers is a wish.** Closing this loop is the single highest-value next wave: define ns `providers` realization objects, have verification write PROMOTED/REQUIRES_REDISCOVERY, healing write DEGRADED/TESTING, and make the providers registry read them for real. Until then, D-307 conformance is conformance to a dictionary.

### G2. Agents are data, not actors
Control plane v0 mints identities, but nothing ever *acts as* an agent principal: `meta.from` is always a plugin id or root, and `forbiddenActions` therefore has enforcement machinery with no real traffic (its only exercise is tests). Two coherent futures: (a) an **agent runtime** — a compartment or surface that calls with `principal: agent:<id>`, making the whole v0 apparatus live; (b) an explicit decision that agents stay descriptive records and enforcement moves to composition grants. The worst outcome is the current middle: machinery that looks alive. Recommend (a), scoped to a single `agent.exec`-style loop with the existing consent/fired-ledger discipline — but it is a real wave, not a patch.

### G3. The spawn-authority grammar seam is v0-grade
`port:<op>@<v>` grants vs `path:constraint` scopes are different namespaces joined by a mapping function (`portCapToScope`). It is correct, tested, and least-privilege — but it is also where a future misunderstanding will breed (e.g., someone assuming a port grant covers a scope it doesn't). If a third grammar ever appears, stop and unify rather than adding a third mapping. Watch item, not action item.

### G4. Variation channels are mostly defaults
Every derived Variation without explicit evidence is `UI_ELEMENT`/`DRAFT` by documented default. That honesty is correct, but it means Upgrade-1's headline case (keyboard + toolbar co-PROMOTED) has no producer yet: inference emits no channel evidence, perception's ontology beyond menu is deferred by design. The loop closes when a fixture exercises a real multi-channel capture — propose one fixture per channel before any channel-inference code.

### G5. Ω14.3 (CDP substrate) arrives into a system that is ready for it
D-300 (Bun-native WS+fetch) and D-301 (attach-only) fit the current shape well: observation already consumes fixtures *as if* they were CDP snapshots (`page.json` ≈ snapshot, `events.jsonl` ≈ trace). Recommendation for the receiving review: the first CDP provider should produce byte-identical shapes to the fixtures (a live capture must be substitutable for `webmail-inbox/page.json` with zero classifier changes). If it can't, the fixture format — not the provider — gets fixed first.

### G6. Namespace sprawl needs a registry before it becomes folklore
Vault namespaces in live use: `email`, `automation`, `nlcl`, `discovery`, `probe`, `agent`, `behavior`, `decision`, (`providers` reserved, `variation` implicit via discovery). Ownership, retention, and compaction interaction per namespace currently live in scattered comments. One doc (`docs/VAULT-NAMESPACES.md`) with a row per namespace — owner plugin, object shapes, who writes, retention/compaction rules — prevents the next wave from guessing.

### G7. `Outcome<T>` is adopted only where it was born
Old ops still throw-into-DEGRADED for expected negatives. Do NOT retrofit wholesale (churn without need); DO require `Outcome<T>` for every new op and convert old ones opportunistically when their files are touched for other reasons. Record this as standing policy so the two styles don't look like an accident.

### G8. The forbidden overlay is memory-only
Restart drops it; re-registration depends on spawns re-occurring. Acceptable for v0 (documented in code), but the failure mode is *silent permissiveness*, which is the wrong direction to fail. Two mitigations in order: (1) log overlay cardinality at law boot so emptiness is visible; (2) when an agent composition boots, re-register from vault agent records (a boot-time reconciliation pass — small, deterministic). Durable policy remains recipe amendment.

### G9. Composition sprawl (13 files)
`law, vault, spine, email, discovery, discovery-mind, console, demo, agent, healing, llm, notes, run` — plus per-test inline specs (good). Risk: two compositions quietly diverging on the same plugin's grants (already happened once: `law.json` vs others on the forbidden op). Mitigation: a conformance test that loads every shipped composition and asserts each granted contract is declared and each entry's source resolves. Cheap, high-value, long overdue.

### G10. Test runtime and the flake budget
516 tests, ~90–150s per full run, green on Windows *with discipline* (explicit spawn budgets, platform-scoped p99). The budget is spent, not saved: the next timing-sensitive test must either be hermetic (fake ports, like mapping/variations) or carry its own ceiling. Prefer hermetic for all pure logic; reserve real boots for ceremony tests. Also: full-suite wall time will cross 5 minutes within two more waves — plan sharding (`--max-concurrency` discipline or file-group lanes) before it becomes a tax on every change.

### G11. Host headroom: 834/1000
166 LOC of headroom. The host hasn't needed to change in four rounds — keep it that way. If a proposal requires host changes, treat that as a design smell to be argued down, per the standing non-goal. The one exception to pre-authorize: nothing. No exceptions.

### G12. DB-track conformance has no mechanism
D-307 declares Omega's vocabulary the reference, but nothing checks conformance — not even a schema test importing the DB track's shapes (which live elsewhere). Options in increasing strength: (a) a `docs/DB-TRACK-CONFORMANCE.md` checklist, human-attested per wave; (b) a contract test that fixtures the DB track's status enum and asserts equality with ours; (c) a shared package. Recommend (b) as soon as the DB track publishes its first status write — which loops back to G1: our side must have writers first, or conformance is vacuous both ways.

---

## 4. Proposed sequencing

```
Phase A — close the realization loop (G1 + G6)
  A1. ns `providers` realization objects (shape in registry.ts already exists — persist it)
  A2. verification writes PROMOTED / REQUIRES_REDISCOVERY (proof-gated, existing probes)
  A3. healing writes DEGRADED / TESTING(probation) on drift
  A4. providers registry reads vault (replace the empty-stub derivation)
  A5. docs/VAULT-NAMESPACES.md (do it here while namespaces are being touched)
        ↓
Phase B — agent runtime v1 (G2 + G8)
  B1. Single acting loop presenting agent principals (reuses director tick discipline)
  B2. Boot-time forbidden re-registration from vault agent records
  B3. Live-agent-under-quarantine rule (the open question from two assessments ago — decide: finish-task vs halt)
        ↓ (independent of B, do in parallel)
Phase C — receive Ω14.3 / CDP (G5)
  C1. Byte-identical live captures vs fixtures (substitution test FIRST)
  C2. attach-only provider behind ProviderClass BROWSER_MEDIATED
  C3. First real MENU_PATH variation from a live capture (closes G4's loop for one channel)
        ↓
Phase D — structural hygiene (G7, G9, G10, G12)
  D1. Composition conformance test (all shipped compositions)
  D2. DB-track conformance fixture test (needs G1 done first)
  D3. Test-lane discipline before wall time crosses 5 min
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

1. **Batches declare their base.** Every upgrade batch arrives stale eventually. Require a header line — `assumes base: <sha>` — so misapplication is mechanically detectable (`git merge-base --is-ancestor`) instead of discovered mid-conflict. Three rounds in a row integrated stale specs by judgment; judgment doesn't scale.
2. **Pre-flight is load-bearing, not ceremonial.** The one round that skipped nothing went green fastest. Keep the 10-check pattern and extend it per §3 of each new plan (exports map, op inventory, rev-type discipline).
3. **Windows is a first-class gate now.** The suite is green here *with* the portability fixes; any batch that hardcodes POSIX paths, `/tmp` semantics, or symlink assumptions will be caught locally before push. The upgrade agent should assume its output runs here, not just on its sandbox.
4. **D-register discipline held** (PROPOSED → RATIFIED on green, never pre-ratified) — keep it. The one deviation to avoid repeating: the round-3 batch arrived with statuses pre-filled RATIFIED; status is earned by the gate, not asserted by the author.
5. **`build/status.json` is evidence, not scratch.** It now records each green gate inline. Keep committing it with wave commits.

---

## 7. Open decisions for the owner

1. **Agent runtime (G2):** registry-only (descriptive) vs acting loop (alternative (a)/(b) above)? This is the largest fork in the doc — everything in Phase B depends on it.
2. **DB-track conformance strength (G12):** checklist, fixture test, or shared package — and who owns the DB side of the handshake?
3. **Quarantine semantics for live agents:** when a behavior contract is quarantined mid-flight, do running agents finish, halt, or migrate? (Carried forward — still unanswered after two assessments.)
4. **Composition flagship:** is `console.json` the product surface and the rest fixtures-of-convenience, or do we support N first-class compositions long-term? (Determines how much D1 conformance machinery is worth.)
5. **Test wall-time budget:** at what runtime do we shard lanes — 5 minutes, or accept slower gates as the suite grows past ~700 tests?

---

## 8. Top risks (if you read nothing else)

1. **Another vocabulary-without-writers wave.** The failure mode of this program is now naming-first, runtime-later. G1 must precede any new contract file.
2. **Tick-step-7-class invariants hiding in new code.** The late-rule race took a full debug cycle because the invariant lived in one `if`. New stateful loops (agent runtime, healing probation) need their ledger-equivalent stated *in the design* before code.
3. **Ambient-load flakes returning.** The Windows budgets cover today's box; a slower CI box or a busier laptop reopens them. Hermetic-by-default for pure logic is the durable fix.
4. **Stale-baseline integration.** Without base-declared batches (§6.1), a future round will mis-merge silently. Process, not code.
5. **Host LOC creep.** 166 lines of headroom with four rounds of "no host changes needed" behind us — the discipline is working; the risk is one plausible-sounding exception.
