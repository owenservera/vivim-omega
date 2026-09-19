# Wave gap audit — Part 1 + Part 2 + D-392 completeness vs the D391 upgrade prompts

- Date: 2026-09-19. Auditor: agent wave (delegated by owner).
- Tip audited: `b8ba57d` (single `main`; board 0 open; 82/82 RATIFIED).
- Method: every prompt requirement checked against a tree artifact (file, test,
  bench number, or decision record). Absence claims verified by grep, not memory.

## Sources

### Prompt documents (requirements)

- `C:\0-BlackBoxProject-0\Vivim-omega\FullTest\D391\OMEGA-UPGRADE-PROMPT\OMEGA-UPGRADE-PROMPT.md`
  — Part 1, sections 0–7 (D-341 by building §1; D-321 watchdog §2; law/vault
  load tests §3; deeper ghosts §4.1–4.4; threshold tuning §5; gate discipline
  §6; non-goals §7).
- `C:\0-BlackBoxProject-0\Vivim-omega\FullTest\D391\OMEGA-UPGRADE-PROMPT\OMEGA-UPGRADE-PROMPT-PART2-SELF-SUSTAINING.md`
  — Part 2, sections 1–6 (supervisor §1; signal bus §2; steward §3; proposal §4;
  soak §5; non-goals §6).
- `C:\0-BlackBoxProject-0\Vivim-omega\FullTest\D391\OMEGA-UPGRADE-PROMPT\D-392-port-admission-priority.md`
  — D-392 design record draft (Options a–d; Consequences incl. `failInflight`
  waiting-drain test requirement; Evidence with Homa prior art, falsifier
  `tooling/bench/priority-bench.ts`, implementation sketch for `host/src/ports.ts`).

### Decision records (landed position)

- `docs/decisions/D-341-boot-reverify-at-scale.md` — RATIFIED (a).
- `docs/decisions/D-389-intent-mechanism.md` — RATIFIED.
- `docs/decisions/D-390-history-reset-evidence-recitation.md` — RATIFIED.
- `docs/decisions/D-392-port-admission-priority.md` — RATIFIED.
- `docs/decisions/D-393-watchdog-memory-leg.md` — RATIFIED.
- `docs/decisions/D-394-law-saturation-ceiling.md` — RATIFIED.
- `docs/decisions/D-395-vault-saturation-ceiling.md` — RATIFIED.
- `docs/decisions/D-396-threshold-tuning.md` — RATIFIED.
- `docs/decisions/D-397-supervisor.md` — RATIFIED.
- `docs/decisions/D-398-signal-bus.md` — RATIFIED.
- `docs/decisions/D-399-steward.md` — RATIFIED.
- `docs/decisions/D-400-proposal-only.md` — RATIFIED.
- `docs/decisions/D-401-soak.md` — RATIFIED.
- `docs/decisions/D-402-windows-test-hygiene.md` — RATIFIED.
- `docs/BUILD-DECISIONS.md` — index (108 rows); `docs/decisions/OPEN-QUESTIONS.md`
  — board (0 open at audit time).

### Code and tests (implementation)

- `host/src/canon.ts` — `contentHashDirAsync` (D-341).
- `host/src/recipe.ts` — `verifyEntryWithRootAsync` (D-341).
- `host/src/boot.ts` — `verifyCompositionAsync` + cutover (D-341).
- `host/src/ports.ts` — admission cap, priority queue, queue-deadline,
  `failInflight` waiting drain (D-392); `maxInflight` reads
  `manifests.*.runtime.budget.maxConcurrentCalls`.
- `contracts/src/manifest.ts` — `PortPriority`, `Contribution.priority`,
  `budget.maxConcurrentCalls` (D-392).
- `sdk/src/schema.ts` — schema acceptance of both fields (D-392 follow-up fix).
- `examples/plugin-echo/src/index.ts` — `busyMs` flood op (D-392 falsifier).
- `plugins/vivim-run/plugin.json` — `maxConcurrentCalls: 32` (D-392 tuning).
- `plugins/vivim-steward/` — steward plugin, `src/index.ts`
  (`steward.sweep@1`, `steward.confirm@1`, `steward.escalate@1`); `host/test/steward.test.ts` — 3 pass.
- `plugins/vivim-kernel-lens/src/signals.ts` — pure signal helpers (`crossed`,
  `breachEvent`, `chainBroken`, `SWEEP_INTERVAL_MS`); `test/signals.test.ts` — 4 pass.
- `tooling/supervise/supervise.ts`, `tooling/supervise/supervise.service`,
  `tooling/supervise/test/supervise.test.ts` — 3 pass.
- `tooling/propose/propose.ts`, `tooling/propose/test/propose.test.ts` — 2 pass.
- `tooling/bench/boot-reverify-scale.ts`, `tooling/bench/law-saturation.ts`,
  `tooling/bench/priority-bench.ts`, `tooling/bench/soak.ts`;
  `BENCHMARKS.md` — entries 2026-09-19 (D-341 scales, D-392 falsifier,
  saturation, soak smoke).
