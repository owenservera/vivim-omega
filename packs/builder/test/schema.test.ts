// pack.builder — test/schema.test.ts (Wave 0 / D-406)
// Pack conformance, four proofs:
//   1. the seven artifact schemas accept their valid fixtures and reject the
//      invalid ones (each invalid breaks exactly one named rule);
//   2. the semantic laws the zod mirror cannot express: assay boundary
//      three-axis admissibility + blueprint one-writer-per-namespace;
//   3. the plugin.json contract catalog equals src/schemas.ts::FORGE_OP_CATALOG
//      exactly (the two-source drift the pack exists to prevent);
//   4. fixtures are hash-pinned (manifest.json) and validation is
//      deterministic (same input twice → identical output).
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  BUILDER_SCHEMAS, FORGE_OP_CATALOG, FORGE_PLUGIN_IDS,
  assayBoundaryIssues, shapeBlueprintIssues, validateArtifact,
  type BuilderArtifactKind,
} from "../src/schemas.ts";

const FIXDIR = join(import.meta.dir, "fixtures");

function load(sub: "valid" | "invalid", kind: BuilderArtifactKind): unknown {
  return JSON.parse(readFileSync(join(FIXDIR, sub, `${kind}.json`), "utf-8"));
}

describe("pack.builder conformance — the seven shapes (valid accepts)", () => {
  for (const kind of Object.keys(BUILDER_SCHEMAS) as BuilderArtifactKind[]) {
    test(`valid ${kind} fixture passes`, () => {
      const r = validateArtifact(kind, load("valid", kind));
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
});

describe("pack.builder conformance — the seven shapes (invalid rejects, one named rule each)", () => {
  test("invalid capture-receipt: file hash grammar", () => {
    const r = validateArtifact("capture-receipt", load("invalid", "capture-receipt"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("hash");
  });

  test("invalid inventory-row: language must be string|null", () => {
    const r = validateArtifact("inventory-row", load("invalid", "inventory-row"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("language");
  });

  test("invalid assay-verdict: disposition enum", () => {
    const r = validateArtifact("assay-verdict", load("invalid", "assay-verdict"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("disposition");
  });

  test("invalid shape-blueprint: writer must be non-empty", () => {
    const r = validateArtifact("shape-blueprint", load("invalid", "shape-blueprint"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("writer");
  });

  test("invalid proposal-artifact: authority must be the literal 'none' (the emission-confers-no-authority law)", () => {
    const r = validateArtifact("proposal-artifact", load("invalid", "proposal-artifact"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("authority");
  });

  test("invalid proof-report: check result enum", () => {
    const r = validateArtifact("proof-report", load("invalid", "proof-report"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("result");
  });

  test("invalid generality-stamp: mine must be pinned", () => {
    const r = validateArtifact("generality-stamp", load("invalid", "generality-stamp"));
    expect(r.ok).toBe(false);
    expect(r.errors.join("; ")).toContain("mine");
  });
});

describe("pack.builder conformance — semantic laws (zod cannot express)", () => {
  test("the three-axis law: an inadmissible boundary is named, not silently accepted", () => {
    const verdict = load("valid", "assay-verdict") as { boundaries: Array<{ op: string; refusable: boolean; substitutable: boolean; provable: boolean }> };
    const inadmissible = {
      ...verdict,
      boundaries: [
        { op: "cache.warm@1", rationale: "no distinct risk class, principal or consent at this edge", refusable: false, substitutable: true, provable: true },
      ],
    };
    const issues = assayBoundaryIssues(inadmissible as never);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("cache.warm@1 inadmissible (refusable)");
  });

  test("the one-writer law: a second writer on a namespace is named, amendment-class", () => {
    const bp = load("valid", "shape-blueprint") as { namespaces: Array<{ name: string; writer: string }>; plugins: Array<{ id: string; writtenNamespace: string | null }> };
    const twoWriters = {
      ...bp,
      namespaces: [...bp.namespaces, { name: "chat", writer: "vivim.mind", readers: [], retention: "x" }],
    };
    const issues = shapeBlueprintIssues(twoWriters as never);
    expect(issues.some((i) => i.includes("namespace chat has 2 writers"))).toBe(true);
  });

  test("a plugin writing an undeclared namespace is named", () => {
    const bp = load("valid", "shape-blueprint") as { namespaces: Array<{ name: string }>; plugins: Array<{ id: string; writtenNamespace: string | null }> };
    const rogue = { ...bp, plugins: [...bp.plugins, { id: "rogue.writer", ops: [], writtenNamespace: "ghost", generality: bp.plugins[0].generality }] };
    const issues = shapeBlueprintIssues(rogue as never);
    expect(issues.some((i) => i.includes("undeclared namespace ghost"))).toBe(true);
  });

  test("the valid blueprint's own shape carries zero semantic issues", () => {
    expect(shapeBlueprintIssues(load("valid", "shape-blueprint") as never)).toEqual([]);
    expect(assayBoundaryIssues(load("valid", "assay-verdict") as never)).toEqual([]);
  });
});

describe("pack.builder conformance — the frozen wire (catalog equality)", () => {
  test("plugin.json contract contributions === FORGE_OP_CATALOG exactly (no drift between the two sources)", () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8"));
    const declared: Record<string, string> = {};
    for (const c of manifest.contributions.contract as Array<{ id: string; version: string; risk: string }>) {
      declared[`${c.id}@${c.version}`] = c.risk;
    }
    expect(declared).toEqual({ ...FORGE_OP_CATALOG });
    expect(Object.keys(declared).length).toBe(24);
  });

  test("every catalog op is namespaced forge.<area>.<verb> and every area is one of the eight Forges", () => {
    for (const op of Object.keys(FORGE_OP_CATALOG)) {
      const m = /^forge\.([a-z]+)\.[a-z]+@1$/.exec(op);
      expect(m).not.toBeNull();
      expect(FORGE_PLUGIN_IDS).toContain(`forge.${m![1]}`);
    }
  });

  test("capture is EXTERNAL_MUTATION; every emit/author/tier op is MUTATION; survey/assay/shape/proof are READ", () => {
    expect(FORGE_OP_CATALOG["forge.mine.capture@1"]).toBe("EXTERNAL_MUTATION");
    for (const [op, risk] of Object.entries(FORGE_OP_CATALOG)) {
      if (op.startsWith("forge.emit.") || op.startsWith("forge.author.") || op.startsWith("forge.tier.")) {
        expect(risk).toBe("MUTATION");
      } else if (op !== "forge.mine.capture@1") {
        expect(risk).toBe("READ");
      }
    }
  });
});

describe("pack.builder conformance — fixtures are pinned and validation is deterministic", () => {
  test("every fixture hash in manifest.json matches the file on disk", () => {
    const pinned = JSON.parse(readFileSync(join(FIXDIR, "manifest.json"), "utf-8")) as { fixtures: Record<string, string> };
    for (const [rel, want] of Object.entries(pinned.fixtures)) {
      const got = `sha256:${createHash("sha256").update(readFileSync(join(FIXDIR, rel))).digest("hex")}`;
      expect(got).toBe(want);
    }
    expect(Object.keys(pinned.fixtures).length).toBe(14);
  });

  test("the pinned set covers every schema kind on both sides (7 valid + 7 invalid)", () => {
    for (const sub of ["valid", "invalid"]) {
      const files = readdirSync(join(FIXDIR, sub)).filter((f) => f.endsWith(".json")).sort();
      expect(files).toEqual(Object.keys(BUILDER_SCHEMAS).map((k) => `${k}.json`).sort());
    }
  });

  test("determinism: same fixture twice → byte-identical validation output", () => {
    for (const kind of Object.keys(BUILDER_SCHEMAS) as BuilderArtifactKind[]) {
      const a = JSON.stringify(validateArtifact(kind, load("valid", kind)));
      const b = JSON.stringify(validateArtifact(kind, load("valid", kind)));
      expect(a).toBe(b);
    }
  });
});
