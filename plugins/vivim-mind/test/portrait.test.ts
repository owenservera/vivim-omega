// vivim.mind — test/portrait.test.ts (Ω10, GATE evidence for D-350)
//
// UNIT (src/derive.ts buildPortrait — the pure lens machinery, no ports) +
// INTEGRATION (the real µhost: law + pack.domain-email + vault +
// provider.email.file + vivim.mind booted as ONE composition through a spec
// copy with the portrait grant — mind.portrait@1 + port:vault.verify@1 — the
// email integration pattern: unique temp vault dirs, never the shipped data
// paths).
//
// The D-350 evidence:
//   derivation (kernel/vault/world/capabilities from registry+verify+rows+config),
//   determinism (same evidence ⇒ same portrait), the one-machinery claim
//   (portrait.world === snapshot machinery), fail-closed without the
//   vault.verify grant, manifest lawfulness (the 5th engine contribution).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import {
  buildPortrait, parseMindConfig, type PortraitEvidence,
} from "../src/derive.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → vivim-mind/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

// ---- the mind config (the documented shape — the ops catalog is RECIPE DATA) ----

const MIND_OPS = [
  { op: "message.send@1", risk: "EXTERNAL_MUTATION", provider: "provider.email.file", title: "send a message" },
  { op: "message.receive@1", risk: "READ", provider: "provider.email.file", title: "simulate an incoming message" },
] as const;

const MIND_CONFIG = {
  composition: "portrait-test",
  nlclVersion: "0.1.0",
  selfAddresses: ["me@omega.local"],
  entityCap: 200,
  ops: [...MIND_OPS],
};

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.getmany@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const MESSAGE_CONTRACTS = ["message.send@1", "message.receive@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1"];
const PROVIDER_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:vault.search@1"];
const PORTRAIT_CONTRACTS = ["mind.snapshot@1", "mind.query@1", "mind.portrait@1"];
const PORTRAIT_CAPS = ["port:law.registry@1", "port:vault.query@1", "port:vault.getmany@1", "port:vault.verify@1"]; // D-387
const SNAPSHOT_CAPS = ["port:law.registry@1", "port:vault.query@1", "port:vault.getmany@1"]; // D-387 // NO vault.verify — the fail-closed case

interface Case { host: BootedHost; root: string }

/** Boots a unique temp case with an explicit mind grant (the portrait or snapshot variant). */
async function bootCase(caseName: string, mindCaps: string[], mindContracts: string[]): Promise<Case> {
  const root = omegaTmp("omega-portrait-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const spec: CompositionSpec = {
    name: caseName,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS }, config: { journalPath: join(vaultDir, "law-journal.jsonl") } },
      { id: "pack.domain-email", source: "packs/domain-email", bootPhase: 1, grant: { capabilities: [], contracts: [] } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir: join(root, "vault-data") } },
      { id: "provider.email.file", source: "plugins/provider-email-file", bootPhase: 1, grant: { capabilities: PROVIDER_CAPS, contracts: MESSAGE_CONTRACTS }, config: { from: "me@omega.local" } },
      { id: "vivim.mind", source: "plugins/vivim-mind", bootPhase: 1, grant: { capabilities: mindCaps, contracts: mindContracts }, config: MIND_CONFIG },
    ],
  };
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root };
}

interface PortraitResult { portrait: {
  at: number; composition: string; nlclVersion: string;
  kernel: { plugins: Array<{ id: string; version: string; state: string }>; events: number; consents: number; generation: number };
  vault: { ok: boolean; headHash: string; entries: number; namespaces: Array<{ ns: string; entries: number }> };
  world: {
    v: number; t: number;
    counts: { entities: number; messages: number; contacts: number; rules: number; lexicon: number; ops: number };
    topContacts: Array<{ id: string; label: string; address: string }>;
  };
  capabilities: Array<{ op: string; risk: string; provider: string; title: string }>;
} }

async function callPortrait(host: BootedHost): Promise<PortResult> {
  return host.router.callAsRoot("mind.portrait@1", {});
}

// =================================================================================================
// UNIT — buildPortrait (the pure derivation, no ports, no I/O)
// =================================================================================================

