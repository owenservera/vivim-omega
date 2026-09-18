#!/usr/bin/env bun
// surfaces/daemon/src/daemon.ts — the warm-path host process (Upgrade A, D-322).
//
// One long-lived host per vault, spoken to over TCP 127.0.0.1: the CLI's expensive
// half (process start, compile, verify, worker spawn) happens ONCE here instead of
// per invocation. Reuses the host public API exactly like the CLI surface does
// (compileComposition → bootWithRecovery → router.callAsRoot) — no new trust
// primitive, no host changes, same gate on every call.
//
// Staleness (the one real risk): the daemon serves what it booted. Every `use`
// restats the running composition's plugin sources (mtime+size syscalls, never a
// content rehash) and reboots on drift; a different spec/recipe always reboots.
// Recipe identity itself is sha256 over the compiled recipe bytes (cheap — KBs).
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net"; // D-361: node:net listener (runtime-neutral)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { bootWithRecovery, compileComposition, contentHashDir, ensureVault, setPoolHook } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import { ownerOnly } from "@vivim/omega-platform"; // D-372 seam: the one sanctioned permission call (D-384: the daemon secret file gets the same treatment as the root signing key)
import type { CompositionSpec } from "@vivim/omega-contracts";
import {
  DAEMON_FILE, checkSecret, mintSecret, snapshotSources, sameSnapshot, type SourceSnapshot,
} from "@vivim/daemon-client";
import { CompileCache, specCacheKey, type CacheEntryHashes } from "./cache.ts";
import { IsolatePool } from "./pool.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DEFAULT_COMPOSITION = join(REPO_ROOT, "compositions", "spine.json");
const DEFAULT_IDLE_MS = 10 * 60_000;

interface Running {
  host: BootedHost;
  specPath: string | null;
  recipeSha: string;
  snapshot: SourceSnapshot;
  specDir: string;
  secret: string;
  callsServed: number;
  startedAt: number;
  idleMs: number;
}

let running: Running | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let vaultDir = "";
let shuttingDown = false;
let listener: Server | null = null;

// D-330 content-hash compile cache (per daemon process): specKey → verified
// entry hashes + mtime baseline + buildDir. A hit skips compileComposition
// (rehash + resign + rewrite); boot verify and worker spawn are NEVER skipped
// (fail-closed verification, B2 fresh isolates). Exported for test isolation
// (clear between cases sharing this process).
export const compileCache = new CompileCache(8);
/** Last lookup outcome (observability for the pool-backed partial boot to come). */
let lastCacheEvent: { kind: string; matched?: string[] } = { kind: "cold" };

// D-329 warm isolate pool (per daemon process): parked generic isolates for the
// host's pool-aware checkout. The hook is host-module-global, so the LAST
// starter wins when several daemons share a process (tests) — pools are
// fungible (generic isolates; vault isolation comes from per-boot init/tokens,
// never from the pool), so sharing is correct, merely cross-coupled. cleanup()
// clears the hook and terminates parked stock; assigned workers belong to their
// host owner and shut down with it.
export const DEFAULT_POOL_SIZE = 4;
// D-388 tuning rule (perf review round 2 §2.2, MEASURED): refill() runs
// synchronously inside acquire(), so a burst larger than the pool never
// cold-falls-back — instead EVERY burst checkout pays a fresh inline thread
// spawn (~26.5 ms cold spawn on record). coldFallbacks only rises when Worker
// construction itself fails, which is the worse signal. Either way: size the
// pool ≥ the deployment's expected peak CONCURRENT compartment boots
// (--pool-size / startDaemon.poolSize is the knob); the daemon `status` op
// carries the live pool snapshot and omega:bench reports the burst wall cost,
// so an undersized pool is measured, not guessed.
let isolatePool: IsolatePool | null = null;

export interface DaemonHandle {
  port: number;
  info: { port: number; pid: number; startedAt: number; specPath: string | null; recipeSha: string };
  close(): Promise<void>;
}

