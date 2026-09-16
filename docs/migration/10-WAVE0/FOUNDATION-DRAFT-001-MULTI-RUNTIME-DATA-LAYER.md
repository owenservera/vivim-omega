# FOUNDATION DRAFT 001 — Multi-Runtime Support + Unified Pluggable Data Layer

| Field | Value |
|---|---|
| Status | **DRAFT-001 — UNVERIFIED** (documented as-is; no gate run; nothing landed in `clone-omega`) |
| Date | 2026-09-16 |
| Provenance | Owner first-draft session. Recorded verbatim per owner directive ("document it as is"). Code below is the draft exactly as supplied — errors included — so the record is faithful. |
| Authority chain | `../INTENT.md` → `../STRATEGY-OMEGA-PLUGIN-REBUILD.md` → `WAVE0-NEEDS-FROM-CODE.md` (foundational needs) → **this draft** (first implementation candidate) |
| Implements | Two foundational needs from Wave0: (1) **Multi-Runtime Support** — a `process` runtime tier so plugins can be Python/OS processes (B2-preserving), plus a `wasm` tier declaration; (2) **Unified Pluggable Data Layer** — a universal `storage.kv` capability so Vault becomes a logic spine (CAS/Merkle/changelog) and byte-persistence (SQLite, Postgres, …) becomes swappable driver plugins. |
| Verification owed | `bun run omega:quick` + `omega:gate` on a branch; decisions-checker pass for any contract/manifest changes; falsifiers in §10 before any RATIFIED claim. |

---

## Owner draft — verbatim record

> "Here is the complete, production-grade implementation for the **Multi-Runtime Support**
> and **Unified Pluggable Data Layer** upgrade. This code strictly adheres to the VIVIM-Ω
> Boot Laws (specifically B2: *Compartments never share a heap*), maximizes I/O
> throughput, and maintains the µhost's <1,000 LOC budget."

### 1. The Universal Storage Contract (Added)

This contract defines the strict wire format for all storage operations. Any plugin
(Vault, SQLite, Postgres) must use this exact interface to communicate data operations.

**File:** `contracts/src/storage.ts` (ADD)

```typescript
// contracts/src/storage.ts
export type StorageKey = string;
export type StorageTable = string;

export interface StorageOp {
  type: "put" | "get" | "del" | "scan";
  table: StorageTable;
  key?: StorageKey;
  value?: Uint8Array; // Base64 encoded in JSON transport, decoded natively by driver
  prefix?: string;    // For scan operations
  limit?: number;
}

export interface StorageResult {
  value?: Uint8Array;
  entries?: Array<{ key: string; value: Uint8Array }>;
}

export interface StorageDriverContract {
  execute(batch: StorageOp[]): Promise<StorageResult[]>;
}
```

### 2. Manifest Contract Evolution (Edited)

We extend the manifest to declare new runtime tiers (`process` for Python/OS processes,
`wasm` for WASM) and their specific configurations.

**File:** `contracts/src/manifest.ts` (EDIT)

```typescript
// contracts/src/manifest.ts
export type RuntimeTier = "worker-thread" | "process" | "wasm";

export interface ProcessRuntime {
  cmd: string[];
  stdio?: "ndjson";
  env?: Record<string, string>;
}

export interface WasmRuntime {
  module: string;
  wit?: string;
}

export interface PluginManifest {
  id: string;
  version: string;
  contracts?: string[];
  capabilities?: string[];
  runtime: {
    tier: RuntimeTier;
    budget: { cpuMs?: number; memMB?: number };
    process?: ProcessRuntime; // Used when tier === "process"
    wasm?: WasmRuntime;       // Used when tier === "wasm"
    entry?: string;           // Used when tier === "worker-thread"
  };
  contentHash: string; // "sha256:<hex>" over the plugin content dir
}
```

### 3. The Host Multi-Runtime Spawner (Added)

This is the OS-level process spawner for the host. It enforces **Boot Law B2** (zero heap
sharing) by isolating the external process and bridging the internal Port Protocol to it
via high-performance NDJSON over `stdio`.

**File:** `host/src/process.ts` (ADD)

