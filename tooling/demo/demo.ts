// Demo: a scripted composition run producing a transcript for the review console.
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, HOST_OPS } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");
const SPEC = join(ROOT, "compositions/demo.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));

const vault = join(ROOT, "dev-vault");
mkdirSync(vault, { recursive: true });
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const t0 = performance.now();
const host = await bootComposition(recipe, buildDir, vault);
const bootMs = Math.round(performance.now() - t0);

const steps: Array<{ op: string; payload?: unknown; deadlineMs?: number }> = [
  { op: "law.registry@1" },
  { op: "echo.ping@1", payload: { hello: "omega" } },
  { op: "counter.bump@1" },
  { op: "counter.value@1" },
  { op: "counter.bump@1" },
  { op: "no.such.op@1", deadlineMs: 200 },
  { op: "echo.ping@1", payload: { delayMs: 300 }, deadlineMs: 60 },
  { op: HOST_OPS.compartmentStats },
];
const transcript = [];
for (const step of steps) {
  const result = await host.router.callAsRoot(step.op, step.payload, step.deadlineMs ?? 5000);
  transcript.push({ op: step.op, result: JSON.parse(JSON.stringify(result)) });
}
const status = host.router.status();
await host.shutdown();

const output = {
  at: new Date().toISOString(),
  composition: spec.name,
  bootMs,
  compartments: status.compartments,
  routedOps: status.routedOps,
  transcript,
};
console.log(JSON.stringify(output, null, 2));