function sha256Hex(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function sourceDirsFor(spec: CompositionSpec, specDir: string): string[] {
  const out: string[] = [];
  for (const e of spec.entries) {
    if (typeof e.source === "string" && e.source.length > 0) out.push(resolve(specDir, e.source));
  }
  return [...new Set(out)];
}

function readSpec(specPath: string): { spec: CompositionSpec; specDir: string } {
  if (!existsSync(specPath)) throw new Error(`daemon: composition spec not found: ${specPath}`);
  let spec: CompositionSpec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf-8")) as CompositionSpec;
  } catch (e) {
    throw new Error(`daemon: composition spec unparseable: ${String(e)}`);
  }
  return { spec, specDir: dirname(resolve(specPath)) };
}

async function bootFromSpec(vault: string, specPath: string): Promise<{ host: BootedHost; recipeSha: string; snapshot: SourceSnapshot; specDir: string }> {
  const { spec, specDir } = readSpec(specPath);
  const resolvedVault = resolve(vault);
  // Vault-scoped key: build dirs live under vault/build/<name> and recipes
  // pin vault keys — a record must never serve a different vault.
  const key = `${resolvedVault}\\x00${specCacheKey(spec)}`;
  const freshSnap = snapshotSources(sourceDirsFor(spec, specDir));
  const prev = compileCache.peek(key);
  const mtimeMatch = prev !== undefined && sameSnapshot(prev.mtime, freshSnap);
  // Rehash ONLY when the cheap restat moved (hit path skips hashing AND compile).
  let freshHashes: CacheEntryHashes | null = null;
  if (prev !== undefined && !mtimeMatch) {
    freshHashes = {};
    for (const e of spec.entries) freshHashes[e.id] = contentHashDir(resolve(specDir, e.source));
  }
  const verdict = compileCache.lookup(key, mtimeMatch, freshHashes);
  lastCacheEvent = verdict.kind === "partial" ? { kind: verdict.kind, matched: verdict.matched } : { kind: verdict.kind };
  if (verdict.kind === "hit") {
    if (!mtimeMatch) verdict.record.mtime = freshSnap; // touched-but-identical: refresh the restat baseline
    const recipeFile = join(verdict.record.buildDir, "recipe.json");
    const { host, report } = await bootWithRecovery(vault, recipeFile);
    if (!host) throw new Error(`daemon: boot failed (fail-closed): ${report.reason ?? "unknown"}`);
    return { host, recipeSha: sha256Hex(readFileSync(recipeFile)), snapshot: freshSnap, specDir };
  }
  // Miss or partial: full compile today (compile is atomic; per-entry partial
  // boot awaits D-329's pool + a host partial-boot primitive — the matched
  // list above is its input). The compile's own hashes ARE the verified values.
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, specDir, vault, rootKey);
  const recipeFile = join(vault, "build", spec.name, "recipe.json");
  const { host, report } = await bootWithRecovery(vault, recipeFile);
  if (!host) throw new Error(`daemon: boot failed (fail-closed): ${report.reason ?? "unknown"}`);
  void recipe;
  void buildDir;
  const hashes: CacheEntryHashes = {};
  for (const e of recipe.composition) hashes[e.id] = e.contentHash;
  compileCache.store({ specKey: key, vaultDir: resolvedVault, hashes, mtime: freshSnap, recipeSha: sha256Hex(readFileSync(recipeFile)), buildDir: join(vault, "build", spec.name) });
  return {
    host,
    recipeSha: sha256Hex(readFileSync(recipeFile)),
    snapshot: snapshotSources(sourceDirsFor(spec, specDir)),
    specDir,
  };
}

async function bootFromRecipe(vault: string, recipePath: string): Promise<{ host: BootedHost; recipeSha: string; snapshot: SourceSnapshot; specDir: string }> {
  if (!existsSync(recipePath)) throw new Error(`daemon: recipe not found: ${recipePath}`);
  ensureVault(vault);
  const { host, report } = await bootWithRecovery(vault, recipePath);
  if (!host) throw new Error(`daemon: boot failed (fail-closed): ${report.reason ?? "unknown"}`);
  return { host, recipeSha: sha256Hex(readFileSync(recipePath)), snapshot: {}, specDir: dirname(resolve(recipePath)) };
}

