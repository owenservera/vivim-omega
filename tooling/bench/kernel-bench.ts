// Kernel bench (D-340 wave) — the sustained-load ceilings SCALABILITY-CEILINGS.md
// asked to be MEASURED before any sharding decision, plus the kernel's own costs.
// Same discipline as bench.ts: real boots, real ports, append-only BENCHMARKS.md.
//
//   1. law-gate sustained throughput  — the ONE gate is architecturally intentional
//      (SCALABILITY §3); this is the measured ops/sec ceiling under concurrent risky
//      traffic, with the ungated READ path as the comparison lane.
//   2. vault write throughput         — the single-writer queue ceiling (§4).
//   3. state-arbitration throughput   — the one non-plugin arbiter's own cost.
//   4. graph-dispatch RTT             — whoOffers resolution vs the recorded v1
//      Map.get number (the Option C latency axis, measured not asserted).
//   5. kernel-lens sweep cost         — centrality over a live snapshot.
//   6. audit chain verify cost        — tamper-evidence is not free; here is its price.
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";

const ROOT = join(import.meta.dir, "../..");

function pct(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]; }
async function lane(name: string, total: number, width: number, fn: (i: number) => Promise<{ ok: boolean }>): Promise<{ name: string; n: number; opsPerSec: number; p50Ms: number; p99Ms: number }> {
  const lat: number[] = [];
  const t0 = performance.now();
  for (let batch = 0; batch < total / width; batch++) {
    const results = await Promise.all(
      Array.from({ length: width }, (_, w) => {
        const i = batch * width + w;
        const s = performance.now();
        return fn(i).then((r) => { if (r.ok) lat.push(performance.now() - s); return r; });
      }),
    );
    for (const r of results) if (!r.ok) throw new Error(`${name} lane: a call failed`);
  }
  const wall = (performance.now() - t0) / 1000;
  const sorted = [...lat].sort((a, b) => a - b);
  const out = { name, n: lat.length, opsPerSec: Math.round(lat.length / wall), p50Ms: +pct(sorted, 50).toFixed(3), p99Ms: +pct(sorted, 99).toFixed(3) };
  console.log(JSON.stringify(out));
  return out;
}

