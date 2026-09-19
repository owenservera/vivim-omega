// surfaces/daemon — test/daemon.test.ts (D-322, Upgrade A gate evidence)
// The warm path, proved in-process: protocol (ping/call/status/shutdown), auth,
// staleness reboot via use(), idle shutdown, snapshot purity. CLI-via-daemon
// parity lives in surfaces/cli/test/cli.test.ts (same stdout, warm vs cold).
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { startDaemon, type DaemonHandle } from "../src/daemon.ts";
import {
  callDaemon, checkSecret, readDaemonInfo, sameSnapshot,
  snapshotSources, stopDaemon, type DaemonInfo,
} from "@vivim/daemon-client";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const ECHO_SPEC = join(OMEGA_ROOT, "surfaces/cli/test/fixtures/echo.json");
const RISK_SPEC = join(OMEGA_ROOT, "surfaces/cli/test/fixtures/risk.json");

const handles: DaemonHandle[] = [];
// Explicit generous budget: closing several booted hosts parks seconds per worker
// terminate under parallel load — must never trip Bun's 5s default hook timeout
// (which surfaces as an "(unnamed)" failure with no test name attached).
afterAll(async () => {
  for (const h of handles) await h.close().catch(() => {});
  for (const d of vaultDirs) rmSync(d, { recursive: true, force: true });
}, 120_000);