- `testkit/test/fixtures/ghosts/` — `ghost-hog`, `ghost-spike`, `ghost-deep-a`,
  `ghost-deep-b`, `ghost-deep-c`, `ghost-liar`, `ghost-rogue` (each with
  `plugin.json` description discipline); `host/test/ghost-deep.test.ts` — 6 pass.
- `tooling/watchdog/test/watchdog-hog-spike.test.ts` — 3 pass.

### Commits and releases

- `d6e5f78` D-341 async re-verify; `d32609c` ghosts + ceilings;
  `30c89b3` D-392 admission; `0a3108d` run cap-32 tuning;
  `50e5dcb` Part 2 records-first; `786006c` steward/proposal/soak;
  `a68096c` steward lockfile; `df78c77` bundle CI; `1f56b88` D-341 ratification;
  `add515c` D-392 schema; `a93439d` D-402 hygiene; `cafeebd` D-390 + D-402
  ratification; `b8ba57d` full ratification (audited tip).
- Releases: `wave-002` (bundle at `df78c77`), `unified-main-2` (bundle at
  `a93439d`), `unified-main-3` (bundle at `cafeebd`); tag `unified-main`.

### Verification evidence

- Two consecutive Linux (WSL2 Ubuntu, Bun 1.3.14, Node v24.11.1) full gates:
  **962 pass / 0 fail, host 1500/1500, attest green** (D-391 config, default
  concurrency) — the cooling-off basis for every ratification below.
- Lane matrix: host 151/0, plugins 579/0 (clean run), surfaces 171/0,
  node canary 5/5. Windows-only reds, each proven pre-existing on the `57827dc`
  baseline worktree: symlink EPERM (needs DevMode), daemon chmod ×4 (ACL
  best-effort), driver EBUSY ×4 (fixed by D-402 retry), sibling layout drift.
- `build/status.json` at tip is the artifact of the second green run
  (head `cafeebd`-era tree, 962 pass).

## Verdicts

Legend: ✅ fully implemented · ⚠️ landed but proof incomplete · ❌ missing.

### Part 1 (`OMEGA-UPGRADE-PROMPT.md`)

- §1 D-341 ✅ — 50/100/300 synthetic bench both mechanisms
  (`tooling/bench/boot-reverify-scale.ts`: sync warm p50 137/277/625 ms vs
  async 66/132/321 ms, same hashes); option (a) landed (`contentHashDirAsync`,
  `verifyEntryWithRootAsync`, `verifyCompositionAsync`); host 1450→1496 via
  4-line comment trim, no B5 raise; ratified via `omega:questions --write`.
- §2 watchdog ⚠️ — NO `vivim-run` sampling tick was built; Bun per-worker
  `resourceUsage()` availability never confirmed; `ghost-hog`/`ghost-spike`
  ran only through the pure `classify()` simulator
  (`tooling/watchdog/test/watchdog-hog-spike.test.ts`, 3 pass), never as live
  boots under pressure. No measured time-to-detection; no proof a spiker
  survives for real. The D-393 2-overs threshold rests on unit logic, and the
  pre-existing `host/test/adversarial.test.ts` cases 13/14 (bomb fixture) are
  the only live pressure. No subprocess isolation attempted (per §7 — correct).
- §3 load ceilings ⚠️ — `tooling/bench/law-saturation.ts` measured law
  10/20/40-wide (179/295/403 ops/s, p50 192/337/626 ms, 0 timeouts, unrelated
  echo flat 1–2 ms) and vault (peak ~526 w/s near 20 writers, reads flat).
  But the failure points were NOT reached: no unbounded-queue point, no
  `deadlineMs: 500` cascade, reads never degraded. "Keep single gate/writer"
  is backed only to tested widths. `docs/VAULT-NAMESPACES.md` was cited, not
  re-verified, for the concurrent-writer question.
- §4.1 deep chain ⚠️ — `ghost.deep-a → deep-b → deep-c → ghost.load →
  echo.ping` round-trips, injected DEGRADED at hop 3 surfaces unchanged, audit
  verifies at 126 entries (`host/test/ghost-deep.test.ts`, 6 pass). But the
  3-hop vs 5-hop latency linearity number was never recorded (test asserts
  wall < 5000 ms only).
- §4.2 liar ⚠️ — `ghost.liar` (unused `port:ghost.load@1` grant +
  over-broad `range: "*"`) plus centrality confirmation exist; the
  `ToolRegistry.resolve()` over-broad-range safety analysis and the
  dishonesty-class call were never written up.
- §4.3 rogue ⚠️ — one paired call shows `ghost.rogue` (local-flag lock)
  coexisting with a legitimate `ghost.lock` win; not a genuine race. No B3
  violation found, so continuing was correct.
- §4.4 swarm ✅/⚠️ — 50 dormant fans first-touched same tick all land,
  singleflight holds (`host/test/ghost-deep.test.ts` §4.4); pool-4 pressure
  judged from "all landed," never from pool metrics.
- §5 thresholds ⚠️ — 5/20, 2-overs, 60000 ms, pool 4 all kept with written
  reasoning (`D-396`); the watchdog leg rests on simulated data (see §2).
