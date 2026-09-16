// D-328 — control-plane v0 slice through a REAL boot (law+vault+mind+agent).
// 4a gate: a zero-knowledge agent calls describe → snapshot → bootstrap and
// states who it is, what governs it, what it may call (unknown
// kind/capability/version → UNKNOWN, never a crash). 4b gate: the full
// discover→act→verify→record→explain→propose loop runs green with zero
// undocumented assumptions — delegate handoffs re-discover their contract,
// evolution aliases carry evidence and mirror to ns "control".
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, Outcome, PortResult } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const MIND_CONTRACTS = ["mind.snapshot@1", "mind.query@1", "control.bootstrap@1", "control.describe@1"];
const MIND_CAPS = ["port:law.registry@1", "port:vault.query@1", "port:vault.get@1"];
const AGENT_CONTRACTS = [
  "agent.spawn@1", "agent.describe@1", "agent.exec@1", "agent.snapshot@1", "agent.delegate@1",
  "behavior.propose@1", "behavior.promote@1", "behavior.rollback@1", "decision.record@1",
  "evolution.propose@1", "evolution.evaluate@1", "evolution.promote@1", "evolution.rollback@1",
];
const AGENT_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.forbidden.set@1", "port:law.check@1"];

const MIND_CONFIG = {
  composition: "control-test",
  nlclVersion: "0.1.0",
  selfAddresses: [],
  entityCap: 200,
  ops: [
    { op: "vault.append@1", risk: "MUTATION", provider: "vivim.vault", title: "append a vault object" },
    { op: "agent.snapshot@1", risk: "READ", provider: "vivim.agent", title: "orient on an agent" },
  ],
};

