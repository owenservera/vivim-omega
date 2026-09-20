// tooling/gates/test/f-genome.test.ts — the F-GENOME falsifier (D-425, Ω-DEV.1).
// Generated as a RED stub by `omega:loop --stub D-425`, then implemented —
// the falsifier-first loop's own shape (D-426). Pure-first fixtures plus one
// live lock against the REAL tree (the process.test.ts pattern).
//  F-GENOME.1 fold-completeness — index↔genome both directions (INCOMPLETE / ORPHAN)
//  F-GENOME.2 no-hand-edits — deterministic fold + byte-exact committed artifacts
//  F-GENOME.3 falsifier-resolution — implemented layers resolve, word-boundary
//  F-GENOME.4 dag-validity — unknown deps and cycles refuse, named
//  F-GENOME.5 budget — genome ≤ 256 KiB, brief ≤ 16 KiB
//  F-GENOME.6 live-lock — the real tree verifies GREEN with committed artifacts
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  checkGenome, foldGenome, parseLayerRegistry, renderGenomeBrief, serializeGenome, verifyGenome,
  type GenomeInputs, type LayerEntry,
} from "../genome.ts";

const REAL_ROOT = join(import.meta.dir, "../../..");

// ---- the fixture kit (pure — no fs) ----

const REC = (n: number) => `# D-${n} — fixture

## Status

RATIFIED

## Context

- fixture record

Blocks: none

## Options

| Criterion | (a) x | (b) y |
|---|---|---|
| c | | |

## Decision

**Decision:** (a) — fixture.

## Consequences

- fixture

## Evidence

  - F-TST.1 (works) — the fixture clause, declared in the clause-line shape.

## Index

summary: s
rationale: r
class: evidence
`;

const BASE_LAYERS: LayerEntry[] = [
  { id: "CORE", name: "core", status: "implemented", treeId: null, specId: null, falsifier: null, dependsOn: [], note: "the core", evidence: "program" },
  { id: "Ω-T", name: "test layer", status: "implemented", treeId: 1, specId: "D-900", falsifier: "F-TST", dependsOn: ["CORE"], note: "t" },
];

function registryText(layers: LayerEntry[]): string {
  return JSON.stringify({
    registryVersion: 1, kind: "fixture",
    lineage: { note: "n", specLineage: "s", assumedDirective: "a" },
    statuses: ["implemented", "external-assumed", "ratified-unimplemented", "queued"],
    layers,
  }, null, 2);
}

const INDEX = (rows: string[]) => rows.join("\n");
const ROW = (n: number, status = "RATIFIED") => `| **D-${n}** | a | **${status}** · evidence | r |`;

function inputs(over: Partial<GenomeInputs> = {}, layers: LayerEntry[] = BASE_LAYERS): GenomeInputs {
  const base: GenomeInputs = {
    registryText: registryText(layers),
    indexText: INDEX([ROW(1)]),
    records: [{ n: 1, file: "D-1-fixture.md", text: REC(1) }],
    tests: [{ path: "tooling/gates/test/f-tst.test.ts", text: "// carries F-TST for the fixture\n" }],
    committedGenome: null,
    committedBrief: null,
    gateStages: ["decisions", "genome"],
    pluginsCount: 0,
    compositionsCount: 0,
    ...over,
  };
  return base;
}

/** The green baseline: committed artifacts = the byte-exact fold of these inputs. */
function committed(i: GenomeInputs): { committedGenome: string; committedBrief: string } {
  const { registry } = parseLayerRegistry(i.registryText);
  const g = foldGenome(i, registry!);
  return { committedGenome: serializeGenome(g), committedBrief: renderGenomeBrief(g) };
}

const codes = (r: { issues: string[] }) => r.issues.map((i) => i.split(":")[0]);

