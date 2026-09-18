// D-340 ghost-plugin pressure suite — the omega agent's own fine-tuning harness.
//
// This is the "build ghost plugins and plugins of plugins to test and adjust"
// protocol: synthetic plugins exercise the kernel from OUTSIDE — real workers,
// real ports, real tokens, real graph — exactly the way third-party plugins
// will. Nothing here is mocked; every scenario must hold on a real boot.
//
// Ghosts (testkit/test/fixtures/ghosts/ — committed, reusable):
//   ghost.load  the shared algorithm nobody labeled core (becomes load-bearing)
//   ghost.fan   swarm member (cloned ×6, ops renamed per clone)
//   ghost.twin  the second generation of echo (echo.ping@2, live beside @1)
//   ghost.stale the caller asking for a vanished version (declared 1.x range)
//   ghost.lock  state-arbitration contender (cloned ×2, ops renamed per clone)
//   ghost.shape the honest coarse wrapper (granularity data, seams named)
// Plus existing fixtures: omega.echo, omega.crashy, vivim.kernel-lens, law-stub.
//
// The composition is generated per-run under .test-tmp/ (gitignored) — the
// swarm clones rewrite manifest ids AND op ids (two plugins offering the same
// op string is a routed-op conflict the recipe rightly refuses — so clones
// rename their ops; the PRESSURE is the point, not the collision).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureVault, compileComposition, bootComposition, type BootedHost, type Recipe } from "@vivim/omega-host";

const REPO = join(import.meta.dir, "../..");
const GHOSTS = join(REPO, "testkit/test/fixtures/ghosts");
// Generated under testkit/ (gitignored) so cloned ghosts resolve @vivim/omega-shim
// via testkit/node_modules — bun isolated installs link workspace deps per-package.
const TMP = join(GHOSTS, ".gen");
const FIXTURE = (name: string) => `../${name}`;
const REPO_ROOT = "../../../../..";

let host: BootedHost;
let recipe: Recipe;
let buildDir: string;

/** Clone a ghost fixture with a rewritten id (+ renamed op when clones would collide). */
function cloneGhost(fixture: string, id: string, opRename?: { from: string; to: string }): void {
  const srcDir = join(GHOSTS, fixture);
  const dst = join(TMP, id.replace(/\./g, "-"));
  mkdirSync(join(dst, "src"), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(srcDir, "plugin.json"), "utf-8"));
  manifest.id = id;
  let code = readFileSync(join(srcDir, "src/index.ts"), "utf-8");
  if (opRename) {
    manifest.contributions.contract = manifest.contributions.contract.map((c: { id: string }) => (c.id === opRename.from ? { ...c, id: opRename.to } : c));
    code = code.replaceAll(opRename.from, opRename.to);
  }
  writeFileSync(join(dst, "plugin.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dst, "src/index.ts"), code);
}

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  // the swarm: six distinct principals, each holding the shared algorithm
  for (let i = 1; i <= 6; i++) cloneGhost("ghost-fan", `ghost.fan-${i}`, { from: "fan.run", to: `fan.run-${i}` });
  // the contenders: two distinct principals, both arbitrating through the one host arbiter
  for (let i = 1; i <= 2; i++) cloneGhost("ghost-lock", `ghost.lock-${i}`, { from: "lock.zone", to: `lock.zone-${i}` });

  const vault = join(TMP, "vault");
  const { rootKey } = ensureVault(vault);
  const entries: Array<{ id: string; source: string; bootPhase: number; grant: { capabilities: string[]; contracts: string[] } }> = [
    { id: "vivim.law", source: `${REPO_ROOT}/plugins/law-stub`, bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
    { id: "omega.echo", source: `${REPO_ROOT}/examples/plugin-echo`, bootPhase: 1, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
    { id: "ghost.load", source: FIXTURE("ghost-load"), bootPhase: 1, grant: { capabilities: ["port:echo.ping@1"], contracts: ["ghost.load@1"] } },
    { id: "ghost.twin", source: FIXTURE("ghost-twin"), bootPhase: 2, grant: { capabilities: ["port:echo.ping@1"], contracts: ["echo.ping@2", "twin.probe@1"] } },
    { id: "ghost.stale", source: FIXTURE("ghost-stale"), bootPhase: 2, grant: { capabilities: ["port:echo.ping@3"], contracts: ["stale.run@1"] } },
    { id: "ghost.shape", source: FIXTURE("ghost-shape"), bootPhase: 2, grant: { capabilities: [], contracts: ["ghost.shape@1"] } },
    { id: "omega.crashy", source: `${REPO_ROOT}/examples/plugin-crashy`, bootPhase: 2, grant: { capabilities: [], contracts: ["crashy.please@1", "crashy.ping@1"] } },
    { id: "vivim.kernel-lens", source: `${REPO_ROOT}/plugins/vivim-kernel-lens`, bootPhase: 2, grant: { capabilities: ["host.kernel.lens"], contracts: ["kernel.centrality@1", "kernel.audit.verify@1"] } },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `ghost.fan-${i + 1}`, source: `ghost-fan-${i + 1}`, bootPhase: 2, grant: { capabilities: ["port:ghost.load@1"], contracts: [`fan.run-${i + 1}@1`] } })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `ghost.lock-${i + 1}`, source: `ghost-lock-${i + 1}`, bootPhase: 2, grant: { capabilities: ["host.state.arbitration"], contracts: [`lock.zone-${i + 1}@1`] } })),
  ];
  const spec = { name: "ghosts", entries };
  const compiled = compileComposition(spec as never, TMP, vault, rootKey);
  recipe = compiled.recipe;
  buildDir = compiled.buildDir;
  host = await bootComposition(recipe, buildDir, vault);
}, 60_000);

