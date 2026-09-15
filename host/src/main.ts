// µhost — main.ts: the CLI. `vivim compose` boots a composition; `vivim verify` verifies only.
// The first-boot ceremony generates the root-of-trust and compiles the composition spec.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, parseRecipe } from "./recipe.ts";
import { ensureVault } from "./boot.ts";
import { bootWithRecovery } from "./recovery.ts";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "help";
  const vaultDir = arg("vault", "dev-vault")!;
  if (cmd === "help" || cmd === "--help") {
    console.log(`vivim µhost commands:
  compose  --vault <dir> [--composition <spec.json> | --recipe <file.json>] [--run <script.json>] [--json]
  verify   --vault <dir> [--recipe <file.json>]
The host refuses to boot without a verifiable recipe (fail-closed, B4).`);
    return;
  }
  if (cmd === "compose") {
    const { rootKey } = ensureVault(vaultDir);
    const compositionSpec = arg("composition");
    let incomingRecipe: string | undefined = arg("recipe");
    if (compositionSpec && !incomingRecipe) {
      // first-boot ceremony: compile + sign the composition spec into the vault build dir
      const spec = JSON.parse(readFileSync(compositionSpec, "utf-8"));
      const { recipe } = compileComposition(spec, join(compositionSpec, ".."), vaultDir, rootKey);
      incomingRecipe = join(vaultDir, "build", spec.name, "recipe.json");
    }
    const { host, report } = await bootWithRecovery(vaultDir, incomingRecipe);
    if (!host) { console.error(JSON.stringify({ booted: false, report })); process.exit(1); }
    const runFile = arg("run");
    if (runFile && existsSync(runFile)) {
      const script = JSON.parse(readFileSync(runFile, "utf-8")) as Array<{ op: string; payload?: unknown; deadlineMs?: number }>;
      const transcript = [];
      for (const step of script) transcript.push({ op: step.op, result: await host.router.callAsRoot(step.op, step.payload, step.deadlineMs ?? 5000) });
      console.log(JSON.stringify({ booted: true, source: report.source, transcript }, null, 2));
    } else {
      console.log(JSON.stringify({ booted: true, source: report.source, status: host.router.status() }, null, 2));
    }
    await host.shutdown();
    return;
  }
  if (cmd === "verify") {
    const { rootKey } = ensureVault(vaultDir);
    const recipeFile = arg("recipe") ?? join(vaultDir, "recipe.pinned");
    if (!existsSync(recipeFile)) { console.error(`no recipe at ${recipeFile}`); process.exit(1); }
    const r = parseRecipe(readFileSync(recipeFile, "utf-8"));
    const { verifyComposition } = await import("./boot.ts");
    const buildDir = recipeFile.endsWith("recipe.pinned") ? join(vaultDir, "build", r.name) : join(recipeFile, "..");
    const { errors } = verifyComposition(r, buildDir, rootKey.publicKey);
    console.log(JSON.stringify({ recipe: r.name, valid: errors.length === 0, errors }, null, 2));
    process.exit(errors.length === 0 ? 0 : 1);
  }
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
