// D-401 soak: sustained moderate randomized load + rare faults + resource tracking.
// Default 60s (green fast); --seconds 86400 targets the 24h first real run.
import { mkdirSync, rmSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const secsArg = process.argv.find((a) => a.startsWith("--seconds="));
const SECS = secsArg ? parseInt(secsArg.split("=")[1], 10) : 60;
const SPEC = join(ROOT, "compositions/spine.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const vault = join(ROOT, "dev-vault-soak");
rmSync(vault, { recursive: true, force: true });
mkdirSync(vault, { recursive: true });
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);
const t0 = Date.now();
let ops = 0, faults = 0, errors = 0;
const mem0 = process.memoryUsage().heapUsed;
while (Date.now() - t0 < SECS * 1000) {
  const pick = Math.random();
  if (pick < 0.7) {
    const r = await host.router.callAsRoot("echo.ping@1", { i: ops });
    if (!r.ok) errors++;
    ops++;
  } else if (pick < 0.85) {
    await host.router.callAsRoot("vault.append@1", { ns: "soak", id: `s-${ops}`, data: { ops } });
    ops++;
  } else if (pick < 0.95) {
    await host.router.callAsRoot("kernel.centrality@1", {}).catch(() => { errors++; });
    ops++;
  } else {
    faults++;
    await host.router.callAsRoot("crashy.please@1", {}).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 20));
}
const mem1 = process.memoryUsage().heapUsed;
let vaultBytes = 0;
try { vaultBytes = statSync(join(vault, "canonical.sqlite")).size; } catch {
  try { vaultBytes = statSync(join(process.env.TEMP ?? "/tmp", "omega-spine/vault-data/canonical.sqlite")).size; } catch { vaultBytes = -1; }
}
const chain = host.router.kernel ? host.router.kernel.audit.length() : -1;
await host.shutdown();
console.log(JSON.stringify({ soakSecs: SECS, ops, faults, errors, memDeltaMB: +((mem1 - mem0) / 1048576).toFixed(2), vaultBytes, chainLength: chain }, null, 2));
rmSync(vault, { recursive: true, force: true });
