// forge.author — test/happy/self-host.test.ts (authored: the falsifier itself)
// THE Wave 0 keystone proof: on a REAL boot (compositions/forge-author.json —
// vivim.law phase 0, vivim.vault, forge.author loaded as a plugin, the op
// routed normally, no direct handler import on the call path),
// forge.author.init@1 reproduces plugins/forge-author/ byte-identically
// outside FORGE:AUTHORED regions, twice (byte-identical across runs), and a
// hand-edit outside those regions turns the comparison red with a NAMED diff.
//
// This file is AUTHORED: a falsifier emitted by the system under test cannot
// falsify it. The comparison judge lives in ../compare.ts (also authored).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, contentHashDir } from "../../../../host/src/index.ts";
import type { BootedHost } from "../../../../host/src/index.ts";
import { omegaTmp, resolveDataDir } from "@vivim/omega-platform";
import { validateManifest } from "@vivim/omega-sdk";
import { comparePluginTree, listFilesRecursive, stripAuthoredRegions } from "../compare.ts";
import { specInputHash, FORGE_AUTHOR_OP, type RecordedSpec } from "../../src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "../../");
const COMP_SPEC_PATH = join(import.meta.dir, "../../../../compositions/forge-author.json");
const compSpec = JSON.parse(readFileSync(COMP_SPEC_PATH, "utf-8"));
const selfSpec = JSON.parse(readFileSync(join(PLUGIN_DIR, "spec/self.json"), "utf-8")) as RecordedSpec;

let vault: string;
let host: BootedHost;
let run1: EmissionReport;
let run1Dir: string;

async function root<T>(op: string, payload: unknown): Promise<T> {
  const r = await host.router.callAsRoot(op, payload);
  if (!r.ok) throw new Error(`${op} failed: ${r.error}: ${("detail" in r && r.detail) || ""}`);
  return r.value as T;
}

/** One clean scratch target per emission (output sits OUTSIDE the spec's hash
 *  domain — two runs may target two scratch dirs under one spec). */
function scratchTarget(name: string): string {
  const dir = omegaTmp("omega-forge-author-happy", name);
  rmSync(dir, { recursive: true, force: true });
  return dir;
}

function specFor(name: string): RecordedSpec {
  const s = JSON.parse(JSON.stringify(selfSpec)) as RecordedSpec;
  s.output = scratchTarget(name);
  return s;
}

interface EmissionReport {
  refused: false; op: string; inputHash: string; outputHash: string;
  outputDir: string; emitted: string[]; proposalRows: Array<{ id: string; rev: number }>;
}

