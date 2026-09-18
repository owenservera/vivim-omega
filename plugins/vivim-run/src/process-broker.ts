// vivim.run — process-broker.ts (D-374)
// The polyglot process tier: OS-process compartments spawned by THIS plugin
// (never the host — B5/D-365; the DRAFT-002 arbitration item 1 placement).
// Every message crosses the Port Protocol vocabulary over newline-delimited
// JSON on stdio (B2 holds: shared-nothing is literal at the OS boundary).
//
// Fail-closed everywhere (house law):
//   * pools exist ONLY in signed composition config — unknown pool: REFUSED;
//     the caller can never name a command, only a declared pool id;
//   * undeclared op on a pool with an ops allowlist: REFUSED;
//   * malformed child frames are BOUNDED — past MALFORMED_LIMIT the child is
//     killed and pending calls settle BUDGET (floods degrade, never hang);
//   * deadline honored: past deadlineMs the child is killed, call = BUDGET
//     (D-366's fast-kill discipline: 500ms cap on the kill itself);
//   * child exit before answer: DEGRADED with the exit reason;
//   * stderr is journaled through ctx.log — captured, never inherited.
//
// Budget honesty (D-321/D-374): process budgets are advisory at spawn in this
// slice — declared in config, journaled here, detection bounded by the D-360
// watchdog vocabulary. OS-enforced limits are the named D-374 deferral.
import { platformSpawn, type OmegaSpawnHandle } from "@vivim/omega-platform";
import type { ProcessRuntime } from "@vivim/omega-contracts"; // D-374: the pool config IS the contract's ProcessRuntime shape (+ pool identity/allowlist)

const POOL_ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const MALFORMED_LIMIT = 5;
const START_TIMEOUT_MS = 5_000;
const DEFAULT_DEADLINE_MS = 10_000;
const MAX_DEADLINE_MS = 60_000;
const KILL_CAP_MS = 500;

/** The signed-config pool declaration: the contract's ProcessRuntime wire shape
 *  (cmd, stdio "ndjson", credentialRefs, poolSize) + the pool identity and
 *  allowlist that only exist in composition config. */
export interface BrokerPoolConfig extends ProcessRuntime {
  id: string;
  ops?: string[];          // optional op allowlist (absent = shim-side REFUSED decides)
  startTimeoutMs?: number;
}

export interface ProcessCallRequest {
  pool: string;
  op: string;
  payload?: unknown;
  deadlineMs?: number;
}

export interface ProcessCallResult {
  ok: boolean;
  data?: unknown;
  error?: "REFUSED" | "BUDGET" | "DEGRADED";
  detail?: string;
  pool?: string;
  ms: number;
}

interface PoolEntry {
  handle: OmegaSpawnHandle;
  busy: boolean;
  malformed: number;
  ready: boolean;
  pending: Map<number, (r: ProcessCallResult) => void>;
}

function validatePool(pool: Partial<BrokerPoolConfig>): BrokerPoolConfig {
  if (typeof pool.id !== "string" || !POOL_ID_RE.test(pool.id)) {
    throw new Error(`process-broker: pool id must match ${POOL_ID_RE} (got ${JSON.stringify(pool.id)})`);
  }
  if (!Array.isArray(pool.cmd) || pool.cmd.length === 0 || pool.cmd.some((c) => typeof c !== "string" || c.length === 0)) {
    throw new Error(`process-broker: pool ${pool.id}: cmd must be a non-empty array of non-empty strings`);
  }
  if (pool.stdio !== "ndjson") throw new Error(`process-broker: pool ${pool.id}: stdio must be "ndjson" (got ${JSON.stringify(pool.stdio)})`);
  if (pool.poolSize !== undefined && (typeof pool.poolSize !== "number" || !Number.isInteger(pool.poolSize) || pool.poolSize < 1 || pool.poolSize > 4)) {
    throw new Error(`process-broker: pool ${pool.id}: poolSize must be an integer in [1,4] (got ${String(pool.poolSize)})`);
  }
  if (pool.ops !== undefined && (!Array.isArray(pool.ops) || pool.ops.some((o) => typeof o !== "string" || o.length === 0))) {
    throw new Error(`process-broker: pool ${pool.id}: ops must be an array of non-empty strings when declared`);
  }
  const t = pool.startTimeoutMs;
  if (t !== undefined && (typeof t !== "number" || !Number.isFinite(t) || t < 250 || t > 30_000)) {
    throw new Error(`process-broker: pool ${pool.id}: startTimeoutMs must be a number in [250, 30000] (got ${String(t)})`);
  }
  return pool as BrokerPoolConfig;
}