```typescript
// host/src/process.ts
import { spawn, Subprocess } from "bun";
import { EventEmitter } from "events";
import type { PortRequest, PortResponse, ProcessRuntime } from "@vivim/omega-contracts";

/**
 * ProcessCompartment
 * Enforces Boot Law B2: Zero heap sharing.
 * Bridges the internal Port Protocol to an external OS process via NDJSON over stdio.
 */
export class ProcessCompartment extends EventEmitter {
  private proc: Subprocess<"pipe", "pipe", "inherit">;
  private buffer = "";

  constructor(id: string, cfg: ProcessRuntime) {
    super();
    this.proc = spawn(cfg.cmd, {
      env: { ...process.env, ...cfg.env },
      stdout: "pipe",
      stderr: "inherit", // Pipe stderr directly to host console for debugging
      stdin: "pipe",
      onExit: (proc, exitCode, signalCode) => {
        this.emit("exit", { exitCode, signalCode });
      },
    });

    // High-performance line-by-line parser for NDJSON IPC
    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      let newlineIndex;
      // Process all complete messages in the chunk
      while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            this.emit("message", JSON.parse(line) as PortResponse);
          } catch (err) {
            this.emit("error", new Error(`[${id}] Malformed IPC message: ${line}`));
          }
        }
      }
    });
  }

  public send(req: PortRequest): void {
    // Append newline to frame the JSON message for the polyglot shim
    this.proc.stdin.write(JSON.stringify(req) + "\n");
  }

  public kill(): void {
    this.proc.kill();
  }
}
```

### 4. Host Worker Router (Edited)

We update the host's worker router to inspect the `runtime.tier` and route to either a
V8 `Worker` or the new `ProcessCompartment`.

**File:** `host/src/worker.ts` (EDIT)

```typescript
// host/src/worker.ts
import { Worker } from "node:worker_threads";
import { ProcessCompartment } from "./process";
import type { PluginManifest, PortRequest, PortResponse } from "@vivim/omega-contracts";
import { EventEmitter } from "events";

export class CompartmentRouter extends EventEmitter {
  private transport: Worker | ProcessCompartment | null = null;

  constructor(private manifest: PluginManifest) {
    super();
  }

  public async boot(): Promise<void> {
    const { tier, process: processCfg } = this.manifest.runtime;

    if (tier === "worker-thread") {
      this.transport = new Worker(this.manifest.runtime.entry ?? "./index.js", {
        workerData: { id: this.manifest.id }
      });
      this.transport.on("message", (msg: PortResponse) => this.emit("message", msg));
    } 
    else if (tier === "process" && processCfg) {
      this.transport = new ProcessCompartment(this.manifest.id, processCfg);
      this.transport.on("message", (msg: PortResponse) => this.emit("message", msg));
      this.transport.on("exit", (info) => this.emit("exit", info));
    } 
    else {
      throw new Error(`Unsupported runtime tier: ${tier}`);
    }
  }

  public send(req: PortRequest): void {
    if (!this.transport) throw new Error("Compartment not booted");
    this.transport.send(req);
  }

  public shutdown(): void {
    if (this.transport) {
      if ("terminate" in this.transport) {
        (this.transport as Worker).terminate();
      } else if ("kill" in this.transport) {
        (this.transport as ProcessCompartment).kill();
      }
      this.transport = null;
    }
  }
}
```

### 5. The Polyglot Python Shim (Added)

This is the Python-side library that plugin authors import. It handles the asynchronous
`stdio` bridge, ensuring the Python plugin never blocks the host and correctly routes
Port Protocol requests to Python functions.

**File:** `shim/py/vivim_omega_shim.py` (ADD)

```python
# shim/py/vivim_omega_shim.py
import sys
import json
import asyncio
from typing import Any, Callable, Awaitable, Dict

class VivimShim:
    """
    High-performance, non-blocking bridge between the VIVIM Host and Python plugins.
    Reads NDJSON from stdin, executes operations, and writes NDJSON to stdout.
    """
    def __init__(self, ops: Dict[str, Callable[..., Awaitable[Any]]]):
        self.ops = ops

    async def run(self) -> None:
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        
        # Map sys.stdin to an async stream for zero-blocking reads
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        
        # Map sys.stdout to an async stream
        w_transport, w_protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin, sys.stdout)
        writer = asyncio.StreamWriter(w_transport, w_protocol, reader, loop)

        while True:
            line = await reader.readline()
            if not line:
                break # EOF, host closed the pipe
                
            try:
                req = json.loads(line)
                op_name = req.get("op")
                args = req.get("args", {})
                req_id = req.get("id")
                
                if op_name in self.ops:
                    try:
                        result = await self.ops[op_name](**args)
                        self._send(writer, {"id": req_id, "ok": True, "data": result})
                    except Exception as e:
                        self._send(writer, {"id": req_id, "ok": False, "error": str(e)})
                else:
                    self._send(writer, {"id": req_id, "ok": False, "error": f"Unknown op: {op_name}"})
            except json.JSONDecodeError:
                self._send(writer, {"id": None, "ok": False, "error": "Invalid JSON"})

    def _send(self, writer: asyncio.StreamWriter, msg: dict) -> None:
        writer.write((json.dumps(msg) + "\n").encode("utf-8"))
        writer.drain() 
        sys.stdout.flush()
```

