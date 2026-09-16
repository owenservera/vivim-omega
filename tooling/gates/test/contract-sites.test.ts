// D-332 unit evidence: the call-site check flags vocabulary without a
// writer/reader, counts real usages (not barrel pass-through), and honors
// the allowlist — against temp dirs, never the real tree.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkContractCallSites, collectContractExports, findCallSites } from "../contract-sites.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

function scaffold(root: string, contracts: Record<string, string>, extra: Record<string, string>): void {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "contracts", "src"), { recursive: true });
  for (const [name, body] of Object.entries(contracts)) {
    writeFileSync(join(root, "contracts", "src", name), body);
  }
  for (const [name, body] of Object.entries(extra)) {
    const full = join(root, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

describe("D-332 contract call sites — export parsing", () => {
  test("collects interfaces, types, functions, consts, and export{} aliases (not export *)", async () => {
    const root = omegaTmp("omega-d332-test", `parse-${Date.now()}`);
    scaffold(root, {
      "a.ts": "export interface Alpha { x: string }\nexport type Beta = string;\nexport function gamma(): void {}\nexport const DELTA = 1;\n",
      "b.ts": "import type { Alpha } from './a.ts';\nexport type { Alpha };\nexport * from './a.ts';\n",
    }, {});
    const m = collectContractExports(root);
    expect(m.get("Alpha")).toEqual(["a.ts", "b.ts"]);
    expect(m.get("Beta")).toEqual(["a.ts"]);
    expect(m.get("gamma")).toEqual(["a.ts"]);
    expect(m.get("DELTA")).toEqual(["a.ts"]);
    expect(m.has("*")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("D-332 contract call sites — verdicts", () => {
  test("used export passes; barrel-only re-export does not count; unused fails naming D-332", async () => {
    const root = omegaTmp("omega-d332-test", `verdict-${Date.now()}`);
    scaffold(root, {
      "a.ts": "export interface Used { x: string }\nexport interface BarrelOnly { y: string }\nexport interface Ghost { z: string }\n",
      "index.ts": "export * from './a.ts';\n",
    }, {
      "plugins/x/index.ts": "import type { Used } from '../../../contracts/src/a.ts';\nexport const v: Used = { x: 'y' };\n",
      "plugins/y/barrel.ts": "export type { BarrelOnly } from '../../../contracts/src/a.ts';\n",
    });
    const hit = findCallSites(root, new Set(["Used", "BarrelOnly", "Ghost"]));
    expect(hit.has("Used")).toBe(true);
    expect(hit.has("BarrelOnly")).toBe(false); // export pass-through never counts
    expect(hit.has("Ghost")).toBe(false);
    const r = await checkContractCallSites(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain('"Ghost"');
    expect(r.issues.join("\n")).toContain("D-332");
    expect(r.issues.join("\n")).toContain('"BarrelOnly"');
    expect(r.issues.join("\n")).not.toContain('"Used"');
    rmSync(root, { recursive: true, force: true });
  });

  test("allowlisted reservations pass loudly (detail names them)", async () => {
    const root = omegaTmp("omega-d332-test", `allow-${Date.now()}`);
    // LangOpFrame is a grandfathered reservation: zero call sites, still ok.
    scaffold(root, { "a.ts": "export interface LangOpFrame { x: string }\n" }, {});
    const r = await checkContractCallSites(root);
    expect(r.ok).toBe(true);
    expect(r.detail.allowlisted).toContain("LangOpFrame");
    rmSync(root, { recursive: true, force: true });
  });

  test("the checker never observes itself (own allowlist keys are not call sites)", async () => {
    const root = omegaTmp("omega-d332-test", `self-${Date.now()}`);
    scaffold(root, { "a.ts": "export interface ProvenanceTier { x: string }\n" }, {});
    const r = await checkContractCallSites(root);
    expect(r.ok).toBe(true); // allowlisted, not self-laundered
    expect(r.detail.allowlisted).toContain("ProvenanceTier");
    rmSync(root, { recursive: true, force: true });
  });
});
