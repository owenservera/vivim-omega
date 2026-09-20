// tooling/gates/orchestrate.ts — D-427 (Ω-DEV.3): the orchestration graph.
//
// The gap this closes: the build sequence reads linear (Ω-1 → Ω-2 → …) but
// the dependency structure is a DAG, and it lives in prose — so nothing
// mechanical can say "what is ready to build now, what is blocked, what
// only needs verification." This tool reads the genome (D-425 — one source,
// never a second) and turns the layer DAG into an actionable plan:
//
//   done          implemented + record RATIFIED (tree evidence, falsifiers green)
//   inFlight      implemented + record PROPOSED (the ratify ceremony owns the flip)
//   verifyQueue   external-assumed — paper lineage; the porting/verification queue
//   buildQueue    ratified-unimplemented with all deps satisfied — READY to build
//   specQueue     queued with all deps satisfied — specs to write first
//   blocked       anything with unsatisfied deps (named, per dep)
//
// Deps are satisfied by {implemented, external-assumed} — the owner's
// assume-implemented directive (recorded in the registry lineage, reported
// by the genome) counts for planning, while the plan header says so out
// loud: an assumed dep is a paper fact, not tree evidence.
//
// The constitutional merge check (F-ORCH.4): when parallel lanes touch the
// same subsystem, the merge verdict IS the full gate — every stage, every
// falsifier — never a subset. `omega:orchestrate --merge` runs it and
// refuses with the failing stage names on red.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { join } from "node:path";
import { foldGenome, parseLayerRegistry, gatherGenomeInputs, type Genome, type GenomeLayer } from "./genome.ts";

export type PlanBucket = "done" | "inFlight" | "verifyQueue" | "buildQueue" | "specQueue" | "blocked";

export interface PlanNode {
  id: string;
  status: string;              // the registry claim
  recordStatus: string | null;
  bucket: PlanBucket;
  unsatisfied: string[];       // deps not satisfied (named, per dep) — blocked only
  reason: string;              // one line, human-readable
}

export interface OrchestrationPlan {
  kind: string;
  assumedDepsNote: string;     // the honesty header — assumed deps are paper facts
  buckets: Record<PlanBucket, PlanNode[]>;
  counts: Record<PlanBucket, number>;
}

/** Pure: genome in, plan out. Deterministic (registry order preserved). */
export function planFromGenome(genome: Genome): OrchestrationPlan {
  const byId = new Map(genome.layers.map((l) => [l.id, l]));
  const satisfies = (dep: string): boolean => {
    const d = byId.get(dep);
    return d !== undefined && (d.status === "implemented" || d.status === "external-assumed");
  };
  const buckets: Record<PlanBucket, PlanNode[]> = { done: [], inFlight: [], verifyQueue: [], buildQueue: [], specQueue: [], blocked: [] };
  for (const l of genome.layers) {
    const unsatisfied = l.dependsOn.filter((d) => !satisfies(d));
    let bucket: PlanBucket;
    let reason: string;
    if (unsatisfied.length > 0) {
      bucket = "blocked";
      reason = `waiting on ${unsatisfied.join(", ")}`;
    } else if (l.status === "implemented" && l.evidence.evidenceKind === "program") {
      bucket = "done"; reason = "program evidence — the built program is its own witness (no single record, no flip to await)";
    } else if (l.status === "implemented" && l.evidence.recordStatus === "RATIFIED") {
      bucket = "done"; reason = "tree evidence + falsifiers green";
    } else if (l.status === "implemented") {
      bucket = "inFlight"; reason = `record ${l.evidence.recordStatus ?? "PROPOSED"} — the ratify ceremony owns the flip`;
    } else if (l.status === "external-assumed") {
      bucket = "verifyQueue"; reason = "paper lineage, no tree evidence — port and verify against the spec falsifiers";
    } else if (l.status === "ratified-unimplemented") {
      bucket = "buildQueue"; reason = "deps satisfied and the decision is ratified — ready to build";
    } else {
      bucket = "specQueue"; reason = "deps satisfied — write the spec (upgrade doc + falsifiers) before building";
    }
    buckets[bucket].push({ id: l.id, status: l.status, recordStatus: l.evidence.recordStatus, bucket, unsatisfied, reason });
  }
  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) as Record<PlanBucket, number>;
  return {
    kind: "the orchestration plan — the layer DAG as actionable buckets (D-427); derived from the genome (D-425), regenerate freely, never hand-edit",
    assumedDepsNote: "deps are satisfied by implemented OR external-assumed layers — the owner's assume-implemented directive (registry lineage) counts for planning; an assumed dep is a paper fact, not tree evidence",
    buckets,
    counts,
  };
}

