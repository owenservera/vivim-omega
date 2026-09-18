// vivim.vault — driver conformance + cross-runtime parity (D-373 falsifier)
// THE byte-identity contract: the same deterministic workload through the REAL
// spine (append/CAS/FTS/Merkle/verify/roundtrip/compaction) must produce the
// SAME digest on every driver. This suite runs three proofs:
//
//   1. bun-sqlite (this process): full conformance workload + invariants.
//   2. Cross-process determinism: a second `bun` invocation of the same suite
//      tool produces the identical digest (rules out hidden nondeterminism —
//      timestamps, iteration order, tmp paths — before we blame the driver).
//   3. Cross-runtime parity: `node tooling/ci/driver-parity.mjs` runs the SAME
//      workload on node:sqlite under real Node 24 and compares to the bun run.
//      This is the D-361 "Node build swaps one module" promise, mechanized.
import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { runWorkload, digestOf, assertInvariants } from "../src/drivers/conformance.ts";
import { DRIVER_INFO } from "../src/db.ts"; // binds the Bun lane first

const ROOT = join(import.meta.dir, "../../..");
const runTag = `${Date.now()}-${process.pid}`;

describe("Ω2 driver conformance — D-373 db-agnostic core", () => {
  test("bun-sqlite lane: full conformance workload green + invariants hold", async () => {
    expect(DRIVER_INFO.id).toBe("bun-sqlite");
    const d = await runWorkload(`conf-bun-${runTag}`);
    assertInvariants(d);
    expect(d.verifyOk).toBe(true);
    expect(d.roundtripOk).toBe(true);
    expect(d.refsSurvive).toBe(true);
    expect(d.chainCount).toBe(5);
    expect(d.revs["parity/alpha"]).toBe(3);
    expect(d.digestOf).toBeUndefined(); // (guard: digest comes from digestOf, not the digest object)
  });

  test("cross-process determinism: a second bun run of the same workload → identical digest", async () => {
    const d1 = digestOf(await runWorkload(`conf-det1-${runTag}`));
    const r = spawnSync("bun", [join(ROOT, "tooling/ci/driver-digest.ts"), `conf-det2-${runTag}`], { encoding: "utf-8", timeout: 120_000, cwd: ROOT });
    expect(r.status).toBe(0);
    const line = (r.stdout || "").split("\n").filter((l) => l.trim().startsWith("{")).pop()!;
    const parsed = JSON.parse(line) as { driver: string; digest: string };
    expect(parsed.driver).toBe("bun-sqlite");
    expect(parsed.digest).toBe(d1);
  });

  test("cross-runtime parity: node:sqlite under Node 24 produces the byte-identical digest", async () => {
    const inProc = digestOf(await runWorkload(`conf-parity-bun-${runTag}`));
    const r = spawnSync("node", [join(ROOT, "tooling/ci/driver-parity.mjs"), `conf-parity-${runTag}`], { encoding: "utf-8", timeout: 240_000, cwd: ROOT });
    expect(r.status).toBe(0);
    const line = (r.stdout || "").split("\n").filter((l) => l.trim().startsWith("{")).pop()!;
    const verdict = JSON.parse(line) as { parity: boolean; bunDriver: string; nodeDriver: string; nodeDigest: string };
    expect(verdict.parity).toBe(true);
    expect(verdict.bunDriver).toBe("bun-sqlite");
    expect(verdict.nodeDriver).toBe("node-sqlite");
    expect(verdict.nodeDigest).toBe(inProc);
  });

  test("append latency — both lanes measurable (bench line for 40-EVIDENCE)", async () => {
    // honest scope: this is a workload-shape timing signal, not the omega:bench wall
    const t0 = performance.now();
    const d = await runWorkload(`conf-bench-${runTag}`);
    const ms = performance.now() - t0;
    assertInvariants(d);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(30_000); // sanity wall, machine-dependent by design
  });
});
