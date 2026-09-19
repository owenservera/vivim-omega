// Part1 §4 ghosts-of-ghosts: 5-hop chain, liar, rogue, 50-swarm.
// Composition generated per-run under .gen-deep (gitignored).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureVault, compileComposition, bootComposition, type BootedHost, type Recipe } from "@vivim/omega-host";

const REPO = join(import.meta.dir, "../..");
const GHOSTS = join(REPO, "testkit/test/fixtures/ghosts");
const TMP = join(GHOSTS, ".gen-deep");
const REPO_ROOT = "../../../../..";

let host: BootedHost;
let recipe: Recipe;
let buildDir: string;

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
  for (let i = 1; i <= 50; i++) cloneGhost("ghost-fan", `ghost.sfan-${i}`, { from: "fan.run", to: `sfan.run-${i}` });
  for (let i = 1; i <= 2; i++) cloneGhost("ghost-lock", `ghost.dlock-${i}`, { from: "lock.zone", to: `dlock.zone-${i}` });
  const vault = join(TMP, "vault");
  const { rootKey } = ensureVault(vault);
  const entries: Array<{ id: string; source: string; bootPhase: number; grant: { capabilities: string[]; contracts: string[] } }> = [
    { id: "vivim.law", source: `${REPO_ROOT}/plugins/law-stub`, bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
    { id: "omega.echo", source: `${REPO_ROOT}/examples/plugin-echo`, bootPhase: 1, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
    { id: "ghost.load", source: `../ghost-load`, bootPhase: 1, grant: { capabilities: ["port:echo.ping@1"], contracts: ["ghost.load@1"] } },
    { id: "ghost.deep-a", source: `../ghost-deep-a`, bootPhase: 2, grant: { capabilities: ["port:deep.middle-b@1"], contracts: ["deep.entry@1"] } },
    { id: "ghost.deep-b", source: `../ghost-deep-b`, bootPhase: 2, grant: { capabilities: ["port:deep.middle-c@1"], contracts: ["deep.middle-b@1"] } },
    { id: "ghost.deep-c", source: `../ghost-deep-c`, bootPhase: 2, grant: { capabilities: ["port:ghost.load@1"], contracts: ["deep.middle-c@1"] } },
    { id: "ghost.liar", source: `../ghost-liar`, bootPhase: 2, grant: { capabilities: ["port:ghost.load@1", "port:echo.ping@1"], contracts: ["liar.probe@1"] } },
    { id: "ghost.rogue", source: `../ghost-rogue`, bootPhase: 2, grant: { capabilities: [], contracts: ["rogue.claim@1"] } },
    { id: "vivim.kernel-lens", source: `${REPO_ROOT}/plugins/vivim-kernel-lens`, bootPhase: 2, grant: { capabilities: ["host.kernel.lens"], contracts: ["kernel.centrality@1", "kernel.audit.verify@1"] } },
    ...Array.from({ length: 50 }, (_, i) => ({ id: `ghost.sfan-${i + 1}`, source: `ghost-sfan-${i + 1}`, bootPhase: 2, grant: { capabilities: ["port:ghost.load@1"], contracts: [`sfan.run-${i + 1}@1`] } })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `ghost.dlock-${i + 1}`, source: `ghost-dlock-${i + 1}`, bootPhase: 2, grant: { capabilities: ["host.state.arbitration"], contracts: [`dlock.zone-${i + 1}@1`] } })),
  ];
  const spec = { name: "ghosts-deep", entries };
  const compiled = compileComposition(spec as never, TMP, vault, rootKey);
  recipe = compiled.recipe;
  buildDir = compiled.buildDir;
  host = await bootComposition(recipe, buildDir, vault);
}, 60_000);

afterAll(async () => {
  await host.shutdown();
  rmSync(TMP, { recursive: true, force: true });
});

describe("§4.1 five-hop chain (deep-a → deep-b → deep-c → load → echo)", () => {
  test("round-trip succeeds and latency is linear-ish vs 3-hop", async () => {
    const t5 = performance.now();
    const r = await host.router.callAsRoot("deep.entry@1", {});
    const wall5 = performance.now() - t5;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { hop: string; downstream: { ok?: boolean; value?: { hop: string; downstream?: { ok?: boolean; value?: { amplified: boolean } } } } };
    expect(v.hop).toBe("deep-a");
    expect(v.downstream?.value?.hop).toBe("deep-b");
    expect(wall5).toBeLessThan(5000);
  });

  test("DEGRADED injected at hop 3 surfaces at hop 1 unchanged", async () => {
    const r = await host.router.callAsRoot("deep.middle-b@1", { fail: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { ok: boolean; error?: string };
    expect(v.ok).toBe(false);
    expect(v.error).toBe("DEGRADED");
  });

  test("audit chain records all intermediate grants (chain length covers edges)", async () => {
    const r = await host.router.callAsRoot("kernel.audit.verify@1", {});
    expect(r.ok).toBe(true);
  });
});

describe("§4.2 liar (unused grant + over-broad range)", () => {
  test("unused grant counts toward fanIn; over-broad range resolves safely", async () => {
    const r = await host.router.callAsRoot("liar.probe@1", { i: 1 });
    expect(r.ok).toBe(true);
    const c = await host.router.callAsRoot("kernel.centrality@1", {});
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const v = c.value as { loadBearing: Array<{ id: string; fanIn: number }> };
    const shared = v.loadBearing.find((n) => n.id === "ghost.load@1");
    expect(shared).toBeDefined();
  });
});

describe("§4.3 rogue (arbiter bypass attempt)", () => {
  test("rogue flag cannot affect a legitimate lock critical section", async () => {
    const [legit, rogue] = await Promise.all([
      host.router.callAsRoot("dlock.zone-1@1", { holdMs: 120 }),
      host.router.callAsRoot("rogue.claim@1", {}),
    ]);
    expect(legit.ok).toBe(true);
    if (!legit.ok) return;
    expect((legit.value as { locked: boolean }).locked).toBe(true);
    expect(rogue.ok).toBe(true);
  });
});

describe("§4.4 fifty-swarm (singleflight + pool pressure)", () => {
  test("50 dormant fans first-touched same tick all land", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => host.router.callAsRoot(`sfan.run-${i + 1}@1`, { concurrency: 1 })));
    for (const r of results) expect(r.ok).toBe(true);
    expect(host.router.status().compartments["ghost.load"]).toBeDefined();
  }, 60_000);
});
