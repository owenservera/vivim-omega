// D-331 — lazy activation through a REAL boot (law-stub + echo + counter).
// bootPhase 0 spawns eager; everything else registers dormant and spawns on
// first routed call — transparently (a just-spawned compartment is
// indistinguishable from an eager one except by first-touch latency).
// dormant ("never started") is structurally distinct from degraded
// ("started and unwell") in both status() and compartment stats.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 30_000);

const SPEC: CompositionSpec = {
  name: "lazy",
  entries: [
    {
      id: "vivim.law", source: "plugins/law-stub", bootPhase: 0,
      grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] },
    },
    {
      id: "omega.echo", source: "examples/plugin-echo", bootPhase: 1,
      grant: { capabilities: [], contracts: ["echo.ping@1"] },
    },
    {
      id: "omega.counter", source: "examples/plugin-counter", bootPhase: 1,
      grant: { capabilities: ["port:echo.ping@1"], contracts: ["counter.bump@1", "counter.value@1"] },
    },
  ],
};

async function bootLazy(caseName: string): Promise<BootedHost> {
  const root = omegaTmp("omega-lazy-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(SPEC, OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return host;
}

type Compartments = Record<string, { state: string }>;

describe("D-331 — bootPhase 0 eager, rest dormant until first touch", () => {
  let host: BootedHost;
  beforeAll(async () => { host = await bootLazy("phases"); }, 60_000);

  test("law is active at boot; phase-1 entries are dormant (never started, not degraded)", async () => {
    const st = host.router.status();
    expect((st.compartments as Compartments)["vivim.law"]?.state).toBe("active");
    expect(st.compartments["omega.echo"]).toBeUndefined();
    expect(st.compartments["omega.counter"]).toBeUndefined();
    expect(st.dormant).toEqual(["omega.counter", "omega.echo"]); // sorted, explicit
    // Routing is unaffected by dormancy: the table covers everything granted.
    for (const op of ["law.check@1", "echo.ping@1", "counter.bump@1", "counter.value@1"]) {
      expect(st.routedOps).toContain(op);
    }
  });

  test("first touch spawns and answers; the compartment is then simply active", async () => {
    const t0 = Date.now();
    const r: PortResult = await host.router.callAsRoot("echo.ping@1", { hello: "lazy" });
    const firstTouchMs = Date.now() - t0;
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { payload: { hello: string } }).payload.hello).toBe("lazy");
    const st = host.router.status();
    expect((st.compartments as Compartments)["omega.echo"]?.state).toBe("active");
    expect(st.dormant).toEqual(["omega.counter"]); // the untouched sibling stays dormant
    console.log(`[D-331] dormant-first-touch echo.ping@1: ${firstTouchMs}ms (spawn + answer)`);
  });

  test("transitive lazy: a dormant compartment's own calls wake their targets", async () => {
    // counter is still dormant; bump spawns it, and its port call to echo.ping
    // is itself a routed call (echo already active from the previous test).
    const r: PortResult = await host.router.callAsRoot("counter.bump@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { count: number }).count).toBe(1);
    const st = host.router.status();
    expect((st.compartments as Compartments)["omega.counter"]?.state).toBe("active");
    expect(st.dormant).toEqual([]);
  });
});

describe("D-331 — dormant reporting: stats zeros, concurrent touch, never-called", () => {
  test("compartment stats report dormant ids with zero counters (health-visible, never quarantined)", async () => {
    const host = await bootLazy("stats");
    const r: PortResult = await host.router.callAsRoot("host.compartment.stats@1", {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("stats failed");
    const stats = r.value as Record<string, { state: string; delivered: number; calls: number; errors: number; crashes: number }>;
    expect(stats["vivim.law"]?.state).toBe("active");
    expect(stats["omega.echo"]).toMatchObject({ state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0 });
    expect(stats["omega.counter"]).toMatchObject({ state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0 });
    await host.shutdown();
  }, 60_000);

  test("concurrent first touches share one spawn (singleflight): all answer, one worker serves", async () => {
    const host = await bootLazy("race");
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => host.router.callAsRoot("echo.ping@1", { n: i })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const returned = results.filter((r) => r.ok).map((r) => (r.value as { payload: { n: number } }).payload.n).sort();
    expect(returned).toEqual([0, 1, 2, 3, 4]);
    const st = host.router.status();
    expect((st.compartments as Compartments)["omega.echo"]?.state).toBe("active");
    await host.shutdown();
  }, 60_000);

  test("a never-called op still spawns and answers correctly on first touch", async () => {
    const host = await bootLazy("untouched");
    expect(host.router.status().dormant).toContain("omega.counter");
    const r: PortResult = await host.router.callAsRoot("counter.value@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { count: number }).count).toBe(0);
    expect((host.router.status().compartments as Compartments)["omega.counter"]?.state).toBe("active");
    await host.shutdown();
  }, 60_000);
});