// spine (real vivim.law + vault + run + echo + risky) + the kernel lens appended —
// the bench composition is data; the lens joins the same way any composition adds it.
const SPEC = join(ROOT, "compositions/spine.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
spec.entries.push({ id: "vivim.kernel-lens", source: "../plugins/vivim-kernel-lens", bootPhase: 2, grant: { capabilities: ["host.kernel.lens"], contracts: ["kernel.centrality@1", "kernel.audit.verify@1"] } });

const vault = join(ROOT, "dev-vault-kernel-bench");
rmSync(vault, { recursive: true, force: true });
mkdirSync(vault, { recursive: true });
rmSync("/tmp/omega-spine/vault-data", { recursive: true, force: true });
const { rootKey } = ensureVault(vault);
const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
const host = await bootComposition(recipe, buildDir, vault);

// 1 · the law gate under sustained concurrent risky traffic (vs the ungated READ lane)
// EXTERNAL_MUTATION is consent-gated by the Ω1 policy. The refusal names the exact
// consentId (a stable hash of principal+op) — self-locate it, grant it, then the
// lane measures THROUGHPUT (allow+journal per call), not the consent refusal path.
const probe = await host.router.callAsRoot("risky.op@1", { i: -1 });
if (probe.ok || !probe.detail?.includes("consent_")) throw new Error(`bench probe unexpected: ${JSON.stringify(probe)}`);
const consentId = (probe.detail.match(/consent_[0-9a-f]{16}/) ?? [])[0];
const consent = await host.router.callAsRoot("law.consent.grant@1", { consentId, principal: "root", scope: "risky.op@1" });
if (!consent.ok) throw new Error(`bench consent grant failed: ${JSON.stringify(consent)}`);
const gate = await lane("law-gate risky.op@1 (gated)", 300, 10, (i) => host.router.callAsRoot("risky.op@1", { i }));
const ungated = await lane("ungated risky.read@1 (no gate)", 300, 10, (i) => host.router.callAsRoot("risky.read@1", { i }));

// 2 · the vault single-writer queue under sustained concurrent appends
const writes = await lane("vault.append@1 (single writer)", 300, 10, (i) =>
  host.router.callAsRoot("vault.append@1", { ns: "bench", id: `row-${i}`, data: { i, pad: "x".repeat(64) } }));

// 3 · the state arbiter: acquire/release cycles under real contention (refusal is
//     the DESIGN — retry-on-refusal measures sustained throughput, mirroring how a
//     stateful plugin would backpressure)
const arb = await lane("state acquire+release (7 contended keys, retry on refusal)", 500, 10, async (i) => {
  const key = `bench:${i % 7}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = await host.router.callAsRoot("host.state.acquire@1", { key, mode: "exclusive" });
    if (a.ok) {
      const r = await host.router.callAsRoot("host.state.release@1", { key });
      return { ok: r.ok };
    }
    await new Promise((res) => setTimeout(res, 1));
  }
  return { ok: false };
});

// 4 · graph-dispatch RTT (whoOffers resolution) — compare with the recorded v1 number
const rtt = await lane("echo.ping@1 (graph-routed)", 200, 1, (i) => host.router.callAsRoot("echo.ping@1", { i }));

// 5 · the lens: centrality sweep + audit verify over the live graph/chain
const sweepT: number[] = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  const r = await host.router.callAsRoot("kernel.centrality@1", {});
  if (!r.ok) throw new Error("kernel.centrality@1 failed in bench");
  sweepT.push(performance.now() - t);
}
const verifyT: number[] = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  const r = await host.router.callAsRoot("kernel.audit.verify@1", {});
  if (!r.ok) throw new Error("kernel.audit.verify@1 failed in bench");
  verifyT.push(performance.now() - t);
}
const k = host.router.kernel!;
const graph = k.graph.snapshot();

await host.shutdown();
rmSync(vault, { recursive: true, force: true });
rmSync("/tmp/omega-spine/vault-data", { recursive: true, force: true });

const result = {
  at: new Date().toISOString(),
  lawGate: { opsPerSec: gate.opsPerSec, p50Ms: gate.p50Ms, p99Ms: gate.p99Ms, n: gate.n },
  ungatedRead: { opsPerSec: ungated.opsPerSec, p50Ms: ungated.p50Ms, p99Ms: ungated.p99Ms, n: ungated.n },
  vaultWrites: { opsPerSec: writes.opsPerSec, p50Ms: writes.p50Ms, p99Ms: writes.p99Ms, n: writes.n },
  stateArbitration: { cyclesPerSec: Math.round(arb.opsPerSec / 2), p50Ms: arb.p50Ms, n: arb.n },
  graphDispatchRtt: { p50Ms: rtt.p50Ms, p99Ms: rtt.p99Ms, n: rtt.n, v1RecordedP50Ms: 0.03 },
  lensSweep: { p50Ms: +pct([...sweepT].sort((a, b) => a - b), 50).toFixed(2), n: sweepT.length, graphNodes: graph.nodes.length, graphEdges: graph.edges.length },
  auditVerify: { p50Ms: +pct([...verifyT].sort((a, b) => a - b), 50).toFixed(2), n: verifyT.length, chainLength: k.audit.length() },
};
writeFileSync(join(ROOT, "build", "kernel-bench.json"), JSON.stringify(result, null, 2));

const BENCH_FILE = join(ROOT, "BENCHMARKS.md");
const prev = existsSync(BENCH_FILE) ? readFileSync(BENCH_FILE, "utf-8") : "";
const header = "# BENCHMARKS — append-only, measured falsifiers per wave\n\n";
const firstNl = prev.indexOf("\n");
const hasHeader = firstNl >= 0 && prev.slice(0, firstNl).startsWith("# BENCHMARKS");
const body = hasHeader ? prev.slice(firstNl + 1).replace(/^\r?\n/, "") : prev;
const entry = `## ${result.at} — D-340 kernel wave (spine + kernel-lens, sustained load)
- law gate (real vivim.law, risky.op@1, 10-wide concurrent, n=${result.lawGate.n}): ${result.lawGate.opsPerSec} ops/s sustained, p50 ${result.lawGate.p50Ms} ms, p99 ${result.lawGate.p99Ms} ms — the ONE gate's measured ceiling; ungated READ lane (risky.read@1): ${result.ungatedRead.opsPerSec} ops/s, p50 ${result.ungatedRead.p50Ms} ms (the gate's per-op tax ≈ ${result.ungatedRead.p50Ms > 0 ? (result.lawGate.p50Ms / result.ungatedRead.p50Ms).toFixed(1) : "?"}×)
- vault single-writer (vault.append@1, 10-wide, n=${result.vaultWrites.n}): ${result.vaultWrites.opsPerSec} writes/s sustained, p50 ${result.vaultWrites.p50Ms} ms, p99 ${result.vaultWrites.p99Ms} ms — SCALABILITY §4's ceiling, measured
- state arbitration (acquire+release, 7 contended keys, n=${result.stateArbitration.n}): ${result.stateArbitration.cyclesPerSec} cycles/s, p50 ${result.stateArbitration.p50Ms} ms (host-op path, no compartment hop)
- graph-routed dispatch (echo.ping@1 via whoOffers, n=${result.graphDispatchRtt.n}): p50 ${result.graphDispatchRtt.p50Ms} ms vs v1 recorded 0.03 ms (Map.get) — the Option C latency axis, measured: Δp50 ${result.graphDispatchRtt.p50Ms.toFixed(3)} ms, p99 ${result.graphDispatchRtt.p99Ms} ms
- kernel-lens sweep (kernel.centrality@1, n=${result.lensSweep.n}, graph ${result.lensSweep.graphNodes} nodes / ${result.lensSweep.graphEdges} edges): p50 ${result.lensSweep.p50Ms} ms per query
- audit-chain verify (kernel.audit.verify@1, n=${result.auditVerify.n}, chain ${result.auditVerify.chainLength} entries): p50 ${result.auditVerify.p50Ms} ms — tamper-evidence's price
`;
writeFileSync(BENCH_FILE, `${header}${body}${body.endsWith("\n") || body.length === 0 ? "" : "\n"}${entry}`);
console.log("\nD-340 kernel bench complete — build/kernel-bench.json + BENCHMARKS.md");