/** Render the plan human-readably. Pure. */
export function renderPlan(plan: OrchestrationPlan): string[] {
  const lines: string[] = [];
  lines.push(`omega:orchestrate — ${plan.counts.done} done · ${plan.counts.inFlight} in-flight · ${plan.counts.verifyQueue} verify-queue · ${plan.counts.buildQueue} build-queue · ${plan.counts.specQueue} spec-queue · ${plan.counts.blocked} blocked`);
  lines.push(`(${plan.assumedDepsNote})`);
  const order: PlanBucket[] = ["buildQueue", "verifyQueue", "specQueue", "inFlight", "blocked", "done"];
  for (const b of order) {
    lines.push("");
    lines.push(`## ${b} (${plan.counts[b]})`);
    for (const n of plan.buckets[b]) lines.push(`  ${n.id} — ${n.reason}`);
  }
  return lines;
}

// ---- the constitutional merge check ----

export interface MergeCheckResult {
  ok: boolean;
  refused: boolean;             // true only when the merge is REFUSED (red)
  failingStages: string[];
  refusalSentence: string | null;
}

/** Pure decision over a gate run's outcome (the runner is injected — tests
 *  stub it, the CLI runs the real gate). The merge verdict IS the full
 *  gate: every stage, every falsifier, never a subset. */
export function mergeVerdict(gateOutcome: { ok: boolean; failingStages: string[] }): MergeCheckResult {
  if (gateOutcome.ok) return { ok: true, refused: false, failingStages: [], refusalSentence: null };
  return {
    ok: false,
    refused: true,
    failingStages: gateOutcome.failingStages,
    refusalSentence: `ORCH_MERGE_RED: the merge is refused — the combined tree fails the gate (${gateOutcome.failingStages.join(", ")}); the conflicting lanes get this evidence, not a silent merge.`,
  };
}

/** Run the full gate as the merge check (the CLI path). */
export function runMergeCheck(root: string): MergeCheckResult {
  const p = nodeSpawnSync(process.execPath, ["run", "tooling/gates/gate.ts"], { cwd: root, encoding: "buffer", timeout: 900_000 });
  const out = `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}`;
  const failingStages = [...out.matchAll(/^✗\s+([a-z-]+):/gm)].map((m) => m[1]);
  const ok = (p.status ?? 1) === 0 && failingStages.length === 0;
  return mergeVerdict({ ok, failingStages });
}

// ---- CLI (`omega:orchestrate` · `--merge` · `--json`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  try {
    if (process.argv.includes("--merge")) {
      const r = runMergeCheck(ROOT);
      if (r.refusalSentence) console.error(r.refusalSentence);
      else console.log("merge check: GREEN — the combined tree passes the full gate (every stage, every falsifier)");
      process.exit(r.ok ? 0 : 1);
    }
    const inputs = gatherGenomeInputs(ROOT);
    const { registry, issues } = parseLayerRegistry(inputs.registryText);
    if (!registry) throw new Error(`refused: invalid registry — ${issues.join("; ")}`);
    const plan = planFromGenome(foldGenome(inputs, registry));
    const dest = join(ROOT, "build/orchestration-plan.json");
    if (!existsSync(join(ROOT, "build"))) mkdirSync(join(ROOT, "build"), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(plan, null, 2)}\n`);
    if (process.argv.includes("--json")) console.log(JSON.stringify(plan, null, 2));
    else for (const line of renderPlan(plan)) console.log(line);
    console.log(`\nplan artifact: build/orchestration-plan.json (derived view — regenerate with omega:orchestrate; the genome is the law, this is a lens)`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
