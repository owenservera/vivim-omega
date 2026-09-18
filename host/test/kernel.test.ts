// D-340 kernel suite — the six vivim_omega_core test scenarios, ported 1:1 to the
// TS kernel, plus the Ω-specific invariants that make the placement hold. Where the
// Rust crate asserts a property of its own in-process kernel, this suite asserts the
// SAME property of the booted µhost's kernel — the parity that matters is live, not
// literary. Companion: host/test/ghost.test.ts (the ghost-plugin pressure suite).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  ensureVault, compileComposition, bootComposition, verifyComposition,
  bootstrapKernel, ToolRegistry, matchesRange, StateArbitrator, verifyJson, canonicalJson, generateRootKey,
  type BootedHost, type Recipe,
} from "@vivim/omega-host";
import { validateManifestHonesty, type PluginManifest } from "@vivim/omega-contracts";
import { KERNEL, SCHEMA, EVERYONE, STATE_ARBITRATOR, CAP_SELF_DESCRIBE } from "@vivim/omega-host";

/** sha256Hex over canonical JSON — same digest the host chain uses (canon.ts, one implementation). */
function digest(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

const SPEC = join(import.meta.dir, "../../compositions/kernel.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
let vault: string;
let recipe: Recipe;
let buildDir: string;
let host: BootedHost;

function freshVault(name: string): string {
  const dir = join(import.meta.dir, "../../.test-tmp", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeAll(async () => {
  vault = freshVault("kernel-vault");
  const { rootKey } = ensureVault(vault);
  const compiled = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  recipe = compiled.recipe;
  buildDir = compiled.buildDir;
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => {
  await host.shutdown();
  rmSync(join(import.meta.dir, "../../.test-tmp/kernel-vault"), { recursive: true, force: true });
});

describe("D-340 · requirement #2 — genesis closes on itself and the chain verifies (genesis_closes_and_the_chain_verifies)", () => {
  test("the genesis set is EXACTLY five nodes — hand-verifiable, no per-composition genesis", () => {
    const k = host.router.kernel!;
    const snapshot = k.graph.snapshot();
    const ids = snapshot.nodes.map((n) => n.id);
    expect(ids).toContain(KERNEL);
    expect(ids).toContain(SCHEMA);
    expect(ids).toContain(EVERYONE);
    expect(ids).toContain(STATE_ARBITRATOR);
    expect(ids).toContain(CAP_SELF_DESCRIBE);
    // the closed set is the FIRST five nodes — everything after is Recipe data
    expect(ids.slice(0, 5).sort()).toEqual([CAP_SELF_DESCRIBE, EVERYONE, KERNEL, SCHEMA, STATE_ARBITRATOR].sort());
  });

  test("the closing loop is exactly two self-referential grants and the chain verifies from entry zero", () => {
    const k = host.router.kernel!;
    const chain = k.audit.export();
    // genesis entries are seq 0 and 1: KERNEL→KERNEL and KERNEL→SCHEMA over CAP_SELF_DESCRIBE
    expect(chain.entries[0].payload).toEqual({ from: KERNEL, to: KERNEL, capability: CAP_SELF_DESCRIBE, seq: 0, prevHash: "0".repeat(64) });
    expect(chain.entries[1].payload).toEqual({ from: KERNEL, to: SCHEMA, capability: CAP_SELF_DESCRIBE, seq: 1, prevHash: digest(chain.entries[0].payload) });
    expect(chain.verified).toBe(true);
    expect(k.audit.verifyChain()).toBe(true);
  });

  test("the schema-of-schema loop is visible in the graph: genesis:schema HOLDS cap:self-describe", () => {
    const k = host.router.kernel!;
    expect(k.graph.whoHolds(CAP_SELF_DESCRIBE)).toContain(KERNEL);
    expect(k.graph.whoHolds(CAP_SELF_DESCRIBE)).toContain(SCHEMA); // the metaclass move, made concrete
  });

  test("the state arbitrator is excluded from extraction BY CONSTRUCTION (never a manifest flag)", () => {
    const k = host.router.kernel!;
    expect(k.graph.node(STATE_ARBITRATOR)?.extractionCandidate).toBe(false);
  });
});

describe("D-340 · requirement #1 — one capability graph; 'global' is an ordinary principal", () => {
  test("every routable op and every granted capability is a node in the ONE graph", () => {
    const k = host.router.kernel!;
    for (const id of ["echo.ping@1", "counter.bump@1", "counter.value@1", "kernel.centrality@1", "kernel.audit.verify@1"]) {
      expect(k.graph.node(id)?.kind).toBe("capability");
    }
    // counter was granted port:echo.ping@1 — a HOLD edge, distinct from the OFFER edge
    expect(k.graph.whoOffers("echo.ping@1")).toEqual(["omega.echo"]);
    expect(k.graph.whoHolds("echo.ping@1")).toEqual(["omega.counter"]);
  });

  test("make_globally_available is an ordinary signed grant to genesis:everyone — no parallel registry", () => {
    // a FRESH kernel — the test never mutates the booted host's graph (isolation)
    const key = generateRootKey();
    const fresh = bootstrapKernel(key.keyId, key.privateKeyPem, key.publicKey);
    fresh.graph.upsertNode({ id: "echo.ping@1", kind: "capability" }); // declare, then grant (the genesis.rs declare/grant split)
    const g = fresh.audit.record(KERNEL, EVERYONE, "echo.ping@1");
    fresh.graph.grant(KERNEL, EVERYONE, "echo.ping@1", g, "hold");
    expect(fresh.graph.whoHolds("echo.ping@1")).toEqual([EVERYONE]);
    expect(fresh.audit.verifyChain()).toBe(true); // the global grant is chained like any other
    expect(fresh.graph.whoOffers("echo.ping@1")).toEqual([]); // holding ≠ offering: global availability does not create a router route
  });

  test("an unsigned edge is REFUSED — no capability without provenance (graph.rs parity)", () => {
    const key = generateRootKey();
    const fresh = bootstrapKernel(key.keyId, key.privateKeyPem, key.publicKey);
    const forged = { payload: { from: KERNEL, to: KERNEL, capability: CAP_SELF_DESCRIBE, seq: 0, prevHash: "0".repeat(64) }, signature: "bogus", signerKeyId: "test", verify: () => false };
    expect(() => fresh.graph.grant(KERNEL, KERNEL, CAP_SELF_DESCRIBE, forged as never)).toThrow("grant signature does not verify");
    expect(() => fresh.graph.grant(KERNEL, "ghost:no-such", CAP_SELF_DESCRIBE, { verify: () => true } as never)).toThrow("unknown principal");
  });
});

describe("D-340 · requirements #4 + #9 — contract versioning with generation pinning (tool_upgrade_never_breaks_in_flight_callers)", () => {
  test("a caller pinned to ^1 keeps its generation after a new major publishes — the Rust sequence, verbatim", () => {
    const registry = new ToolRegistry();
    registry.publish("state-store", "1", "impl-v1");
    const oldReq = "1.x";
    const pinnedBeforeUpgrade = registry.resolve("state-store", oldReq);
    expect(pinnedBeforeUpgrade?.impl).toBe("impl-v1");

    registry.publish("state-store", "2", "impl-v2"); // the upgrade ships

    expect(pinnedBeforeUpgrade?.impl).toBe("impl-v1"); // the already-resolved pin is untouched
    expect(registry.resolve("state-store", oldReq)?.impl).toBe("impl-v1"); // a 1.x caller resolving AFTER the upgrade still gets v1
    expect(registry.resolve("state-store", "*")?.impl).toBe("impl-v2"); // a wide-open caller gets the latest
    expect(registry.generationCount("state-store")).toBe(2); // prior generations are never removed
  });

  test("matchesRange honors the DependencyRef grammar exactly", () => {
    expect(matchesRange("1", "1.x")).toBe(true);
    expect(matchesRange("1.2", "1.x")).toBe(true);
    expect(matchesRange("2", "1.x")).toBe(false);
    expect(matchesRange("12", "1.x")).toBe(false); // prefix trap: "1.x" is the 1-SERIES, not "starts with 1"
    expect(matchesRange("2", "2")).toBe(true);
    expect(matchesRange("3", "2")).toBe(false);
    expect(matchesRange("anything", "*")).toBe(true);
  });

  test("the live graph holds generations: echo.ping has @1 published by omega.echo", () => {
    const k = host.router.kernel!;
    expect(k.tools.generationCount("echo.ping")).toBe(1);
    expect(k.tools.resolve("echo.ping", "1.x")?.impl).toBe("omega.echo");
    expect(k.tools.resolve("echo.ping", "*")?.impl).toBe("omega.echo");
  });
});

describe("D-340 · requirement #3 — state arbitration is the one non-plugin (state_arbitration_prevents_the_race)", () => {
  test("two exclusive holders on the same key: the second is REFUSED, then succeeds after release — the Rust sequence", () => {
    const arb = new StateArbitrator();
    expect(arb.tryAcquire("session:42", "plugin:a", "exclusive").ok).toBe(true);
    const conflict = arb.tryAcquire("session:42", "plugin:b", "exclusive");
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error).toContain("session:42");

    arb.release("session:42", "plugin:a");
    expect(arb.tryAcquire("session:42", "plugin:b", "exclusive").ok).toBe(true);
  });

  test("shared mode: multiple shared holders coexist; an exclusive blocks and is blocked", () => {
    const arb = new StateArbitrator();
    expect(arb.tryAcquire("k", "a", "shared").ok).toBe(true);
    expect(arb.tryAcquire("k", "b", "shared").ok).toBe(true);
    expect(arb.tryAcquire("k", "c", "exclusive").ok).toBe(false); // shared holders present
    arb.release("k", "a");
    expect(arb.tryAcquire("k", "c", "exclusive").ok).toBe(false); // one shared holder still present
    arb.release("k", "b");
    expect(arb.tryAcquire("k", "c", "exclusive").ok).toBe(true);
  });

  test("reachable through the port protocol as capability-gated host ops", async () => {
    const acq = await host.router.callAsRoot("host.state.acquire@1", { key: "kernel:test", mode: "exclusive" });
    expect(acq.ok).toBe(true);
    const conflict = await host.router.callAsRoot("host.state.acquire@1", { key: "kernel:test", mode: "exclusive" });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) { expect(conflict.error).toBe("REFUSED"); expect(conflict.detail).toContain("held"); }
    const rel = await host.router.callAsRoot("host.state.release@1", { key: "kernel:test" });
    expect(rel.ok).toBe(true);
    const reacq = await host.router.callAsRoot("host.state.acquire@1", { key: "kernel:test", mode: "exclusive" });
    expect(reacq.ok).toBe(true);
    await host.router.callAsRoot("host.state.release@1", { key: "kernel:test" });
  });
});

describe("D-340 · requirement #8 — the audit chain is tamper-evident (by attack, not assertion)", () => {
  test("a mutated entry copy fails signature verification AND breaks the hash link for every later entry", async () => {
    const chain = host.router.kernel!.audit.export();
    expect(chain.verified).toBe(true);
    // 1. signature tamper: flip the capability in entry 1's payload
    const tampered = JSON.parse(JSON.stringify(chain)) as typeof chain;
    tampered.entries[1].payload.capability = "echo.ping@1";
    const bad = tampered.entries[1];
    expect(verifyJson(bad.payload, chain.publicKey, bad.signature)).toBe(false);
    // 2. chain tamper: re-link entry 3 to a wrong prevHash — every honest walker detects the break
    const spliced = JSON.parse(JSON.stringify(chain)) as typeof chain;
    spliced.entries[3].payload.prevHash = "f".repeat(64);
    let expected = "0".repeat(64);
    let linkBroken = false;
    for (const e of spliced.entries) {
      if (e.payload.prevHash !== expected) { linkBroken = true; break; }
      expected = digest(e.payload);
    }
    expect(linkBroken).toBe(true);
  });

  test("kernel.audit.verify@1 reports the live verdict through the lens (READ surface)", async () => {
    const r = await host.router.callAsRoot("kernel.audit.verify@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { verified: boolean; length: number; headHash: string; signerKeyId: string };
      expect(v.verified).toBe(true);
      expect(v.length).toBeGreaterThanOrEqual(13); // 2 genesis + law(4) + echo(1) + counter(3) + lens(3)
      expect(v.headHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("every graph edge mints exactly one signed chain entry — the counts reconcile", () => {
    const k = host.router.kernel!;
    const snapshot = k.graph.snapshot();
    // the genesis closing grants ARE edges 0 and 1: chain length === edge count, always
    expect(k.audit.length()).toBe(snapshot.edges.length);
    expect(snapshot.edges[0]).toEqual({ to: KERNEL, capability: CAP_SELF_DESCRIBE, kind: "hold" });
    expect(snapshot.edges[1]).toEqual({ to: SCHEMA, capability: CAP_SELF_DESCRIBE, kind: "hold" });
  });
});

describe("D-340 · requirement #5 — the granularity-agnostic manifest (manifest_catches_dishonest_self_reporting)", () => {
  const base = (over: Partial<PluginManifest>): PluginManifest =>
    ({ manifestVersion: "1", id: "plugin:x", version: "0.1.0", entry: "src/index.ts", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "", ...over });

  test("an atomic plugin still declaring internalSeams is LYING about having extracted — refused", () => {
    const lyingAtomic = base({ granularity: "atomic", internalSeams: ["seam:leftover"] });
    expect(validateManifestHonesty(lyingAtomic).length).toBeGreaterThan(0);
  });

  test("an extraction candidate naming no seams is flagging intent without the cheap work — refused", () => {
    const unlabeled = base({ granularity: "coarse", extractionCandidate: true });
    expect(validateManifestHonesty(unlabeled).length).toBeGreaterThan(0);
  });

  test("the honest coarse wrapper passes: seams named, candidate flagged (the Rust a_coarse_plugin case)", () => {
    const honest = base({ granularity: "coarse", internalSeams: ["seam:session-memory", "seam:prompt-templates"], extractionCandidate: true });
    expect(validateManifestHonesty(honest)).toEqual([]);
  });

  test("the compile ceremony refuses a dishonest manifest (fail-closed at the gate, not at review)", () => {
    const v = freshVault("kernel-dishonest");
    const { rootKey } = ensureVault(v);
    const badSpec = {
      name: "dishonest",
      entries: [{ id: "ghost.liar", source: "../../testkit/test/fixtures/ghosts/ghost-shape", bootPhase: 1, grant: { capabilities: [], contracts: ["ghost.shape@1"] } }],
    };
    // re-point the source at a temp copy whose manifest lies (atomic + seams)
    const tmpDir = join(v, "ghost-liar");
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    const honestManifest = JSON.parse(readFileSync(join(import.meta.dir, "../../testkit/test/fixtures/ghosts/ghost-shape/plugin.json"), "utf-8"));
    honestManifest.id = "ghost.liar";
    honestManifest.granularity = "atomic"; // the lie: atomic, but seams still declared
    writeFileSync(join(tmpDir, "plugin.json"), JSON.stringify(honestManifest, null, 2));
    writeFileSync(join(tmpDir, "src/index.ts"), readFileSync(join(import.meta.dir, "../../testkit/test/fixtures/ghosts/ghost-shape/src/index.ts"), "utf-8"));
    badSpec.entries[0].source = "ghost-liar";
    expect(() => compileComposition(badSpec as never, v, v, rootKey)).toThrow("manifest honesty");
    rmSync(v, { recursive: true, force: true });
  });
});

describe("D-340 · requirement #6 — resolution is a graph query, byte-identical with v1 for every existing composition", () => {
  test("every existing op resolves to its exact v1 target through whoOffers", async () => {
    const r = await host.router.callAsRoot("echo.ping@1", { proof: "graph-routing" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { echo: boolean }).echo).toBe(true);
  });

  test("an unrouted op is REFUSED exactly as v1 — no silent magic routing for undeclared callers", async () => {
    const r = await host.router.callAsRoot("no.such.op@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("REFUSED"); expect(r.detail).toContain("no routed implementation"); }
  });

  test("dormant entries register in the graph before their first spawn (dormant offerors are routable)", async () => {
    const k = host.router.kernel!;
    expect(k.graph.whoOffers("counter.bump@1")).toEqual(["omega.counter"]); // counter is dormant until touched
    const r = await host.router.callAsRoot("counter.bump@1", {});
    expect(r.ok).toBe(true);
    expect(k.graph.whoOffers("counter.bump@1")).toEqual(["omega.counter"]); // unchanged after the spawn — idempotent
  });

  test("idempotent registration: the chain does NOT grow on lazy spawn", async () => {
    const before = host.router.kernel!.audit.length();
    await host.router.callAsRoot("counter.value@1", {});
    expect(host.router.kernel!.audit.length()).toBe(before);
  });
});

describe("D-340 · B5 honesty — the gate's own math", () => {
  test("the lens reports the graph it was handed, falsifiable against the host's own kernel", async () => {
    const r = await host.router.callAsRoot("kernel.centrality@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { nodeCount: number; edgeCount: number };
      const k = host.router.kernel!;
      const snap = k.graph.snapshot();
      expect(v.nodeCount).toBe(snap.nodes.length);
      expect(v.edgeCount).toBe(snap.edges.length);
    }
  });
});
