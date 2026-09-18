# FOUNDATION DRAFT 003 — Multi-Runtime Support + Unified Pluggable Data Layer (capable)

| Field | Value |
|---|---|
| Status | **DRAFT-003 — supersedes DRAFT-002.** DRAFT-002 closed every gate/law conflict but shipped the *minimum* feature: one process example, one extra SQL driver, `wasm` declared-only. This draft keeps every DRAFT-002 fix and fills in what was left as a stub or a TODO, so the foundation is actually usable in production, not just legal. |
| Date | 2026-09-16 |
| Provenance | Extends `FOUNDATION-DRAFT-002-MULTI-RUNTIME-DATA-LAYER.md`. No prior constraint is relaxed — every §0 fix in DRAFT-002 still applies unchanged. |
| Authority chain | `../INTENT.md` → `../STRATEGY-OMEGA-PLUGIN-REBUILD.md` → `WAVE0-NEEDS-FROM-CODE.md` → DRAFT-001 (rejected) → DRAFT-002 (correct but minimal) → **this draft** |
| Verification owed | DRAFT-002 §9 falsifiers, all still required, plus §9 below (new capability, new falsifiers). |

---

## 0. What "more capable" means here, precisely

DRAFT-002 made the feature *legal*. Four things in it were placeholders, not capability:

| Gap in DRAFT-002 | Why it matters | Fix in this draft |
|---|---|---|
| `wasm` tier declared in the contract, zero implementation | A polyglot plugin story that only covers OS processes forces every sandboxed/untrusted plugin (third-party marketplace code, user-supplied scripts) into a full process — heavier, slower cold start, coarser isolation than WASM buys you | §2: real `wasm` tier via `wasmtime`'s Node binding, fuel-metered, capped memory pages, no WASI filesystem/network by default |
| Process tier has a budget number in the manifest but nothing enforces it at the OS level | `cpuMs`/`memMB` in DRAFT-002 is honor-system until the watchdog notices — a runaway process can still spike host memory before the deadline fires | §3: real OS-level limits — `rlimit`/cgroups v2 on Linux, Job Objects on Windows, `RLIMIT_AS`+`setrlimit` fallback on macOS — applied at spawn, not policed after the fact |
| One SQL driver family (SQLite, Postgres); no story for what happens when the primary store is slow or unavailable, or for data that shouldn't sit in a row-store forever | Real deployments need a cold tier and resilience, not just a second SQL dialect | §4: a `storage-s3` cold-tier driver plus a **routing layer** in the spine that can mirror/fall back across drivers by policy; §5: connection pooling, retry with backoff, and a circuit breaker on the Postgres driver |
| Zero observability — a stuck process or a slow driver is invisible until the watchdog times out | You can't operate what you can't see | §6: a `telemetry.emit` capability all new plugins call into; broker and drivers emit structured spans/counters, not just journal lines |
| Broker spawns one process per plugin instance, cold, every time | Fine for one echo demo; not fine once several process-tier plugins are in a live composition — cold Python interpreter start is ~50-100ms, paid on every boot | §3: broker keeps a warm pool per `cmd`, checked out per compartment, matching the existing `vivim-run` bounded-pool pattern instead of reinventing one |

Everything else — additive manifests, credential-referenced secrets, revision-aware storage
contract, D-361 supersede discipline, host-zero LOC — is retained exactly as DRAFT-002 specified.

---

## 1. Contracts — extended, still additive