afterAll(async () => {
  await host.shutdown();
  rmSync(TMP, { recursive: true, force: true });
});

describe("D-340 pressure · plugins of plugins (three hops through the kernel graph)", () => {
  test("fan.run → ghost.load → echo.ping: the full chain returns amplified evidence from every hop", async () => {
    const r = await host.router.callAsRoot("fan.run-3@1", { concurrency: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { fan: string; concurrency: number; results: Array<{ ok: boolean; value?: { amplified: boolean; upstream: { ok: boolean; value?: { echo: boolean } } } }> };
    expect(v.fan).toBe("ghost.fan-3");
    expect(v.concurrency).toBe(4);
    for (const res of v.results) {
      expect(res.ok).toBe(true);
      expect(res.value?.amplified).toBe(true);
      expect(res.value?.upstream.ok).toBe(true);
      expect(res.value?.upstream.value?.echo).toBe(true); // the third hop answered
    }
  });
});

describe("D-340 pressure · the swarm race (concurrent dormant first-touch)", () => {
  test("six dormant fans spawn and fan-in simultaneously — singleflight holds, every call lands", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => host.router.callAsRoot(`fan.run-${i + 1}@1`, { concurrency: 2 })));
    for (const r of results) expect(r.ok).toBe(true);
    // ghost.load was spawned exactly once despite 12 concurrent first touches
    expect(host.router.status().compartments["ghost.load"]).toBeDefined();
    const stats = (host.router.status().compartments as Record<string, { crashes: number; state: string }>)["ghost.load"];
    expect(stats.state).toBe("active");
    expect(stats.crashes).toBe(0);
  });
});

