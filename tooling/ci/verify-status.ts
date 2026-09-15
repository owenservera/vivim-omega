// tooling/ci/verify-status.ts — D-362: the committed build/status.json must be
// reproducible from the commit it sits on. A fresh `omega:gate` run is executed,
// and the structural claims (stage flags, host LOC, test counts, wave registry,
// benchmarks pointer) are compared against the committed copy — modulo the
// generation timestamp and runner-shape fields (test concurrency scales with
// the box, so two machines can never agree byte-for-byte on those).
//
// Exit 0 = reproducible. Exit 1 = the committed claims are NOT what this tree
// produces (stale status.json, hand-edited numbers, or a flaky gate — all loud).
//
// Run: bun run tooling/ci/verify-status.ts   (from a clean checkout at the tagged commit)
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const fail = (m: string): never => { console.error(`✗ verify-status: ${m}`); process.exit(1); };

const committedPath = join(ROOT, "build", "status.json");
if (!existsSync(committedPath)) fail("no committed build/status.json — run omega:gate and commit it");
const committed = JSON.parse(readFileSync(committedPath, "utf-8"));

// Run the gate fresh. The gate REWRITES build/status.json — snapshot the committed copy first.
const gate = spawnSync("bun", ["run", "omega:gate"], { cwd: ROOT });
const fresh = JSON.parse(readFileSync(committedPath, "utf-8"));

const structural = (s: Record<string, any>): Record<string, unknown> => ({
  head: s.head,
  waves: s.waves,
  benchmarks: s.benchmarks,
  hostLoc: s.hostLoc,
  tests: { pass: s.tests?.pass, fail: s.tests?.fail },
  stages: Object.fromEntries(
    Object.entries(s.gate?.checks ?? {}).map(([k, v]) => [k, { ok: (v as { ok?: boolean }).ok, skipped: (v as { skipped?: boolean }).skipped === true }]),
  ),
});

const a = JSON.stringify(structural(committed));
const b = JSON.stringify(structural(fresh));
if (a !== b) {
  console.error("✗ verify-status: committed status.json does NOT reproduce at this commit");
  console.error("--- committed:", a);
  console.error("--- fresh:   ", b);
  process.exit(1);
}
if (gate.status !== 0) fail(`fresh gate exited ${gate.status} — see its output above`);
console.log(`✓ verify-status: committed status.json reproduces at ${committed.head} (tests ${fresh.tests?.pass}/${(fresh.tests?.pass ?? 0) + (fresh.tests?.fail ?? 0)}, host ${structural(fresh).hostLoc}/1000)`);
