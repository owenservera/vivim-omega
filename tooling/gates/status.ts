// Status emitter: build/status.json — the machine-readable build state feeding the review console.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

/** Wave registry: status is set by evidence, not ambition (D2 §9: claims carry no weight). */
const WAVES: Array<{ id: string; title: string; deliverable: string; status: string }> = [
  { id: "Ω0", title: "µhost", deliverable: "Recipe verify, worker compartments, port router (B1–B4), recovery, CLI, demos", status: "built" },
  { id: "Ω1", title: "vivim.law", deliverable: "Gate/consent, attenuation, revocation, registry, amendment", status: "built" },
  { id: "Ω2", title: "vivim.vault", deliverable: "SQLite WAL+FTS5, CAS, Merkle changelog, verify, compaction", status: "built" },
  { id: "Ω3", title: "vivim.run", deliverable: "Bounded pool, budgets, crash-loop quarantine", status: "built" },
  { id: "Ω4", title: "SDK + testkit", deliverable: "zod schemas, signing, typed client, FakeHost, conformance", status: "built" },
  { id: "Ω5", title: "domain-email + provider", deliverable: "First domain pack, full loop through vault + consent", status: "planned" },
  { id: "Ω6", title: "surfaces", deliverable: "CLI + MCP surfaces, provider-llm, webmail scaffold", status: "planned" },
  { id: "Ω7", title: "discovery perception/observation", deliverable: "ApplicationGraph from captured fixtures, zero LLM", status: "planned" },
  { id: "Ω8", title: "discovery inference/mapping/verification", deliverable: "DRAFT→PROMOTED only on postcondition probes", status: "planned" },
  { id: "Ω9", title: "healing + ecosystem", deliverable: "Drift→rediscovery→probation→promotion, builder tooling", status: "planned" },
];

export async function emitStatus(extra: { gate?: unknown; hostLoc?: number; tests?: { pass: number; fail: number } } = {}): Promise<void> {
  const head = Bun.spawnSync(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"]);
  const headOut = new TextDecoder().decode(head.stdout).trim();
  const benchmarks = readBenchmarks();
  const status = {
    generatedAt: new Date().toISOString(),
    repo: "vivim-omega",
    branch: "omega",
    head: headOut || "uncommitted",
    waves: WAVES,
    ...(extra as Record<string, unknown>),
    benchmarks,
  };
  writeFileSync(join(ROOT, "build", "status.json"), JSON.stringify(status, null, 2));
}

function readBenchmarks(): Record<string, unknown> {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, "build", "benchmarks.json"), "utf-8"));
    return raw;
  } catch { return {}; }
}

// CLI: bun run tooling/gates/status.ts
if (import.meta.main) {
  await emitStatus();
  console.log(JSON.stringify({ emitted: join(ROOT, "build/status.json") }));
}