function writeDaemonFile(port: number): void {
  if (!running) return;
  // D-384: daemon.json carries the 32-byte bearer secret for full root-principal RPC —
  // the same sensitivity class as the vault's root signing key, which already writes
  // {mode: 0o600} + ownerOnly(). Plain writeFileSync inherited the process umask
  // (typically 0644, world-readable) — on a shared box any local user could read the
  // secret and reach the daemon over loopback. The gate enforces HOW permissions are
  // set (no raw chmod); remembering to apply them to every sensitive file stays with us.
  const file = join(vaultDir, DAEMON_FILE);
  writeFileSync(file, JSON.stringify({
    port, pid: process.pid, secret: running.secret,
    startedAt: running.startedAt, specPath: running.specPath, recipeSha: running.recipeSha,
  }), { mode: 0o600 });
  ownerOnly(file); // D-372 seam (best-effort on Windows ACLs — the writeFileSync mode above already applied where supported)
}

async function cleanup(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  try { await running?.host.shutdown(); } catch { /* best effort */ }
  setPoolHook(null);
  try { await isolatePool?.shutdown(); } catch { /* best effort */ }
  isolatePool = null;
  try { listener?.close(); } catch { /* best effort */ } // D-361: node:net close
  listener = null;
  try { rmSync(join(vaultDir, DAEMON_FILE), { force: true }); } catch { /* best effort */ }
}

async function shutdown(code: number): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true;
    await cleanup();
  }
  process.exit(code);
}

/** Start a daemon in THIS process (tests + embedding). For the standalone
 *  process entry, see main() below. */
export async function startDaemon(opts: {
  vaultDir: string; specPath?: string; recipePath?: string; idleMs?: number; port?: number;
  poolSize?: number;
}): Promise<DaemonHandle> {
  vaultDir = resolve(opts.vaultDir);
  mkdirSync(vaultDir, { recursive: true });
  const idleMs = opts.idleMs !== undefined && Number.isFinite(opts.idleMs) && opts.idleMs > 0
    ? Math.floor(opts.idleMs)
    : DEFAULT_IDLE_MS;
  // D-329: warm isolate pool BEFORE boot so eager + lazy checkouts alike flow
  // through it (cold fallback while prefilling). poolSize 0 disables (no hook).
  const poolSize = opts.poolSize === undefined ? DEFAULT_POOL_SIZE
    : Number.isFinite(opts.poolSize) && opts.poolSize > 0 ? Math.floor(opts.poolSize) : 0;
  if (poolSize > 0) {
    isolatePool?.shutdown().catch(() => {});
    isolatePool = new IsolatePool(poolSize);
    isolatePool.start();
    const pool = isolatePool;
    setPoolHook({ acquire: (entryAbs) => pool.acquire(entryAbs) });
  }
  const booted = opts.recipePath
    ? await bootFromRecipe(vaultDir, resolve(opts.recipePath))
    : await bootFromSpec(vaultDir, opts.specPath ? resolve(opts.specPath) : DEFAULT_COMPOSITION);
  running = {
    host: booted.host,
    specPath: opts.recipePath ? null : resolve(opts.specPath ?? DEFAULT_COMPOSITION),
    recipeSha: booted.recipeSha,
    snapshot: booted.snapshot,
    specDir: booted.specDir,
    secret: mintSecret(),
    callsServed: 0,
    startedAt: Date.now(),
    idleMs,
  };
  const buffers = new Map<object, string>();
  // D-361: node:net server — same newline-delimited JSON protocol, runtime-neutral,
  // the production tree. Ephemeral port resolved from address() once listening.
  listener = createServer((sock) => {
    sock.on("data", (data: Buffer) => {
      const buf = (buffers.get(sock) ?? "") + data.toString("utf-8");
      const lines = buf.split("\n");
      buffers.set(sock, lines.pop() ?? "");
      void (async () => {
        for (const line of lines) {
          const text = line.trim();
          if (!text) continue;
          let req: WireRequest;
          try {
            req = JSON.parse(text) as WireRequest;
          } catch {
            continue;
          }
          const r = await handle(req);
          try {
            sock.write(JSON.stringify({ id: req.id ?? null, ...r }) + "\n");
          } catch { /* client gone */ }
        }
      })();
    });
    sock.on("close", () => { buffers.delete(sock); });
    sock.on("error", (e) => { buffers.delete(sock); console.error(`[daemon] socket error: ${String(e)}`); }); // D-369: drop buffer on error too (no leak on long-lived daemon)
  });
  const boundPort = await new Promise<number>((res, rej) => {
    listener!.once("listening", () => { const a = listener!.address(); res(typeof a === "object" && a ? a.port : 0); });
    listener!.once("error", rej);
    listener!.listen({ host: "127.0.0.1", port: opts.port ?? 0 });
  });
  const port = boundPort;
  writeDaemonFile(port);
  console.error(`[daemon] up on 127.0.0.1:${port} for vault ${vaultDir} (idle ${running.idleMs}ms)`);
  armIdle();
  const info = {
    port, pid: process.pid,
    startedAt: running.startedAt, specPath: running.specPath, recipeSha: running.recipeSha,
  };
  return {
    port,
    info,
    close: async () => {
      shuttingDown = true;
      await cleanup();
      shuttingDown = false;
    },
  };
}

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!running || running.idleMs <= 0) return;
  idleTimer = setTimeout(() => {
    console.error(`[daemon] idle ${running!.idleMs}ms — shutting down`);
    void shutdown(0);
  }, running.idleMs);
  idleTimer.unref?.();
}