describe("F-GENOME.1 fold-completeness", () => {
  test("green baseline — committed = the fold ⇒ zero issues", () => {
    const i = inputs();
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
  test("tree has a decision the committed genome lacks ⇒ GENOME_INCOMPLETE, named", () => {
    const older = inputs({ indexText: INDEX([ROW(1)]), records: [{ n: 1, file: "D-1-fixture.md", text: REC(1) }] });
    const c = committed(older); // folded BEFORE D-2 existed
    const nowTree = inputs({ indexText: INDEX([ROW(1), ROW(2)]), records: [
      { n: 1, file: "D-1-fixture.md", text: REC(1) },
      { n: 2, file: "D-2-fixture.md", text: REC(2) },
    ] });
    const r = verifyGenome({ ...nowTree, ...c });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("GENOME_INCOMPLETE") && i.includes("D-2"))).toBe(true);
  });
  test("committed genome lists a ghost decision ⇒ GENOME_ORPHAN, named", () => {
    const older = inputs({ indexText: INDEX([ROW(1), ROW(2)]), records: [
      { n: 1, file: "D-1-fixture.md", text: REC(1) },
      { n: 2, file: "D-2-fixture.md", text: REC(2) },
    ] });
    const c = committed(older); // folded when D-2 existed
    const nowTree = inputs();   // D-2 since deleted from the tree
    const r = verifyGenome({ ...nowTree, ...c });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("GENOME_ORPHAN") && i.includes("D-2"))).toBe(true);
  });
  test("registry claims a treeId with no record file ⇒ GENOME_ORPHAN (registry direction)", () => {
    const i = inputs();
    const c = committed(i);
    const lying = inputs({ registryText: registryText([
      BASE_LAYERS[0],
      { ...BASE_LAYERS[1], treeId: 99 },
    ]) }, [BASE_LAYERS[0], { ...BASE_LAYERS[1], treeId: 99 }]);
    const r = verifyGenome({ ...lying, ...c });
    expect(r.ok).toBe(false);
    expect(r.issues.some((x) => x.startsWith("GENOME_ORPHAN") && x.includes("D-99"))).toBe(true);
  });
});

describe("F-GENOME.2 no-hand-edits", () => {
  test("determinism — the same inputs fold twice ⇒ byte-identical artifacts", () => {
    const i = inputs();
    const { registry } = parseLayerRegistry(i.registryText);
    const a = serializeGenome(foldGenome(i, registry!));
    const b = serializeGenome(foldGenome({ ...i }, registry!));
    expect(a).toBe(b);
    expect(renderGenomeBrief(foldGenome(i, registry!))).toBe(renderGenomeBrief(foldGenome({ ...i }, registry!)));
  });
  test("a hand-edited committed genome ⇒ GENOME_HAND_EDIT", () => {
    const i = inputs();
    const c = committed(i);
    const r = verifyGenome({ ...i, committedGenome: `${c.committedGenome}x`, committedBrief: c.committedBrief });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("GENOME_HAND_EDIT");
  });
  test("a hand-edited committed brief ⇒ GENOME_HAND_EDIT", () => {
    const i = inputs();
    const c = committed(i);
    const r = verifyGenome({ ...i, committedGenome: c.committedGenome, committedBrief: `${c.committedBrief}x` });
    expect(r.ok).toBe(false);
    expect(r.issues.some((x) => x.startsWith("GENOME_HAND_EDIT") && x.includes("genome.md"))).toBe(true);
  });
  test("absent artifacts ⇒ GENOME_MISSING, both named", () => {
    const r = verifyGenome(inputs());
    expect(r.ok).toBe(false);
    expect(r.issues.filter((x) => x.startsWith("GENOME_MISSING")).length).toBe(2);
  });
  test("a program-evidence layer claiming a record or falsifier is a status lie, both directions", () => {
    const lying = inputs({}, [
      { ...BASE_LAYERS[0], treeId: 1 },
      BASE_LAYERS[1],
    ]);
    const c = committed(lying);
    const r = verifyGenome({ ...lying, ...c });
    expect(r.issues.some((x) => x.startsWith("GENOME_STATUS_LIE") && x.includes("program evidence"))).toBe(true);
  });
});

