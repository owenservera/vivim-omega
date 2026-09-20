// tooling/gates/simulate.ts — D-429 (Ω-DEV.5): the design simulation sandbox.
//
// The gap this closes: the constitution demands falsifiers that can go RED,
// not just green — a falsifier that cannot fail is a rubber stamp. And an
// agent about to build a layer has no way to try its contracts before
// writing code. This tool is try-before-you-build, scoped honestly:
//
//   DESIGN simulation (this record): mutate a layer's registry entry through
//   the genome verifier's own machinery — orphan the record, lie about the
//   status, sever a dep into a cycle, point the falsifier at nothing, blow
//   the budget — and receipt WHICH clauses catch each mutation. A mutation
//   that no clause catches is an unguarded seam, found before code exists.
//
//   RUNTIME behavioral simulation (NOT this record): load profiles, latency,
//   attack paths. That half lives with the rehearsal engine (Ω-8, paper
//   `D-432`) and lands when that layer ports. Stated plainly so the receipt
//   is never mistaken for a performance claim.
//
// Verdicts are ADVISORY, always (the adaptation-governance stance: suggest,
// never block) — except malformed requests, which are refused:
// SIM_LAYER_UNKNOWN for a layer the registry does not carry. Receipts are
// deterministic (same inputs → same bytes, no timestamps) and land ONLY in
// build/sim-receipts/ — the write scope is the containment.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { gatherGenomeInputs, parseLayerRegistry, verifyGenome, type GenomeInputs, type LayerEntry } from "./genome.ts";

export interface SimMutation {
  name: string;
  applies: (layer: LayerEntry) => boolean; // status-aware — an inapplicable mutation is SKIPPED (n/a), never reported UNCAUGHT
  mutate: (layer: LayerEntry, all: LayerEntry[]) => void;
  expectCode: string; // the genome refusal code the mutation should provoke
}

/** The mutation catalog — fixed order, deterministic. Each names the clause
 *  it rehearses (the refusal code the verifier should emit) and when it
 *  applies: an orphan mutation needs a record to orphan; an assumed-lie
 *  mutation needs an external-assumed layer. Inapplicable mutations are
 *  skipped with the reason, not silently passed — and never counted as
 *  uncaught seams. */
export const SIM_MUTATIONS: SimMutation[] = [
  {
    name: "orphan-record",
    applies: (l) => l.treeId !== null,
    mutate: (l) => { l.treeId = 99999; },
    expectCode: "GENOME_ORPHAN",
  },
  {
    name: "status-lie-implemented-no-record",
    applies: (l) => l.status === "implemented" && l.treeId !== null,
    mutate: (l) => { l.treeId = null; },
    expectCode: "GENOME_STATUS_LIE",
  },
  {
    name: "status-lie-assumed-with-record",
    applies: (l) => l.status === "external-assumed",
    mutate: (l) => { l.treeId = 425; },
    expectCode: "GENOME_STATUS_LIE",
  },
  {
    name: "dep-unknown",
    applies: () => true,
    mutate: (l) => { l.dependsOn = ["Ω-NONEXISTENT"]; },
    expectCode: "GENOME_DEP_UNKNOWN",
  },
  {
    name: "dep-cycle",
    applies: () => true,
    mutate: (l, all) => {
      // point the layer at a descendant (or itself) — the DAG check must bite
      const target = all.find((o) => o.dependsOn.includes(l.id)) ?? l;
      l.dependsOn = [...l.dependsOn, target.id];
    },
    expectCode: "GENOME_CYCLE",
  },
  {
    name: "falsifier-unresolved",
    applies: (l) => l.falsifier !== null && l.status === "implemented", // the resolution law binds implemented layers only
    mutate: (l) => { if (l.falsifier) l.falsifier = "F-DEFINITELY-NOT-IMPLEMENTED"; },
    expectCode: "GENOME_FALSIFIER_UNRESOLVED",
  },
  {
    name: "budget-blow",
    applies: () => true,
    mutate: (l) => { l.note = "x".repeat(300 * 1024); },
    expectCode: "GENOME_BUDGET_EXCEEDED",
  },
];

export interface SimFinding {
  mutation: string;
  applicable: boolean;
  caught: boolean;
  caughtBy: string | null; // the issue line that fired (truncated)
  expectedCode: string;
}