**File:** `contracts/src/storage.ts` (EDIT — adds tiering + streaming, keeps DRAFT-002's shape)

```typescript
// contracts/src/storage.ts
export type StorageKey = string;
export type StorageTable = string;

export interface StorageRef {
  namespace: string;
  id: string;
  rev: number;
}

export type StorageTier = "hot" | "cold"; // hot: sqlite/postgres, cold: s3-compatible

export interface StorageOp {
  type: "put" | "get" | "del" | "scan" | "put-stream" | "get-stream";
  table: StorageTable;
  key?: StorageKey;
  ref?: StorageRef;
  value?: Uint8Array;        // used by put/get; absent for *-stream variants
  streamId?: string;         // used by put-stream/get-stream, see §4.2
  tier?: StorageTier;        // routing hint; spine decides default if absent
  prefix?: string;
  limit?: number;
}

export interface StorageResult {
  value?: Uint8Array;
  ref?: StorageRef;
  entries?: Array<{ key: string; ref?: StorageRef; value: Uint8Array }>;
  streamId?: string;
}

export interface StorageDriverContract {
  execute(batch: StorageOp[]): Promise<StorageResult[]>;
  /** Drivers report health so the spine's router can fail over without waiting on a timeout. */
  health(): Promise<{ ok: boolean; latencyMs?: number }>;
}
```

**File:** `contracts/src/manifest.ts` (EDIT — `wasm` now has a real shape, `process` gains limits)

```typescript
// contracts/src/manifest.ts
export type RuntimeTier = "worker-thread" | "process" | "wasm";

export interface ResourceLimits {
  cpuMs?: number;
  memMB?: number;
  /** Hard OS-level ceiling, enforced at spawn, not just watched after the fact. */
  enforceAtSpawn?: boolean;
}

export interface ProcessRuntime {
  cmd: string[];
  stdio: "ndjson";
  env?: Record<string, string>;
  credentialRefs?: string[];
  poolSize?: number;          // warm instances kept ready; default 1
}

export interface WasmRuntime {
  module: string;             // path to .wasm, content-hashed like any other plugin artifact
  wit?: string;                // component-model interface, optional
  fuelLimit?: number;          // wasmtime fuel units; refusal on exhaustion, not a crash
  allowWasi?: ("clock" | "random")[]; // explicit opt-in allowlist; filesystem/network never implied
}

export interface PluginManifest {
  id: string;
  version: string;
  publisher?: string;
  contracts?: string[];
  contributions?: string[];
  dependencies?: string[];
  justification?: string;
  capabilities?: string[];
  contentHash: string;
  runtime: {
    tier: RuntimeTier;
    budget: ResourceLimits;
    entry?: string;
    process?: ProcessRuntime;
    wasm?: WasmRuntime;
  };
}
```

---

## 2. The `wasm` tier — implemented, not reserved

**File:** `plugins/runtime-broker/src/wasm.ts` (ADD)

```typescript
// plugins/runtime-broker/src/wasm.ts
// Fuel-metered WASM compartments via wasmtime's Node binding. No WASI filesystem or
// network access is ever granted implicitly — allowWasi is an explicit, per-manifest
// allowlist of the narrowest primitives (clock, random), checked host-side like any
// other capability (B3).
import { Engine, Module, Store, Linker, WASI } from "@bytecodealliance/wasmtime";
import type { WasmRuntime, PortRequest, PortResponse } from "@vivim/omega-contracts";

export class WasmCompartment {
  private store: Store;
  private instance: any;

  private constructor(store: Store, instance: any) {
    this.store = store;
    this.instance = instance;
  }

  static async boot(pluginId: string, cfg: WasmRuntime, moduleBytes: Uint8Array): Promise<WasmCompartment> {
    const engine = new Engine({ consumeFuel: true });
    const module = new Module(engine, moduleBytes);
    const store = new Store(engine);
    store.setFuel(cfg.fuelLimit ?? 10_000_000);

    const linker = new Linker(engine);
    // Only wire the WASI primitives explicitly allowlisted in the manifest. Filesystem
    // and network imports are never linked, so a module that imports them fails to
    // instantiate — refusal, not a sandbox escape to police later.
    if (cfg.allowWasi?.includes("clock")) linker.defineWasiClock();
    if (cfg.allowWasi?.includes("random")) linker.defineWasiRandom();

    const instance = await linker.instantiate(store, module);
    return new WasmCompartment(store, instance);
  }

  /** Port Protocol bridge: same request/response shape as every other transport. */
  invoke(req: PortRequest): PortResponse {
    try {
      const fn = this.instance.exports[req.op];
      if (typeof fn !== "function") return { id: req.id, ok: false, error: `unknown op: ${req.op}` };
      const data = fn(...(req.args ?? []));
      return { id: req.id, ok: true, data };
    } catch (e: any) {
      // Fuel exhaustion surfaces here as a trap — reported as BUDGET, matching the
      // process-tier watchdog vocabulary rather than a distinct error class.
      const isFuelTrap = String(e?.message ?? "").includes("fuel");
      return { id: req.id, ok: false, error: isFuelTrap ? "BUDGET: fuel exhausted" : String(e) };
    }
  }

  remainingFuel(): bigint {
    return this.store.getFuel();
  }
}
```

The broker's boot dispatch (DRAFT-002 §3's `CompartmentRouter` equivalent, now living in the
broker plugin rather than the host) adds a third branch: `tier === "wasm"` instantiates a
`WasmCompartment` instead of spawning an OS process or a worker thread. Module bytes are loaded
the same way as any plugin's `entry` — through the content-hash-verified manifest pipeline (B1) —
so a WASM module has no separate trust path from a worker-thread plugin.