describe("F-GENOME.3 falsifier-resolution", () => {
  test("implemented layer with an unresolved falsifier ⇒ GENOME_FALSIFIER_UNRESOLVED", () => {
    const i = inputs({ tests: [] }); // no test carries F-TST
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.ok).toBe(false);
    expect(r.issues.some((x) => x.startsWith("GENOME_FALSIFIER_UNRESOLVED") && x.includes("F-TST"))).toBe(true);
  });
  test("word-boundary resolution — a test carrying F-SIMPLE does not resolve F-SIM", () => {
    const layers: LayerEntry[] = [
      BASE_LAYERS[0],
      { ...BASE_LAYERS[1], falsifier: "F-SIM" },
    ];
    const i = inputs({ tests: [{ path: "tooling/gates/test/f-simple.test.ts", text: "// carries F-SIMPLE only\n" }] }, layers);
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.issues.some((x) => x.startsWith("GENOME_FALSIFIER_UNRESOLVED") && x.includes("F-SIM"))).toBe(true);
  });
  test("non-implemented layers may carry unresolved falsifiers honestly (reported, not failed)", () => {
    const layers: LayerEntry[] = [
      BASE_LAYERS[0],
      { id: "Ω-P", name: "paper", status: "ratified-unimplemented", treeId: null, specId: "D-901", falsifier: "F-PAPER", dependsOn: ["CORE"], note: "p" },
    ];
    const i = inputs({}, layers);
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.ok).toBe(true); // Ω-P has no tree evidence — no falsifier file is the honest state
    expect((r.detail.unresolvedFalsifiers as string[]).some((f) => f.includes("F-PAPER"))).toBe(true);
  });
});

describe("F-GENOME.4 dag-validity", () => {
  test("unknown dependency ⇒ the dep is named", () => {
    const layers: LayerEntry[] = [BASE_LAYERS[0], { ...BASE_LAYERS[1], dependsOn: ["Ω-X"] }];
    const i = inputs({}, layers);
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.issues.some((x) => x.includes("depends on unknown layer") && x.includes("Ω-X"))).toBe(true);
  });
  test("a cycle ⇒ GENOME_CYCLE names the members", () => {
    const layers: LayerEntry[] = [
      { ...BASE_LAYERS[0], dependsOn: ["Ω-T"] }, // CORE → Ω-T → CORE
      BASE_LAYERS[1],
    ];
    const i = inputs({}, layers);
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.issues.some((x) => x.includes("cycle") && x.includes("CORE") && x.includes("Ω-T"))).toBe(true);
  });
});

describe("F-GENOME.5 budget", () => {
  test("an inflated note breaches the budget ⇒ GENOME_BUDGET_EXCEEDED", () => {
    const layers: LayerEntry[] = [BASE_LAYERS[0], { ...BASE_LAYERS[1], note: "x".repeat(300 * 1024) }];
    const i = inputs({}, layers);
    const c = committed(i);
    const r = verifyGenome({ ...i, ...c });
    expect(r.issues.some((x) => x.startsWith("GENOME_BUDGET_EXCEEDED"))).toBe(true);
  });
});

describe("F-GENOME.6 live-lock", () => {
  test("the REAL tree verifies GREEN with committed artifacts; reported facts are self-consistent", () => {
    const r = checkGenome(REAL_ROOT);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    // the fold's external-assumed count equals the registry's claim (self-consistency, not a pinned census)
    const registry = parseLayerRegistry(readFileSync(join(REAL_ROOT, "genome/layers.json"), "utf-8"));
    const claimed = registry.registry!.layers.filter((l) => l.status === "external-assumed").length;
    expect(r.detail.externalAssumed).toBe(claimed);
    // in-flight layers are implemented layers whose record flip is pending — reported, never failed
    for (const id of (r.detail.inFlight as string[]) ?? []) expect(id.startsWith("Ω-DEV.") || id === "CORE").toBe(true);
    // every implemented layer's falsifier resolves
    expect((r.detail.unresolvedFalsifiers as string[]).filter((f) => f.includes("F-GENOME") || f.includes("F-LOOP") || f.includes("F-ORCH") || f.includes("F-DEVAULT") || f.includes("F-PRESIM"))).toEqual([]);
  });
});
