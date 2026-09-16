// D-330 — daemon content-hash compile cache: pure key/LRU tables plus the
// live proof that a cache HIT is unobservable to a correct caller
// (byte-identical routed ops + call semantics vs cold boot) and that changed
// sources MISS (never stale). Same-process starts share the module cache;
// cases clear it for isolation.
import { describe, test, expect, afterAll } from "bun:test";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startDaemon, compileCache, type DaemonHandle } from "../src/daemon.ts";
import { CompileCache, specCacheKey } from "../src/cache.ts";
import { callDaemon, readDaemonInfo, type DaemonInfo } from "@vivim/daemon-client";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const ECHO_SPEC = join(OMEGA_ROOT, "surfaces/cli/test/fixtures/echo.json");
const RISK_SPEC = join(OMEGA_ROOT, "surfaces/cli/test/fixtures/risk.json");

const handles: DaemonHandle[] = [];
const vaultDirs: string[] = [];
afterAll(async () => {
  for (const h of handles) await h.close().catch(() => {});
  for (const d of vaultDirs) rmSync(d, { recursive: true, force: true });
  rmSync(join(OMEGA_ROOT, ".tmp-d330"), { recursive: true, force: true });
}, 120_000);

function tempVault(name: string): string {
  const v = omegaTmp("omega-cache-test", `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(v, { recursive: true, force: true });
  mkdirSync(v, { recursive: true });
  vaultDirs.push(v);
  return v;
}

async function rpc(info: DaemonInfo, op: string, payload?: unknown) {
  return callDaemon(info, op, payload, 15000);
}

describe("D-330 pure — spec key stability + LRU bound + verdicts", () => {
  test("specCacheKey: stable, grant-order-insensitive, distinguishes specs", () => {
    const base = {
      name: "s",
      entries: [{
        id: "a", source: "p/a", bootPhase: 1,
        grant: { capabilities: ["port:x@1", "host.y"], contracts: ["x@1"] },
      }],
    } as never;
    const reordered = {
      name: "s",
      entries: [{
        id: "a", source: "p/a", bootPhase: 1,
        grant: { capabilities: ["host.y", "port:x@1"], contracts: ["x@1"] },
      }],
    } as never;
    expect(specCacheKey(base)).toBe(specCacheKey(reordered));
    expect(specCacheKey({ ...base, name: "t" } as never)).not.toBe(specCacheKey(base));
  });

  test("CompileCache: hit/partial/miss + LRU eviction with stats", () => {
    const c = new CompileCache(2);
    expect(c.lookup("k1", false, null)).toMatchObject({ kind: "miss" });
    const rec = (id: string) => ({
      specKey: id, vaultDir: "/v", hashes: { a: "h1", b: "h2" },
      mtime: {}, recipeSha: "r", buildDir: "/b",
    });
    c.store(rec("k1"));
    c.store(rec("k2"));
    // Restat match → hit without hashing.
    expect(c.lookup("k1", true, null)).toMatchObject({ kind: "hit" });
    // Restat moved, hashes identical → hit (touch without change).
    expect(c.lookup("k1", false, { a: "h1", b: "h2" })).toMatchObject({ kind: "hit" });
    // One entry changed → partial naming the survivor.
    const partial = c.lookup("k1", false, { a: "h1", b: "CHANGED" });
    expect(partial).toMatchObject({ kind: "partial" });
    if (partial.kind === "partial") expect(partial.matched).toEqual(["a"]);
    // Bound evicts least-recently-used (k2 untouched since store; k1 hot).
    c.store(rec("k3"));
    expect(c.snapshotStats()).toMatchObject({ evictions: 1, entries: 2 });
    expect(c.lookup("k2", true, null)).toMatchObject({ kind: "miss" });
    expect(c.lookup("k1", true, null)).toMatchObject({ kind: "hit" });
  });
});

describe("D-330 live — warm reboot is unobservable; changed sources miss", () => {
  test("cold → warm switch-back: identical routed ops + call semantics, compile skipped", async () => {
    compileCache.clear();
    const vaultDir = tempVault("warm");
    const t0Cold = Date.now();
    const cold = await startDaemon({ vaultDir, specPath: ECHO_SPEC, idleMs: 300_000 });
    const coldBootMs = Date.now() - t0Cold;
    handles.push(cold);
    const info = readDaemonInfo(vaultDir)!;
    const ping1 = await rpc(info, "ping");
    expect(ping1.ok).toBe(true);
    const call1 = await rpc(info, "call", { op: "echo.ping@1", payload: { hello: "cache" } });
    expect(call1.ok).toBe(true);
    const status1 = await rpc(info, "status", {});
    expect(status1.ok).toBe(true);
    const routed1 = (status1.value as { router: { routedOps: string[] } }).router.routedOps;
    const result1 = (call1.value as { result: { value: { payload: { hello: string } } } }).result.value.payload;

    // Switch away (miss) and back (hit): the reboot still respawns + reverifies,
    // but compile is skipped.
    expect(((await rpc(info, "use", { specPath: RISK_SPEC })).value as { rebooted: boolean }).rebooted).toBe(true);
    const t0Warm = Date.now();
    expect(((await rpc(info, "use", { specPath: ECHO_SPEC })).value as { rebooted: boolean }).rebooted).toBe(true);
    const warmBootMs = Date.now() - t0Warm;
    const status2 = await rpc(info, "status", {});
    expect(status2.ok).toBe(true);
    const v2 = status2.value as {
      router: { routedOps: string[] };
      manifests: Record<string, { version: string }>;
      daemon: { compileCache: { hits: number; misses: number; entries: number; lastEvent: { kind: string } } };
    };
    expect(v2.router.routedOps).toEqual(routed1); // byte-identical routing
    expect(v2.manifests["omega.echo"]?.version).toBe("0.2.0"); // D-352: echo.stream@1 falsifier op landed (0.1.0 → 0.2.0)
    expect(v2.daemon.compileCache.misses).toBe(2);
    expect(v2.daemon.compileCache.hits).toBe(1);
    expect(v2.daemon.compileCache.lastEvent.kind).toBe("hit");
    const call2 = await rpc(info, "call", { op: "echo.ping@1", payload: { hello: "cache" } });
    expect(call2.ok).toBe(true);
    expect((call2.value as { result: { value: { payload: { hello: string } } } }).result.value.payload).toEqual(result1);
    console.log(`[D-330] reboot cold ${coldBootMs}ms vs cache-warm ${warmBootMs}ms (compile skipped on warm)`);
    await cold.close();
  }, 90_000);

  test("changed sources miss and serve the NEW behavior (never stale)", async () => {
    compileCache.clear();
    // Self-contained temp plugin (copied entry code with a behavior marker).
    const tmp = join(OMEGA_ROOT, ".tmp-d330");
    rmSync(tmp, { recursive: true, force: true });
    const plugDir = join(tmp, "myecho");
    mkdirSync(join(plugDir, "src"), { recursive: true });
    const entryFile = join(plugDir, "src", "index.ts");
    const writeMarker = (marker: string) => writeFileSync(entryFile,
      `import { definePlugin, startPlugin } from "../../../shim/src/index.ts";\n` +
      `const MARKER = "${marker}";\n` +
      `startPlugin(definePlugin({ ops: { "echo.ping@1": async (payload) => ({ echo: true, marker: MARKER, payload }) } }));\n`);
    writeMarker("v1");
    writeFileSync(join(plugDir, "plugin.json"), JSON.stringify({
      manifestVersion: "1", id: "omega.myecho", version: "0.1.0", entry: "src/index.ts",
      publisher: { keyId: "", signature: "" },
      contributions: { contract: [{ kind: "contract", id: "echo.ping", version: "1", risk: "READ" }] },
      dependencies: [], capabilities: { requested: [] },
      runtime: { tier: "worker-thread", budget: {} }, contentHash: "",
    }));
    const specFile = join(tmp, "myecho.json");
    writeFileSync(specFile, JSON.stringify({
      name: "myecho-cli",
      entries: [
        {
          id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0,
          grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] },
        },
        { id: "omega.myecho", source: "./myecho", bootPhase: 1, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
      ],
    }));
    // NOTE: spec sources resolve relative to the SPEC's dir — law-stub via
    // ../plugins/law-stub lands back in the real tree (read-only use, never written).
    const vaultDir = tempVault("stale");
    const handle = await startDaemon({ vaultDir, specPath: specFile, idleMs: 300_000 });
    handles.push(handle);
    const info = readDaemonInfo(vaultDir)!;
    const first = await rpc(info, "call", { op: "echo.ping@1", payload: {} });
    expect(first.ok).toBe(true);
    expect((first.value as { result: { value: { marker: string } } }).result.value.marker).toBe("v1");

    writeMarker("v2"); // content + mtime change
    const used = await rpc(info, "use", { specPath: specFile });
    expect(used.ok).toBe(true);
    expect((used.value as { rebooted: boolean }).rebooted).toBe(true);
    const status = await rpc(info, "status", {});
    const cache = (status.value as { daemon: { compileCache: { lastEvent: { kind: string; matched?: string[] }; misses: number; partials: number } } }).daemon.compileCache;
    // Only myecho changed: PARTIAL naming the untouched survivor (law-stub).
    // Partial still recompiles today (compile is atomic) — the matched list is
    // the pool-backed partial boot's future input, and the changed entry is
    // never served stale (marker v2 below).
    expect(cache.lastEvent.kind).toBe("partial");
    expect(cache.lastEvent.matched).toEqual(["vivim.law"]);
    expect(cache.partials).toBe(1);
    const second = await rpc(info, "call", { op: "echo.ping@1", payload: {} });
    expect(second.ok).toBe(true);
    expect((second.value as { result: { value: { marker: string } } }).result.value.marker).toBe("v2");
    await handle.close();
  }, 90_000);
});
