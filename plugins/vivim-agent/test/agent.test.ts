// vivim.agent — test/agent.test.ts (D-309, GATE evidence)
// Ω Control Plane v0 end-to-end through the real µhost: boot law+vault+agent
// (unique temp dirs, inline spec) → propose/promote/spawn/describe/rollback/
// decision over real vault objects. Pure scope/rollback tables unit-tested
// alongside (no ports). Malformed payloads → DEGRADED (fail-closed).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, Outcome } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { isSubset } from "../src/tokens.ts";
import { decideRollback, portCapToScope, resolveSpawnAuthority } from "../src/agent.ts";

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → vivim-agent/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const AGENT_CONTRACTS = ["agent.spawn@1", "agent.describe@1", "agent.exec@1", "behavior.propose@1", "behavior.promote@1", "behavior.rollback@1", "decision.record@1"];
const AGENT_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.forbidden.set@1", "port:law.check@1"];

function makeAgentSpec(name: string, dataDir: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "vivim.agent", source: "plugins/vivim-agent", bootPhase: 1, grant: { capabilities: AGENT_CAPS, contracts: AGENT_CONTRACTS } },
    ],
  };
}

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

async function bootCase(caseName: string): Promise<Case> {
  const root = join("/tmp/omega-agent-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = join(root, "vault-data");
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(makeAgentSpec(caseName, dataDir), OMEGA_ROOT, vaultDir, rootKey);
  const { host, report } = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
  expect(report.booted).toBe(true);
  expect(report.source).toBe("incoming");
  if (!host) throw new Error(`boot failed: ${report.reason}`);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

async function shutdownCase(h: BootedHost): Promise<void> {
  const i = hosts.indexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  await h.shutdown().catch(() => {});
}

interface OkOutcome { status: "OK"; value: Record<string, any> }
async function callOk(host: BootedHost, op: string, payload: unknown): Promise<Record<string, any>> {
  const r: PortResult = await host.router.callAsRoot(op, payload);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
  const o = r.value as Outcome;
  expect(o.status).toBe("OK");
  if (o.status !== "OK" || o.value === undefined) throw new Error(`${op} not OK: ${JSON.stringify(o)}`);
  return o.value as Record<string, any>;
}

async function callOutcome(host: BootedHost, op: string, payload: unknown): Promise<Outcome> {
  const r: PortResult = await host.router.callAsRoot(op, payload);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
  return r.value as Outcome;
}

// ---- pure tables (no ports) ----

describe("vivim.agent pure — scope mapping + authority + rollback tables", () => {
  test("portCapToScope maps port grants to scope paths; host caps map to nothing", () => {
    expect(portCapToScope("port:vault.append@1")).toBe("vault.append");
    expect(portCapToScope("port:law.check@1")).toBe("law.check");
    expect(portCapToScope("host.journal.append")).toBeNull();
    expect(portCapToScope("banana")).toBeNull();
  });

  test("resolveSpawnAuthority: child ⊆ parent ok; broadening REFUSED; uncovered required UNSUPPORTED", () => {
    const contract = { requiredCapabilities: ["vault.append:ns=agent:id=x1"] } as never;
    const good = resolveSpawnAuthority({
      parent: { capabilityToken: "vault.append:ns=agent" } as never,
      ownCaps: [], requestedScope: "vault.append:ns=agent:id=x1", contract,
    });
    expect(good.status).toBe("OK");
    // a narrower grant cannot cover a broader requirement (correct UNSUPPORTED)
    const narrow = resolveSpawnAuthority({
      parent: { capabilityToken: "vault.append:ns=agent:id=x1" } as never,
      ownCaps: [], requestedScope: "vault.append:ns=agent:id=x1",
      contract: { requiredCapabilities: ["vault.append:ns=agent"] } as never,
    });
    expect(narrow.status).toBe("UNSUPPORTED");
    const wide = resolveSpawnAuthority({
      parent: { capabilityToken: "vault.append:ns=agent" } as never,
      ownCaps: [], requestedScope: "vault.append:ns=other", contract: { requiredCapabilities: [] } as never,
    });
    expect(wide.status).toBe("REFUSED");
    const root = resolveSpawnAuthority({
      parent: null, ownCaps: ["port:vault.append@1", "host.journal.append"],
      requestedScope: "vault.append:ns=agent", contract,
    });
    expect(root.status).toBe("OK");
    const rootWide = resolveSpawnAuthority({
      parent: null, ownCaps: ["port:vault.append@1"],
      requestedScope: "vault.query:ns=agent", contract: { requiredCapabilities: [] } as never,
    });
    expect(rootWide.status).toBe("REFUSED");
    const hungry = resolveSpawnAuthority({
      parent: null, ownCaps: ["port:vault.append@1"],
      requestedScope: "vault.append:ns=agent",
      contract: { requiredCapabilities: ["vault.compact:ns=agent"] } as never,
    });
    expect(hungry.status).toBe("UNSUPPORTED");
  });

  test("decideRollback: needs active + prior different-version staged|verified", () => {
    expect(decideRollback([]).status).toBe("UNSUPPORTED");
    expect(decideRollback([{ rev: 1, version: "1", state: "staged" }]).status).toBe("UNSUPPORTED"); // nothing active
    expect(decideRollback([
      { rev: 2, version: "1", state: "active" },
      { rev: 1, version: "1", state: "staged" },
    ]).status).toBe("UNSUPPORTED"); // same version — not a rollback target
    const good = decideRollback([
      { rev: 4, version: "2", state: "active" },
      { rev: 3, version: "2", state: "staged" },
      { rev: 2, version: "1", state: "active" },
      { rev: 1, version: "1", state: "staged" },
    ]);
    expect(good.status).toBe("OK");
    if (good.status === "OK" && good.value) {
      expect(good.value.quarantineRev).toBe(4);
      expect(good.value.reactivateRev).toBe(1); // v1, not the same-version v2 staged row
    }
  });
});

// ---- manifest ----

describe("vivim.agent manifest — parses + validates through @vivim/omega-sdk", () => {
  test("plugin.json: 13 engine ops, exact caps, zero validator issues", () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.id).toBe("vivim.agent");
    expect(parsed.value.contributions.engine?.map((e) => `${e.id}@${e.version}`).sort()).toEqual([
      "agent.delegate@1", "agent.describe@1", "agent.exec@1", "agent.snapshot@1",
      "agent.spawn@1", "behavior.promote@1", "behavior.propose@1", "behavior.rollback@1",
      "decision.record@1", "evolution.evaluate@1", "evolution.promote@1",
      "evolution.propose@1", "evolution.rollback@1",
    ]);
    expect(parsed.value.capabilities.requested).toEqual(AGENT_CAPS);
    expect(validateManifest(parsed.value)).toEqual([]);
  });
});