beforeAll(async () => {
  vault = omegaTmp("omega-forge-author-happy", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(compSpec, join(COMP_SPEC_PATH, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("the boot is real (no bespoke bypass anywhere in the ceremony)", () => {
  test("the compile ceremony signed the forge.author manifest; the plugin is loaded as a plugin", () => {
    const m = host.manifests.get("forge.author")!;
    expect(m).toBeTruthy();
    expect(m.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentHashDir(PLUGIN_DIR)).toBe(m.contentHash);
    expect(m.contributions?.contract?.map((c) => `${c.id}@${c.version}`)).toEqual([FORGE_AUTHOR_OP]);
  });
});

describe("the keystone: forge.author.init@1 emits itself", () => {
  test("run 1 succeeds and reproduces plugins/forge-author/ outside authored regions", async () => {
    const s = specFor("run1");
    run1 = await root<EmissionReport>(FORGE_AUTHOR_OP, { spec: s });
    run1Dir = s.output as string;
    expect(run1.refused).toBe(false);
    expect(run1.emitted.sort()).toEqual(["README.md", "package.json", "plugin.json", "src/index.ts"].sort());
    expect(run1.inputHash).toBe(specInputHash(selfSpec as unknown as Record<string, unknown>));
    const cmp = comparePluginTree(selfSpec, run1Dir, PLUGIN_DIR);
    expect(cmp.issues).toEqual([]); // rules 1-6 all green
  });

  test("run 2 (fresh scratch dir) is byte-identical to run 1 — the emission is deterministic", async () => {
    const s = specFor("run2");
    const run2 = await root<EmissionReport>(FORGE_AUTHOR_OP, { spec: s });
    expect(run2.outputHash).toBe(run1.outputHash); // aggregate pin
    for (const f of listFilesRecursive(run1Dir)) {
      expect(readFileSync(join(run2.outputDir, f), "utf-8")).toBe(readFileSync(join(run1Dir, f), "utf-8")); // per-file bytes
    }
  });

  test("the recorded commandList pins what the real boot produced (inputHash AND outputHash)", () => {
    expect(selfSpec.commandList[0].inputHash).toBe(run1.inputHash);
    expect(selfSpec.commandList[0].outputHash).toBe(run1.outputHash);
  });

  test("the generated manifest is valid (sdk validateManifest, generality included)", () => {
    const generated = JSON.parse(readFileSync(join(run1Dir, "plugin.json"), "utf-8"));
    const issues = validateManifest(generated);
    expect(issues).toEqual([]);
  });

  test("the output confers no authority: unsigned, uncommitted, authority:'none' rows", async () => {
    const generated = JSON.parse(readFileSync(join(run1Dir, "plugin.json"), "utf-8"));
    expect(generated.publisher.signature).toBe("");
    expect(generated.contentHash).toBe(""); // pre-compile state — signing is a host ceremony, never a spec's to request
    for (const row of run1.proposalRows) {
      const got = await root<{ data: { authority: string; generatedBy: string } }>("vault.get@1", { ns: "proposal", id: row.id });
      expect(got.data.authority).toBe("none");
      expect(got.data.generatedBy).toBe(FORGE_AUTHOR_OP);
    }
  });

  test("the proposal ledger holds exactly one row per emitted file (written and read back)", async () => {
    expect(run1.proposalRows.map((r) => r.id).sort()).toEqual(
      ["file:forge.author/README.md", "file:forge.author/package.json", "file:forge.author/plugin.json", "file:forge.author/src/index.ts"].sort(),
    );
    for (const row of run1.proposalRows) expect(row.rev).toBeGreaterThan(0);
  });

  test("the output path is scratch the boot never reads (outside vault and buildDir)", () => {
    expect(run1Dir.startsWith(omegaTmp())).toBe(true);
    expect(run1Dir.includes(vault)).toBe(false);
    expect(run1Dir.includes(join(vault, "build"))).toBe(false);
  });
});

describe("the fence: hand-edits fail with NAMED diffs (red cases on scratch copies)", () => {
  // Each red case copies the checked-in tree to scratch, tampering ONE thing,
  // then re-runs the comparison — the falsifier must name the sin.
  function tamperedCopy(name: string, mutate: (dir: string) => void): string {
    const dir = omegaTmp("omega-forge-author-happy", `tamper-${name}`);
    rmSync(dir, { recursive: true, force: true });
    cpSync(PLUGIN_DIR, dir, { recursive: true });
    mutate(dir);
    return dir;
  }

  test("a hand-edit OUTSIDE authored regions fails with SPEC_BYTE_DRIFT (named first-diff)", () => {
    const dir = tamperedCopy("byte", (d) => {
      const p = join(d, "src/index.ts");
      const text = readFileSync(p, "utf-8");
      writeFileSync(p, text.replace("emits plugin scaffolds from RECORDED specs", "emits plugin scaffolds from TAMPERED specs"));
    });
    const cmp = comparePluginTree(selfSpec, run1Dir, dir);
    expect(cmp.ok).toBe(false);
    expect(cmp.issues.map((i) => i.rule)).toContain("SPEC_BYTE_DRIFT");
    expect(cmp.issues.find((i) => i.rule === "SPEC_BYTE_DRIFT")!.file).toBe("src/index.ts");
    expect(cmp.issues.find((i) => i.rule === "SPEC_BYTE_DRIFT")!.detail).toContain("offset");
  });

  test("a hand-edit INSIDE the authored region is ignored (rule 2: authored bytes are free)", () => {
    const dir = tamperedCopy("authored", (d) => {
      const p = join(d, "src/index.ts");
      const text = readFileSync(p, "utf-8");
      writeFileSync(p, text.replace("// 3. The four request parameters", "// 3. EDITED-BY-HAND the four request parameters"));
    });
    const cmp = comparePluginTree(selfSpec, run1Dir, dir);
    expect(cmp.issues).toEqual([]); // the edit sits inside FORGE:AUTHORED-BEGIN/END
  });

  test("a forged GENERATED header (mismatched spec-hash) fails with SPEC_HASH_MISMATCH", () => {
    const dir = tamperedCopy("header", (d) => {
      const p = join(d, "src/index.ts");
      const text = readFileSync(p, "utf-8");
      writeFileSync(p, text.replace(/spec-hash=sha256:[0-9a-f]{64}/, "spec-hash=sha256:" + "0".repeat(64)));
    });
    const cmp = comparePluginTree(selfSpec, run1Dir, dir);
    expect(cmp.ok).toBe(false);
    expect(cmp.issues.map((i) => i.rule)).toContain("SPEC_HASH_MISMATCH");
  });

  test("an undeclared file in the checked-in tree fails with SPEC_UNDECLARED_FILE", () => {
    const dir = tamperedCopy("undeclared", (d) => {
      writeFileSync(join(d, "rogue.txt"), "hand-added, never declared in the spec\n");
    });
    const cmp = comparePluginTree(selfSpec, run1Dir, dir);
    expect(cmp.ok).toBe(false);
    expect(cmp.issues.find((i) => i.rule === "SPEC_UNDECLARED_FILE")!.file).toBe("rogue.txt");
  });

  test("a deleted generated file fails with SPEC_FILE_MISSING", () => {
    const dir = tamperedCopy("missing", (d) => {
      rmSync(join(d, "src/index.ts"));
    });
    const cmp = comparePluginTree(selfSpec, run1Dir, dir);
    expect(cmp.ok).toBe(false);
    expect(cmp.issues.find((i) => i.rule === "SPEC_FILE_MISSING")!.file).toBe("src/index.ts");
  });

  test("an emission missing one file fails with EMIT_FILE_MISSING", () => {
    const partial = omegaTmp("omega-forge-author-happy", "partial-emit");
    rmSync(partial, { recursive: true, force: true });
    cpSync(run1Dir, partial, { recursive: true });
    rmSync(join(partial, "package.json"));
    const cmp = comparePluginTree(selfSpec, partial, PLUGIN_DIR);
    expect(cmp.ok).toBe(false);
    expect(cmp.issues.find((i) => i.rule === "EMIT_FILE_MISSING")!.file).toBe("package.json");
  });

  test("a tampered spec body (no re-pin) is refused by the op itself with SPEC_SPEC_HASH_MISMATCH", async () => {
    const s = specFor("tampered-spec");
    s.version = "0.2.0"; // specBody change, commandList pin left stale
    const r = await root<{ refused: boolean; rule?: string }>(FORGE_AUTHOR_OP, { spec: s });
    expect(r.refused).toBe(true);
    expect(r.rule).toBe("SPEC_SPEC_HASH_MISMATCH");
    expect(existsSync(s.output as string) ? readdirSync(s.output as string) : []).toEqual([]); // refused before a byte was written
  });

  test("a re-pinned spec whose template drifted is refused with SPEC_CONTENT_PIN_MISMATCH", async () => {
    const s = specFor("re-pinned");
    s.files[0].template = `${s.files[0].template}\n`; // attacker re-pins inputHash but contentHash still pins the old bytes
    s.commandList[0].inputHash = specInputHash(s as unknown as Record<string, unknown>);
    const r = await root<{ refused: boolean; rule?: string }>(FORGE_AUTHOR_OP, { spec: s });
    expect(r.refused).toBe(true);
    expect(r.rule).toBe("SPEC_CONTENT_PIN_MISMATCH");
    expect(existsSync(s.output as string) ? readdirSync(s.output as string) : []).toEqual([]);
  });

  test("stripAuthoredRegions leaves the generated bytes intact (the tool is total and honest)", () => {
    const text = readFileSync(join(PLUGIN_DIR, "src/index.ts"), "utf-8");
    const regions = selfSpec.authoredRegions;
    const stripped = stripAuthoredRegions(text, regions);
    expect(stripped.includes("FORGE:AUTHORED-BEGIN")).toBe(false);
    expect(stripped.includes("The authored conscience")).toBe(false); // inside the region
    expect(stripped.includes("export async function authorInit")).toBe(true); // outside the region
    expect(stripped.length).toBeLessThan(text.length);
  });
});

describe("the composition config scratchDir is honored (data passthrough, never authority)", () => {
  test("the default target (spec.output omitted) lands in the composition's scratchDir", async () => {
    const scratchCfg = compSpec.entries.find((e: { id: string }) => e.id === "forge.author")?.config?.scratchDir as string;
    expect(typeof scratchCfg).toBe("string");
    const defaultDir = resolveDataDir(scratchCfg);
    rmSync(defaultDir, { recursive: true, force: true });
    const s = JSON.parse(JSON.stringify(selfSpec)) as RecordedSpec;
    delete s.output;
    const r = await root<EmissionReport>(FORGE_AUTHOR_OP, { spec: s });
    expect(r.refused).toBe(false);
    expect(r.outputDir).toBe(defaultDir);
    const cmp = comparePluginTree(selfSpec, defaultDir, PLUGIN_DIR);
    expect(cmp.issues).toEqual([]);
    rmSync(defaultDir, { recursive: true, force: true }); // leave scratch clean for other suites
  });
});
