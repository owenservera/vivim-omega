# D-373 — DB-agnostic storage core: the vault driver lane, conformance-proven

## Status

RATIFIED

## Context

Every plugin is a `worker-thread` compartment and vault byte-persistence is one
`bun:sqlite` adapter (`plugins/vivim-vault/src/db.ts`, the D-361 single importer).
FOUNDATION-DRAFT-002 (received 2026-09-16, arbitration record D-375) makes pluggable
byte-storage a Wave0 foundation need (W0-10): SQLite today, Postgres later, with the
vault spine and every vault caller unaware which driver is live. D-361 deliberately
kept ONE importer — a Node build swaps the module by hand. That promise is unmechanized:
nothing proves a second driver behaves byte-identically, and the "swap one module"
story is a comment, not a contract. The 12-item DRAFT-001 arbitration resolved the
conflicts: contracts stay additive, the spine keeps CAS/Merkle/changelog discipline,
drivers stay dumb byte stores, and the gate allowlist is rewritten by explicit decision
instead of silently growing a second importer.

## Options

| Criterion | (a) Vault driver lane + conformance parity suite (this row) | (b) Full storage.kv broker plugin over the Port Protocol now | (c) Keep one adapter, doc-only |
|---|---|---|---|
| DB-agnostic core | Yes — driver interface + two drivers proven byte-identical | Yes, strongest (driver = separate plugin) | No |
| Law fit | Additive; bun-surface allowlist rewritten by THIS record, not smeared | Same, but needs composition generator (D-370 freeze blocks driver compositions) | Frozen |
| Falsifier strength | Cross-runtime parity: identical workload digest on bun:sqlite (Bun) vs node:sqlite (Node) | Same plus wire-level proofs | None |
| Scope for one falsifier-first slice | One seam + one suite + one parity run | Spine refactor + grants + generator first | Zero |
| Host LOC | 0 | 0 | 0 |

## Decision

**Decision:** (a) Vault driver lane + conformance parity suite — the vault's
byte-persistence sits behind one structural `SqliteDriver` seam
(`plugins/vivim-vault/src/drivers/`): `bun-sqlite` (today, default) and `node-sqlite`
(Node 24 `node:sqlite`, lazily loaded — never under Bun), with `contracts/src/storage.ts`
pinning the wire vocabulary (`StorageOp`/`StorageResult`/`StorageDriverContract` with
`ns`/`rev`/`refs` preserved and a `health()` probe adopted from DRAFT-003). The
bun-surface allowlist is REWRITTEN by this record from "one file" to "the vault driver
lane" — any file under `plugins/vivim-vault/src/drivers/` may import `bun:sqlite`, still
zero `Bun.*` calls anywhere. The conformance suite runs the IDENTICAL workload
(append → verify → roundtrip → search → compaction-honors-refs → changelog chain) on
both drivers and asserts byte-identical digests — Bun-side in `bun test`, Node-side via
`node tooling/ci/driver-parity.mjs`, compared live. D-361's single-importer clause is
hereby superseded IN THIS ONE LANE; every other D-361 ruling (toolchain neutrality,
sleep, daemon, surfaces) stands. The Postgres driver arrives as this record's step 2
(credential.use + net.egress capability + LAW_POLICY rows + the W0-1 generator), per
DRAFT-002's landing order — not in this slice.

## Consequences

- Vault callers see no change: `openVault(dataDir)` keeps its exact signature and
  Bun behavior; the lane is bound ONCE at module load (`db.ts` binds bun-sqlite,
  `db.node.ts` binds node-sqlite — a Node build swaps that ONE import; tests may
  bind any factory explicitly via `openVaultWith`).
- The "Node build swaps one module" promise becomes mechanically true and proven:
  the node driver passes the same conformance suite under Node 24 in CI-reachable
  plain `node` (no Bun on the box needed for the node lane).
- `db.ts` keeps every SQL helper unchanged — only the constructor is behind the seam.
- Postgres remains REFUSED-by-absence until its step-2 slice lands with its own
  falsifier (byte-identical CAS hashes sqlite vs postgres per DRAFT-002 §7.1).
- The gate's bun-surface stage enforces the lane allowlist; a `bun:sqlite` import
  anywhere else still fails the build.

## Evidence

- Falsifier (in tree BEFORE ratification): `plugins/vivim-vault/test/driver-conformance.test.ts`
  — cross-runtime parity digest (bun:sqlite under Bun vs node:sqlite under Node 24)
  + full suite per driver; self-contained (no cross-package imports, node-runnable).
- DRAFT-002 received verbatim: `docs/migration/10-WAVE0/received/FOUNDATION-DRAFT-002-DB-AGNOSTIC-DATA-PLANE.md`
  (arbitration chain: D-375).
- Gate: `omega:quick` green (7/7 structural incl. rewritten bun-surface) + full gate
  green + host LOC unchanged — landing SHA + numbers cited in the ratify commit.
- Landing: 377c4ed — gate GREEN (omega:quick 7/7 structural; full gate ok:true, 776 pass / 0 fail, host 999/1100 flat, attest booted), node canary 5/5; the parity falsifier ran green INSIDE that gate run (driver-conformance.test.ts 4/4, cross-runtime digest equality bun:sqlite<->node:sqlite).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