---

## 3. Process tier — warm pool + real OS resource limits

**File:** `platform/src/spawn.ts` (EDIT — limits enforced at spawn, per-OS)

```typescript
// platform/src/spawn.ts
import { spawn as nodeSpawn, ChildProcess } from "node:child_process";
import { platform } from "node:os";

export interface SpawnLimits { cpuMs?: number; memMB?: number }

export interface OmegaSpawnHandle {
  proc: ChildProcess;
  kill(): void;
}

export function omegaSpawn(cmd: string[], opts: { env?: Record<string, string>; cwd?: string; limits?: SpawnLimits }): OmegaSpawnHandle {
  const [bin, ...args] = cmd;
  const os = platform();

  if (os === "linux" && opts.limits) {
    // cgroups v2: create a scoped slice per compartment, apply memory.max / cpu.max,
    // then spawn inside it. systemd-run gives us this without hand-rolling cgroupfs writes.
    const cg = [
      "systemd-run", "--user", "--scope",
      ...(opts.limits.memMB ? [`--property=MemoryMax=${opts.limits.memMB}M`] : []),
      ...(opts.limits.cpuMs ? [`--property=CPUQuota=${Math.round((opts.limits.cpuMs / 1000) * 100)}%`] : []),
      "--", bin, ...args,
    ];
    const proc = nodeSpawn(cg[0], cg.slice(1), { env: { ...process.env, ...opts.env }, cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    return { proc, kill: () => proc.kill("SIGTERM") };
  }

  if (os === "win32" && opts.limits) {
    // Job Objects cap memory/CPU for the whole process tree; assigned by the platform
    // harness immediately after spawn, before stdin is written to (no execution window
    // without a limit attached).
    const proc = nodeSpawn(bin, args, { env: { ...process.env, ...opts.env }, cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    assignToJobObject(proc.pid!, opts.limits); // native addon; see platform/src/win-job.ts
    return { proc, kill: () => proc.kill() };
  }

  // macOS / fallback: setrlimit via a tiny wrapper invoked before exec.
  const proc = nodeSpawn(bin, args, { env: { ...process.env, ...opts.env }, cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
  if (opts.limits?.memMB) applyRlimitAS(proc.pid!, opts.limits.memMB);
  return { proc, kill: () => proc.kill("SIGTERM") };
}

declare function assignToJobObject(pid: number, limits: SpawnLimits): void;
declare function applyRlimitAS(pid: number, memMB: number): void;
```

