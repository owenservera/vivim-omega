// tooling/ci/verify-status.ts — D-362: the committed build/status.json must be
// reproducible from the commit tree it sits on. A fresh `omega:gate` run is executed,
// and the structural claims (stage flags, host LOC, test counts, wave registry,
// benchmarks pointer) are compared against the committed copy — modulo the
// generation timestamp and runner-shape fields (test concurrency scales with
// the box, so two machines can never agree byte-for-byte on those).
// `head` is checked separately as ancestor-or-equal: a status stamp is taken at the
// gate run's commit and carried forward by the commits that record it, so the
// committed head is by construction at or behind the carrying commit (first real
// run of the verifier caught exactly this; a diverged/unrelated head still fails).
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

// head: ancestor-or-equal (see header). A short-sha that doesn't resolve or isn't
// an ancestor of the current HEAD means the committed claims are from another lineage.
const headCheck = spawnSync("git", ["merge-base", "--is-ancestor", String(committed.head ?? ""), "HEAD"], { cwd: ROOT });
const headResolved = spawnSync("git", ["cat-file", "-t", String(committed.head ?? "")], { cwd: ROOT });
if (headResolved.status !== 0 || headCheck.status !== 0) {
  fail(`committed status.json head (${committed.head}) is not an ancestor of HEAD — claims from a diverged lineage`);
}

// Run the gate fresh. The gate REWRITES build/status.json — snapshot the committed copy first.
// D-369: fail fast on gate failure before the structural diff (clearer signal on red gate).
// Windows soak boxes: run with OMEGA_TEST_CONCURRENCY=1 in the environment
// (handle-starved parallel runs flake where the serial gate passes — D-368);
// the verifier inherits the ambient concurrency, it does not set it.
const gate = spawnSync("bun", ["run", "omega:gate"], { cwd: ROOT });
if (gate.status !== 0) fail(`fresh gate exited ${gate.status} — see its output above`);
const fresh = JSON.parse(readFileSync(committedPath, "utf-8"));

const structural = (s: Record<string, any>): Record<string, unknown> => ({
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
// D-414 (A12): the toolchain pin is recorded in status.json and REPORTED here.
// Runner-shape by definition — never part of the failing structural compare
// (two machines can never agree on it; D-362), but drift is surfaced loudly.
const { compareToolchain } = await import("../gates/status.ts");
const tc = compareToolchain(committed.toolchain, fresh.toolchain);
console.log(`${tc.same ? "✓" : "○"} verify-status: ${tc.line}`);
console.log(`✓ verify-status: committed status.json reproduces (stamped @ ${committed.head}, carrying HEAD ${fresh.head}; tests ${fresh.tests?.pass}/${(fresh.tests?.pass ?? 0) + (fresh.tests?.fail ?? 0)}, host ${structural(fresh).hostLoc}/1100)`);
