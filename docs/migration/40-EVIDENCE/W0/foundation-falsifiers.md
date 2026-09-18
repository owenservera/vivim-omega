# Foundation falsifier evidence — D-373 + D-374 (W0-10 landing, 2026-09-16)

Command: `bun run omega:gate` → `{"ok": true, "failed": 0, "hostLoc": 999, "tests": {"pass": 776, "fail": 0}}` (full JSON in `foundation-gate.json`, same folder). Node canary: 5/5. Bench re-run recorded in `foundation-bench-delta.md`.

## D-373 — driver conformance parity (falsifier: plugins/vivim-vault/test/driver-conformance.test.ts)

- Suite: 4/4 green (`bun test plugins/vivim-vault/test/driver-conformance.test.ts`).
- Workload (identical, deterministic): append×5 across 2 ns with refs+meta → CAS reads (latest + rev) → Merkle chain re-derivation (entryHash formula, genesis → head) → FTS single/multi-hit search → queryObjects scan → verify() walk → roundtrip() copy+head-equality → compact(keep=1) → refs-honored survivor check.
- **Cross-runtime byte-identity PROVEN**: `node tooling/ci/driver-parity.mjs` inside the suite — bun:sqlite digest (under Bun 1.3.14) === node:sqlite digest (under Node 24, FTS5 bundled build). Digest = sha256 over canonical JSON of cids/revs/reads/chain/entryHashes/search/query/compaction survivors/verify/roundtrip (ints + strings only; bm25 rank floats deliberately excluded as build-dependent, multi-hit ordering normalized by sort).
- Invariants asserted per run: 5 distinct cids · chainCount 5 · verify ok + head match · roundtrip ok + head match · cited ref survives compaction · rev allocation 1..3.
- The D-361 "Node build swaps one module" promise is now a real file pair (`db.ts` / `db.node.ts`) proven by this suite — not a comment.

## D-374 — polyglot process tier (falsifier: plugins/vivim-run/test/process-broker.test.ts)

- Suite: 9/9 green on REAL child processes (no mocks):
  1. python3 shim (Python 3.12.14) answers `echo.say` → `{said, tier:"process", runtime:"python …"}` (31ms).
  2. node shim twin answers identically — Bun host ↔ Node child is a cross-runtime boundary (33ms).
  3. unknown op → shim REFUSES end-to-end (27ms).
  4. malformed-IPC flood → bounded BUDGET at MALFORMED_LIMIT=5 frames, wall <10s (measured 49ms), never a hang.
  5. deadline honored — slow child killed at 500ms deadline, call settles BUDGET (measured 502ms wall).
  6. unknown pool → REFUSED broker-side (pools live in signed config only).
  7. op allowlist → undeclared op REFUSED broker-side.
  8. config validation fail-closed (id grammar / cmd / stdio / poolSize / array shape).
  9. shutdownAll — children actually exit; post-shutdown call DEGRADED (no orphans).
- Host LOC: `git diff --stat -- host/src` EMPTY (`foundation-host-diff.txt`) — the broker lives in vivim-run's compartment; platformSpawn is the only new OS-aware code, inside the D-372 seam. 999/1100 unchanged.
- LAW_POLICY_V1 1.4.0: exact row `run.process.call@1` → MUTATION (journaled); parity net green through the compositions stage.
- Composition: `run.json` EXTENDED (grant + config.processPools), 16-spec freeze intact (D-370). Shim hardening note: the Python shim uses a synchronous line loop on purpose — flush-after-write IS the awaited drain, and no event loop means no Windows Proactor/selector hazard (DRAFT-002 §5's intent, simpler mechanism; malformed counter + self-bounding exit backed by the broker's BUDGET trip).

## Bench (foundation-bench-delta.md, same folder)

- omega:bench re-run at the landing tree: boot/RTT/spawn walls unchanged within noise; driver-conformance workload-shape timing: full parity workload (8 spine stages) ≈ 5–6ms on bun:sqlite (in-suite measurement, machine-dependent by design — an honest signal, not an SLO).

## Scope honesty (what is NOT here)

- Postgres driver: D-373 step 2 (needs credential.use + net.egress capability + LAW_POLICY rows + the W0-1 generator under the D-370 freeze). The wire vocabulary (`StorageOp`/`StorageResult`/`StorageDriverContract`) is committed and reserved with the D-373 pointer in the contract-sites allowlist.
- OS-enforced spawn limits (cgroups/Job Objects): D-374 named deferral (DRAFT-003 §3) — budgets advisory, watchdog bounds detection (D-321 honesty preserved).
- wasm tier: forward-declared only (D-354 reserve). S3 cold tier, streaming-through-process-tier, telemetry: D-375 deferrals with named triggers.