export interface SimReceipt {
  layer: string;
  inputHash: string;          // sha256 over (registry json + layer id + committed genome bytes)
  verdict: "advisory";
  mutations: SimFinding[];
  uncaughtCount: number;
  scope: string;              // the honesty header — what this sim is and is not
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function cloneRegistry(registryText: string, layerId: string): { layers: LayerEntry[]; base: LayerEntry } {
  const { registry } = parseLayerRegistry(registryText);
  if (!registry) throw new Error("SIM_REGISTRY_INVALID: the registry does not parse — fix it before simulating");
  const layers = registry.layers.map((l) => ({ ...l, dependsOn: [...l.dependsOn] }));
  const base = layers.find((l) => l.id === layerId);
  if (!base) {
    throw new Error(`SIM_LAYER_UNKNOWN: layer "${layerId}" is not in the registry — simulate what exists; the refusal is the contract (Ω-DEV.5, D-429).`);
  }
  return { layers, base };
}

/** Pure: run the mutation catalog over a layer through verifyGenome. The
 *  inputs are cloned; the caller's inputs are never mutated. */
export function simulateLayer(inputs: GenomeInputs, layerId: string): SimReceipt {
  const { layers, base } = cloneRegistry(inputs.registryText, layerId);
  const findings: SimFinding[] = [];
  for (const mut of SIM_MUTATIONS) {
    const applicable = mut.applies(base);
    let caught = false;
    let caughtBy: string | null = null;
    if (applicable) {
      const mutatedLayers = layers.map((l) => ({ ...l, dependsOn: [...l.dependsOn] }));
      const target = mutatedLayers.find((l) => l.id === layerId)!;
      mut.mutate(target, mutatedLayers);
      const mutatedText = JSON.stringify({ ...JSON.parse(inputs.registryText), layers: mutatedLayers }, null, 2);
      const result = verifyGenome({ ...inputs, registryText: mutatedText });
      const hit = result.issues.find((i) => i.includes(mut.expectCode.split("/")[0]));
      caught = hit !== undefined;
      caughtBy = hit ? hit.slice(0, 160) : null;
    }
    findings.push({ mutation: mut.name, applicable, caught, caughtBy, expectedCode: mut.expectCode });
  }
  const inputHash = sha256(`${inputs.registryText}\u0000${layerId}\u0000${inputs.committedGenome ?? "(none)"}`);
  return {
    layer: layerId,
    inputHash,
    verdict: "advisory",
    mutations: findings,
    uncaughtCount: findings.filter((f) => f.applicable && !f.caught).length,
    scope: "design simulation only (D-429): falsifier red-case rehearsal over the genome verifier — which clauses bite when the registry is attacked. NOT runtime behavioral simulation (load, latency, attack paths): that half lands with the rehearsal engine (Ω-8, paper `D-432`). Advisory, never blocking: an uncaught mutation is a finding to fix, not a gate failure.",
  };
}

/** Render the receipt human-readably. Pure. */
export function renderReceipt(r: SimReceipt): string[] {
  const lines: string[] = [];
  lines.push(`omega:simulate ${r.layer} — ${r.mutations.filter((f) => f.applicable).length} applicable mutations, ${r.uncaughtCount} uncaught · verdict: ${r.verdict}`);
  lines.push(`inputHash: ${r.inputHash.slice(0, 16)}… (deterministic: same registry + layer + committed genome ⇒ same receipt)`);
  for (const f of r.mutations) {
    if (!f.applicable) lines.push(`  ○ ${f.mutation} — skipped (n/a for this layer's status; never reported UNCAUGHT)`);
    else lines.push(`  ${f.caught ? "✓" : "✗ UNCAUGHT"} ${f.mutation} → ${f.caughtBy ? f.caughtBy.split(":")[0] : `expected ${f.expectedCode}, nothing fired`}`);
  }
  lines.push(`(${r.scope})`);
  return lines;
}

/** Receipt destination: build/sim-receipts/<layer-sanitized>.json — the write scope. */
export function receiptPath(layerId: string): string {
  return `build/sim-receipts/${layerId.replace(/[^A-Za-z0-9.-]/g, "_")}.json`;
}

// ---- CLI (`omega:simulate <layer-id>`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  try {
    const layerId = process.argv[2];
    if (!layerId) throw new Error("refused: usage: omega:simulate <layer-id> (e.g. omega:simulate Ω-DEV.1)");
    const inputs = gatherGenomeInputs(ROOT);
    const receipt = simulateLayer(inputs, layerId);
    const dest = join(ROOT, receiptPath(layerId));
    if (!existsSync(join(ROOT, "build/sim-receipts"))) mkdirSync(join(ROOT, "build/sim-receipts"), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(receipt, null, 2)}\n`);
    for (const line of renderReceipt(receipt)) console.log(line);
    console.log(`\nreceipt: ${receiptPath(layerId)} (advisory — an uncaught mutation is a finding, not a failure)`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
