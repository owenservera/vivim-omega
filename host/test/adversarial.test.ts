// Ω0 adversarial boot suite — B1–B4 demonstrated by attack, not assertion.
// Each case must FAIL CLOSED: no composition boots, previous state preserved.
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, parseRecipe, pinRecipe, loadPinnedRecipe } from "@vivim/omega-host";
import { ensureVault, verifyComposition, bootComposition } from "@vivim/omega-host";
import { bootWithRecovery } from "@vivim/omega-host";
import { generateRootKey } from "@vivim/omega-host";
import { startWatchdog } from "../../tooling/watchdog/watchdog.ts";
import type { Recipe } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const SPEC = join(import.meta.dir, "../../compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const BOMB_SPEC = join(import.meta.dir, "../../fixtures/bomb-composition.json");
const bombSpec = JSON.parse(readFileSync(BOMB_SPEC, "utf-8"));
let vault: string;
let recipe: Recipe;
let buildDir: string;

function freshVault(name: string): string {
  // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
  const dir = omegaTmp("omega-test", `${name}-${Date.now()}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeAll(() => {
  vault = freshVault("adversarial");
  const { rootKey } = ensureVault(vault);
  const compiled = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  recipe = compiled.recipe;
  buildDir = compiled.buildDir;
});

describe("B1 manifest-or-nothing + B4 fail-closed", () => {
  test("1 · valid composition boots (control case)", async () => {
    const host = await bootComposition(recipe, buildDir, vault);
    const r = await host.router.callAsRoot("echo.ping@1", { hello: "omega" });
    expect(r.ok).toBe(true);
    await host.shutdown();
  });

  test("2 · tampered recipe composition (signature broken)", () => {
    const tampered: Recipe = JSON.parse(JSON.stringify(recipe));
    tampered.composition[2].grant.capabilities.push("port:law.check@1");
    const { errors } = verifyComposition(tampered, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(errors.some((e) => e.includes("signature invalid"))).toBe(true);
  });

  test("3 · wrong bootPhase-0 owner refused", () => {
    const bad: Recipe = JSON.parse(JSON.stringify(recipe));
    bad.composition[0].bootPhase = 1; // law demoted
    const inv = verifyComposition(bad, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(inv.errors.join(" ")).toContain("bootPhase 0");
  });

  test("4 · recipe signed by a foreign root key refused", () => {
    const foreign = generateRootKey();
    const foreignVault = freshVault("foreign");
    ensureVault(foreignVault);
    const compiled = compileComposition(spec, join(SPEC, ".."), foreignVault, foreign);
    // bring the foreign recipe to OUR vault: signature is internally consistent but the root differs
    const { errors } = verifyComposition(compiled.recipe, compiled.buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(errors.some((e) => e.includes("does not match the vault key"))).toBe(true);
    rmSync(foreignVault, { recursive: true, force: true });
  });

  test("5 · manifestHash mismatch (recipe points at different manifest)", () => {
    const bad: Recipe = JSON.parse(JSON.stringify(recipe));
    bad.composition[1].manifestHash = "sha256:" + "0".repeat(64);
    const { errors } = verifyComposition(bad, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(errors.some((e) => e.includes("manifestHash mismatch"))).toBe(true);
  });

  test("6 · content hash mismatch (source file mutated after compile)", () => {
    const src = join(buildDir, recipe.composition[2].source, "src/index.ts");
    const original = readFileSync(src, "utf-8");
    writeFileSync(src, original + "\n// tampered");
    const { errors } = verifyComposition(recipe, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(errors.some((e) => e.includes("contentHash mismatch"))).toBe(true);
    writeFileSync(src, original); // restore
    const healed = verifyComposition(recipe, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(healed.errors.length).toBe(0);
  });

  test("7 · truncated content (entry file deleted) refused", () => {
    const src = join(buildDir, recipe.composition[1].source, "src/index.ts");
    const original = readFileSync(src, "utf-8");
    rmSync(src);
    const { errors } = verifyComposition(recipe, buildDir, JSON.parse(readFileSync(join(vault, "keys/root-of-trust"), "utf-8")).publicKey);
    expect(errors.some((e) => e.includes("contentHash mismatch") || e.includes("source dir missing"))).toBe(true);
    writeFileSync(src, original);
  });

  test("8 · replay: old recipe after content changed → fail-closed, not silent accept", async () => {
    // pin the current (valid) recipe, then mutate content: the pinned replay must refuse
    const v = freshVault("replay");
    const { rootKey } = ensureVault(v);
    const c1 = compileComposition(spec, join(SPEC, ".."), v, rootKey);
    pinRecipe(v, c1.recipe);
    const src = join(c1.buildDir, c1.recipe.composition[2].source, "src/index.ts");
    const original = readFileSync(src, "utf-8");
    writeFileSync(src, original + "\n// changed world");
    const { host, report } = await bootWithRecovery(v);
    expect(host).toBeNull();
    expect(report.reason).toContain("pinned recipe corrupt");
    writeFileSync(src, original);
    const { host: h2 } = await bootWithRecovery(v);
    expect(h2).not.toBeNull();
    await h2!.shutdown();
  });

  test("9 · mid-swap crash: pinned survives, stale tmp cleaned", async () => {
    const v = freshVault("midswap");
    const { rootKey } = ensureVault(v);
    const c1 = compileComposition(spec, join(SPEC, ".."), v, rootKey);
    pinRecipe(v, c1.recipe);
    // simulate crash between tmp-write and rename
    writeFileSync(join(v, "recipe.pinned.tmp"), JSON.stringify(c1.recipe));
    const { host, report } = await bootWithRecovery(v);
    expect(report.cleanedStaleSwap).toBe(true);
    expect(report.source).toBe("pinned");
    expect(host).not.toBeNull();
    expect(existsSync(join(v, "recipe.pinned.tmp"))).toBe(false);
    await host!.shutdown();
  });

  test("10 · duplicate routed op refused", () => {
    const badSpec = JSON.parse(JSON.stringify(spec));
    badSpec.name = "conflict";
    badSpec.entries[2].grant.contracts.push("echo.ping@1"); // counter also claims echo.ping@1
    const v = freshVault("conflict");
    const { rootKey } = ensureVault(v);
    const c = compileComposition(badSpec, join(SPEC, ".."), v, rootKey);
    const { errors } = verifyComposition(c.recipe, c.buildDir, rootKey.publicKey);
    expect(errors.some((e) => e.includes("routed op conflict"))).toBe(true);
  });

  test("11 · missing dependency refused at boot (composition plane)", () => {
    const noEcho = JSON.parse(JSON.stringify(spec));
    noEcho.name = "noecho";
    noEcho.entries = noEcho.entries.filter((e: any) => e.id !== "omega.echo");
    const v = freshVault("noecho");
    const { rootKey } = ensureVault(v);
    const c = compileComposition(noEcho, join(SPEC, ".."), v, rootKey);
    const { errors } = verifyComposition(c.recipe, c.buildDir, rootKey.publicKey);
    expect(errors.some((e) => e.includes("dependency") || e.includes("does not declare"))).toBe(true);
  });

  test("12 · corrupted pinned recipe → recovery mode, refuse to boot", async () => {
    const v = freshVault("corrupt");
    const { rootKey } = ensureVault(v);
    const c = compileComposition(spec, join(SPEC, ".."), v, rootKey);
    pinRecipe(v, c.recipe);
    writeFileSync(join(v, "recipe.pinned"), "{ this is not json");
    const { host, report } = await bootWithRecovery(v);
    expect(host).toBeNull();
    expect(report.reason).toBeTruthy();
  });

  test("B4 drill · successful atomic swap: new version pins and boots", async () => {
    const v = freshVault("swap");
    const { rootKey } = ensureVault(v);
    const c1 = compileComposition(spec, join(SPEC, ".."), v, rootKey);
    pinRecipe(v, c1.recipe);
    // "amend": recompile (e.g. counter got a new version) and boot from incoming
    const c2 = compileComposition({ ...spec, name: "demo2" }, join(SPEC, ".."), v, rootKey);
    const recipeFile = join(c2.buildDir, "recipe.json");
    const { host, report } = await bootWithRecovery(v, recipeFile);
    expect(report.source).toBe("incoming");
    expect(host!.recipe.name).toBe("demo2");
    const pinned = loadPinnedRecipe(v);
    expect(pinned!.name).toBe("demo2");
    await host!.shutdown();
  });
});

// D-360 falsifiers — the D-321 consumption exposure, bounded. A compartment that
// consumes (CPU-wedged or heap-bombed) is EVICTED by the watchdog while sibling
// compartments keep routing untouched. Detection latency is interval×N bounded.
describe("D-360 consumption watchdog (attack, then evict)", () => {
  const budgetsFrom = (m: Map<string, { runtime?: { budget?: Record<string, number> } }>): Map<string, Record<string, number>> =>
    new Map([...m.entries()].map(([id, man]) => [id, man.runtime?.budget ?? {}]));

  test("13 · CPU-wedged compartment (sync infinite loop) → unresponsive eviction, siblings unaffected", async () => {
    const v = freshVault("watchdog-spin");
    const { rootKey } = ensureVault(v);
    const c = compileComposition(bombSpec, join(BOMB_SPEC, ".."), v, rootKey);
    const host = await bootComposition(c.recipe, c.buildDir, v);
    const wd = startWatchdog(host.router, { intervalMs: 100, missLimit: 3, budgets: budgetsFrom(host.manifests) });
    const r = await host.router.callAsRoot("bomb.alloc@1", { mode: "spin" }, 250);
    expect(r.ok).toBe(false); // the wedge cannot answer inside the deadline (BUDGET)
    // bounded detection: 3 × 100ms samples, then terminate (hard-kill cap ~2.6s)
    const stopped = await (async () => {
      for (let i = 0; i < 100; i++) {
        const evicted = wd.evictions().some((e) => e.id === "omega.bomb");
        const st = (host.router.status().compartments as Record<string, { state: string }>)["omega.bomb"];
        if (evicted && (st?.state === "stopped" || st?.state === "degraded")) return true;
        await new Promise((res) => setTimeout(res, 100));
      }
      return false;
    })();
    expect(stopped).toBe(true);
    expect(wd.evictions()[0].reason).toContain("unresponsive");
    // the point of the exercise: siblings route and answer as if nothing happened
    const echo = await host.router.callAsRoot("echo.ping@1", { hello: "omega" });
    expect(echo.ok).toBe(true);
    const st = host.router.status().compartments as Record<string, { state: string; crashes: number }>;
    expect(st["vivim.law"].state).toBe("active");
    expect(st["vivim.law"].crashes).toBe(0);
    expect(st["omega.echo"].state).toBe("active");
    expect(st["omega.echo"].crashes).toBe(0);
    wd.stop();
    await host.shutdown();
  }, 30_000);

  test("14 · responsive heap bomb (over declared memMB) → memory eviction, siblings unaffected", async () => {
    const v = freshVault("watchdog-heap");
    const { rootKey } = ensureVault(v);
    const c = compileComposition(bombSpec, join(BOMB_SPEC, ".."), v, rootKey);
    const host = await bootComposition(c.recipe, c.buildDir, v);
    const wd = startWatchdog(host.router, { intervalMs: 100, missLimit: 3, budgets: budgetsFrom(host.manifests) });
    const r = await host.router.callAsRoot("bomb.alloc@1", { mode: "heap" }, 5_000);
    expect(r.ok).toBe(true); // the bomber answers, keeps the loop alive, keeps growing
    const stopped = await (async () => {
      for (let i = 0; i < 100; i++) {
        const evicted = wd.evictions().some((e) => e.id === "omega.bomb");
        const st = (host.router.status().compartments as Record<string, { state: string }>)["omega.bomb"];
        if (evicted && (st?.state === "stopped" || st?.state === "degraded")) return true;
        await new Promise((res) => setTimeout(res, 100));
      }
      return false;
    })();
    expect(stopped).toBe(true);
    expect(wd.evictions()[0].reason).toContain("heap over budget");
    const echo = await host.router.callAsRoot("echo.ping@1", { hello: "omega" });
    expect(echo.ok).toBe(true);
    const st = host.router.status().compartments as Record<string, { state: string; crashes: number }>;
    expect(st["omega.echo"].state).toBe("active");
    expect(st["omega.echo"].crashes).toBe(0);
    wd.stop();
    await host.shutdown();
  }, 30_000);
});
