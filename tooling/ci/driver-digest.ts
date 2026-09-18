// tooling/ci/driver-digest.ts (D-373)
// ONE conformance workload digest under the runtime invoking this file:
//   bun  tooling/ci/driver-digest.ts <runId>   → binds the bun-sqlite lane
//   node tooling/ci/driver-digest.ts <runId>   → binds the node-sqlite lane
// Prints a JSON line: {"driver":..., "digest":"<sha256>", "invariants":"ok"}.
// tooling/ is out-of-tree, so the runtime branch here is gate-legal (the
// bun-surface stage scans production src, not tooling).
import { runWorkload, digestOf, assertInvariants } from "../../plugins/vivim-vault/src/drivers/conformance.ts";

const runId = process.argv[2] ?? `digest-${Date.now()}`;
const isBun = process.versions.bun !== undefined;

const lane = isBun
  ? await import("../../plugins/vivim-vault/src/db.ts")
  : await import("../../plugins/vivim-vault/src/db.node.ts");

const digest = await runWorkload(`${runId}-${isBun ? "bun" : "node"}`);
assertInvariants(digest);
console.log(JSON.stringify({ driver: lane.DRIVER_INFO.id, digest: digestOf(digest), invariants: "ok" }));