describe("D-328a — describe → snapshot → bootstrap (real boot, zero prior knowledge)", () => {
  let host: BootedHost;
  beforeAll(async () => {
    const root = omegaTmp("omega-control-test", `v24-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const spec: CompositionSpec = {
      name: "control-v24",
      entries: [
        { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
        { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
        { id: "vivim.mind", source: "plugins/vivim-mind", bootPhase: 1, grant: { capabilities: MIND_CAPS, contracts: MIND_CONTRACTS }, config: MIND_CONFIG },
        { id: "vivim.agent", source: "plugins/vivim-agent", bootPhase: 1, grant: { capabilities: AGENT_CAPS, contracts: AGENT_CONTRACTS } },
      ],
    };
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  async function call(op: string, payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot(op, payload);
  }
  async function okValue(op: string, payload: unknown): Promise<Record<string, any>> {
    const r = await call(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
    const o = r.value as Outcome;
    expect(o.status).toBe("OK");
    if (o.status !== "OK" || o.value === undefined) throw new Error(`${op} not OK: ${JSON.stringify(o)}`);
    return o.value as Record<string, any>;
  }
  async function outcomeOf(op: string, payload: unknown): Promise<Outcome> {
    const r = await call(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed`);
    return r.value as Outcome;
  }

  const CONTRACT = {
    id: "scout", version: "1.0",
    preconditions: ["probe"], invariants: ["no exfil"],
    forbiddenActions: ["message.send@1"],
    requiredCapabilities: ["vault.append:ns=ctlsnap"],
    recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
  };

  test("describe states the system: versions, namespaces, kinds, capabilities, policy", async () => {
    const v = await okValue("control.describe@1", {});
    const control = v.control as Record<string, any>;
    expect(control.controlVersion).toBe("control-model/1");
    expect(control.composition).toBe("control-test");
    expect(control.namespaces).toContain("control");
    expect(control.namespaces).toContain("resolve");
    expect(control.namespaces).toContain("law");
    expect(control.kinds).toEqual(["DETERMINISTIC", "PROBABILISTIC", "HUMAN"]);
    expect(control.capabilities).toEqual(MIND_CONFIG.ops);
    expect(control.contracts).toContain("control.describe@1");
    expect(control.contracts).toContain("agent.snapshot@1");
    expect(control.policy.gate).toBe("law.check@1");
    expect(control.evolution).toEqual({ proposals: 0 }); // 4b not yet run — honestly zero
  });

  test("describe focus: known answers OK, unknown kind/capability/version answer UNKNOWN", async () => {
    const known = await outcomeOf("control.describe@1", { focus: { kind: "HUMAN", capability: "agent.snapshot@1", version: "control-model/1" } });
    expect(known.status).toBe("OK");
    for (const focus of [{ kind: "ORACLE" }, { capability: "teleport@1" }, { version: "control-model/9" }]) {
      const u = await outcomeOf("control.describe@1", { focus });
      expect(u.status).toBe("UNKNOWN");
    }
    const bad = await call("control.describe@1", { focus: { kind: 7 } });
    expect(bad.ok).toBe(false); // malformed shape fails closed
  });

  test("snapshot states the self: identity + contract + ledger cursor that tracks exec", async () => {
    const probe = await call("vault.append@1", { ns: "probe", id: "p-ctl", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await okValue("behavior.propose@1", CONTRACT);
    await okValue("behavior.promote@1", { contractId: "scout", evidence: [{ ns: "probe", id: "p-ctl", rev: 1 }] });
    const sv = await okValue("agent.spawn@1", { behaviorContractId: "scout", requestedScope: "vault.append:ns=ctlsnap" });
    const agentId = (sv.identity as { id: string }).id;
    const s0 = await okValue("agent.snapshot@1", { agentId });
    expect((s0.identity as { id: string }).id).toBe(agentId);
    expect((s0.contract as { id: string }).id).toBe("scout");
    expect(s0.contractRev).toBe(2);
    expect(s0.ledgerCursor).toEqual({ attempts: 0, latest: null });
    // Act once under the agent's own authority…
    const ex = await outcomeOf("agent.exec@1", { agentId, op: "vault.append@1", payload: { ns: "ctlsnap", id: "m1", data: {} } });
    expect(ex.status).toBe("OK");
    // …and the cursor proves it.
    const s1 = await okValue("agent.snapshot@1", { agentId });
    expect((s1.ledgerCursor as { attempts: number }).attempts).toBe(1);
    expect((s1.ledgerCursor as { latest: { rev: number } }).latest.rev).toBe(1);
    const ghost = await outcomeOf("agent.snapshot@1", { agentId: "agent_ghost" });
    expect(ghost.status).toBe("UNKNOWN");
  });

  test("bootstrap orients first contact: versions, entry points, the describe→snapshot sequence", async () => {
    const r = await call("control.bootstrap@1", {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("bootstrap transport failed");
    const b = (r.value as { bootstrap: Record<string, any> }).bootstrap;
    expect(b.bootstrapVersion).toBe("control-bootstrap/1");
    expect(b.composition).toBe("control-test");
    expect(b.controlModel).toBe("control-model/1");
    expect(b.entrypoints).toContain("agent.exec@1");
    expect(b.namespaces).toContain("control");
    expect(b.next).toEqual(["control.describe@1", "agent.snapshot@1"]);
  });
});

describe("D-328b — delegate + governed evolution (real boot)", () => {
  let host: BootedHost;
  beforeAll(async () => {
    const root = omegaTmp("omega-control-test", `v24b-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const spec: CompositionSpec = {
      name: "control-v24b",
      entries: [
        { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
        { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
        { id: "vivim.mind", source: "plugins/vivim-mind", bootPhase: 1, grant: { capabilities: MIND_CAPS, contracts: MIND_CONTRACTS }, config: MIND_CONFIG },
        { id: "vivim.agent", source: "plugins/vivim-agent", bootPhase: 1, grant: { capabilities: AGENT_CAPS, contracts: AGENT_CONTRACTS } },
      ],
    };
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  async function call(op: string, payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot(op, payload);
  }
  async function okValue(op: string, payload: unknown): Promise<Record<string, any>> {
    const r = await call(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
    const o = r.value as Outcome;
    expect(o.status).toBe("OK");
    if (o.status !== "OK" || o.value === undefined) throw new Error(`${op} not OK: ${JSON.stringify(o)}`);
    return o.value as Record<string, any>;
  }
  async function outcomeOf(op: string, payload: unknown): Promise<Outcome> {
    const r = await call(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed`);
    return r.value as Outcome;
  }

  const CONTRACT = {
    id: "courier", version: "1.0",
    preconditions: ["probe"], invariants: ["no exfil"],
    forbiddenActions: ["message.send@1"],
    requiredCapabilities: ["vault.append:ns=ctlhand"],
    recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
  };

  test("delegate hands off under the parent's authority and journals the envelope to ns control", async () => {
    const probe = await call("vault.append@1", { ns: "probe", id: "p-hand", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await okValue("behavior.propose@1", CONTRACT);
    await okValue("behavior.promote@1", { contractId: "courier", evidence: [{ ns: "probe", id: "p-hand", rev: 1 }] });
    const parent = await okValue("agent.spawn@1", { behaviorContractId: "courier", requestedScope: "vault.append:ns=ctlhand" });
    const parentId = (parent.identity as { id: string }).id;
    // A narrowed child cannot satisfy the broad parent contract — it runs a
    // specialist contract whose requirements fit inside the narrowed scope
    // (same discipline as the lineage test: attenuation narrows, never broadens).
    await okValue("behavior.propose@1", {
      ...CONTRACT, id: "courier-child", version: "1.0",
      requiredCapabilities: ["vault.append:ns=ctlhand:id=child1"],
    });
    await okValue("behavior.promote@1", { contractId: "courier-child", evidence: [{ ns: "probe", id: "p-hand", rev: 1 }] });

    const handoff = await okValue("agent.delegate@1", {
      parentAgentId: parentId, behaviorContractId: "courier-child",
      authority: "vault.append:ns=ctlhand:id=child1",
      task: "triage the west inbox", intent: "relieve the parent",
      constraints: ["ctlsnap only"], evidenceRequirements: ["probe refs"],
      expectedOutputs: ["a triage note"],
    });
    const childId = handoff.childId as string;
    expect(childId).toMatch(/^agent_[0-9a-f]+$/);
    expect((handoff.identity as { parentId: string }).parentId).toBe(parentId);
    expect((handoff.identity as { capabilityToken: string }).capabilityToken).toBe("vault.append:id=child1:ns=ctlhand"); // canonical sort
    // The envelope is journaled (receiver reads the vault, never trusts claims).
    const g = await call("vault.get@1", { ns: "control", id: `delegation:${childId}` });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect((g.value as { data: Record<string, any> }).data).toMatchObject({
        parentAgentId: parentId, task: "triage the west inbox", buildDecisionRef: "D-328",
      });
    }
    // The child re-discovers its own contract (describe, not the envelope).
    const rediscovered = await okValue("agent.describe@1", { agentId: childId });
    expect((rediscovered.contract as { id: string }).id).toBe("courier-child");
    // Broadening past the parent is REFUSED, ghosts are UNKNOWN, garbage is DEGRADED.
    const wide = await outcomeOf("agent.delegate@1", {
      parentAgentId: parentId, behaviorContractId: "courier-child", authority: "vault.append:ns=other",
    });
    expect(wide.status).toBe("REFUSED");
    const ghost = await outcomeOf("agent.delegate@1", {
      parentAgentId: "agent_ghost", behaviorContractId: "courier", authority: "vault.append:ns=ctlhand",
    });
    expect(ghost.status).toBe("UNKNOWN");
    const bad = await call("agent.delegate@1", { parentAgentId: parentId });
    expect(bad.ok).toBe(false);
  });

  test("evolution propose→evaluate→promote runs governed with ns control mirrors", async () => {
    const probe = await call("vault.append@1", { ns: "probe", id: "p-evo", data: { pass: true } });
    expect(probe.ok).toBe(true);
    const ev = [{ ns: "probe", id: "p-evo", rev: 1 }];
    const prop = await okValue("evolution.propose@1", {
      id: "evolver", version: "1.0",
      preconditions: ["probe"], invariants: ["no exfil"],
      forbiddenActions: [], requiredCapabilities: ["vault.append:ns=ctlhand"],
      recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
      actor: "human", evidence: ev,
    });
    expect(prop).toMatchObject({ id: "evolver", state: "staged", rev: 1 });
    expect(prop.evolutionRev).toBe(1);
    const evaled = await okValue("evolution.evaluate@1", {
      contractId: "evolver", evidence: ev, verdict: "adopt", note: "probes green", actor: "human",
    });
    expect(evaled).toMatchObject({ verdict: "adopt", evolutionRev: 2 });
    const prom = await okValue("evolution.promote@1", { contractId: "evolver", evidence: ev, actor: "human" });
    expect(prom.rev).toBe(2); // behavior rev (staged 1 → active 2)
    expect(prom.evolutionRev).toBe(3);
    // The ns control object tells the whole genealogy: proposal → evaluation → promotion.
    const evo = await call("vault.get@1", { ns: "control", id: "evolution:evolver" });
    expect(evo.ok).toBe(true);
    if (evo.ok) {
      expect((evo.value as { rev: number }).rev).toBe(3);
      expect((evo.value as { data: Record<string, any> }).data).toMatchObject({ kind: "promotion", behaviorRev: 2 });
    }
    // describe now reports the activity honestly (the 4a→4b read loop is live).
    const described = await okValue("control.describe@1", {});
    expect(((described.control as Record<string, any>).evolution as { proposals: number }).proposals).toBe(1);
  });

  test("evolution refuses ghosts, empty evidence, and unresolvable refs", async () => {
    // Ghost agent actors cannot self-authorize.
    const ghost = await outcomeOf("evolution.propose@1", {
      id: "ghost-evo", version: "1.0",
      preconditions: ["p"], invariants: ["i"], forbiddenActions: [],
      requiredCapabilities: [], recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
      actor: "agent_ghost",
    });
    expect(ghost.status).toBe("REFUSED");
    // Evidence-required: empty evidence throws at the boundary.
    const empty = await call("evolution.evaluate@1", {
      contractId: "evolver", evidence: [], verdict: "adopt", actor: "human",
    });
    expect(empty.ok).toBe(false);
    // Unresolvable refs fail evaluation, never promote (on a staged contract —
    // the gate order is shape → actor → staged → resolving evidence).
    await okValue("evolution.propose@1", {
      id: "evolver-dangle", version: "1.0",
      preconditions: ["probe"], invariants: ["no exfil"],
      forbiddenActions: [], requiredCapabilities: [],
      recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
      actor: "human",
    });
    const dangling = await outcomeOf("evolution.promote@1", {
      contractId: "evolver-dangle", evidence: [{ ns: "probe", id: "nope", rev: 1 }], actor: "human",
    });
    expect(dangling.status).toBe("EVALUATION_FAILED");
  });

  test("evolution.rollback quarantines + reactivates with a control mirror", async () => {
    const probe = await call("vault.append@1", { ns: "probe", id: "p-evo2", data: { pass: true } });
    expect(probe.ok).toBe(true);
    const ev = [{ ns: "probe", id: "p-evo2", rev: 1 }];
    await okValue("evolution.propose@1", {
      id: "evolver", version: "2.0",
      preconditions: ["probe"], invariants: ["no exfil"],
      forbiddenActions: [], requiredCapabilities: ["vault.append:ns=ctlhand"],
      recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
      actor: "human",
    });
    await okValue("evolution.promote@1", { contractId: "evolver", evidence: ev, actor: "human" });
    const rb = await okValue("evolution.rollback@1", { contractId: "evolver", actor: "human" });
    expect(rb.quarantinedRev).toBe(4);
    expect(rb.reactivatedRev).toBe(1);
    const mirror = await call("vault.get@1", { ns: "control", id: "evolution:evolver" });
    expect(mirror.ok).toBe(true);
    if (mirror.ok) {
      expect((mirror.value as { data: Record<string, any> }).data).toMatchObject({
        kind: "rollback", quarantinedRev: 4, reactivatedRev: 1,
      });
    }
  });
});
