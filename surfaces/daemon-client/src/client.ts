// surfaces/daemon — client.ts: shared daemon client (CLI + tests).
// Line-delimited JSON over TCP 127.0.0.1. One daemon per vault (vaults are the
// unit of trust — anyone who can read the vault dir already holds its root keys,
// so the daemon secret adds no new trust assumption; it only stops casual
// cross-talk between same-machine processes).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect } from "node:net";
import { spawn } from "node:child_process"; // D-361: node:child_process (runtime-neutral)

export const DAEMON_FILE = "daemon.json";
const LOCK_DIR = "daemon.lock";

export interface DaemonInfo {
  port: number;
  pid: number;
  secret: string;
  startedAt: number;
  specPath: string | null;
  recipeSha: string;
}

export interface DaemonRequest { id: number; secret: string; op: string; payload?: unknown }
export interface DaemonResponse { id: number; ok: boolean; value?: unknown; error?: string; detail?: string }

/** Constant-time secret compare (length-gated; localhost threat model, belt and suspenders). */
export function checkSecret(provided: unknown, actual: string): boolean {
  if (typeof provided !== "string" || provided.length !== actual.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "utf-8"), Buffer.from(actual, "utf-8"));
  } catch {
    return false;
  }
}

export function mintSecret(): string {
  return randomBytes(32).toString("hex");
}

export function sha256Hex(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

export function readDaemonInfo(vaultDir: string): DaemonInfo | null {
  try {
    const raw = readFileSync(join(vaultDir, DAEMON_FILE), "utf-8");
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.port !== "number" || typeof o.pid !== "number" || typeof o.secret !== "string") return null;
    return {
      port: o.port, pid: o.pid, secret: o.secret,
      startedAt: typeof o.startedAt === "number" ? o.startedAt : 0,
      specPath: typeof o.specPath === "string" ? o.specPath : null,
      recipeSha: typeof o.recipeSha === "string" ? o.recipeSha : "",
    };
  } catch {
    return null;
  }
}

function unlinkDaemonInfo(vaultDir: string): void {
  try { rmSync(join(vaultDir, DAEMON_FILE), { force: true }); } catch { /* already gone */ }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** One request/response round trip with a bounded wait. Rejects on timeout/refusal. */
export function callDaemon(info: DaemonInfo, op: string, payload?: unknown, timeoutMs = 8000): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    let done = false;
    const finish = (fn: () => void): void => { if (!done) { done = true; fn(); } };
    const timer = setTimeout(() => finish(() => reject(new Error(`daemon: ${op} timed out after ${timeoutMs}ms`))), timeoutMs);
    let sock: ReturnType<typeof connect>;
    try {
      sock = connect({ host: "127.0.0.1", port: info.port });
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let buf = "";
    sock.on("connect", () => {
      sock.write(JSON.stringify({ id, secret: info.secret, op, payload } satisfies DaemonRequest) + "\n");
    });
    sock.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let resp: DaemonResponse;
        try {
          resp = JSON.parse(line) as DaemonResponse;
        } catch {
          continue;
        }
        if (resp.id !== id) continue; // not ours (pipelining guard)
        clearTimeout(timer);
        sock.destroy();
        finish(() => resolve(resp));
        return;
      }
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      finish(() => reject(e));
    });
    sock.on("close", () => {
      clearTimeout(timer);
      finish(() => reject(new Error(`daemon: connection closed before ${op} answered`)));
    });
  });
}

/** Graceful stop: shutdown op, then remove the file. Returns true when a live daemon answered. */
export async function stopDaemon(vaultDir: string, timeoutMs = 8000): Promise<boolean> {
  const info = readDaemonInfo(vaultDir);
  if (!info) return false;
  try {
    await callDaemon(info, "shutdown", {}, timeoutMs);
  } catch {
    return false;
  }
  unlinkDaemonInfo(vaultDir);
  return true;
}

/** Liveness probe for `daemon status`: live daemon detail, or { live: false }. */
export async function daemonStatus(vaultDir: string): Promise<{ live: boolean; info?: DaemonInfo; detail?: unknown }> {
  const info = readDaemonInfo(vaultDir);
  if (!info) return { live: false };
  try {
    const r = await callDaemon(info, "ping", {}, 1500);
    if (!r.ok) return { live: false };
    return { live: true, info, detail: r.value };
  } catch {
    return { live: false };
  }
}
/** Liveness + auth + staleness probe. Returns null on ANY failure (cold fallback owns the error surface). */
export async function pingDaemon(info: DaemonInfo, timeoutMs = 1500): Promise<{ specPath: string | null; recipeSha: string } | null> {
  try {
    const r = await callDaemon(info, "ping", {}, timeoutMs);
    if (!r.ok) return null;
    const v = r.value as { specPath?: unknown; recipeSha?: unknown };
    return {
      specPath: typeof v.specPath === "string" ? v.specPath : null,
      recipeSha: typeof v.recipeSha === "string" ? v.recipeSha : "",
    };
  } catch {
    return null;
  }
}

// ---- source snapshot (cheap staleness signal; no content rehash) ----