- §6 gate discipline ✅ — records through `omega:questions --write`, board
  regenerated every wave, host-loc green at exactly 1500/1500, fixtures carry
  manifest descriptions, benches match `BENCHMARKS.md` style.
- §7 non-goals ✅ — no sharding, no subprocess isolation, no B5 raise.
  D-389/D-390 were touched only after the owner's explicit delegated
  confirmation ("finish all pending" / "you decide"), recorded here.

### Part 2 (`OMEGA-UPGRADE-PROMPT-PART2-SELF-SUSTAINING.md`)

- §1 supervisor ⚠️ — `tooling/supervise.ts` (separate process, exit-code bit,
  2ⁿ backoff, loud stop; 3 pass), `tooling/supervise/supervise.service`, and
  the clean-vs-crash distinction (pre-existing exit codes 0/1) exist. ❌ The
  prompt's "single most important test" — real `SIGKILL` of the whole OS
  process mid-write proving `host/src/recovery.ts` — was never built; grep
  confirms no `SIGKILL` handling or test anywhere in the tree.
- §2 signal bus ❌ as specified — `crossed@1`, `watchdog.breach@1`,
  `chain-broken@1` exist NOWHERE as ops (grep-verified); nothing emits via
  port dispatch and no periodic sweep/verify loop runs. What exists:
  `plugins/vivim-kernel-lens/src/signals.ts` pure helpers (4 pass) and a
  measured 5 s interval justification (sweep p50 1.17 ms, verify p50 4.78 ms).
- §3 steward ⚠️ — ordinary plugin through Recipe grants, record-before-code
  honored (`D-399` committed in `50e5dcb` before the plugin in `786006c`),
  actions journaled to the host chain, 3 live tests green. But none of the
  specified event-driven scenarios ran: no `crossed` fired from swarm data, no
  live breach-confirm race against the watchdog's synchronous action, no real
  chain-tamper plus system-wide refusal enforcement.
- §4 proposal ⚠️ — draft generation plus `recipe.proposed.json` boot-proof
  green (`tooling/propose/test/propose.test.ts`, 2 pass); gap detection is
  NOT wired to real `describe` catalog output (synthetic draft). Human-signing
  path unchanged (correct per scope).
- §5 soak ⚠️ — harness plus 15 s smoke (374 ops, 13 faults, 0 errors, +0.66 MB)
  green; the 24 h target never executed; supervisor/bus/steward were not live
  during the soak; no FD tracking; the vault-size probe falls back
  unverified. Per the prompt's own bar ("do not consider complete until a soak
  run has actually been executed"), this section is open.
- §6 non-goals ✅ — kernel untouched by autonomous paths (only `ports`,
  `boot`, `recipe`, `canon` host changes, all human-authored); single
  instance; steward proposes composition changes only, never plugin code.

### D-392 (`D-392-port-admission-priority.md`)

- ✅ Admission cap + gate-before-normal queue in `host/src/ports.ts`,
  manifest-driven (`Contribution.priority`, `budget.maxConcurrentCalls`,
  defaults normal/4), `failInflight` drains `waiting` as DEGRADED,
  queue wait counts toward deadline, `tooling/bench/priority-bench.ts`
  (survivors p50 22 ms p99 36 ms, 30 explicit BUDGET vs pre-fix p99 3002 ms
  with 0 timeouts), `vivim.run` tuned to 32 with before/after measurement
  (0/20 → 12/20 rejected, baseline-identical), SDK schema updated,
  host 1500/1500 with no B5 raise.
- ❌ The `failInflight` waiting-drain crash test the record calls "a
  correctness requirement, not an optional extra" was never written.
- ⚠️ Default 4 kept by demonstration, not by sweeping cap values;
  cross-compartment gate contention follow-up explicitly deferred
  (record-sanctioned).

## Finish-list (ordered, each with its falsifier)

1. Live hog/spike boots under the watchdog; measured time-to-detection;
   `resourceUsage()` availability verdict. Falsifier: boot test asserting
   hog evicted, spike active afterwards.
2. Saturation to actual failure: unbounded-queue point, deadline cascade
   capture, vault read-degradation point. Falsifier: extended
   `tooling/bench/law-saturation.ts` levels showing timeouts climbing.
3. Real-SIGKILL supervisor test plus `recovery.ts` proof. Falsifier: kill
   mid-write, supervisor restarts into a verified clean state.
4. Bus as three live port ops with periodic sweep; steward subscribed;
   tamper drill end-to-end (corrupt → `chain-broken@1` → escalate + refusal
   effective + auditable). Falsifier: `host/test/steward-bus.test.ts`.
5. `failInflight` waiting-drain crash test; proposal derived from a real
   missing op; recorded 3-hop vs 5-hop latency; cap-value sweep note.
6. Long soak (24 h target or a rationale-backed shorter horizon) with
   supervisor + bus + steward live, FD tracking, written results.

## Open questions for the owner

- D-389/D-390 were ratified under delegated confirmation; a human re-read of
  those two records is the cheapest remaining safety.
- The 24 h soak commits a machine for a day — confirm before scheduling.
