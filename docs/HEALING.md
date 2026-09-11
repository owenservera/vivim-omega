# Ω9 — The Healing Loop

One page: how a broken provider heals itself, and why the Ω roadmap closes with it.

**Engine:** `discovery.healing` · op `discovery.heal@1` (READ-class) · composition `compositions/healing.json`
**Evidence:** `plugins/discovery-healing/test/heal.test.ts` (15) + `test/integration.test.ts` (2, incl. GATE-Ω9 end-to-end) + `tooling/builder/test/builder.test.ts` (9)

Healing is a **plugin's contract concern**, not host machinery: an engine plugin that
detects drift, triggers rediscovery, supervises probation, and promotes only through
the verification gate. The only host involvement is the amendment transport — the
Ω0 recipe/pin machinery every composition already uses.

## The loop

```
        ┌──────────────────────────────────────────────────────────────┐
        │  promoted contract (vault ns "discovery")                    │
        │  selector "#compose-btn" · actionType "click" · riskHint "dom"│
        └──────────────┬───────────────────────────────────────────────┘
                       │ vs fresh observation (re-observed behavior)
  1 · DRIFT ───────────┘
        drift score = worst normalized axis divergence:
          selector (graded, bigram-dice) · actionType (categorical)
          · riskHint (categorical) · outcomeRates (normalized L1)
        score < policy.driftThreshold → {action: "none"} — nothing to heal
  2 · REDISCOVERY
        a DRAFT SurfaceContract replacement, re-run against fresh captures:
        no evidence cited → {action: "reject"} (a guess is not a rediscovery)
        op mismatch / selector ≠ observation → reject (rediscovery cites the
        re-observed behavior, not memory)
  3 · PROBATION
        postcondition probes {candidateId, preState, postState, passed} run in
        shadow against the candidate; probes naming a different candidate are
        excluded, never counted against the score
  4 · PROMOTION (the verification gate)
        score ≥ policy.promotionThreshold AND total probes ≥ policy.probationProbes
        → {action: "promote", replacement, evidenceChain}   (DRAFT flips PROMOTED)
        else → {action: "hold-in-probation", gap report}     (never install below gate)
  5 · ATOMIC INSTALL (amendment transport — Ω0 host machinery)
        compileComposition(fixed source, SAME vault) → pinRecipe (write-tmp →
        rename, B4) → bootWithRecovery → the healed provider serves the new
        behavior; the vault (and the heal event) survive the swap
```

Every healing event — `none`, `reject`, `hold-in-probation`, `promote` — is journaled
to the user's vault (ns `discovery`, id `heal:<ts>`) with the full evidence chain,
best-effort: a vault failure is reported (`journal.appended: false`), never blocks
the decision. Provenance: the event cites the promoted contract's vault address
(`refs`), so the chain reads contract → heal event end-to-end.

The GATE-Ω9 end-to-end (one test, `plugins/discovery-healing/test/integration.test.ts`):
the promoted contract says `#compose-btn`, the fresh observation says the button moved
to `button[data-testid='compose']` — drift 0.6923 ≥ 0.3; a candidate citing fresh
captures + 3/3 probes → `promote` with the 4-link chain journaled (Merkle-verified);
then the amendment transport compiles the FIXED provider source
(`test/fixtures/provider-fixed/`, version 0.1.0 → 0.1.1, content hash changed) into
the same vault, pins, boots via `bootWithRecovery` — and the healed provider clicks
the button at the new selector. Drift → rediscovery → probation → promotion → atomic
install, in one live run over real compartments.

## Policy knobs (POLICY data, amendable)

The policy is a **versioned POLICY contribution** on the engine's manifest —
`discovery.healing-policy@1` — never code constants. `heal@1` reads it from the
manifest the recipe pinned (fail-closed if absent or malformed); the unit suite
proves data-ness by mutating the manifest, not by mocking:

| knob | shipped | meaning |
|---|---|---|
| `driftThreshold` | `0.3` | drift scores at/above this trigger rediscovery |
| `probationProbes` | `3` | minimum probe count a probation report must carry |
| `promotionThreshold` | `0.95` | probe pass-rate score promotion requires |

Amending the policy is an ordinary plugin amendment: manifest change → recipe
re-compile → atomic pin swap → reboot. Same ceremony, no code path.

## Ω0–Ω9 completion cross-check (exit evidence per wave)

| wave | what exists | exit evidence (real test counts) |
|---|---|---|
| Ω0 µhost | boring loader, B1–B4, LOC gate | adversarial suite **13 cases** (attack, fail-closed) + runtime 8 → host **21 tests** |
| Ω1 vivim.law | gate, consent, attenuation, registry, shadow amendment | **21 tests** |
| Ω2 vivim.vault | SQLite WAL+FTS5, CAS, Merkle changelog, verify, compaction, roundtrip | **23 tests** |
| Ω3 vivim.run | bounded pool, priority queue, budgets, crash-loop quarantine | **30 tests** |
| Ω4 sdk + testkit | zod 4 mirror, semantic validators, signing, FakeHost, conformance, seeded fuzz | **87 tests** (sdk 35 + testkit 47 + plugin-notes 5) |
| Ω5 email pack | domain-email pack + provider-email-file over vault + consent | **36 tests** (pack 12 + provider 24) |
| Ω6 surfaces | CLI + MCP (tools from routed ops) + provider-llm simulator | **49 tests** (cli 16 + mcp 11 + llm 22) |
| Ω7 discovery-* | perception/observation engines | built by concurrent agents — see their suites |
| Ω8 discovery-* | inference/mapping/verification engines | built by concurrent agents — see their suites |
| **Ω9 healing + builder** | **this wave: heal loop + amendment install + `omega new-plugin`** | **26 tests** (heal 15 + integration 2 + builder 9) |
| spine integration | full composition (law+vault+run+echo+risky), the loop closes | **7 tests** (tooling/test/spine.test.ts) |

Committed-tree total at Ω6: 274 tests / 23 files, all green; Ω9 adds 26; Ω7/Ω8
suites land with their agents. Existence = a booted composition with passing tests (law 9).

## The ecosystem builder (`omega new-plugin`)

The Ω9 "third parties can build plugins" proof —
`bun run tooling/builder/src/builder.ts new <pluginId> [--dir] [--contract] [--kind]`:

1. **Scaffold** — `plugin.json` (one contribution `<contract>@1`, risk READ on the
   contract kind), `package.json` (name derived, deps shim+contracts, devDeps
   sdk+testkit), `src/index.ts` (a working def whose op echoes),
   `test/scaffold.test.ts` (a real bun test on FakeHost),
   `test/conformance.fixture.ts` (`run(def, fake)` — the TEST contribution).
2. **Validate** — the SDK parse + semantic validators on the generated manifest:
   the same law a hand-written manifest faces, reported honestly (bad ids are
   refused before anything is written).
3. **Conform** — the testkit conformance runner on the scaffolded dir:
   `staged → verified → active` with zero issues.

A new plugin authored from scaffold passes conformance with **zero host changes** —
no new host code, no new contracts, no registry edits. The µhost never learns a
plugin's name; it verifies manifests, routes ops, and checks tokens.
