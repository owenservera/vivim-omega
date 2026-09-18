// @vivim/omega-platform — spawn.ts (D-374)
// The ONLY OS-aware process-creation helper in the production tree (D-372 seam:
// everything outside platform/ calls this and never touches node:child_process
// for compartment spawning). Built on node:child_process — the production tree
// stays runtime-neutral (D-361): no Bun API calls, no runtime-platform
// branches (spawning itself is portable; per-OS resource LIMITS are a named
// deferral in D-374 — never fake-enforced here).
//
// Wire discipline (D-374): newline-delimited JSON over stdio. The handle does
// the line framing so callers never parse bytes; stderr is captured (piped),
// never inherited — the broker journals it.
import { spawn, type ChildProcess } from "node:child_process";

export interface SpawnOptions {
  env?: Record<string, string>;       // extra env (secrets ride credential.use resolution upstream — never literals in manifests)
  cwd?: string;
}

export interface OmegaSpawnHandle {
  proc: ChildProcess;
  /** Send one ndjson frame to the child's stdin (adds the newline). */
  writeLine(obj: unknown): void;
  /** Subscribe to complete ndjson frames from the child's stdout (partial lines are buffered until complete). */
  onLine(cb: (obj: unknown, raw: string) => void): void;
  /** Subscribe to RAW non-JSON stdout fragments (malformed lines — the broker bounds them, D-374). */
  onMalformed(cb: (raw: string) => void): void;
  /** Subscribe to stderr chunks (journaled by the broker — captured, never inherited). */
  onStderr(cb: (chunk: string) => void): void;
  onExit(cb: (code: number | null, signal: string | null) => void): void;
  /** Hard-kill the process tree root (SIGKILL-class; the fast path — D-366's 500ms discipline lives in the caller). */
  kill(): void;
}

export function platformSpawn(cmd: string[], opts: SpawnOptions = {}): OmegaSpawnHandle {
  if (!Array.isArray(cmd) || cmd.length === 0 || cmd.some((c) => typeof c !== "string" || c.length === 0)) {
    throw new Error("platform: platformSpawn cmd must be a non-empty array of non-empty strings (fail-closed)");
  }
  const [bin, ...args] = cmd;
  const proc = spawn(bin, args, {
    env: { ...process.env, ...(opts.env ?? {}) },
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    stdio: ["pipe", "pipe", "pipe"], // stderr captured — never inherited (D-374)
    windowsHide: true,
  });

  let stdoutBuf = "";
  let closed = false;
  const lineCbs: Array<(obj: unknown, raw: string) => void> = [];
  const malformedCbs: Array<(raw: string) => void> = [];

  proc.stdout?.setEncoding("utf-8");
  proc.stdout?.on("data", (chunk: string) => {
    stdoutBuf += chunk;
    let idx: number;
    while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
      const raw = stdoutBuf.slice(0, idx).replace(/\r$/, "");
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (raw.length === 0) continue;
      let obj: unknown;
      try { obj = JSON.parse(raw); } catch {
        for (const cb of malformedCbs) cb(raw);
        continue;
      }
      for (const cb of lineCbs) cb(obj, raw);
    }
  });

  const handle: OmegaSpawnHandle = {
    proc,
    writeLine(obj: unknown): void {
      if (closed) throw new Error("platform: spawn handle closed (writeLine after exit is refused)");
      proc.stdin?.write(`${JSON.stringify(obj)}\n`);
    },
    onLine(cb) { lineCbs.push(cb); },
    onMalformed(cb) { malformedCbs.push(cb); },
    onStderr(cb) { proc.stderr?.setEncoding("utf-8"); proc.stderr?.on("data", cb); },
    onExit(cb) {
      proc.on("exit", (code, signal) => { closed = true; cb(code, signal); });
      proc.on("error", () => { closed = true; cb(-1, "error"); });
    },
    kill(): void {
      closed = true;
      try { proc.stdin?.destroy(); } catch { /* already dead */ }
      try { proc.kill("SIGKILL"); } catch { /* already dead — kill() is best-effort by contract */ }
    },
  };
  return handle;
}