/** Ensure the running composition matches {specPath?, recipePath?}; reboot when it doesn't. */
async function ensureCurrent(specPath: string | null, recipePath: string | null): Promise<{ rebooted: boolean; recipeName: string }> {
  if (!running) throw new Error("daemon: not booted");
  if (recipePath) {
    const want = sha256Hex(readFileSync(recipePath));
    if (want === running.recipeSha) return { rebooted: false, recipeName: running.host.recipe.name };
    const next = await bootFromRecipe(vaultDir, recipePath);
    await running.host.shutdown().catch(() => {});
    running = { ...running, host: next.host, specPath: null, recipeSha: next.recipeSha, snapshot: next.snapshot, specDir: next.specDir };
    return { rebooted: true, recipeName: running.host.recipe.name };
  }
  const wantSpec = specPath ?? running.specPath ?? DEFAULT_COMPOSITION;
  if (resolve(wantSpec) !== resolve(running.specPath ?? "") || Object.keys(running.snapshot).length === 0) {
    const next = await bootFromSpec(vaultDir, wantSpec);
    await running.host.shutdown().catch(() => {});
    running = { ...running, host: next.host, specPath: resolve(wantSpec), recipeSha: next.recipeSha, snapshot: next.snapshot, specDir: next.specDir };
    return { rebooted: true, recipeName: running.host.recipe.name };
  }
  // same spec: cheap drift check (restat, no rehash) before serving
  const { spec, specDir } = readSpec(wantSpec);
  if (!sameSnapshot(running.snapshot, snapshotSources(sourceDirsFor(spec, specDir)))) {
    const next = await bootFromSpec(vaultDir, wantSpec);
    await running.host.shutdown().catch(() => {});
    running = { ...running, host: next.host, specPath: resolve(wantSpec), recipeSha: next.recipeSha, snapshot: next.snapshot, specDir: next.specDir };
    return { rebooted: true, recipeName: running.host.recipe.name };
  }
  return { rebooted: false, recipeName: running.host.recipe.name };
}

interface WireRequest { id: unknown; secret: unknown; op: unknown; payload?: unknown }

