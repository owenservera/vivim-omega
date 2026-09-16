// Demo: a scripted SPINE composition run producing a transcript for the review console.
// Boots the real law + vault + run plugins and exercises the full loop:
// gate → consent ceremony → vault round-trip → scheduled task → health.
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const ROOT = join(import.meta.dir, "../..");
const SPEC = join(ROOT, "compositions/spine.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));

const vault = join(ROOT, "dev-vault");
// E-9: unique demo scratch — a fixed name would collide across concurrent runs on one box.
const demoRoot = omegaTmp("omega-demo", `run-${Date.now()}-${process.pid}`);
const dataDir = join(demoRoot, "vault-data");
rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(vault, { recursive: true });
mkdirSync(demoRoot, { recursive: true });
const { rootKey } = ensureVault(vault);
const demoSpec = {
  ...spec,
  name: "spine-demo",
  entries: spec.entries.map((e: any) => (e.id === "vivim.vault" ? { ...e, config: { dataDir } } : e)),
};
const { recipe, buildDir } = compileComposition(demoSpec, join(SPEC, ".."), vault, rootKey);
const t0 = performance.now();
const host = await bootComposition(recipe, buildDir, vault);
const bootMs = Math.round(performance.now() - t0);

const steps: Array<{ op: string; payload?: unknown; deadlineMs?: number; note?: string }> = [
  { op: "law.registry@1", note: "the constitution is a plugin" },
  { op: "echo.ping@1", payload: { hello: "omega" }, note: "root principal round-trip" },
  { op: "vault.append@1", payload: { ns: "email", id: "m1", data: { subject: "hello spine", body: "the vault works" } }, note: "MUTATION → law gate → allow + journal" },
  { op: "vault.search@1", payload: { ns: "email", q: "vault" }, note: "FTS5 search through the vault" },
  { op: "vault.verify@1", note: "Merkle chain walk" },
  { op: "risky.op@1", payload: { hello: "world" }, note: "EXTERNAL_MUTATION → consent required (expect REFUSED)" },
  { op: "run.submit@1", payload: { op: "echo.ping@1", payload: { via: "run-pool" }, deadlineMs: 1000 }, note: "scheduled task with freshness" },
  { op: "run.health@1", note: "compartment health from the run plugin" },
  { op: "no.such.op@1", deadlineMs: 200, note: "unknown op → REFUSED register" },
];
const transcript = [];
for (const step of steps) {
  const result = await host.router.callAsRoot(step.op, step.payload, step.deadlineMs ?? 5000);
  transcript.push({ op: step.op, note: step.note, result: JSON.parse(JSON.stringify(result)) });
}

// consent ceremony: the risky.op REFUSED carries the consentId → grant → retry
const refused = transcript.find((t) => t.op === "risky.op@1")?.result as { ok: false; detail?: string } | undefined;
if (refused && !refused.ok && refused.detail?.includes("consent required")) {
  const consentId = refused.detail.split(":")[1]?.trim();
  if (consentId) {
    const grant = await host.router.callAsRoot("law.consent.grant@1", { consentId });
    const retry = await host.router.callAsRoot("risky.op@1", { hello: "world" });
    transcript.push({ op: "law.consent.grant@1", note: `consent ${consentId} granted by the user`, result: JSON.parse(JSON.stringify(grant)) });
    transcript.push({ op: "risky.op@1", note: "retry after consent → allowed", result: JSON.parse(JSON.stringify(retry)) });
  }
}

const status = host.router.status();
await host.shutdown();

const output = {
  at: new Date().toISOString(),
  composition: demoSpec.name,
  bootMs,
  compartments: status.compartments,
  routedOps: status.routedOps,
  transcript,
};
console.log(JSON.stringify(output, null, 2));