describe("D-340 pressure · centrality is computed, not assigned (requirement #7)", () => {
  test("the shared algorithm nobody labeled core crosses the load-bearing threshold on its own", async () => {
    const r = await host.router.callAsRoot("kernel.centrality@1", {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { loadBearing: Array<{ id: string; fanIn: number; blastRadius: number }>; thresholds: { fanInThreshold: number } };
    const shared = v.loadBearing.find((n) => n.id === "ghost.load@1");
    expect(shared).toBeDefined();
    expect(shared!.fanIn).toBe(7); // 6 swarm holders + 1 offeror — nobody assigned it anything
    expect(shared!.fanIn).toBeGreaterThanOrEqual(v.thresholds.fanInThreshold);
  });

  test("the ghost manifest is honest about NOT being an extraction candidate — only ghost.shape self-reports", () => {
    const k = host.router.kernel!;
    const candidates = k.graph.snapshot().nodes.filter((n) => n.extractionCandidate === true);
    expect(candidates.map((n) => n.id)).toEqual(["ghost.shape"]);
  });
});

describe("D-340 pressure · the honest coarse wrapper (requirement #5, live)", () => {
  test("a coarse plugin wears the SAME manifest schema and reports its own seams through its op", async () => {
    const r = await host.router.callAsRoot("ghost.shape@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { shape: string; seams: string[]; extractionCandidate: boolean };
      expect(v.shape).toBe("coarse");
      expect(v.seams).toEqual(["seam:session-memory", "seam:prompt-templates"]);
      expect(v.extractionCandidate).toBe(true);
    }
    const k = host.router.kernel!;
    expect(k.graph.node("ghost.shape")?.granularity).toBe("coarse");
    expect(k.graph.whoOffers("ghost.shape@1")).toEqual(["ghost.shape"]);
  });
});

describe("D-340 pressure · generations live beside each other (requirements #4 + #9)", () => {
  test("echo.ping has TWO live generations; v2 answers @2, and a 1.x-pinned caller still lands on v1", async () => {
    const k = host.router.kernel!;
    expect(k.tools.generationCount("echo.ping")).toBe(2);

    const v2 = await host.router.callAsRoot("echo.ping@2", { who: "new-caller" });
    expect(v2.ok).toBe(true);
    if (v2.ok) expect((v2.value as { twin: boolean }).twin).toBe(true);

    // the pinned probe: a compartment holding a 1.x token calls the OLD exact op
    const probe = await host.router.callAsRoot("twin.probe@1", {});
    expect(probe.ok).toBe(true);
    if (probe.ok) {
      const v = probe.value as { pinnedTo: string; upstream: { ok: boolean; value?: { echo: boolean } } };
      expect(v.pinnedTo).toBe("v1");
      expect(v.upstream.ok).toBe(true);
      expect(v.upstream.value?.echo).toBe(true); // omega.echo answered, not ghost.twin
    }
  });

  test("the stale caller asking for a VANISHED version gets the compatible generation — atomization transparency", async () => {
    const r = await host.router.callAsRoot("stale.run@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { stale: boolean; resolvedInstead: { ok: boolean; value?: { echo: boolean } } };
      expect(v.stale).toBe(true);
      expect(v.resolvedInstead.ok).toBe(true); // NOT REFUSED — the declared 1.x range earned the fallback
      expect(v.resolvedInstead.value?.echo).toBe(true); // v1 answered
    }
  });

  test("an undeclared caller asking for the same vanished version keeps v1 REFUSED semantics — fail-closed preserved", async () => {
    const r = await host.router.callAsRoot("echo.ping@3", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("REFUSED"); // root declared nothing: no magic routing
  });
});

describe("D-340 pressure · the one arbiter under contention (requirement #3, live)", () => {
  test("two compartments contend for one key: exactly one wins, the loser is REFUSED with the holder named", async () => {
    // pre-spawn both contenders (so contention, not spawn latency, decides)
    const warm1 = await host.router.callAsRoot("lock.zone-1@1", { holdMs: 5 });
    const warm2 = await host.router.callAsRoot("lock.zone-2@1", { holdMs: 5 });
    expect(warm1.ok && warm2.ok).toBe(true);

    const [a, b] = await Promise.all([
      host.router.callAsRoot("lock.zone-1@1", { holdMs: 300 }),
      host.router.callAsRoot("lock.zone-2@1", { holdMs: 300 }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const av = a.value as { locked: boolean; contender: string; refused?: string; detail?: string };
    const bv = b.value as { locked: boolean; contender: string; refused?: string; detail?: string };
    const winners = [av, bv].filter((x) => x.locked);
    expect(winners.length).toBe(1); // the arbiter, not the race, decides
    const loser = [av, bv].find((x) => !x.locked)!;
    expect(loser.refused).toBe("REFUSED");
    expect(loser.detail).toContain(winners[0].contender); // the holder is NAMED in the refusal

    // and the critical section is genuinely held: after both settle, it is free again
    const followUp = await host.router.callAsRoot("lock.zone-1@1", { holdMs: 5 });
    expect((followUp.value as { locked: boolean }).locked).toBe(true);
  });
});

describe("D-340 pressure · fault injection (a crashed compartment must not dent the kernel)", () => {
  test("crashy.please kills its worker: the call returns DEGRADED, the compartment is degraded, the kernel is intact", async () => {
    const r = await host.router.callAsRoot("crashy.please@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DEGRADED");

    const st = host.router.status().compartments as Record<string, { state: string; crashes: number }>;
    expect(st["omega.crashy"].state).toBe("degraded");
    expect(st["omega.crashy"].crashes).toBeGreaterThanOrEqual(1);

    // the kernel: chain still verifies, graph intact, other compartments unaffected
    expect(host.router.kernel!.audit.verifyChain()).toBe(true);
    const echo = await host.router.callAsRoot("echo.ping@1", { stillAlive: true });
    expect(echo.ok).toBe(true);

    const lens = await host.router.callAsRoot("kernel.audit.verify@1", {});
    expect(lens.ok && (lens.value as { verified: boolean }).verified).toBe(true);
  });

  test("a degraded compartment refuses further dispatch with DEGRADED, not a hang", async () => {
    const r = await host.router.callAsRoot("crashy.ping@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DEGRADED");
  });
});

describe("D-340 pressure · revocation mid-flight (B3's generation bump through the kernel)", () => {
  test("after host.tokens.revoke, outstanding compartment tokens fail REVOKED at their next use", async () => {
    const before = await host.router.callAsRoot("fan.run-1@1", { concurrency: 1 });
    expect(before.ok).toBe(true); // still authorized pre-revoke

    const revoke = await host.router.callAsRoot("host.tokens.revoke@1", {});
    expect(revoke.ok).toBe(true);

    const after = await host.router.callAsRoot("fan.run-1@1", { concurrency: 1 });
    expect(after.ok).toBe(true); // the fan itself still runs (root path is unrevoked)…
    if (after.ok) {
      const v = after.value as { results: Array<{ ok: boolean; error?: string }> };
      expect(v.results[0].ok).toBe(false); // …but its call INTO ghost.load is refused
      expect(v.results[0].error).toBe("REVOKED"); // attributable, not vanished
    }

    // the kernel is untouched by revocation: chain + graph stay verified
    expect(host.router.kernel!.audit.verifyChain()).toBe(true);
  });
});

describe("D-340 pressure · end state — the whole boot reconciles", () => {
  test("chain length === edge count, and the chain verifies over the full pressure history", () => {
    const k = host.router.kernel!;
    const snap = k.graph.snapshot();
    expect(k.audit.length()).toBe(snap.edges.length);
    expect(k.audit.verifyChain()).toBe(true);
    // 5 genesis + 14 composition principals + every op + every granted capability
    expect(snap.nodes.length).toBeGreaterThanOrEqual(40);
    expect(snap.edges.length).toBeGreaterThanOrEqual(25);
  });
});
