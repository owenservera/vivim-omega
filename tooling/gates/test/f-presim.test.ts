// tooling/gates/test/f-presim.test.ts — the F-PRESIM falsifier (D-429, Ω-DEV.5).
// Generated as a RED stub by `omega:loop --stub D-429`, then implemented.
//  F-PRESIM.1 determinism — same inputs ⇒ byte-identical receipt (inputHash pins them)
//  F-PRESIM.2 mutation-coverage — the catalog's expected refusals fire or are reported UNCAUGHT, never hidden
//  F-PRESIM.3 advisory-never-blocking — verdict advisory, write scope build/sim-receipts/ only
//  F-PRESIM.4 unknown-layer-refusal — SIM_LAYER_UNKNOWN, refusal-as-sentence
import { describe, test, expect } from "bun:test";
import { receiptPath, simulateLayer } from "../simulate.ts";
import { foldGenome, parseLayerRegistry, serializeGenome, type GenomeInputs, type LayerEntry } from "../genome.ts";

const BASE_LAYERS: LayerEntry[] = [
  { id: "CORE", name: "core", status: "implemented", treeId: null, specId: null, falsifier: null, dependsOn: [], note: "the core", evidence: "program" },
  { id: "Ω-IMP", name: "implemented fixture", status: "implemented", treeId: 1, specId: "D-900", falsifier: "F-IMP", dependsOn: ["CORE"], note: "imp" },
  { id: "Ω-ASM", name: "assumed fixture", status: "external-assumed", treeId: null, specId: "D-901", falsifier: "F-ASM", dependsOn: ["CORE"], note: "asm" },
];

function registryText(layers: LayerEntry[]): string {
  return JSON.stringify({
    registryVersion: 1, kind: "fixture",
    lineage: { note: "n", specLineage: "s", assumedDirective: "a" },
    statuses: ["implemented", "external-assumed", "ratified-unimplemented", "queued"],
    layers,
  }, null, 2);
}

function inputs(): GenomeInputs {
  const base: GenomeInputs = {
    registryText: registryText(BASE_LAYERS),
    indexText: "| **D-1** | a | **RATIFIED** · evidence | r |",
    records: [{ n: 1, file: "D-1-fixture.md", text: "# D-1 — f\n\n## Status\n\nRATIFIED\n\n## Context\n\n- f\n\nBlocks: none\n\n## Options\n\n| Criterion | (a) x | (b) y |\n|---|---|---|\n| c | | |\n\n## Decision\n\n**Decision:** (a) — f.\n\n## Consequences\n\n- f\n\n## Evidence\n\n  - F-IMP.1 (works) — the fixture clause.\n\n## Index\n\nsummary: s\nrationale: r\nclass: evidence\n" }],
    tests: [{ path: "tooling/gates/test/f-imp.test.ts", text: "// carries F-IMP\n" }],
    committedGenome: null,
    committedBrief: null,
    gateStages: ["genome"],
    pluginsCount: 0,
    compositionsCount: 0,
  };
  const { registry } = parseLayerRegistry(base.registryText);
  base.committedGenome = serializeGenome(foldGenome(base, registry!));
  return base;
}

describe("F-PRESIM.1 determinism", () => {
  test("same registry + layer + committed genome ⇒ byte-identical receipt", () => {
    const a = simulateLayer(inputs(), "Ω-IMP");
    const b = simulateLayer(inputs(), "Ω-IMP");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.inputHash).toBe(b.inputHash);
  });
  test("the inputHash pins the inputs — a different committed genome changes it", () => {
    const a = simulateLayer(inputs(), "Ω-IMP");
    const i2 = inputs();
    i2.committedGenome = `${i2.committedGenome!.slice(0, -2)}  }\n`;
    const b = simulateLayer(i2, "Ω-IMP");
    expect(a.inputHash).not.toBe(b.inputHash);
  });
});

describe("F-PRESIM.2 mutation-coverage", () => {
  test("an implemented layer: every applicable mutation is CAUGHT by the expected refusal", () => {
    const r = simulateLayer(inputs(), "Ω-IMP");
    const byName = new Map(r.mutations.map((f) => [f.mutation, f]));
    // applicable on an implemented layer with a record and a falsifier:
    expect(byName.get("orphan-record")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("status-lie-implemented-no-record")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("dep-unknown")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("dep-cycle")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("falsifier-unresolved")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("budget-blow")).toMatchObject({ applicable: true, caught: true });
    // the assumed-lie mutation does not apply to an implemented layer — SKIPPED, never UNCAUGHT
    expect(byName.get("status-lie-assumed-with-record")).toMatchObject({ applicable: false });
    expect(r.uncaughtCount).toBe(0);
  });
  test("an external-assumed layer: the assumed-lie mutation bites; the implemented-lie is skipped", () => {
    const r = simulateLayer(inputs(), "Ω-ASM");
    const byName = new Map(r.mutations.map((f) => [f.mutation, f]));
    expect(byName.get("status-lie-assumed-with-record")).toMatchObject({ applicable: true, caught: true });
    expect(byName.get("status-lie-implemented-no-record")).toMatchObject({ applicable: false });
    expect(byName.get("orphan-record")).toMatchObject({ applicable: false }); // no treeId to orphan
    expect(r.uncaughtCount).toBe(0);
  });
});

describe("F-PRESIM.3 advisory-never-blocking", () => {
  test("the verdict is advisory and the scope header says what this sim is NOT", () => {
    const r = simulateLayer(inputs(), "Ω-IMP");
    expect(r.verdict).toBe("advisory");
    expect(r.scope).toContain("NOT runtime behavioral simulation");
    expect(r.scope).toContain("never blocking");
  });
  test("the write scope is build/sim-receipts/ only — the pure core writes nothing", () => {
    expect(receiptPath("Ω-DEV.1")).toBe("build/sim-receipts/_-DEV.1.json");
    expect(receiptPath("Ω-IMP")).toMatch(/^build\/sim-receipts\/[^/]+\.json$/);
    // simulateLayer is pure: it returns a receipt and touches no file (the CLI owns the one write)
    const before = simulateLayer(inputs(), "Ω-IMP");
    const after = simulateLayer(inputs(), "Ω-IMP");
    expect(before).toEqual(after);
  });
});

describe("F-PRESIM.4 unknown-layer-refusal", () => {
  test("simulating an unknown layer is refused with the SIM_LAYER_UNKNOWN sentence", () => {
    expect(() => simulateLayer(inputs(), "Ω-NONEXISTENT")).toThrow(/SIM_LAYER_UNKNOWN: layer "Ω-NONEXISTENT" is not in the registry/);
  });
});