export type SourceSnapshot = Record<string, { mtimeMs: number; size: number }>;
const SNAPSHOT_EXCLUDE = new Set(["node_modules", ".git", "plugin.json", "package.json", "package.json.orig", ".DS_Store", "build"]);

/** mtimeMs+size per file under dirs (make-like heuristic: restat is syscalls, not content reads). */
export function snapshotSources(dirs: string[]): SourceSnapshot {
  const out: SourceSnapshot = {};
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as unknown as ReturnType<typeof readdirSync>;
    } catch {
      return;
    }
    for (const e of entries as unknown as Array<{ name: string; isDirectory(): boolean }>) {
      if (SNAPSHOT_EXCLUDE.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      try {
        const st = statSync(p);
        if (st.isFile()) out[p] = { mtimeMs: st.mtimeMs, size: st.size };
      } catch { /* raced deletion — absence is itself a change, caught by key mismatch */ }
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/** True iff same key set with identical mtimeMs+size (granularity caveat documented at call site). */
export function sameSnapshot(a: SourceSnapshot, b: SourceSnapshot): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = a[k];
    const y = b[k];
    if (!x || !y || x.mtimeMs !== y.mtimeMs || x.size !== y.size) return false;
  }
  return true;
}

// ---- ensure (connect → spawn → wait), lock-guarded ----

/** mkdir-based mutex (atomic on all platforms). Stale locks (dead pid) are taken over. */
function acquireLock(vaultDir: string): boolean {
  const lock = join(vaultDir, LOCK_DIR);
  try {
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(process.pid));
    return true;
  } catch {
    try {
      const pid = Number(readFileSync(join(lock, "pid"), "utf-8").trim());
      if (!Number.isInteger(pid) || !pidAlive(pid)) {
        rmSync(lock, { recursive: true, force: true });
        mkdirSync(lock);
        writeFileSync(join(lock, "pid"), String(process.pid));
        return true;
      }
    } catch { /* lock genuinely held — fall through */ }
    return false;
  }
}

function releaseLock(vaultDir: string): void {
  try { rmSync(join(vaultDir, LOCK_DIR), { recursive: true, force: true }); } catch { /* best effort */ }
}

export interface EnsureOpts {
  specPath?: string;
  recipePath?: string;
  idleMs?: number;
  daemonSrc?: string; // entry file to spawn (default: this package's daemon.ts)
  spawnTimeoutMs?: number;
}

const DEFAULT_SPAWN_WAIT_MS = 15000;

/** Connect to the live daemon for vaultDir, spawning one (detached) if absent.
 *  Never throws for daemon-side reasons — returns null so the caller falls back
 *  to the cold path with its own honest errors. */
export async function ensureDaemon(vaultDir: string, opts: EnsureOpts = {}): Promise<DaemonInfo | null> {
  // The lock lives INSIDE the vault dir, so the dir must exist before anything
  // else (a missing dir made mkdir(lock) throw ENOENT → silent "no daemon").
  try {
    mkdirSync(vaultDir, { recursive: true });
  } catch {
    return null;
  }
  const existing = readDaemonInfo(vaultDir);
  if (existing) {
    if (pidAlive(existing.pid) && (await pingDaemon(existing)) !== null) return existing;
    unlinkDaemonInfo(vaultDir); // stale file: dead pid or refused ping
  }
  if (!acquireLock(vaultDir)) {
    // someone else is spawning: wait for their daemon.json, then use it
    const deadline = Date.now() + (opts.spawnTimeoutMs ?? DEFAULT_SPAWN_WAIT_MS);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      const info = readDaemonInfo(vaultDir);
      if (info && (await pingDaemon(info)) !== null) return info;
    }
    return null;
  }
  try {
    // Default server entry: the daemon package sits beside this one
    // (surfaces/daemon/src/daemon.ts). Callers may override via daemonSrc
    // (tests do). Missing entry → null (cold fallback), never a crash.
    const src = opts.daemonSrc ?? join(import.meta.dir, "..", "..", "daemon", "src", "daemon.ts");
    if (!existsSync(src)) return null;
    const args = ["run", src, "start", "--vault", resolve(vaultDir)];
    if (opts.specPath) args.push("--composition", resolve(opts.specPath));
    if (opts.recipePath) args.push("--recipe", resolve(opts.recipePath));
    if (opts.idleMs !== undefined) args.push("--idle-ms", String(opts.idleMs));
    // cwd = repo root: relative composition paths + workspace resolution behave
    // exactly as when the user runs the CLI by hand.
    // D-361: node:child_process (runtime-neutral); `exitCode` semantics match.
    const child = spawn(["bun", ...args], {
      cwd: join(import.meta.dir, "..", "..", ".."),
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    const deadline = Date.now() + (opts.spawnTimeoutMs ?? DEFAULT_SPAWN_WAIT_MS);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      const info = readDaemonInfo(vaultDir);
      if (info && (await pingDaemon(info)) !== null) return info;
      if (child.exitCode !== null) break; // spawner died — stop waiting
    }
    return null;
  } finally {
    releaseLock(vaultDir);
  }
}