// ---- live ceremony ----

describe("D-309 — control plane v0 ceremony through the real µhost", () => {
  let c: Case;
  beforeAll(async () => { c = await bootCase("ceremony"); }, 60_000);

  const CONTRACT = {
    id: "researcher",
    version: "1.0",
    preconditions: ["inbox reachable"],
    invariants: ["never exfiltrate"],
    forbiddenActions: ["message.send@1"],
    requiredCapabilities: ["vault.append:ns=agent"],
    recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
  };

  test("propose forces staged (never live by construction), even when asked active", async () => {
    const v = await callOk(c.host, "behavior.propose@1", { ...CONTRACT, state: "active" });
    expect(v.id).toBe("researcher");
    expect(v.state).toBe("staged");
    expect(v.rev).toBe(1);
  });

  test("spawn against a staged contract is UNSUPPORTED (not silently allowed)", async () => {
    const o = await callOutcome(c.host, "agent.spawn@1", {
      behaviorContractId: "researcher", requestedScope: "vault.append:ns=agent",
    });
    expect(o.status).toBe("UNSUPPORTED");
  });

  test("promote with no evidence is REFUSED (D-303 for behaviors)", async () => {
    const o = await callOutcome(c.host, "behavior.promote@1", { contractId: "researcher", evidence: [] });
    expect(o.status).toBe("REFUSED");
  });

  test("promote with unresolvable evidence is EVALUATION_FAILED", async () => {
    const o = await callOutcome(c.host, "behavior.promote@1", {
      contractId: "researcher", evidence: [{ ns: "probe", id: "nope", rev: 1 }],
    });
    expect(o.status).toBe("EVALUATION_FAILED");
  });

  test("promote with resolving evidence activates; spawn + describe complete bootstrap", async () => {
    const probe = await c.host.router.callAsRoot("vault.append@1", { ns: "probe", id: "p1", data: { suite: "contract-probe", pass: true } });
    expect(probe.ok).toBe(true);
    const pv = await callOk(c.host, "behavior.promote@1", {
      contractId: "researcher", evidence: [{ ns: "probe", id: "p1", rev: 1 }],
    });
    expect(pv.rev).toBe(2);
    const sv = await callOk(c.host, "agent.spawn@1", {
      behaviorContractId: "researcher", requestedScope: "vault.append:ns=agent", task: "triage inbox",
    });
    const identity = sv.identity as Record<string, any>;
    expect(identity.id).toMatch(/^agent_[0-9a-f]+$/);
    expect(identity.behaviorVersion).toBe("1.0");
    expect(identity.capabilityToken).toBe("vault.append:ns=agent");
    expect(identity.createdBy).toBe("root");
    expect(identity.provenance).toEqual([{ ns: "behavior", id: "researcher", rev: 2 }]); // head rev at spawn (v1.0 active)
    const dv = await callOk(c.host, "agent.describe@1", { agentId: identity.id });
    expect((dv.identity as Record<string, any>).id).toBe(identity.id);
    expect((dv.contract as Record<string, any>).id).toBe("researcher");
  });

  test("lineage: child scope is a strict subset; parent refs recorded", async () => {
    // a narrower child cannot satisfy the broad researcher contract — it runs
    // a specialist contract whose requirements fit inside the narrowed scope
    const narrow = await callOk(c.host, "behavior.propose@1", {
      ...CONTRACT, id: "lineage-worker", version: "1.0",
      requiredCapabilities: ["vault.append:ns=agent:id=child1"],
    });
    expect(narrow.state).toBe("staged");
    const narrowPv = await callOk(c.host, "behavior.promote@1", {
      contractId: "lineage-worker", evidence: [{ ns: "probe", id: "p1", rev: 1 }],
    });
    expect(narrowPv.rev).toBe(2);
    const parent = await callOk(c.host, "agent.spawn@1", {
      behaviorContractId: "researcher", requestedScope: "vault.append:ns=agent",
    });
    const parentId = (parent.identity as Record<string, any>).id as string;
    const child = await callOk(c.host, "agent.spawn@1", {
      parentId, behaviorContractId: "lineage-worker", requestedScope: "vault.append:ns=agent:id=child1",
    });
    const childId = child.identity as Record<string, any>;
    expect(childId.parentId).toBe(parentId);
    expect(isSubset(childId.capabilityToken, "vault.append:ns=agent")).toBe(true);
    expect(childId.capabilityToken).not.toBe("vault.append:ns=agent"); // strict
    expect(childId.provenance).toContainEqual({ ns: "agent", id: parentId, rev: 1 });
    // broadening past the parent is REFUSED, not clamped
    const wide = await callOutcome(c.host, "agent.spawn@1", {
      parentId, behaviorContractId: "researcher", requestedScope: "vault.append:ns=other",
    });
    expect(wide.status).toBe("REFUSED");
  });

  test("forbidden end-to-end: spawned agent's forbidden op denies at law.check", async () => {
    const sv = await callOk(c.host, "agent.spawn@1", {
      behaviorContractId: "researcher", requestedScope: "vault.append:ns=agent",
    });
    const agentId = (sv.identity as Record<string, any>).id as string;
    const denied = await c.host.router.callAsRoot("law.check@1", { principal: agentId, op: "message.send@1" });
    expect(denied.ok).toBe(true);
    if (denied.ok) {
      expect((denied.value as { decision: string }).decision).toBe("deny");
      expect(String((denied.value as { reason: string }).reason)).toContain("forbidden action");
    }
    // sibling op for the same principal is unaffected (exact-match overlay)
    const sibling = await c.host.router.callAsRoot("law.check@1", { principal: agentId, op: "vault.append@1" });
    expect(sibling.ok).toBe(true);
    if (sibling.ok) expect((sibling.value as { decision: string }).decision).not.toBe("deny");
  });

  test("rollback across versions reactivates v1; history stays fetchable by rev", async () => {
    const v2 = await callOk(c.host, "behavior.propose@1", { ...CONTRACT, version: "2.0" });
    expect(v2.rev).toBe(3);
    const pv2 = await callOk(c.host, "behavior.promote@1", {
      contractId: "researcher", evidence: [{ ns: "probe", id: "p1", rev: 1 }],
    });
    expect(pv2.rev).toBe(4);
    const rb = await callOk(c.host, "behavior.rollback@1", { contractId: "researcher" });
    expect(rb.quarantinedRev).toBe(4);
    expect(rb.reactivatedRev).toBe(1);
    // latest is v1 active again
    const latest = await c.host.router.callAsRoot("vault.get@1", { ns: "behavior", id: "researcher" });
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      const data = (latest.value as { data: Record<string, any> }).data;
      expect(data.version).toBe("1.0");
      expect(data.state).toBe("active");
    }
    // quarantined head still fetchable by rev (append-only: nothing deleted)
    const q = await c.host.router.callAsRoot("vault.get@1", { ns: "behavior", id: "researcher", rev: 4 });
    expect(q.ok).toBe(true);
    // rollback with no prior version left is UNSUPPORTED (single-version contract)
    const solo = await callOk(c.host, "behavior.propose@1", { ...CONTRACT, id: "solo", version: "1.0" });
    expect(solo.rev).toBe(1);
    const noPrior = await callOutcome(c.host, "behavior.rollback@1", { contractId: "solo" });
    expect(noPrior.status).toBe("UNSUPPORTED");
  });

  test("decision.record: happy path refs evidence+parents; dangling parent is UNKNOWN", async () => {
    const d1 = await callOk(c.host, "decision.record@1", {
      decisionId: "dec-root", subject: "adopt v1", priorState: "none", proposedState: "v1-active",
      actor: "human", evidence: [], parentDecisions: [],
    });
    expect(d1.decisionId).toBe("dec-root");
    const d2 = await callOk(c.host, "decision.record@1", {
      decisionId: "dec-child", subject: "roll to v1", priorState: "v2-active", proposedState: "v1-active",
      actor: "human", evidence: [{ ns: "probe", id: "p1", rev: 1 }], parentDecisions: ["dec-root"],
    });
    expect(d2.rev).toBe(1); // revs are per (ns, id): new decision id starts at 1
    const stored = await c.host.router.callAsRoot("vault.get@1", { ns: "decision", id: "dec-child" });
    expect(stored.ok).toBe(true);
    if (stored.ok) {
      expect((stored.value as { refs: unknown }).refs).toContainEqual({ ns: "decision", id: "dec-root", rev: 1 });
      expect((stored.value as { refs: unknown }).refs).toContainEqual({ ns: "probe", id: "p1", rev: 1 });
    }
    const dangling = await callOutcome(c.host, "decision.record@1", {
      decisionId: "dec-orphan", subject: "x", priorState: "a", proposedState: "b",
      actor: "human", evidence: [], parentDecisions: ["dec-missing"],
    });
    expect(dangling.status).toBe("UNKNOWN");
  });

  test("malformed payloads fail closed (DEGRADED), unknown ids are UNKNOWN", async () => {
    const bad = await c.host.router.callAsRoot("agent.spawn@1", {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("DEGRADED");
    const ghost = await callOutcome(c.host, "agent.spawn@1", {
      behaviorContractId: "ghost", requestedScope: "vault.append:ns=agent",
    });
    expect(ghost.status).toBe("UNKNOWN");
    const ghostParent = await callOutcome(c.host, "agent.spawn@1", {
      parentId: "agent_ghost", behaviorContractId: "researcher", requestedScope: "vault.append:ns=agent",
    });
    expect(ghostParent.status).toBe("UNKNOWN");
    const ghostDescribe = await callOutcome(c.host, "agent.describe@1", { agentId: "agent_ghost" });
    expect(ghostDescribe.status).toBe("UNKNOWN");
  });
});
