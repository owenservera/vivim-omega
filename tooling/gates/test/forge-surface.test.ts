// tooling/gates/test/forge-surface.test.ts — the D5 falsifiers: every forge-surface
// rule proven GREEN on the real tree AND RED on a hand-built violation. The check
// functions are pure over an input object, so red fixtures are mutated copies of
// the real input — the gate and the tests see the same truth.
import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import type { PluginManifest } from "@vivim/omega-contracts";
import { checkForgeSurface, loadForgeSurfaceInput, type ForgeSurfaceInput } from "../forge-surface.ts";

const ROOT = join(import.meta.dir, "../../..");
let real: ForgeSurfaceInput;

beforeAll(async () => {
  real = await loadForgeSurfaceInput(ROOT);
});

/** A deep copy of the real input — mutations land on the copy, never the tree. */
function mutated(fn: (input: ForgeSurfaceInput) => void): ForgeSurfaceInput {
  const copy = JSON.parse(JSON.stringify(real)) as ForgeSurfaceInput;
  fn(copy);
  return copy;
}

function rulesOf(r: { issues: Array<{ check: string }> }): string[] {
  return r.issues.map((i) => i.check);
}

describe("D5 — forge-surface on the REAL tree (all green)", () => {
  test("the loader actually sees the domain (guards against silent no-op)", () => {
    expect(real.forgePlugins.map((p) => p.manifest.id)).toEqual(["forge.author"]);
    expect(real.compositions.some((c) => c.name === "forge-author")).toBe(true);
    expect(real.compositions.length).toBeGreaterThanOrEqual(18);
    expect(Object.keys(real.catalog).length).toBe(24);
    expect(real.packFixtureValidation.length).toBe(14); // 7 valid + 7 invalid, each pinned to its sin
  });

  test("the real tree passes every check (the Forge boundary holds)", () => {
    const r = checkForgeSurface(real);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test("the builder composition routes its forge op; no product composition does", () => {
    const builder = real.compositions.find((c) => c.name === "forge-author")!;
    expect(builder.entries.find((e) => e.id === "forge.author")?.grant.contracts).toContain("forge.author.init@1");
    for (const comp of real.compositions) {
      if (comp.name.startsWith("forge-")) continue;
      for (const e of comp.entries) {
        expect(e.grant.contracts.filter((c) => c.startsWith("forge."))).toEqual([]);
      }
    }
  });
});

describe("D5 — FORGE_IN_PRODUCT (red)", () => {
  test("a product composition granting a forge.* op fails with the op named", () => {
    const r = checkForgeSurface(mutated((input) => {
      const agent = input.compositions.find((c) => c.name === "agent")!;
      agent.entries[0]!.grant.contracts.push("forge.emit.plugin@1");
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_IN_PRODUCT")!;
    expect(hit.subject).toContain("agent");
    expect(hit.reason).toContain("forge.emit.plugin@1");
    expect(hit.fix).toContain("builder composition");
  });
});

describe("D5 — FORGE_CLASS_SPAN (red)", () => {
  test("a forge plugin declaring ops in two risk classes fails (READ + MUTATION is still two)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.forgePlugins[0]!.manifest as PluginManifest;
      m.contributions!.contract!.push({ kind: "contract", id: "forge.survey.run", version: "1", risk: "READ" });
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_CLASS_SPAN")!;
    expect(hit.subject).toBe("plugins/forge-author");
    expect(hit.reason).toContain("READ");
    expect(hit.reason).toContain("MUTATION");
    expect(hit.fix).toContain("split");
  });
});

describe("D5 — FORGE_EMIT_SCOPE (red)", () => {
  test("a manifest justification without the proposal-only claim fails", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.forgePlugins[0]!.manifest as PluginManifest;
      m.capabilities!.justification = "reads recorded specs and writes provisional scaffold artifacts";
    }));
    expect(r.ok).toBe(false);
    expect(rulesOf(r)).toContain("FORGE_EMIT_SCOPE");
    expect(r.issues.find((i) => i.check === "FORGE_EMIT_SCOPE")!.reason).toContain("proposal-only");
  });

  test("a forge plugin whose source writes a vault ns other than proposal fails with the ns named", () => {
    const r = checkForgeSurface(mutated((input) => {
      const p = input.forgePlugins[0]!;
      p.sourceText["src/index.ts"] = `${p.sourceText["src/index.ts"]}\nawait ctx.port.call("vault.append@1", { ns: "config", id: "evil", data: {} });\n`;
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_EMIT_SCOPE")!;
    expect(hit.reason).toContain("config");
    expect(hit.fix).toContain("ns proposal");
  });
});

describe("D5 — FORGE_NO_REFUSAL_TEST (red)", () => {
  test("a declared forge.* op with no refusal test naming it fails with the op named", () => {
    const r = checkForgeSurface(mutated((input) => {
      input.forgePlugins[0]!.refusalTestTexts = []; // the refusal suite vanished
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_NO_REFUSAL_TEST")!;
    expect(hit.reason).toContain("forge.author.init@1");
    expect(hit.fix).toContain("test/refusal");
  });
});

describe("D5 — FORGE_CONTRACT_DRIFT (red)", () => {
  test("a manifest risk that contradicts the catalog fails (two sources, one truth)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.forgePlugins[0]!.manifest as PluginManifest;
      m.contributions!.contract![0]!.risk = "READ";
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_CONTRACT_DRIFT")!;
    expect(hit.reason).toContain("forge.author.init@1");
    expect(hit.reason).toContain("MUTATION");
  });

  test("a declared op absent from the catalog fails (the wire is frozen)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.forgePlugins[0]!.manifest as PluginManifest;
      m.contributions!.contract![0]!.id = "forge.author.explode";
    }));
    expect(r.ok).toBe(false);
    expect(rulesOf(r)).toContain("FORGE_CONTRACT_DRIFT");
    expect(r.issues.find((i) => i.check === "FORGE_CONTRACT_DRIFT")!.reason).toContain("not in pack.builder");
  });

  test("an invalid pack fixture that VALIDATES fails (a schema that cannot reject is not a schema)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const bad = input.packFixtureValidation.find((f) => f.fixture.includes("invalid"))!;
      bad.valid = true; // the schema stopped rejecting the pinned sin
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_CONTRACT_DRIFT")!;
    expect(hit.reason).toContain("no longer rejects");
  });

  test("a valid pack fixture that fails validation fails (fixture and schema drifted apart)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const good = input.packFixtureValidation.find((f) => !f.fixture.includes("invalid"))!;
      good.valid = false;
      good.errors = ["targetPath: must be a non-empty string"];
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "FORGE_CONTRACT_DRIFT")!;
    expect(hit.reason).toContain("valid fixture fails");
  });
});

describe("D5 — GEN_LEVEL_MISSING (red, hard for forge.*/pack.builder)", () => {
  test("a forge plugin without a generality block fails", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.forgePlugins[0]!.manifest as PluginManifest & { generality?: unknown };
      delete m.generality;
    }));
    expect(r.ok).toBe(false);
    const hit = r.issues.find((i) => i.check === "GEN_LEVEL_MISSING")!;
    expect(hit.reason).toContain("forge.author");
  });

  test("pack.builder without a generality block fails too (it declares the frozen wire)", () => {
    const r = checkForgeSurface(mutated((input) => {
      const m = input.packBuilder.manifest as PluginManifest & { generality?: unknown };
      delete m.generality;
    }));
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.check === "GEN_LEVEL_MISSING")!.reason).toContain("pack.builder");
  });
});