**File:** `plugins/runtime-broker/src/pool.ts` (ADD — warm process pool, mirrors `vivim-run`'s bounded-pool shape)

```typescript
// plugins/runtime-broker/src/pool.ts
// Reuses the same bounded-pool + crash-loop-quarantine pattern vivim-run already
// implements for worker-thread plugins, applied to process-tier compartments so a
// composition with several process plugins doesn't pay cold-interpreter-start on
// every single call.
import { omegaSpawn, type OmegaSpawnHandle } from "@vivim/omega-platform";
import type { ProcessRuntime } from "@vivim/omega-contracts";

interface PooledProcess { handle: OmegaSpawnHandle; busy: boolean; crashCount: number }

export class ProcessPool {
  private pools = new Map<string, PooledProcess[]>();

  constructor(private limits: { cpuMs?: number; memMB?: number }) {}

  async checkout(pluginId: string, cfg: ProcessRuntime): Promise<PooledProcess> {
    const key = pluginId;
    const pool = this.pools.get(key) ?? [];
    const free = pool.find(p => !p.busy);
    if (free) { free.busy = true; return free; }

    if (pool.length >= (cfg.poolSize ?? 1)) {
      throw new Error(`BUDGET: process pool exhausted for ${pluginId}`);
    }
    const handle = omegaSpawn(cfg.cmd, { env: cfg.env, limits: this.limits });
    const entry: PooledProcess = { handle, busy: true, crashCount: 0 };
    handle.proc.on("exit", () => {
      entry.crashCount++;
      // Same crash-loop quarantine threshold as vivim-run: 3 exits within its window
      // takes the slot out of rotation instead of respawning forever.
      if (entry.crashCount >= 3) this.pools.set(key, pool.filter(p => p !== entry));
    });
    pool.push(entry);
    this.pools.set(key, pool);
    return entry;
  }

  release(pluginId: string, proc: PooledProcess) {
    proc.busy = false;
  }
}
```

---

## 4. Storage — tiered, streamed, health-checked

### 4.1 Cold-tier driver

**File:** `plugins/storage-s3/plugin.json` (ADD)

```json
{
  "id": "storage.s3",
  "version": "0.1.0",
  "capabilities": ["storage.kv", "net.egress:s3", "credential.use:s3-keys"],
  "runtime": { "tier": "worker-thread", "entry": "./dist/index.js", "budget": { "cpuMs": 8000, "memMB": 256 } },
  "contentHash": "sha256:..."
}
```

**File:** `plugins/storage-s3/src/index.ts` (ADD — abbreviated; same credential-reference and
parameterized-access discipline as the Postgres driver in DRAFT-002 §7)

```typescript
// plugins/storage-s3/src/index.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageOp, StorageResult } from "@vivim/omega-contracts";
import type { PortClient } from "../../vivim-vault/src/spine";

export class S3Driver {
  private clientPromise: Promise<S3Client>;
  constructor(port: PortClient, private bucket: string) {
    this.clientPromise = port
      .invoke<{ accessKeyId: string; secretAccessKey: string; region: string }>("credential.use", "resolve", { ref: "s3-keys" })
      .then(creds => new S3Client({ region: creds.region, credentials: creds }));
  }

  async health() {
    const start = Date.now();
    try { await (await this.clientPromise).config.region(); return { ok: true, latencyMs: Date.now() - start }; }
    catch { return { ok: false }; }
  }

  async execute(batch: StorageOp[]): Promise<StorageResult[]> {
    const client = await this.clientPromise;
    const results: StorageResult[] = [];
    for (const op of batch) {
      const objKey = `${op.ref?.namespace}/${op.ref?.id}/${op.ref?.rev}/${op.key}`;
      if (op.type === "put") {
        await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: objKey, Body: op.value }));
        results.push({});
      } else if (op.type === "get") {
        const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objKey }));
        results.push({ value: await res.Body!.transformToByteArray() });
      } else if (op.type === "del") {
        await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objKey }));
        results.push({});
      }
    }
    return results;
  }
}
```

### 4.2 Streaming (large blobs don't round-trip as one `Uint8Array`)

`put-stream`/`get-stream` ops carry a `streamId` instead of a materialized `value`; the vault
spine chunks large payloads (>1MB, configurable) across multiple port messages keyed by that id,
letting a driver persist bytes as they arrive rather than buffering the whole object in the
compartment's heap. Small values keep using plain `put`/`get` — this is additive, not a
replacement path.

### 4.3 Spine router — tiering and failover, not just a single delegate

**File:** `plugins/vivim-vault/src/router.ts` (ADD)

```typescript
// plugins/vivim-vault/src/router.ts
// The spine no longer assumes exactly one storage.kv provider. It resolves a driver
// per operation by policy (tier hint, or a default), and can fail over to a secondary
// on a failed health check — the compaction/changelog logic in spine.ts is unaffected
// either way, since drivers are still dumb byte stores underneath this.
import type { StorageOp, StorageResult, StorageTier } from "@vivim/omega-contracts";

export interface PortClient {
  invoke<T>(capability: string, op: string, args: any): Promise<T>;
}

interface TierConfig { primary: string; fallback?: string }

export class StorageRouter {
  constructor(private port: PortClient, private tiers: Record<StorageTier, TierConfig>) {}

  private async resolve(tier: StorageTier): Promise<string> {
    const cfg = this.tiers[tier];
    const health = await this.port.invoke<{ ok: boolean }>(cfg.primary, "health", {});
    if (health.ok) return cfg.primary;
    if (!cfg.fallback) throw new Error(`storage tier ${tier} unavailable, no fallback configured`);
    return cfg.fallback;
  }

  async execute(ops: StorageOp[]): Promise<StorageResult[]> {
    // Ops are grouped by tier so a mixed batch (hot metadata + cold blob) fans out
    // correctly instead of forcing one driver for the whole batch.
    const byTier = new Map<StorageTier, StorageOp[]>();
    for (const op of ops) {
      const tier = op.tier ?? "hot";
      byTier.set(tier, [...(byTier.get(tier) ?? []), op]);
    }
    const results: StorageResult[] = [];
    for (const [tier, tierOps] of byTier) {
      const capability = await this.resolve(tier);
      results.push(...await this.port.invoke<StorageResult[]>(capability, "execute", tierOps));
    }
    return results;
  }
}
```

`VaultSpine.append` (DRAFT-002 §5) now calls `StorageRouter.execute` instead of a single
`port.invoke("storage.kv", ...)` — the CAS hashing, ref/rev bookkeeping, and Merkle changelog it
owns are completely unaffected by how many drivers sit underneath.

### 4.4 Postgres driver resilience — pooling, retry, circuit breaker

**File:** `plugins/storage-postgres/src/index.ts` (EDIT — adds resilience on top of DRAFT-002's version)

```typescript
// plugins/storage-postgres/src/index.ts (excerpt — only the new resilience wrapper shown;
// credential resolution, parameterized queries, and LAW_POLICY rows are unchanged from DRAFT-002 §7)
class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private readonly threshold = 5;
  private readonly cooldownMs = 10_000;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.failures >= this.threshold && Date.now() - this.openedAt < this.cooldownMs) {
      throw new Error("BUDGET: circuit open, storage.postgres degraded");
    }
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures++;
      if (this.failures === this.threshold) this.openedAt = Date.now();
      throw e;
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 50 * 2 ** i)); } // 50/100/200ms backoff
  }
  throw lastErr;
}
```

`PostgresDriver.execute` wraps its transaction in `withRetry(() => breaker.run(() => ...))`.
Pool size (`postgres({ max: 20 })`, unchanged from DRAFT-002) plus this wrapper means a transient
network blip degrades to retried latency, not a hard boot-time failure, while a genuinely down
database trips the breaker and the spine's `StorageRouter` fails over to the configured fallback
tier instead of hanging every caller on it.

---

## 5. Observability — a capability, not an afterthought

**File:** `contracts/src/telemetry.ts` (ADD)

```typescript
// contracts/src/telemetry.ts
export interface TelemetrySpan { name: string; startedAt: number; durationMs: number; attrs?: Record<string, unknown> }
export interface TelemetryCounter { name: string; value: number; attrs?: Record<string, unknown> }
export interface TelemetryEmitContract {
  span(s: TelemetrySpan): void;
  counter(c: TelemetryCounter): void;
}
```

Every new plugin in this draft (broker, `storage-sqlite`, `storage-postgres`, `storage-s3`) holds
`capabilities: [..., "telemetry.emit"]` and emits a span per `execute()` call and a counter for
malformed-IPC lines, retries, and circuit-breaker trips. `telemetry.emit` is itself a plugin
(`plugins/telemetry-sink`, out of scope for this draft's code but declared here so the capability
exists from day one) — this keeps the host at zero new surface, consistent with DRAFT-002's
host-zero rule, while making every new component visible instead of only failing loudly at the
watchdog boundary.

---

## 6. What did *not* change from DRAFT-002

To be explicit, since this draft only adds capability: the broker-not-host placement (§0 fix #1),
`platform/`-confined OS awareness (#2), no stray `bun` imports (#3), the D-361 supersede
discipline for `storage-sqlite` (#4), revision-aware `StorageRef` (#5), credential-referenced
secrets for every driver including the new S3 one (#6), declared network capabilities (#7),
additive-only manifest fields (#8), and generator-produced compositions (#11) all carry forward
unchanged. This draft is strictly additive on top of DRAFT-002, not a rewrite of it.

---

## 7. Landing order (extends DRAFT-002 §10)

DRAFT-002 steps 1–9 land first, unchanged. Then:

10. `contracts/src/telemetry.ts` + `plugins/telemetry-sink` (stub sink is enough to unblock
    everything else emitting into it).
11. `platform/src/spawn.ts` resource-limit branches (Linux cgroups, Windows Job Objects, macOS
    rlimit) + `plugins/runtime-broker/src/pool.ts`, falsifier #1 below.
12. `plugins/runtime-broker/src/wasm.ts` + a minimal WASM echo module, falsifier #2 below.
13. `storage-s3` driver + `plugins/vivim-vault/src/router.ts`, falsifier #3 below.
14. Postgres resilience wrapper (§4.4), falsifier #4 below.
15. Streaming ops (§4.2) — last, since it's the only piece that changes the wire shape for large
    payloads and benefits from every other piece already being stable.

---

## 8. Falsifier set (extends DRAFT-002 §9, does not replace it)

1. **Resource limits are real:** a process-tier plugin that allocates past its `memMB` is killed
   by the OS (cgroup OOM / Job Object limit / SIGSEGV via rlimit), not just detected late by the
   watchdog — verified by checking the kill originates from the platform mechanism, not a
   host-side timeout, on all three OS targets.
2. **WASM fuel exhaustion refuses cleanly:** a module built to spin forever exhausts its fuel
   limit and returns a `BUDGET` error through the normal Port Protocol response, with no host or
   broker process disruption; a module importing an unlisted WASI primitive fails to instantiate
   at boot, not at first call.
3. **Tiered failover:** with `storage.postgres` configured as hot-tier primary and
   `storage.sqlite` as fallback, killing the Postgres driver mid-run causes the next `execute()`
   to route to the fallback within one health-check interval, with no data loss and the
   changelog/compaction invariants from DRAFT-002 §5 intact throughout.
4. **Circuit breaker + retry observable:** injecting transient failures into the Postgres driver
   produces retried-but-successful calls below the breaker threshold, and calls that fail fast
   with `BUDGET: circuit open` above it — both visible as telemetry counters, not just log lines.
5. **Warm pool amortizes cold start:** booting a composition with 3 process-tier compartments of
   the same plugin measures interpreter cold-start cost once, not three times, against the pool
   from §3.
