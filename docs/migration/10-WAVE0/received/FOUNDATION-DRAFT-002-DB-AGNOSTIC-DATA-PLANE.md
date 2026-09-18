# FOUNDATION DRAFT 002 — DB-Agnostic Data Plane + Polyglot Process Tier (arbitrated)

| Field | Value |
|---|---|
| **Status** | **DRAFT-002 — PROPOSED** (arbitrates DRAFT-001 into a gate-passable spec; nothing landed yet) |
| **Date** | 2026-09-16 |
| **Provenance** | Resolves the 12-item arbitration list at the foot of `FOUNDATION-DRAFT-001-MULTI-RUNTIME-DATA-LAYER.md`. Every change below traces to one of those 12 items. |
| **Authority chain** | `../INTENT.md` → `../STRATEGY-OMEGA-PLUGIN-REBUILD.md` → `WAVE0-NEEDS-FROM-CODE.md` → `FOUNDATION-DRAFT-001` (first draft, unverified) → **this draft** (arbitrated, landable) |
| **Base pin** | `clone-omega` @ `61d1a41` — host 911/1100, laws B1–B5, D-361/D-365/D-370/D-372 ratified, 16-spec composition freeze |
| **Verification owed** | `bun run omega:quick` + `omega:gate` green (all stages incl. `bun-surface`, `os-surface`, `decisions`); falsifiers in §7 before PROPOSED→RATIFIED |

## 0. What this draft is and isn't

**Is:** a concrete path to (a) any plugin can supply the byte-storage backend behind one
`storage.kv` capability — SQLite today, Postgres as a second driver, with the host and
every existing vault caller unaware which one is live — and (b) a `process` runtime tier
so a plugin can be a Python process, callable by other plugins through the same Port
Protocol as a worker-thread plugin.

**Isn't:** a new architecture. No new isolation primitive, no new trust model, no
dependency the project doesn't already have a decision record for. Everything here is
additive to contracts, mediated by `platform/` where it touches the OS, and gated by the
same `omega:gate` that everything else goes through. (A separate, much larger proposal
floated distributed live-migration, TEE attestation, and self-writing code agents for
this problem — that is out of scope here: it doesn't fit a project whose µhost is capped
at 1,000 LOC and whose only sanctioned trust primitive is the signed Recipe + capability
token. If there's a real need for hardware attestation later, it gets its own decision
record and its own falsifiers, not a bundle with storage plumbing.)

---

## 1. Resolving DRAFT-001's arbitration list, item by item

| # | DRAFT-001 conflict | Resolution in DRAFT-002 |
|---|---|---|
| 1 | Host growth vs B5/D-365 (`host/src/process.ts` is new host code) | Process spawning moves to a **broker plugin** (`plugins/vivim-run/src/process-broker.ts`), the sanctioned "plugin of plugins" shape `vivim-run` already charters. Host LOC target: **unchanged from 911/1100**. |
| 2 | OS awareness vs D-372 (`spawn()`, env, paths) | All OS-specific parts (process creation, Job Objects/rlimits, path spelling) move to `platform/` as `platformSpawn()`. The broker plugin calls `platform/`; it never touches the OS directly. `os-surface` gate stays green. |
| 3 | `bun` import vs `bun-surface` (D-361) | `import { spawn } from "bun"` is dropped. `platformSpawn()` is built on `node:child_process`, matching the "production tree is runtime-neutral" doctrine. No new Bun import anywhere in `*/src`. |
| 4 | One-sqlite-adapter ruling (D-361) vs pluggable drivers | This *is* a deliberate, declared supersede of D-361's single-importer exception — not a silent second importer. New decision record **D-373** (below) rewrites the `bun-surface` allowlist to read "any plugin implementing `storage.kv`" instead of "one file." Gate stage updated in the same commit. |
| 5 | Storage contract vs existing vault contracts (ns/rev/refs, changelog, compaction) | `StorageOp`/`StorageResult` gain `ns`, `rev`, and `refs` fields (§2 below). Compaction's "never delete a revision cited by a live object" rule stays spine-side — the driver never decides what's live, it only stores/retrieves bytes by `(ns, key, rev)`. |
| 6 | Postgres secrets in `process.env.PG_PASSWORD` vs the credentials spine | DSN arrives only via `credential.use` at call time (§4). No secret ever rides a manifest, composition, or env var. Dev/sim compositions use a synthetic credential. |
| 7 | No declared network capability for Postgres | New capability `net.egress:storage-postgres` + LAW_POLICY risk rows (MUTATION for writes, READ for reads); boot is REFUSED without it, per the existing fail-closed rule. |
| 8 | Manifest drift (dropped `publisher`/`contributions`/`dependencies`/`justification`) | `runtime.process` and `runtime.wasm` are **additive** fields on the existing `PluginManifest` shape. Nothing existing is renamed or dropped; all 21 current plugin manifests validate unchanged; D-370 tooling (decisions-checker, composition generator) is untouched. |
| 9 | `wasm` tier declared but unimplemented | Contract keeps the `wasm` field for forward-declaration only. This draft's falsifiers cover `process` tier exclusively. `wasm` gets its own decision record when someone actually needs it. |
| 10 | Python shim robustness (Proactor loop, unawaited drain, no watchdog, stderr leak) | Fixed in §5: `writer.drain()` is awaited, malformed-IPC lines increment a bounded counter that trips the existing D-360 watchdog (BUDGET, not hang), stderr is captured to the journal rather than inherited, and Windows uses `asyncio.ProactorEventLoop` explicitly. |
| 11 | Composition/grant wiring absent | New plugins (`vivim-run` broker update, `storage-postgres`, `provider-python-echo`) enter via the **W0-1 composition generator**, not hand-edited specs — respects the D-370 16-spec freeze. |
| 12 | CAS collision / refs losing rev history | `refs` keys become `(ns, key, rev) → hash`, not hash-only. The vault spine, not the driver, owns changelog discipline; drivers are dumb byte stores. |