### 6. The Vault Spine (Added)

The Vault is refactored. It no longer holds database connections. It is the **Data
Spine** that manages Merkle logic, Content Addressable Storage (CAS) hashing, and
compaction. It delegates the actual byte-writing to the `storage.kv` capability via the
Port Protocol.

**File:** `plugins/vivim-vault/src/spine.ts` (ADD)

```typescript
// plugins/vivim-vault/src/spine.ts
import { createHash } from "node:crypto";
import type { StorageOp, StorageResult } from "@vivim/omega-contracts";

export interface PortClient {
  invoke<T>(capability: string, op: string, args: any): Promise<T>;
}

/**
 * Vault Spine
 * Computes hashes, builds the changelog, and delegates persistence 
 * to the `storage.kv` capability (SQLite, Postgres, etc.).
 */
export class VaultSpine {
  constructor(private port: PortClient) {}

  async append(namespace: string, key: string, data: Uint8Array): Promise<string> {
    // 1. Core Logic: Compute CAS Hash
    const hash = createHash("sha256").update(data).digest("hex");
    const casKey = `cas:${hash}`;
    
    // 2. Build the Storage Batch
    const ops: StorageOp[] = [
      { type: "put", table: "blobs", key: casKey, value: data },
      { type: "put", table: "refs", key: `${namespace}:${key}`, value: Buffer.from(hash) }
    ];

    // 3. Delegate to Pluggable Data Layer via Port Protocol
    // The host routes this to whichever plugin holds the `storage.kv` capability
    await this.port.invoke<StorageResult[]>("storage.kv", "execute", ops);

    return hash;
  }
}
```

**File:** `plugins/vivim-vault/plugin.json` (EDIT — updated capabilities)

```json
{
  "id": "vivim.vault",
  "version": "0.2.0",
  "contracts": ["vault.append", "vault.get", "vault.verify"],
  "capabilities": ["storage.kv"],
  "runtime": {
    "tier": "worker-thread",
    "entry": "./dist/index.js",
    "budget": { "cpuMs": 5000, "memMB": 512 }
  },
  "contentHash": "sha256:..."
}
```

### 7. The SQLite Driver Plugin (Added)

This plugin implements the `storage.kv` capability. It uses `bun:sqlite` with aggressive
performance pragmas (WAL mode, Memory-Mapped I/O) and pre-compiled prepared statements
wrapped in transactions for maximum throughput.

**File:** `plugins/storage-sqlite/plugin.json` (ADD)

```json
{
  "id": "storage.sqlite",
  "version": "0.1.0",
  "contracts": [],
  "capabilities": ["storage.kv"],
  "runtime": {
    "tier": "worker-thread",
    "entry": "./dist/index.js",
    "budget": { "cpuMs": 5000, "memMB": 256 }
  },
  "contentHash": "sha256:..."
}
```

**File:** `plugins/storage-sqlite/src/index.ts` (ADD)