async function handle(req: WireRequest): Promise<{ ok: boolean; value?: unknown; error?: string; detail?: string }> {
  if (!running) return { ok: false, error: "DEGRADED", detail: "daemon not booted" };
  if (!checkSecret(req.secret, running.secret)) return { ok: false, error: "REFUSED", detail: "bad daemon secret" };
  armIdle(); // every authed request resets the idle clock (unauthed probes must not extend lifetime)
  const payload = (req.payload ?? {}) as Record<string, unknown>;
  switch (req.op) {
    case "ping":
      return { ok: true, value: { specPath: running.specPath, recipeSha: running.recipeSha, recipeName: running.host.recipe.name, callsServed: running.callsServed, startedAt: running.startedAt, idleMs: running.idleMs } };
    case "use": {
      const specPath = typeof payload.specPath === "string" ? resolve(payload.specPath as string) : null;
      const recipePath = typeof payload.recipePath === "string" ? resolve(payload.recipePath as string) : null;
      try {
        return { ok: true, value: await ensureCurrent(specPath, recipePath) };
      } catch (e) {
        return { ok: false, error: "DEGRADED", detail: `daemon use failed: ${String(e)}` };
      }
    }
    case "call": {
      if (typeof payload.op !== "string" || payload.op.length === 0) {
        return { ok: false, error: "DEGRADED", detail: "call requires {op}" };
      }
      const deadlineMs = typeof payload.deadlineMs === "number" ? payload.deadlineMs : 5000;
      const t0 = Date.now();
      try {
        const r = await running.host.router.callAsRoot(payload.op as string, payload.payload, deadlineMs);
        running.callsServed++;
        return { ok: true, value: { result: r, serverMs: Date.now() - t0 } };
      } catch (e) {
        return { ok: false, error: "DEGRADED", detail: `daemon call threw: ${String(e)}` };
      }
    }
    case "status": {
      const st = running.host.router.status();
      const manifests: Record<string, { version: string; description: string }> = {};
      for (const [id, m] of running.host.manifests) manifests[id] = { version: m.version, description: m.description ?? "" };
      return {
        ok: true,
        value: {
          router: st,
          recipe: { name: running.host.recipe.name, composition: running.host.recipe.composition },
          manifests,
          daemon: {
            callsServed: running.callsServed, startedAt: running.startedAt,
            idleMs: running.idleMs, specPath: running.specPath, recipeSha: running.recipeSha,
            compileCache: { ...compileCache.snapshotStats(), lastEvent: lastCacheEvent },
            pool: isolatePool ? isolatePool.snapshot() : { disabled: true as const },
          },
        },
      };
    }
    case "shutdown":
      setImmediate(() => void shutdown(0));
      return { ok: true, value: { shuttingDown: true } };
    default:
      return { ok: false, error: "DEGRADED", detail: `unknown daemon op ${String(req.op)}` };
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== "start") {
    console.error("usage: bun run surfaces/daemon/src/daemon.ts start --vault <dir> [--composition <file> | --recipe <file>] [--idle-ms <n>] [--port <n>] [--pool-size <n>]");
    process.exit(2);
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 && typeof argv[i + 1] === "string" && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
  };
  const vault = flag("--vault");
  if (!vault) {
    console.error("daemon: --vault <dir> is required");
    process.exit(2);
  }
  await startDaemon({
    vaultDir: vault,
    ...(flag("--composition") ? { specPath: flag("--composition")! } : {}),
    ...(flag("--recipe") ? { recipePath: flag("--recipe")! } : {}),
    ...(flag("--idle-ms") !== undefined ? { idleMs: Number(flag("--idle-ms")) } : {}),
    ...(flag("--port") !== undefined ? { port: Number(flag("--port")) } : {}),
    ...(flag("--pool-size") !== undefined ? { poolSize: Number(flag("--pool-size")) } : {}), // D-388: the per-deployment tuning knob
  });
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`daemon: fatal: ${String(e)}`);
    process.exit(1);
  });
}

