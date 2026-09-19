// D-397 supervisor: restarts the Ω process on crash exits, never on clean 0.
// Backoff 2^n to a cap, then stops LOUD (file + log), mirroring vivim-run quarantine.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface SuperviseOptions {
  cmd: string[];
  cwd?: string;
  maxRestarts?: number;
  baseBackoffMs?: number;
  alertFile?: string;
  log?: (m: string) => void;
  spawn?: (cmd: string[], opts: { cwd?: string }) => { exited: Promise<number> };
}

export async function supervise(opts: SuperviseOptions): Promise<{ restarts: number; stoppedLoud: boolean }> {
  const max = opts.maxRestarts ?? 5;
  const base = opts.baseBackoffMs ?? 200;
  const spawn = opts.spawn ?? (async (cmd, o) => {
    const p = Bun.spawn(cmd, { cwd: o.cwd, stdout: "ignore", stderr: "ignore" });
    return { exited: p.exited };
  });
  let restarts = 0;
  for (;;) {
    const handle = await spawn(opts.cmd, { cwd: opts.cwd });
    const code = await handle.exited;
    if (code === 0) return { restarts, stoppedLoud: false };
    restarts++;
    if (restarts > max) {
      const msg = `supervisor: crash-loop past ${max} restarts, stopping LOUD`;
      opts.log?.(msg);
      if (opts.alertFile) { mkdirSync(join(opts.alertFile, ".."), { recursive: true }); writeFileSync(opts.alertFile, `${new Date().toISOString()} ${msg}\n`); }
      return { restarts, stoppedLoud: true };
    }
    opts.log?.(`supervisor: exit ${code}, restart ${restarts}/${max} in ${base * 2 ** (restarts - 1)}ms`);
    await new Promise((r) => setTimeout(r, base * 2 ** (restarts - 1)));
  }
}