```typescript
// plugins/storage-sqlite/src/index.ts
import { Database } from "bun:sqlite";
import type { StorageOp, StorageResult } from "@vivim/omega-contracts";

export class SqliteDriver {
  private db: Database;
  private putStmt: any;
  private getStmt: any;
  private delStmt: any;

  constructor(path: string) {
    this.db = new Database(path);
    
    // Performance Pragmas
    this.db.exec("PRAGMA journal_mode = WAL;");      // Write-Ahead Logging
    this.db.exec("PRAGMA synchronous = NORMAL;");    // Balances durability and speed
    this.db.exec("PRAGMA temp_store = MEMORY;");     // Temp tables in RAM
    this.db.exec("PRAGMA mmap_size = 268435456;");   // 256MB Memory Mapped I/O

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        ns TEXT NOT NULL,
        key TEXT NOT NULL,
        val BLOB NOT NULL,
        PRIMARY KEY (ns, key)
      );
    `);
    
    // Pre-compile statements to avoid query planning overhead on every call
    this.putStmt = this.db.prepare("INSERT OR REPLACE INTO kv_store (ns, key, val) VALUES (?, ?, ?)");
    this.getStmt = this.db.prepare("SELECT val FROM kv_store WHERE ns = ? AND key = ?");
    this.delStmt = this.db.prepare("DELETE FROM kv_store WHERE ns = ? AND key = ?");
  }

  public execute(batch: StorageOp[]): StorageResult[] {
    const results: StorageResult[] = new Array(batch.length);
    
    // The ultimate SQLite performance optimization: wrap bulk operations in a transaction
    this.db.transaction(() => {
      for (let i = 0; i < batch.length; i++) {
        const op = batch[i];
        if (op.type === "put") {
          this.putStmt.run(op.table, op.key, Buffer.from(op.value!));
          results[i] = {};
        } else if (op.type === "get") {
          const row = this.getStmt.get(op.table, op.key) as { val: Buffer } | null;
          results[i] = { value: row ? row.val : undefined };
        } else if (op.type === "del") {
          this.delStmt.run(op.table, op.key);
          results[i] = {};
        }
      }
    })();

    return results;
  }
}

const driver = new SqliteDriver("./vault.sqlite");

export default {
  ops: {
    execute: (batch: StorageOp[]) => driver.execute(batch)
  }
};
```

### 8. The Postgres Driver Plugin (Added)

This implements the same capability for Postgres using `postgres` (postgres.js), which
supports native binary parameter binding for `bytea` columns.

**File:** `plugins/storage-postgres/plugin.json` (ADD)

```json
{
  "id": "storage.postgres",
  "version": "0.1.0",
  "contracts": [],
  "capabilities": ["storage.kv"],
  "runtime": {
    "tier": "worker-thread",
    "entry": "./dist/index.js",
    "budget": { "cpuMs": 5000, "memMB": 512 }
  },
  "contentHash": "sha256:..."
}
```

**File:** `plugins/storage-postgres/src/index.ts` (ADD)

```typescript
// plugins/storage-postgres/src/index.ts
import postgres from "postgres";
import type { StorageOp, StorageResult } from "@vivim/omega-contracts";

const sql = postgres({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  max: 20, // Connection pool size
  types: {
    // postgres.js natively maps bytea to Buffer, avoiding JSON base64 overhead
    bytea: {
      to: 17,
      from: 17,
      serialize: (x: Buffer) => x,
      parse: (x: string) => Buffer.from(x.slice(2), "hex")
    }
  }
});

export class PostgresDriver {
  async init() {
    await sql`
      CREATE TABLE IF NOT EXISTS kv_store (
        ns TEXT NOT NULL,
        key TEXT NOT NULL,
        val BYTEA NOT NULL,
        PRIMARY KEY (ns, key)
      )
    `;
  }

  public async execute(batch: StorageOp[]): Promise<StorageResult[]> {
    const results: StorageResult[] = [];
    
    // postgres.js supports highly optimized batch parameter binding
    await sql.begin(async (tx) => {
      for (const op of batch) {
        if (op.type === "put") {
          await tx`
            INSERT INTO kv_store (ns, key, val) 
            VALUES (${op.table}, ${op.key}, ${Buffer.from(op.value!)})
            ON CONFLICT (ns, key) DO UPDATE SET val = EXCLUDED.val
          `;
          results.push({});
        } else if (op.type === "get") {
          const rows = await tx`SELECT val FROM kv_store WHERE ns = ${op.table} AND key = ${op.key}`;
          results.push({ value: rows[0]?.val });
        } else if (op.type === "del") {
          await tx`DELETE FROM kv_store WHERE ns = ${op.table} AND key = ${op.key}`;
          results.push({});
        }
      }
    });

    return results;
  }
}

const driver = new PostgresDriver();

