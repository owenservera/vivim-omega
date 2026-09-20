// tooling/gates/test/f-orch.test.ts — the F-ORCH falsifier (D-427, Ω-DEV.3).
// Generated as a RED stub by `omega:loop --stub D-427`, then implemented.
//  F-ORCH.1 plan-determinism — the plan is a pure function of the genome
//  F-ORCH.2 bucket-correctness — deps gate the buckets, named per node
//  F-ORCH.3 assumed-deps-honesty — assumed deps satisfy planning, never become tree evidence
//  F-ORCH.4 merge-is-the-gate — the verdict runs the FULL gate; red refuses with the stages named
import { describe, test, expect } from "bun:test";
import { mergeVerdict, planFromGenome, type PlanBucket } from "../orchestrate.ts";
import type { Genome, GenomeLayer } from "../genome.ts";

const layer = (id: string, over: Partial<GenomeLayer> = {}): GenomeLayer => ({
  id, name: id, status: "implemented", dependsOn: [], note: "",
  specId: null,
  evidence: { treeId: null, recordFile: null, recordStatus: "RATIFIED", falsifier: null, falsifierFile: null, falsifierClauses: [], evidenceKind: "record" },
  ...over,
});

function fixtureGenome(): Genome {
  const layers: GenomeLayer[] = [
    layer("A"),                                                                    // implemented + RATIFIED → done
    layer("B", { evidence: { treeId: 2, recordFile: "docs/decisions/D-2-x.md", recordStatus: "PROPOSED", falsifier: null, falsifierFile: null, falsifierClauses: [] } }), // → inFlight
    layer("C", { status: "external-assumed", evidence: { treeId: null, recordFile: null, recordStatus: null, falsifier: "F-PAPER", falsifierFile: null, falsifierClauses: [] } }), // → verifyQueue
    layer("D", { status: "ratified-unimplemented", dependsOn: ["A", "B"] }),      // deps satisfied → buildQueue
    layer("E", { status: "queued", dependsOn: ["C"] }),                           // assumed dep satisfies → specQueue
    layer("F", { status: "ratified-unimplemented", dependsOn: ["A", "Ω-X"] }),    // Ω-X unknown → blocked, named
  ];
  return {
    genomeVersion: 1, kind: "fixture",
    lineage: { note: "n", specLineage: "s", assumedDirective: "the owner directive, as data" },
    counts: { layers: layers.length, implemented: 2, externalAssumed: 1, ratifiedUnimplemented: 2, queued: 1, decisions: 0, ratified: 0, proposed: 0, records: 0, testFiles: 0, gateStages: 0, plugins: 0, compositions: 0 },
    layers,
    decisions: [],
    falsifiers: [],
    tests: { files: [] },
    gate: { stages: [] },
  };
}

const bucketOf = (plan: ReturnType<typeof planFromGenome>, id: string): PlanBucket | undefined =>
  (Object.entries(plan.buckets) as Array<[PlanBucket, Array<{ id: string }>]>).find(([, nodes]) => nodes.some((n) => n.id === id))?.[0];

describe("F-ORCH.1 plan-determinism", () => {
  test("same genome ⇒ identical plan bytes", () => {
    expect(JSON.stringify(planFromGenome(fixtureGenome()))).toBe(JSON.stringify(planFromGenome(fixtureGenome())));
  });
});

describe("F-ORCH.2 bucket-correctness", () => {
  test("every layer lands in the bucket its status + deps dictate", () => {
    const plan = planFromGenome(fixtureGenome());
    expect(bucketOf(plan, "A")).toBe("done");
    expect(bucketOf(plan, "B")).toBe("inFlight");
    expect(bucketOf(plan, "C")).toBe("verifyQueue");
    expect(bucketOf(plan, "D")).toBe("buildQueue");
    expect(bucketOf(plan, "E")).toBe("specQueue");
    expect(bucketOf(plan, "F")).toBe("blocked");
  });
  test("blocked nodes name their unsatisfied deps", () => {
    const plan = planFromGenome(fixtureGenome());
    const f = plan.buckets.blocked.find((n) => n.id === "F")!;
    // D is satisfied (buildQueue) — only Ω-X (unknown) is unsatisfied
    expect(f.unsatisfied).toEqual(["Ω-X"]);
    expect(f.reason).toContain("Ω-X");
  });
  test("counts agree with the buckets", () => {
    const plan = planFromGenome(fixtureGenome());
    for (const [bucket, nodes] of Object.entries(plan.buckets) as Array<[PlanBucket, Array<{ id: string }>]>) {
      expect(plan.counts[bucket]).toBe(nodes.length);
    }
  });
});

describe("F-ORCH.3 assumed-deps-honesty", () => {
  test("an assumed dep satisfies planning but never becomes tree evidence", () => {
    const g = fixtureGenome();
    const plan = planFromGenome(g);
    expect(bucketOf(plan, "E")).toBe("specQueue");        // C (external-assumed) satisfied E's dep
    const c = g.layers.find((l) => l.id === "C")!;
    expect(c.evidence.recordFile).toBeNull();             // …and C still carries NO tree evidence
    expect(c.evidence.recordStatus).toBeNull();
    expect(plan.assumedDepsNote).toContain("paper fact"); // the header says so out loud
  });
});

describe("F-ORCH.4 merge-is-the-gate", () => {
  test("a red gate refuses the merge with the failing stages named", () => {
    const r = mergeVerdict({ ok: false, failingStages: ["tests", "genome"] });
    expect(r.refused).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.refusalSentence).toContain("ORCH_MERGE_RED");
    expect(r.refusalSentence).toContain("tests");
    expect(r.refusalSentence).toContain("genome");
  });
  test("a green gate merges citing the whole-gate run", () => {
    const r = mergeVerdict({ ok: true, failingStages: [] });
    expect(r.ok).toBe(true);
    expect(r.refused).toBe(false);
    expect(r.refusalSentence).toBeNull();
  });
});