describe("unit: buildPortrait", () => {
  const registry = {
    plugins: ["vivim.law", "vivim.vault"],
    events: 7,
    consents: 2,
    generation: 3,
    states: { "vivim.law": { state: "active" }, "vivim.vault": { state: "active" } },
  };
  const verify = { ok: true, headHash: "a".repeat(64), entries: 5 };
  const rows = [
    { id: "m1", data: { id: "m1", folder: "inbox", from: "peter@northwind.example", to: "me@omega.local", subject: "hello", body: "hi", sentAt: 1, flags: { seen: false, flagged: false, draft: false } } },
  ];
  const evidence: PortraitEvidence = {
    registry,
    verify,
    namespaceCounts: [{ ns: "email", entries: 1 }, { ns: "automation", entries: 0 }, { ns: "nlcl", entries: 0 }, { ns: "control", entries: 0 }],
    messageRows: rows,
    ruleRows: [],
    lexiconRows: [],
  };
  const config = parseMindConfig(MIND_CONFIG);

  test("derives the kernel slice from the registry (plugins/events/consents/generation)", () => {
    const p = buildPortrait(evidence, config, { t: 42 });
    expect(p.kernel.plugins.length).toBe(2);
    expect(p.kernel.events).toBe(7);
    expect(p.kernel.consents).toBe(2);
    expect(p.kernel.generation).toBe(3);
    expect(p.kernel.plugins[0]).toEqual({ id: "vivim.law", version: "unknown", state: "active" });
  });

  test("carries the vault verdict + namespace counts through the mind's own lens", () => {
    const p = buildPortrait(evidence, config, { t: 42 });
    expect(p.vault.ok).toBe(true);
    expect(p.vault.headHash).toBe("a".repeat(64));
    expect(p.vault.entries).toBe(5);
    expect(p.vault.namespaces).toEqual([
      { ns: "email", entries: 1 },
      { ns: "automation", entries: 0 },
      { ns: "nlcl", entries: 0 },
      { ns: "control", entries: 0 },
    ]);
  });

  test("the world inside is the SAME machinery as snapshot (one derivation, two views)", () => {
    const p = buildPortrait(evidence, config, { t: 42 });
    // the summary counts the snapshot machinery's own outputs: 1 message + 1 derived contact (peter)
    expect(p.world.counts.messages).toBe(1);
    expect(p.world.counts.contacts).toBe(1);
    expect(p.world.counts.entities).toBe(2);
    expect(p.world.counts.ops).toBe(config.ops.length);
    expect(p.world.t).toBe(42);
    expect(p.world.topContacts).toEqual([{ id: "contact:peter", label: "Peter", address: "peter@northwind.example" }]);
  });

  test("the capabilities catalog is the config ops (recipe data, never invented)", () => {
    const p = buildPortrait(evidence, config, { t: 42 });
    expect(p.capabilities).toEqual([...MIND_OPS]);
  });

  test("deterministic: same evidence + config ⇒ same portrait (except the one clock)", () => {
    const a = buildPortrait(evidence, config, { t: 100 });
    const b = buildPortrait(evidence, config, { t: 100 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = buildPortrait(evidence, config, { t: 200 });
    expect(c.at).toBe(200);
    expect(c.world.t).toBe(200);
    expect(c.world.v).toBe(a.world.v); // v is a function of evidence, not the clock
  });
});

// =================================================================================================
// INTEGRATION — the real µhost, the portrait grant in the spec
// =================================================================================================

describe("integration: mind.portrait@1 through the real composition", () => {
  let c: Case;

  beforeAll(async () => {
    c = await bootCase("portrait-roundtrip", PORTRAIT_CAPS, PORTRAIT_CONTRACTS);
  }, 30_000);

  test("one call after real traffic returns the unified view", async () => {
    // real traffic first: two received messages (the evidence the portrait must see)
    const r1 = await c.host.router.callAsRoot("message.receive@1", { from: "peter@northwind.example", subject: "numbers", body: "q3 numbers" });
    expect(r1.ok).toBe(true);
    const r2 = await c.host.router.callAsRoot("message.receive@1", { from: "ana@acme.example", subject: "budget", body: "review tomorrow" });
    expect(r2.ok).toBe(true);

    const pr = await callPortrait(c.host);
    expect(pr.ok).toBe(true);
    if (!pr.ok) throw new Error(pr.detail ?? "");
    const { portrait } = pr.value as PortraitResult;
    // kernel: the registry the traffic actually exercised
    expect(portrait.kernel.plugins.length).toBeGreaterThan(0);
    expect(portrait.kernel.consents).toBe(0);
    expect(typeof portrait.kernel.generation).toBe("number");
    // vault: the Merkle walk verified the live chain
    expect(portrait.vault.ok).toBe(true);
    expect(portrait.vault.entries).toBeGreaterThanOrEqual(2);
    expect(portrait.vault.headHash).toMatch(/^[0-9a-f]{64}$/);
    expect(portrait.vault.namespaces.find((n) => n.ns === "email")!.entries).toBeGreaterThanOrEqual(2);
    // world: the same evidence the snapshot machinery sees, as the summary
    expect(portrait.world.counts.messages).toBeGreaterThanOrEqual(2);
    expect(portrait.world.topContacts.some((c) => c.id === "contact:peter" && c.address === "peter@northwind.example")).toBe(true);
    expect(portrait.world.counts.ops).toBe(MIND_OPS.length);
    // capabilities: the config catalog verbatim
    expect(portrait.capabilities.map((x) => x.op)).toEqual(MIND_OPS.map((x) => x.op));
  }, 30_000);

  test("portrait.world matches mind.snapshot@1 on the same live state", async () => {
    const pr = await callPortrait(c.host);
    const sr = await c.host.router.callAsRoot("mind.snapshot@1", {});
    expect(pr.ok && sr.ok).toBe(true);
    if (!pr.ok || !sr.ok) throw new Error("precondition");
    const { portrait } = pr.value as PortraitResult;
    const snap = (sr.value as { world: { v: number; entities: unknown[] } }).world;
    // the portrait's entity count is the snapshot machinery's own count (same evidence, two views)
    expect(portrait.world.counts.entities).toBe(snap.entities.length);
    expect(portrait.world.v).toBe(snap.v);
  }, 30_000);

  test("fail-closed: without port:vault.verify@1 the portrait degrades, never guesses", async () => {
    const bare = await bootCase("portrait-noverify", SNAPSHOT_CAPS, PORTRAIT_CONTRACTS);
    const pr = await callPortrait(bare.host);
    expect(pr.ok).toBe(false);
    if (!pr.ok) expect(pr.error).toBe("DEGRADED");
  }, 30_000);

  test("manifest lawfulness: the 5th engine contribution parses + validates", async () => {
    const parsed = parseManifest(await Bun.file(join(OMEGA_ROOT, "plugins/vivim-mind/plugin.json")).text());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const manifest = parsed.value;
    const engineOps = manifest.contributions.engine?.map((e) => `${e.id}@${e.version}`) ?? [];
    expect(engineOps).toContain("mind.portrait@1");
    const issues = validateManifest(manifest);
    expect(issues).toEqual([]);
    expect(manifest.capabilities?.requested).toContain("port:vault.verify@1");
  });
});