export default {
  ops: {
    execute: (batch: StorageOp[]) => driver.execute(batch)
  }
};
```

### 9. Polyglot Proof: A Python Plugin (Added)

To prove the new `process` tier works, here is an example Python plugin that implements
the `echo.say` contract using the new Python shim.

**File:** `plugins/provider-python-echo/plugin.json` (ADD)

```json
{
  "id": "provider.python.echo",
  "version": "0.1.0",
  "contracts": ["echo.say"],
  "capabilities": [],
  "runtime": {
    "tier": "process",
    "process": {
      "cmd": ["python3", "./src/echo_plugin.py"],
      "stdio": "ndjson"
    },
    "budget": { "cpuMs": 2000, "memMB": 128 }
  },
  "contentHash": "sha256:..."
}
```

**File:** `plugins/provider-python-echo/src/echo_plugin.py` (ADD)

```python
# plugins/provider-python-echo/src/echo_plugin.py
import sys
import os

# Add the shim to the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../shim/py')))

from vivim_omega_shim import VivimShim
import asyncio

async def say(message: str):
    # Simulate some Python-side processing
    return f"Python received: {message.upper()}"

shim = VivimShim(ops={
    "say": say
})

if __name__ == "__main__":
    asyncio.run(shim.run())
```

---

## Assessor annotations (NOT part of the draft — added during documentation, per the standing assess role)

The draft is recorded verbatim above. These notes map it onto the current base
(`clone-omega` @ `61d1a41`, laws B1–B5, D-361/D-365/D-370/D-372, 16-spec freeze) so the
next session can arbitrate without re-deriving. None of these notes change the draft.

### What the draft gets right

1. **B2 preserved in spirit:** external processes are separate OS processes bridged by
   NDJSON over stdio — genuinely no shared heap. Same for the storage split: logic
   (CAS/Merkle) in the vault spine, bytes behind a capability.
2. **Foundations as plugins, not host features:** Python/Postgres arrive as driver +
   runtime plugins, exactly the plugin-pure direction in `STRATEGY` §2. The draft's
   `storage.kv` capability is the "one op = one plugin surface" shape.
3. **Budget declarations in manifests** continue the existing `runtime.budget` pattern.

### Conflicts to arbitrate before landing (each needs a decision record, not a workaround)

1. **Host growth vs B5/D-365.** `host/src/process.ts` is new host code (and `worker.ts`
   is rewritten). B5 is a hard gate: no new host surface without same-commit removal.
   The draft's claim "<1,000 LOC budget" is not evidence — the gate measures. Options:
   (a) move the process spawner into an **orchestrator/broker plugin** (the sanctioned
   "plugin of plugins" shape) that uses `platform/` primitives; (b) supersede B5/D-365
   explicitly with a falsifier showing why the host must own process spawning. The
   broker option keeps the µhost boring and matches `vivim-run`'s charter.
2. **OS awareness vs D-372.** `spawn()` is OS-aware (env, paths, process lifecycle).
   Gate `os-surface` currently forbids OS knowledge outside `platform/`. The spawner's
   OS-specific parts belong in `platform/` (`omegaSpawn`, Job Objects / rlimits,
   Windows-vs-POSIX paths); the compartment framing in the shim; the broker plugin holds
   the lifecycle.
3. **`bun` import vs `bun-surface` gate (D-361).** `import { spawn, Subprocess } from
   "bun"` fails the gate (prod `*/src` is Bun-free except the one vault sqlite adapter).
   Node-canonical spelling (`node:child_process`) or a platform-mediated spawn is
   required — and matches the "production tree is runtime-neutral" doctrine.
4. **One-sqlite-adapter ruling (D-361) vs pluggable drivers.** Today `bun:sqlite` exists
   in exactly one declared file. A `storage-sqlite` driver plugin is a second importer.
   This draft effectively **supersedes D-361's exception** with "drivers implement
   `storage.kv`" — legal, but it must be a supersede with the gate allowlist rewritten,
   not a silent second importer.
5. **Storage contract shape vs existing vault contracts.** The draft's `StorageOp`
   (`table/key/value/prefix`) is a generic KV; the existing vault is ns-keyed with
   `{ns,id,rev}` refs, Merkle changelog, FTS, compaction-honors-refs semantics
   (`VAULT-NAMESPACES.md`). The spine draft shows `put` only — `get/query/verify/
   roundtrip/compact` and the changelog must survive the delegation, and **compaction
   must still refuse to delete a revision cited by a live object** even when the bytes
   live in Postgres. The contract needs rev/refs fields or the spine must own them.
6. **Postgres secrets vs the credentials spine.** `process.env.PG_PASSWORD` in a driver
   plugin violates the credential law (material never rides env/manifest/composition;
   `credential.put/use/redact@1` + REDACTION_POLICY exists for exactly this). The DSN
   must arrive as a `credential.use` REFERENCE resolved at call time; sim-synthetic only
   in dev compositions.
7. **No network capability declared.** `storage.postgres` opens TCP but its manifest
   declares no network egress capability and no LAW_POLICY risk rows. Under fail-closed,
   this boot must be REFUSED today. Needs: capability (`net.egress:pg` or similar),
   MUTATION/READ risk rows, forbidden entries (day-one: no cross-principal rows, no
   arbitrary DDL in the query path — parameterized only).
8. **Manifest drift.** The draft's `PluginManifest` drops `publisher`, `contributions`,
   `dependencies`, `justification` and changes field names vs the shipped shape
   (`plugins/provider-llm/plugin.json`). Either the draft's shape supersedes (with
   migration of all 21 plugin manifests + decisions-checker updates) or the new fields
   are additive (`runtime.process`, `runtime.wasm`) to the existing manifest. Additive is
   cheaper and keeps D-370 tooling intact.
9. **`wasm` tier declared but unimplemented.** Fine to declare in the contract, but the
   first falsifier is `process`-only; `wasm` should ship with its own decision record
   later (isolation story, budget enforcement, fuel limits).
10. **Python shim robustness.** `connect_write_pipe` on Windows needs the Proactor loop;
    `writer.drain()` should be awaited; malformed-IPC should be counted/deadline'd
    (D-360 watchdog semantics) rather than only emitted; stderr `inherit` leaks plugin
    chatter into host logs — capture + journal instead. Falsifier must include a
    hostile-input case (garbage lines, oversized line, no-EOF hang).
11. **Composition/grant wiring absent.** New plugins need composition entries (grant
    matrices) — and the 16-spec freeze (D-370) means these land via the W0-1 generator,
    not hand-edited specs.
12. **CAS collision via content hash only.** `refs` stores hash without namespace/rev;
    two namespaces citing identical bytes is fine for blobs but `refs` as shown loses
    rev history — changelog discipline must live spine-side (it already exists; the
    spine draft must not delete it).

### Minimal falsifier set (before any PROPOSED→RATIFIED)

1. **Polyglot boot:** `provider-python-echo` boots through the process tier on a real
   recipe (Windows first per D-371/372), answers `echo.say` through the Port Protocol,
   and a malformed-IPC flood is deadline-BUDGET'd, not hung.
2. **Driver swap:** the same `vault.append` workload runs green twice — once on
   `storage.sqlite`, once on `storage.postgres` — with byte-identical CAS hashes and a
   verify/roundtrip pass in both; then the `compaction-honors-refs` test passes on the
   Postgres driver.
3. **Budget refusal:** a process plugin exceeding `cpuMs`/`memMB` is killed and reported
   BUDGET (watchdog detection time bounded), not silently leaked.
4. **Secret law:** boot WITHOUT the credential reference is REFUSED; with it, the DSN
   never appears in any manifest, composition, or journal row.
5. **Host LOC:** gate reports host LOC unchanged from 911/1100 (broker option) or names
   the same-commit removal that buys the addition (supersede option).

### Disposition

- **Adopt direction:** multi-runtime (`process`) tier + pluggable `storage.kv` drivers
  are exactly the foundational expansion Wave0 needs (`W0-10` candidate: foundation tier
  ruling — PROCESS_RUNTIME | STORE classes, broker monopoly, pinned content, no-bypass
  provenance rule).
- **Do not land as written:** it bypasses B5, D-361, D-372, the credentials spine, and
  the composition freeze. Re-cut per the arbitration list, then land as PROPOSED records
  + code behind the gate.
- **Suggested landing order:** (1) W0-10 foundation-tier decision record + additive
  manifest fields + contracts (storage.ts + runtime tiers) with writer/reader/test;
  (2) platform-mediated spawn + broker plugin (host-zero); (3) vault spine refactor with
  full op coverage + compaction honors refs; (4) sqlite driver (supersede D-361
  allowlist); (5) postgres driver behind credentials + net capability + policy rows;
  (6) python shim + echo falsifier; (7) compositions via generator; (8) gate + bench
  evidence in `../40-EVIDENCE/`.