const vaultDirs: string[] = [];
function tempVault(name: string): string {
  const v = omegaTmp("omega-daemon-test", `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(v, { recursive: true, force: true });
  mkdirSync(v, { recursive: true });
  vaultDirs.push(v);
  return v;
}

async function start(spec: string = ECHO_SPEC, idleMs = 300_000): Promise<{ handle: DaemonHandle; info: DaemonInfo }> {
  const vaultDir = tempVault("case");
  const handle = await startDaemon({ vaultDir, specPath: spec, idleMs });
  handles.push(handle);
  const info = readDaemonInfo(vaultDir);
  expect(info).not.toBeNull();
  expect(info!.port).toBe(handle.port);
  // D-384: daemon.json carries the 32-byte bearer secret — owner-only, same
  // treatment as the vault's root signing key (mode 0o600 + ownerOnly seam).
  // Windows: chmod is best-effort over ACLs (proven platform fact) — POSIX bits
  // are asserted where they exist, existence where they cannot.
  const st = statSync(join(vaultDir, "daemon.json"));
  if (process.platform === "win32") expect(st.isFile()).toBe(true);
  else expect(st.mode & 0o777).toBe(0o600);
  return { handle, info: info! };
}

async function rpc(info: DaemonInfo, op: string, payload?: unknown): Promise<{ ok: boolean; value?: any; error?: string; detail?: string }> {
  return callDaemon(info, op, payload, 10000);
}

describe("daemon — protocol (ping/call/status/shutdown) + auth", () => {
  test("ping answers with identity; wrong secret is REFUSED; unknown op is DEGRADED", async () => {
    const { info } = await start();
    const p = await rpc(info, "ping");
    expect(p.ok).toBe(true);
    expect((p.value as { recipeName: string }).recipeName).toBe("echo-cli");
    const bad = await rpc({ ...info, secret: "wrong" }, "ping");
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("REFUSED");
    const unknown = await rpc(info, "nope", {});
    expect(unknown.ok).toBe(false);
    expect(checkSecret(info.secret, info.secret)).toBe(true);
    expect(checkSecret("wrong", info.secret)).toBe(false);
  }, 30_000);

  test("call forwards through the router; callsServed counts; status carries recipe+manifests", async () => {
    const { info } = await start();
    const r = await rpc(info, "call", { op: "echo.ping@1", payload: { hello: "warm" } });
    expect(r.ok).toBe(true);
    const v = r.value as { result: { ok: boolean; value: { payload: { hello: string } } }; serverMs: number };
    expect(v.result.ok).toBe(true);
    expect(v.result.value.payload.hello).toBe("warm");
    expect(typeof v.serverMs).toBe("number");
    const s = await rpc(info, "status", {});
    expect(s.ok).toBe(true);
    const sv = s.value as {
      router: { routedOps: string[] };
      recipe: { name: string };
      manifests: Record<string, { version: string }>;
      daemon: { callsServed: number };
    };
    expect(sv.router.routedOps).toContain("echo.ping@1");
    expect(sv.recipe.name).toBe("echo-cli");
    expect(sv.manifests["omega.echo"]?.version).toBe("0.2.0"); // D-352: echo.stream@1 falsifier op landed (0.1.0 → 0.2.0)
    expect(sv.daemon.callsServed).toBe(1);
  }, 30_000);

  test("malformed call payload fails closed (DEGRADED, never a throw out of the socket)", async () => {
    const { info } = await start();
    const r = await rpc(info, "call", { payload: {} });
    expect(r.ok).toBe(false);
  }, 30_000);

  test("stopDaemon shuts down a real child daemon process; daemon file is removed", async () => {
    // Cross-process by necessity: the shutdown op ends the DAEMON's process, so
    // exercising it in-process would exit the test runner itself.
    const vaultDir = tempVault("stop");
    const child = Bun.spawn(
      ["bun", "run", join(OMEGA_ROOT, "surfaces/daemon/src/daemon.ts"), "start",
        "--vault", vaultDir, "--composition", ECHO_SPEC, "--idle-ms", "120000"],
      { cwd: OMEGA_ROOT, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );
    try {
      let info: DaemonInfo | null = null;
      for (let i = 0; i < 100 && !info; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const cand = readDaemonInfo(vaultDir);
        if (cand && (await callDaemon(cand, "ping", {}, 1500).then((r) => r.ok).catch(() => false))) info = cand;
        if (child.exitCode !== null) break;
      }
      expect(info).not.toBeNull();
      expect(child.exitCode).toBeNull(); // still alive before stop
      expect(await stopDaemon(vaultDir)).toBe(true);
      expect(readDaemonInfo(vaultDir)).toBeNull();
      let exited: number | null = null;
      for (let i = 0; i < 50 && exited === null; i++) {
        await new Promise((r) => setTimeout(r, 200));
        exited = child.exitCode;
      }
      expect(exited).toBe(0); // clean shutdown exit
      expect(await stopDaemon(vaultDir)).toBe(false); // idempotent: nothing there
    } finally {
      try { child.kill(); } catch { /* already exited */ }
    }
  }, 60_000);
});

describe("daemon — use() staleness (recipe identity, restat drift, spec switch)", () => {
  test("same spec → rebooted:false; different spec → rebooted:true with new recipe", async () => {
    const { info } = await start();
    const same = await rpc(info, "use", { specPath: ECHO_SPEC });
    expect(same.ok).toBe(true);
    expect((same.value as { rebooted: boolean }).rebooted).toBe(false);
    const other = await rpc(info, "use", { specPath: RISK_SPEC });
    expect(other.ok).toBe(true);
    expect((other.value as { rebooted: boolean }).rebooted).toBe(true);
    expect(((other.value as { recipeName: string }).recipeName)).not.toBe("echo-cli");
    // and back again reboots once more (no sticky state)
    const back = await rpc(info, "use", { specPath: ECHO_SPEC });
    expect((back.value as { rebooted: boolean }).rebooted).toBe(true);
  });

  test("snapshot purity: same tree twice is identical; touched file differs", async () => {
    const dir = omegaTmp("omega-daemon-test", `snap-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, "a.ts"), "const a = 1;\n");
      const s1 = snapshotSources([dir]);
      const s2 = snapshotSources([dir]);
      expect(sameSnapshot(s1, s2)).toBe(true);
      // forced mtime change (size may collide on some filesystems — mtime won't)
      const later = new Date(Date.now() + 5000);
      writeFileSync(join(dir, "a.ts"), "const a = 2;\n");
      const { utimesSync } = await import("node:fs");
      utimesSync(join(dir, "a.ts"), later, later);
      expect(sameSnapshot(s1, snapshotSources([dir]))).toBe(false);
      // removals change the key set
      rmSync(join(dir, "a.ts"));
      expect(sameSnapshot(s1, snapshotSources([dir]))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("daemon — idle shutdown", () => {
  test("short idle budget shuts down and removes the daemon file", async () => {
    // Child process by necessity, like the stop test: idle shutdown ends in
    // process.exit, which must never run in the test process itself.
    const vaultDir = tempVault("idle");
    const child = Bun.spawn(
      ["bun", "run", join(OMEGA_ROOT, "surfaces/daemon/src/daemon.ts"), "start",
        "--vault", vaultDir, "--composition", ECHO_SPEC, "--idle-ms", "800"],
      { cwd: OMEGA_ROOT, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );
    try {
      // NOTE: poll the daemon FILE only — pinging would reset the idle clock
      // (every authed request arms it), defeating the shutdown under test.
      // File removal is the last cleanup step, so absence ⟺ shutdown complete.
      let gone = false;
      for (let i = 0; i < 150 && !gone; i++) {
        await new Promise((r) => setTimeout(r, 200));
        gone = readDaemonInfo(vaultDir) === null;
      }
      expect(gone).toBe(true);
      let exited: number | null = null;
      for (let i = 0; i < 50 && exited === null; i++) {
        await new Promise((r) => setTimeout(r, 200));
        exited = child.exitCode;
      }
      expect(exited).toBe(0); // clean idle exit, not a crash
    } finally {
      try { child.kill(); } catch { /* already exited */ }
    }
  }, 90_000);
});



