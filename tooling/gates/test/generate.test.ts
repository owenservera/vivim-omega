// tooling/gates/test/generate.test.ts — the W0-1 generator falsifiers (D-377).
// 1. byte-identity: the matrix regenerates EVERY shipped spec byte-identical.
// 2. drift detection: a hand-edited spec diverges from the matrix with a named
//    first-diff line (the same comparison the compositions gate stage runs).
// 3. fresh-plugin falsifier: a scaffolded plugin passes sdk manifest validation
//    AND boots first-try in a generated composition on a real host — the
//    "plugin-echo-class plugin boots on first try" bar from W0-1.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitCompositions, scaffoldPlugin } from "../../generate/generate.ts";
import { emitSpec } from "../../generate/format.ts";
import { validateManifest } from "@vivim/omega-sdk";
import type { PluginManifest } from "@vivim/omega-contracts";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../../..");
const SCRATCH = join(ROOT, "dev-vault", `gen-test-${Date.now()}-${process.pid}`);

afterAll(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

describe("W0-1 generator — composition emission (D-377)", () => {
  test("the matrix reproduces every shipped spec byte-identical (modulo nothing)", () => {
    const { ok, reports } = emitCompositions(join(ROOT, "compositions"), { write: false });
    expect(reports.map((r) => r.status)).toEqual(reports.map(() => "identical"));
    expect(ok).toBe(true);
    expect(reports.length).toBe(18); // 16 under the D-370 freeze; +1 by D-391 (kernel witness rig); +1 by D-406 (forge-author builder composition — both matrix-authored)
  });

  test("a drifted hand-edit is named with its first diff line", () => {
    const dir = join(SCRATCH, "drift", "compositions");
    mkdirSync(dir, { recursive: true });
    const matrix = {
      compositions: {
        demo: {
          entries: [{
            id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0,
            grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1"] },
          }],
        },
      },
    };
    writeFileSync(join(dir, "_matrix.json"), JSON.stringify(matrix, null, 2) + "\n");
    // the spec ON DISK grants one contract MORE than the matrix — the classic
    // "hand-edited the spec, forgot the matrix" drift
    const drifted = {
      name: "demo",
      entries: [{
        id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0,
        grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1"] },
      }],
    };
    writeFileSync(join(dir, "demo.json"), JSON.stringify(drifted, null, 2) + "\n");
    const { ok, reports } = emitCompositions(dir, { write: false });
    expect(ok).toBe(false);
    expect(reports[0]!.status).toBe("drift");
    expect(reports[0]!.firstDiffLine).toBeGreaterThan(0);
  });
});

describe("W0-1 generator — plugin scaffold (D-377)", () => {
  // The falsifier mirrors the REAL authoring workflow (the only honest shape):
  // scaffold into plugins/ (the workspace glob covers it) → bun install →
  // generated composition boots the scaffold first-try. The generated spec
  // itself lives in dev-vault scratch (gitignored) — no 17th shipped spec, the
  // D-370 freeze stays intact. Cleanup restores the tree exactly.
  const PLUGIN = "first-try";
  const pluginDir = join(ROOT, "plugins", PLUGIN);
  const specDir = join(SCRATCH, "compositions");
  const vault = join(SCRATCH, "vault");
  let s: ReturnType<typeof scaffoldPlugin>;

  test("scaffold materializes the five files with the checklist", () => {
    rmSync(pluginDir, { recursive: true, force: true }); // defensive: crashed prior run
    s = scaffoldPlugin(PLUGIN, { baseDir: join(ROOT, "plugins") });
    expect(s.files.sort()).toEqual(["package.json", "plugin.json", "src/core.ts", "src/index.ts", "test/core.test.ts"]);
    expect(s.checklist.join("\n")).toContain("VAULT-NAMESPACES.md");
    expect(s.checklist.join("\n")).toContain("LAW_POLICY_V1");
  });

  test("the scaffolded manifest passes sdk validation clean", () => {
    const m = JSON.parse(readFileSync(join(s.dir, "plugin.json"), "utf-8")) as PluginManifest;
    expect(validateManifest(m)).toEqual([]);
    expect(m.id).toBe("omega.first-try");
  });

  test("FALSIFIER: the scaffolded plugin boots first-try in a generated composition on a real host", async () => {
    // register the workspace package exactly as the checklist instructs
    const inst = Bun.spawnSync(["bun", "install"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(inst.exitCode).toBe(0);

    const specText = emitSpec("first-try-demo", null, [
      { id: "vivim.law", source: "../../../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.describe@1"] } },
      { id: "omega.first-try", source: "../../../plugins/first-try", bootPhase: 1, grant: { capabilities: [], contracts: ["first-try.ping@1"] } },
    ] as never);
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "first-try-demo.json"), specText);
    mkdirSync(vault, { recursive: true });
    const { rootKey } = ensureVault(vault);
    const spec = JSON.parse(readFileSync(join(specDir, "first-try-demo.json"), "utf-8"));
    const { recipe, buildDir } = compileComposition(spec, specDir, vault, rootKey);
    const host = await bootComposition(recipe, buildDir, vault);
    try {
      const r = await host.router.callAsRoot("first-try.ping@1", { who: "omega" });
      expect((r as { detail?: string }).detail ?? "").not.toContain("crashed");
      expect(r.ok).toBe(true);
      expect((r as { value?: { pong?: boolean; who?: string } }).value?.pong).toBe(true);
      expect((r as { value?: { who?: string } }).value?.who).toBe("omega");
    } finally {
      await host.shutdown();
    }
  });

  afterAll(() => {
    // restore the tree exactly: scaffold out, lockfile back, node_modules resync
    rmSync(pluginDir, { recursive: true, force: true });
    rmSync(SCRATCH, { recursive: true, force: true });
    const lock = Bun.spawnSync(["git", "checkout", "--", "bun.lock"], { cwd: ROOT });
    if (lock.exitCode !== 0) console.warn("generate.test: bun.lock checkout skipped (no change or git unavailable)");
    Bun.spawnSync(["bun", "install"], { cwd: ROOT, stdout: "ignore", stderr: "ignore" });
  });
});
