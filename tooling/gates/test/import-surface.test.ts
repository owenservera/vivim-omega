// import-surface unit evidence: the layering checker catches each rule class
// against temp dirs, never the real tree.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkImportSurface } from "../import-surface.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

function scaffold(root: string, files: Record<string, string>): void {
  rmSync(root, { recursive: true, force: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
}

const CLEAN: Record<string, string> = {
  "contracts/src/a.ts": `export const x = 1;\nimport { join } from "node:path";\nvoid join;\n`,
  "shim/src/i.ts": `import type { PortResult } from "@vivim/omega-contracts";\nexport type T = PortResult;\n`,
  "host/src/h.ts": `import { ownerOnly } from "@vivim/omega-platform";\nimport type { Recipe } from "@vivim/omega-contracts";\nvoid ownerOnly;\n`,
  "plugins/p/src/i.ts": `import { definePlugin } from "@vivim/omega-shim";\nvoid definePlugin;\n`,
  "surfaces/s/src/s.ts": `import { bootSurface } from "./boot.ts";\nvoid bootSurface;\n`,
  "plugins/p/test/t.ts": `import { bootComposition } from "@vivim/omega-host";\nvoid bootComposition;\n`,
};

describe("import-surface net — layering contract", () => {
  test("clean tree passes (tests excluded from the scan)", async () => {
    const root = omegaTmp("omega-import-surface-test", `clean-${Date.now()}`);
    scaffold(root, CLEAN);
    const r = await checkImportSurface(root);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("plugin src importing the host fails", async () => {
    const root = omegaTmp("omega-import-surface-test", `pluginhost-${Date.now()}`);
    scaffold(root, { ...CLEAN, "plugins/p/src/i.ts": `import { bootComposition } from "@vivim/omega-host";\nvoid bootComposition;\n` });
    const r = await checkImportSurface(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/never imports|authority flows through ports/);
    rmSync(root, { recursive: true, force: true });
  });

  test("surface src with a plugins-relative import fails", async () => {
    const root = omegaTmp("omega-import-surface-test", `surfplug-${Date.now()}`);
    scaffold(root, { ...CLEAN, "surfaces/s/src/s.ts": `import { x } from "../../../plugins/p/src/i.ts";\nvoid x;\n` });
    const r = await checkImportSurface(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/workspace dependency/);
    rmSync(root, { recursive: true, force: true });
  });

  test("contracts src with a workspace import fails", async () => {
    const root = omegaTmp("omega-import-surface-test", `contracts-${Date.now()}`);
    scaffold(root, { ...CLEAN, "contracts/src/a.ts": `import { y } from "@vivim/omega-shim";\nvoid y;\n` });
    const r = await checkImportSurface(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/contracts src/);
    rmSync(root, { recursive: true, force: true });
  });

  test("shim src importing the host fails; host src importing the shim fails", async () => {
    const root = omegaTmp("omega-import-surface-test", `shimhost-${Date.now()}`);
    scaffold(root, {
      ...CLEAN,
      "shim/src/i.ts": `import { bootComposition } from "@vivim/omega-host";\nvoid bootComposition;\n`,
      "host/src/h.ts": `import { startPlugin } from "@vivim/omega-shim";\nvoid startPlugin;\n`,
    });
    const r = await checkImportSurface(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/shim src/);
    expect(r.issues.join("\n")).toMatch(/host src/);
    rmSync(root, { recursive: true, force: true });
  });
});