/** Validate + normalize the signed config (fail-closed on every field). */
export function parseBrokerConfig(config: unknown, log: (m: string) => void): Map<string, BrokerPoolConfig> {
  const pools = new Map<string, BrokerPoolConfig>();
  const raw = (config as { processPools?: unknown } | null)?.processPools;
  if (raw === undefined || raw === null) return pools;
  if (!Array.isArray(raw)) throw new Error("process-broker: config.processPools must be an array (fail-closed)");
  for (const item of raw) {
    const pool = validatePool(item as Partial<BrokerPoolConfig>);
    if (pools.has(pool.id)) throw new Error(`process-broker: duplicate pool id ${pool.id}`);
    pools.set(pool.id, pool);
    log(`[broker] pool declared: ${pool.id} cmd=${JSON.stringify(pool.cmd)} poolSize=${pool.poolSize ?? 1} ops=${pool.ops ? pool.ops.join(",") : "(shim decides)"}`);
  }
  return pools;
}

export class ProcessBroker {
  private lanes = new Map<string, PoolEntry[]>();
  private nextId = 1;
  private shutDown = false;

  constructor(private pools: Map<string, BrokerPoolConfig>, private log: (m: string) => void) {}

  stats(): Record<string, { configured: boolean; live: number; busy: number }> {
    const out: Record<string, { configured: boolean; live: number; busy: number }> = {};
    for (const id of this.pools.keys()) {
      const entries = this.lanes.get(id) ?? [];
      out[id] = { configured: true, live: entries.length, busy: entries.filter((e) => e.busy).length };
    }
    return out;
  }

  async call(req: ProcessCallRequest): Promise<ProcessCallResult> {
    const started = Date.now();
    const poolId = typeof req?.pool === "string" ? req.pool : "";
    const cfg = this.pools.get(poolId);
    if (this.shutDown) return { ok: false, error: "DEGRADED", detail: "process-broker: shut down", pool: poolId || undefined, ms: 0 };
    if (!cfg) return { ok: false, error: "REFUSED", detail: `process-broker: unknown pool ${JSON.stringify(poolId)} (pools live in signed config only)`, pool: poolId || undefined, ms: 0 };
    if (typeof req.op !== "string" || req.op.length === 0) return { ok: false, error: "REFUSED", detail: "process-broker: op must be a non-empty string", pool: poolId, ms: 0 };
    if (cfg.ops && !cfg.ops.includes(req.op)) return { ok: false, error: "REFUSED", detail: `process-broker: op ${req.op} not declared on pool ${poolId} (allowlist: ${cfg.ops.join(",")})`, pool: poolId, ms: 0 };
    const rawDeadline = req.deadlineMs;
    const deadlineMs = rawDeadline === undefined ? DEFAULT_DEADLINE_MS
      : (typeof rawDeadline === "number" && Number.isFinite(rawDeadline) && rawDeadline >= 50 && rawDeadline <= MAX_DEADLINE_MS ? Math.floor(rawDeadline) : NaN);
    if (Number.isNaN(deadlineMs)) return { ok: false, error: "REFUSED", detail: `process-broker: deadlineMs must be a number in [50, ${MAX_DEADLINE_MS}]`, pool: poolId, ms: 0 };

    let entry: PoolEntry;
    try {
      entry = this.checkout(poolId, cfg);
    } catch (e) {
      return { ok: false, error: "DEGRADED", detail: `process-broker: spawn failed for pool ${poolId}: ${String(e)}`, pool: poolId, ms: Date.now() - started };
    }

    const id = this.nextId++;
    const lane = new Promise<ProcessCallResult>((resolve) => {
      entry.pending.set(id, resolve);
      try {
        entry.handle.writeLine({ type: "call", id, op: req.op, payload: req.payload ?? {} });
      } catch (e) {
        resolve({ ok: false, error: "DEGRADED", detail: `process-broker: writeLine failed: ${String(e)}`, ms: Date.now() - started });
      }
    });

    const deadline = new Promise<ProcessCallResult>((resolve) => {
      setTimeout(() => resolve({ ok: false, error: "BUDGET", detail: `process-broker: pool ${poolId} did not answer ${req.op} within ${deadlineMs}ms — killed`, ms: Date.now() - started }), deadlineMs);
    });

    const result = await Promise.race([lane, deadline]);
    // a settled-but-failed or malformed-flagged lane has unknown state — retire it, never reuse
    if (!result.ok) this.retire(poolId, entry, `call ${req.op} failed (${result.error})`);
    else if (entry.malformed > 0) this.retire(poolId, entry, "lane flagged malformed");
    else entry.busy = false;
    return { ...result, pool: poolId, ms: result.ms || (Date.now() - started) };
  }

