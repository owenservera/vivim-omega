#!/usr/bin/env node
// tooling/ci/driver-parity.mjs (D-373 falsifier entry — runs under plain Node, no Bun needed for orchestration)
// Proves the DB-agnostic core claim: the IDENTICAL conformance workload
// (append → read → verify → search → roundtrip → compaction, real spine code)
// produces the SAME digest on bun:sqlite (under Bun) and node:sqlite (under Node 24).
//
//   node tooling/ci/driver-parity.mjs [runId]
//
// Prints a verdict JSON line and exits 0 on parity, 1 on any mismatch/failure.
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runId = process.argv[2] ?? `parity-${Date.now()}`;
const digestTool = join(here, "driver-digest.ts");

function runDigest(bin) {
  const r = spawnSync(bin, [digestTool, runId], { encoding: "utf-8", timeout: 120_000 });
  if (r.status !== 0) return { ok: false, error: `${bin} exited ${r.status}`, stderr: (r.stderr || "").slice(-400) };
  const line = (r.stdout || "").split("\n").filter((l) => l.trim().startsWith("{")).pop();
  if (!line) return { ok: false, error: `${bin} printed no JSON line`, stdout: (r.stdout || "").slice(-200) };
  try { return { ok: true, ...JSON.parse(line) }; }
  catch (e) { return { ok: false, error: `unparseable digest line: ${String(e)}`, raw: line.slice(0, 200) }; }
}

const bunSide = runDigest("bun");
if (!bunSide.ok) {
  console.log(JSON.stringify({ parity: false, reason: "bun side failed", detail: bunSide }));
  process.exit(1);
}
const nodeSide = runDigest(process.execPath);
if (!nodeSide.ok) {
  console.log(JSON.stringify({ parity: false, reason: "node side failed", detail: nodeSide }));
  process.exit(1);
}

const parity = bunSide.digest === nodeSide.digest;
console.log(JSON.stringify({
  parity,
  bunDriver: bunSide.driver,
  nodeDriver: nodeSide.driver,
  bunDigest: bunSide.digest,
  nodeDigest: nodeSide.digest,
  runId,
}));
process.exit(parity ? 0 : 1);