---

## 2. Contracts (additive only)

**File:** `contracts/src/storage.ts` (ADD)

```typescript
export type StorageKey = string;
export type StorageTable = string;

export interface StorageOp {
  type: "put" | "get" | "del" | "scan";
  ns: string;                 // vault namespace — required, not optional
  table: StorageTable;
  key?: StorageKey;
  rev?: number;                // revision number; omitted = latest
  value?: Uint8Array;
  refs?: string[];             // content-hash refs this write cites (compaction input)
  prefix?: string;
  limit?: number;
}

export interface StorageResult {
  value?: Uint8Array;
  rev?: number;
  entries?: Array<{ key: string; rev: number; value: Uint8Array }>;
}

export interface StorageDriverContract {
  execute(batch: StorageOp[]): Promise<StorageResult[]>;
}
```

**File:** `contracts/src/manifest.ts` (EDIT — additive fields only)

```typescript
export type RuntimeTier = "worker-thread" | "process" | "wasm";

export interface ProcessRuntime {
  cmd: string[];
  stdio: "ndjson";
  credentialRefs?: string[];   // names resolved via credential.use, never literal env
}

// Existing PluginManifest fields (publisher, contributions, dependencies,
// justification, id, version, contracts, capabilities, contentHash) are unchanged.
// Only runtime.process / runtime.wasm are new, optional members of runtime.
```

---

## 3. The broker plugin (host stays at 911/1100 LOC)

**File:** `plugins/vivim-run/src/process-broker.ts` (ADD, inside the existing `vivim-run` plugin — no new host surface)

```typescript
import { platformSpawn } from "@vivim/omega-platform";
import type { PortRequest, PortResponse, ProcessRuntime } from "@vivim/omega-contracts";

// Runs inside vivim-run's own worker-thread compartment. It asks `platform/`
// to create the OS process; it never calls node:child_process or bun directly.
export class ProcessBroker {
  private handles = new Map<string, ReturnType<typeof platformSpawn>>();

  async spawn(pluginId: string, cfg: ProcessRuntime, resolvedEnv: Record<string, string>) {
    const handle = platformSpawn(cfg.cmd, { env: resolvedEnv });
    this.handles.set(pluginId, handle);
    return handle;
  }

  // Malformed-IPC counter feeds the existing D-360 watchdog: N bad lines within
  // the budget window -> BUDGET, process killed, reported, never left hanging.
}
```

`platformSpawn()` itself is new code in `platform/` (the one package already licensed to
know about the OS per D-372) — Job Objects on Windows, rlimits/POSIX signals elsewhere,
one call surface. This is the only new OS-aware code in the whole draft.

---

## 4. Postgres driver — credentials and network capability, not env vars

**File:** `plugins/storage-postgres/plugin.json` (ADD)