  async shutdownAll(): Promise<void> {
    this.shutDown = true;
    const jobs: Promise<void>[] = [];
    for (const [poolId, entries] of [...this.lanes]) {
      for (const entry of entries) {
        jobs.push(new Promise<void>((res) => {
          const t = setTimeout(() => { entry.handle.kill(); res(); }, KILL_CAP_MS); // D-366 fast-kill cap
          try {
            entry.handle.onExit(() => { clearTimeout(t); res(); });
            entry.handle.writeLine({ type: "shutdown" });
          } catch { clearTimeout(t); entry.handle.kill(); res(); }
        }));
      }
      this.lanes.delete(poolId);
      void poolId;
    }
    await Promise.all(jobs);
  }

  private checkout(poolId: string, cfg: BrokerPoolConfig): PoolEntry {
    if (this.shutDown) throw new Error("broker shut down");
    const lanes = this.lanes.get(poolId) ?? [];
    const free = lanes.find((e) => !e.busy && e.ready && e.malformed === 0);
    if (free) { free.busy = true; return free; }
    const size = cfg.poolSize ?? 1;
    if (lanes.length >= size) throw new Error(`BUDGET: process pool exhausted for ${poolId} (size ${size})`);
    const entry = this.spawnLane(poolId, cfg);
    lanes.push(entry);
    this.lanes.set(poolId, lanes);
    return entry;
  }

  /** One dispatcher per lane — frame routing, malformed bounding, exit handling. */
  private spawnLane(poolId: string, cfg: BrokerPoolConfig): PoolEntry {
    const startTimeoutMs = cfg.startTimeoutMs ?? START_TIMEOUT_MS;
    this.log(`[broker] spawning pool ${poolId}: ${JSON.stringify(cfg.cmd)}`);
    const handle = platformSpawn(cfg.cmd, {});
    const entry: PoolEntry = { handle, busy: true, malformed: 0, ready: false, pending: new Map() };

    handle.onStderr((chunk) => this.log(`[broker][${poolId}][stderr] ${chunk.trim().slice(0, 200)}`));
    handle.onLine((obj) => {
      const frame = obj as { type?: string; id?: number; result?: ProcessCallResult; shim?: string };
      if (frame?.type === "ready" && typeof frame.shim === "string" && frame.shim.startsWith("vivim-omega-polyglot/")) {
        entry.ready = true;
        this.log(`[broker] pool ${poolId} lane ready (${frame.shim})`);
        return;
      }
      if (frame?.type === "return" && typeof frame.id === "number") {
        const resolve = entry.pending.get(frame.id);
        if (resolve) {
          entry.pending.delete(frame.id);
          resolve(frame.result ?? { ok: false, error: "DEGRADED", detail: "empty return frame", ms: 0 });
        }
        return;
      }
      // a well-formed JSON line that is not a protocol frame counts as malformed (bounded)
      this.flagMalformed(poolId, entry, JSON.stringify(frame ?? null).slice(0, 60));
    });
    handle.onMalformed((raw) => this.flagMalformed(poolId, entry, raw));
    handle.onExit((code, signal) => {
      this.log(`[broker] pool ${poolId}: child exited (code=${code}, signal=${signal})`);
      for (const [, resolve] of entry.pending) {
        resolve({ ok: false, error: "DEGRADED", detail: `process-broker: pool ${poolId} child exited (code=${code}, signal=${signal}) before answering`, ms: 0 });
      }
      entry.pending.clear();
    });

    // readiness gate: bounded cold-start — a lane that never reads ready is retired
    const t = setTimeout(() => {
      if (!entry.ready) {
        this.retire(poolId, entry, `no ready frame within ${startTimeoutMs}ms`);
        for (const [, resolve] of entry.pending) {
          resolve({ ok: false, error: "DEGRADED", detail: `process-broker: pool ${poolId} not ready within ${startTimeoutMs}ms`, ms: 0 });
        }
        entry.pending.clear();
      }
    }, startTimeoutMs);
    handle.onExit(() => clearTimeout(t));
    return entry;
  }

  private flagMalformed(poolId: string, entry: PoolEntry, raw: string): void {
    entry.malformed++;
    this.log(`[broker] pool ${poolId}: malformed frame #${entry.malformed}: ${raw.slice(0, 60)}`);
    if (entry.malformed > MALFORMED_LIMIT) {
      for (const [, resolve] of entry.pending) {
        resolve({ ok: false, error: "BUDGET", detail: `process-broker: pool ${poolId} exceeded malformed-frame budget (${entry.malformed} bad frames)`, ms: 0 });
      }
      entry.pending.clear();
      this.retire(poolId, entry, `malformed-frame budget exceeded (${entry.malformed})`);
    }
  }

  private retire(poolId: string, entry: PoolEntry, reason: string): void {
    const lanes = this.lanes.get(poolId);
    if (lanes) {
      const idx = lanes.indexOf(entry);
      if (idx >= 0) lanes.splice(idx, 1);
    }
    this.log(`[broker] pool ${poolId}: lane retired (${reason})`);
    entry.handle.kill();
  }
}
