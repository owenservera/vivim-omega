// tooling/gates/conformance-drift-seed.ts — the W0-2 falsifier (D-376).
// Proves the conformance net FAILS CLOSED on seeded drift with named
// diagnostics, and that the real tree is green. Read-only on the real tree:
// drifted variants live in a scratch root (plugins/packs/examples copied
// sans node_modules so manifest resolution reaches real sources).
//
//   scenario 0 (baseline): the real tree is GREEN.
//   scenario 1 (lost grant): chat.json's vivim.director loses
//     resolve.classify@1 → vivim.chat's port:resolve.classify@1 has no routed
//     implementation → named diagnostic.
//   scenario 2 (undeclared risk): vivim-law's law.check@1 manifest risk flips
//     READ → MUTATION with no policy row → D-351 parity diagnostic names both
//     sources (manifest MUTATION vs policy EXTERNAL_MUTATION).
//
// Run: bun run tooling/gates/conformance-drift-seed.ts   (exit 0 = falsifier green)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkCompositions } from "./compositions.ts";
import { omegaTmp } from "@vivim/omega-platform";

const ROOT = join(import.meta.dir, "../..");

function scratchRoot(tag: string): string {
  const dir = omegaTmp("omega-conformance-seed", `${tag}-${Date.now()}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const d of ["compositions", "plugins", "packs", "examples"]) {
    cpSync(join(ROOT, d), join(dir, d), { recursive: true, filter: (s) => !s.includes("node_modules") });
  }
  rmSync(join(dir, "compositions", "_matrix.json"), { force: true }); // scope the seed to checks 1–6
  return dir;
}

async function main(): Promise<string[]> {
  const failures: string[] = [];

  // scenario 0 — the real tree must be green (the net's honest baseline)
  const base = await checkCompositions(ROOT);
  console.log(`scenario 0 (baseline): ${base.ok ? "GREEN" : "RED"} — specs ${base.detail.specs}, entries ${base.detail.entries}, parity ops ${base.detail.riskParityOps}, matrix ${base.detail.matrixConformance}`);
  if (!base.ok) failures.push(`baseline RED (expected GREEN): ${base.issues.slice(0, 3).join("; ")}`);

  // scenario 1 — lost grant (the composition grant matrix forgets one grant)
  const s1 = scratchRoot("lost-grant");
  try {
    const chatPath = join(s1, "compositions", "chat.json");
    const chat = JSON.parse(readFileSync(chatPath, "utf-8"));
    const director = chat.entries.find((e: { id: string }) => e.id === "vivim.director");
    director.grant.contracts = director.grant.contracts.filter((c: string) => c !== "resolve.classify@1");
    writeFileSync(chatPath, JSON.stringify(chat, null, 2) + "\n");
    const r = await checkCompositions(s1, { compositionsDir: join(s1, "compositions") });
    const hit = r.issues.find((i) => i.includes("chat.json") && i.includes("port:resolve.classify@1") && i.includes("no routed implementation"));
    console.log(`scenario 1 (lost grant): ${hit ? "NAMED DIAGNOSTIC" : "MISSED"} — ${hit ?? `issues: ${JSON.stringify(r.issues.slice(0, 3))}`}`);
    if (!hit || r.ok) failures.push("scenario 1: seeded lost grant did NOT fail with the named diagnostic");
  } finally { rmSync(s1, { recursive: true, force: true }); }

  // scenario 2 — undeclared risk (manifest flips risk, policy has no row)
  const s2 = scratchRoot("undeclared-risk");
  try {
    const manifestPath = join(s2, "plugins", "vivim-law", "plugin.json");
    const m = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const row = m.contributions.contract.find((c: { id: string }) => c.id === "law.check");
    row.risk = "MUTATION"; // no LAW_POLICY_V1 row for law.check@1 → policy says EXTERNAL_MUTATION
    writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");
    const r = await checkCompositions(s2, { compositionsDir: join(s2, "compositions") });
    const hit = r.issues.find((i) => i.includes("law.check@1") && i.includes("manifest declares MUTATION") && i.includes("EXTERNAL_MUTATION"));
    console.log(`scenario 2 (undeclared risk): ${hit ? "NAMED DIAGNOSTIC" : "MISSED"} — ${hit ?? `issues: ${JSON.stringify(r.issues.slice(0, 3))}`}`);
    if (!hit || r.ok) failures.push("scenario 2: seeded undeclared risk did NOT fail with the named diagnostic");
  } finally { rmSync(s2, { recursive: true, force: true }); }

  return failures;
}

main().then((failures) => {
  if (failures.length === 0) {
    console.log("conformance-drift-seed: GREEN — the net fails closed on seeded drift with named diagnostics (D-376 falsifier)");
    process.exit(0);
  }
  console.error(`conformance-drift-seed: RED\n  ${failures.join("\n  ")}`);
  process.exit(1);
});
