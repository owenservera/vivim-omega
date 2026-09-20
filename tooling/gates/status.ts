// Status emitter: build/status.json — the machine-readable build state feeding the review console.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process"; // D-361: runtime-neutral
import { join } from "node:path";
import { release } from "node:os";

const ROOT = join(import.meta.dir, "../..");

/** D-414 (A12): the toolchain pin — what produced the numbers, recorded next to
 *  the run shape. Pure (reads process only) so tests and verify-status share it. */
export interface ToolchainPin { bun: string | null; node: string; os: string; arch: string }
export function toolchainPin(): ToolchainPin {
  return {
    bun: (process.versions as Record<string, string | undefined>).bun ?? null,
    node: process.versions.node,
    os: `${process.platform} ${release()}`,
    arch: process.arch,
  };
}

/** D-414 (A12): report-only compare — runner-shape fields are recorded, never
 *  compared-to-fail (D-362's two-machines rule extended one notch). */
export function compareToolchain(a: ToolchainPin | undefined, b: ToolchainPin | undefined): { same: boolean; line: string } {
  const fmt = (t?: ToolchainPin) => t ? `bun ${t.bun ?? "(non-bun)"} · node ${t.node} · ${t.os} · ${t.arch}` : "(absent)";
  const same = JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return {
    same,
    line: same
      ? `toolchain pinned (A12, D-414): ${fmt(b)}`
      : `toolchain drift — recorded, not failing (runner-shape, D-362/D-414): committed ${fmt(a)} vs fresh ${fmt(b)}`,
  };
}

/** Wave registry: status is set by evidence, not ambition (D2 §9: claims carry no weight). */
const WAVES: Array<{ id: string; title: string; deliverable: string; status: string }> = [
  { id: "Ω0", title: "µhost", deliverable: "Recipe verify, worker compartments, port router (B1–B4), recovery, CLI, demos", status: "built" },
  { id: "Ω1", title: "vivim.law", deliverable: "Gate/consent, attenuation, revocation, registry, amendment", status: "built" },
  { id: "Ω2", title: "vivim.vault", deliverable: "SQLite WAL+FTS5, CAS, Merkle changelog, verify, compaction", status: "built" },
  { id: "Ω3", title: "vivim.run", deliverable: "Bounded pool, budgets, crash-loop quarantine", status: "built" },
  { id: "Ω4", title: "SDK + testkit", deliverable: "zod schemas, signing, typed client, FakeHost, conformance", status: "built" },
  { id: "Ω5", title: "domain-email + provider", deliverable: "First domain pack, full loop through vault + consent", status: "built" },
  { id: "Ω6", title: "surfaces", deliverable: "CLI + MCP surfaces, provider-llm, webmail scaffold", status: "built" },
  { id: "Ω7", title: "discovery perception/observation", deliverable: "ApplicationGraph from captured fixtures, zero LLM", status: "built" },
  { id: "Ω8", title: "discovery inference/mapping/verification", deliverable: "DRAFT→PROMOTED only on postcondition probes", status: "built" },
  { id: "Ω9", title: "healing + ecosystem", deliverable: "Drift→rediscovery→probation→promotion, builder tooling", status: "built" },
  { id: "Ω10", title: "vivim.mind (self-knowledge)", deliverable: "WorldModel derived from registry+vault+projections, contacts learned from history", status: "built" },
  { id: "Ω11", title: "vivim.nlcl (deterministic NLP)", deliverable: "17 symbol families, 7-stage pure pipeline, instant feedback projection, nlcl-pure shared browser/server", status: "built" },
  { id: "Ω12", title: "vivim.director (reprogramming)", deliverable: "Rules/teach/consent as data, tick loop, NL-driven backend reconfiguration", status: "built" },
  { id: "Ω13", title: "surfaces/web (Ω console)", deliverable: "WorldModel replication, authoritative interpret/execute/consent, live stream, browser-side keystroke feedback", status: "built" },
];

export async function emitStatus(extra: { gate?: unknown; hostLoc?: number; tests?: { pass: number; fail: number } } = {}): Promise<void> {
  const head = spawnSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]);
  const headOut = head.stdout.toString().trim();
  const benchmarks = readBenchmarks();
  const status = {
    generatedAt: new Date().toISOString(),
    repo: "vivim-omega",
    branch: "omega",
    head: headOut || "uncommitted",
    toolchain: toolchainPin(), // D-414 (A12): the run's shape, recorded not trusted
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