```json
{
  "id": "storage.postgres",
  "version": "0.1.0",
  "capabilities": ["storage.kv", "net.egress:storage-postgres"],
  "runtime": {
    "tier": "worker-thread",
    "entry": "./dist/index.js",
    "process": { "credentialRefs": ["pg-dsn"] },
    "budget": { "cpuMs": 5000, "memMB": 512 }
  }
}
```

The driver never reads `process.env.PG_*`. At boot it calls `credential.use("pg-dsn")`
and receives a resolved connection string for that call only — never persisted, never
logged, never visible in the manifest or composition. LAW_POLICY gains two rows for this
capability: `MUTATION` (put/del) and `READ` (get/scan), both scoped to `storage.postgres`.
Boot without the credential reference resolves is REFUSED, per the standing fail-closed
rule — same as every other capability today.

---

## 5. Python process tier — hardened shim

Same shape as DRAFT-001's `vivim_omega_shim.py`, with the three robustness fixes from
arbitration item 10:

- `writer.drain()` is `await`-ed on every send (DRAFT-001 fired-and-forgot it).
- On Windows, the shim explicitly sets `asyncio.WindowsProactorEventLoopPolicy()` before
  opening the pipes — `connect_write_pipe` silently fails on the default selector loop.
- Malformed lines increment a counter reported back to the broker each heartbeat; the
  broker's existing watchdog (D-360) trips BUDGET at threshold instead of the process
  hanging indefinitely. `stderr` is piped to the host journal, not inherited to console.

The `provider-python-echo` example plugin from DRAFT-001 is unchanged in spirit — it's
the falsifier proof, not new production surface.

---

## 6. Landing order (each step gate-green before the next starts)

1. **D-373** decision record: rewrite `bun-surface` allowlist from "one file" to "any
   `storage.kv` implementer," plus the additive manifest fields and `storage.ts`
   contract. Writer + reader + test in the same commit (no vocabulary without writers).
2. `platform/` gains `platformSpawn()`; `vivim-run` gains the `ProcessBroker`. Host LOC
   asserted unchanged in the gate output.
3. Vault spine refactor: `vault.append/get/verify/roundtrip/compact` all route through
   `storage.kv` with `(ns, key, rev, refs)` preserved; `compaction-honors-refs` test
   passes against the in-tree SQLite driver first (no behavior change from today).
4. `storage-sqlite` driver plugin extracted as a real second importer under the D-373
   allowlist — same behavior, now pluggable.
5. `storage-postgres` driver behind `credential.use` + `net.egress:storage-postgres` +
   LAW_POLICY rows. Falsifier: byte-identical CAS hashes running the same workload on
   SQLite vs. Postgres.
6. `provider-python-echo` + hardened shim; polyglot boot falsifier.
7. Compositions regenerated via the W0-1 generator (freeze respected, no hand edits).
8. Gate + bench evidence archived to `docs/migration/40-EVIDENCE/`.

---

## 7. Falsifier set (must all hold before PROPOSED → RATIFIED)

1. **Driver swap, byte-identical:** the same `vault.append` workload run twice — once on
   `storage.sqlite`, once on `storage.postgres` — produces identical CAS hashes, and
   `compaction-honors-refs` passes on both.
2. **Secret law:** boot without the `pg-dsn` credential reference is REFUSED; with it,
   the DSN never appears in any manifest, composition, or journal row.
3. **Network fail-closed:** removing the `net.egress:storage-postgres` capability from
   the manifest causes boot REFUSAL, not a silent connection attempt.
4. **Polyglot boot:** `provider-python-echo` boots on the process tier, answers
   `echo.say` over the Port Protocol, and a flood of malformed IPC lines resolves to a
   bounded BUDGET failure, never a hang.
5. **Host LOC flat:** `omega:gate` reports host LOC unchanged at 911/1100 — the broker
   plugin, not the host, owns process lifecycle.
6. **Gate stages green:** `bun-surface` (under the rewritten D-373 allowlist),
   `os-surface`, `decisions`, and the full test suite all pass on one commit.

---

## 8. What's deliberately not here

No distributed migration, no TEE/enclave attestation, no zk-proofs, no code-generating
agent that deploys itself. If a future need for hardware attestation or a genuine
multi-node mesh materializes, it should arrive as its own INTENT-anchored proposal with
its own falsifiers — bundling it with storage/process plumbing was the mistake in the
earlier draft this one replaces.
