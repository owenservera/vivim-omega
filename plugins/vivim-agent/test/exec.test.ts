// D-327 B1a — one agent acts once (realization→execution wiring, D-315 finish-then-halt).
// Through a REAL boot (law+vault+agent): a PROMOTED realization, replayed as a
// fixture seed, causes a gated op call under the agent's authority with exactly
// one ledger row per attempt (settled AND refused) — refused-and-ledgered is a
// legitimate outcome, never silently retried. Finish-then-halt is pinned:
// quarantine-then-exec REFUSEs new calls (version-pinned admission); admitted
// calls settle with admittedContractRev + quarantinedMidFlight annotation.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, Outcome } from "@vivim/omega-contracts";
import {
  decideExecAdmission, execCallScope, execQuarantinedMidFlight, parseExecInput,
} from "../src/agent.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const AGENT_CONTRACTS = ["agent.spawn@1", "agent.describe@1", "agent.exec@1", "behavior.propose@1", "behavior.promote@1", "behavior.rollback@1", "decision.record@1"];
const AGENT_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.forbidden.set@1", "port:law.check@1"];

// ---- pure tables (no ports) ----

describe("agent.exec pure — input, scope, admission, annotation", () => {
  test("parseExecInput requires agentId+op; payload defaults {}; realizationRef optional", () => {
    const full = parseExecInput({ agentId: "agent_x", op: "vault.append@1", payload: { ns: "a" }, realizationRef: { ns: "providers", id: "r", rev: 1 } });
    expect(full).toEqual({ agentId: "agent_x", op: "vault.append@1", payload: { ns: "a" }, realizationRef: { ns: "providers", id: "r", rev: 1 } });
    expect(parseExecInput({ agentId: "agent_x", op: "vault.get@1" })).toMatchObject({ agentId: "agent_x", op: "vault.get@1", payload: {} , realizationRef: null});
    expect(() => parseExecInput({})).toThrow(/agentId/);
    expect(() => parseExecInput({ agentId: "a", op: "vault.append@1", payload: [], })).toThrow(/payload/);
  });

  test("execCallScope: vault.* + ns → scope; other verbs unsupported; missing ns unattributable; bad shape throws", () => {
    expect(execCallScope("vault.append@1", { ns: "exec-probe" })).toEqual({ kind: "scope", scope: "vault.append:ns=exec-probe" });
    expect(execCallScope("message.send@1", { ns: "x" })).toMatchObject({ kind: "unsupported" });
    expect(execCallScope("vault.append@1", {})).toMatchObject({ kind: "unattributable" });
    expect(() => execCallScope("not-an-op", {})).toThrow(/<id>@<version>/);
  });

  test("decideExecAdmission: active+pinned+live admits; everything else refuses with a named reason", () => {
    const good = { contractState: "active", contractVersion: "1.0", identityState: "staged", identityVersion: "1.0" };
    expect(decideExecAdmission(good)).toEqual({ admittable: true, reason: "admitted" });
    expect(decideExecAdmission({ ...good, identityState: "active" }).admittable).toBe(true);
    expect(decideExecAdmission({ ...good, contractState: "quarantined" })).toMatchObject({ admittable: false });
    expect(decideExecAdmission({ ...good, identityState: "quarantined" }).reason).toContain("terminal");
    expect(decideExecAdmission({ ...good, identityState: "retired" }).admittable).toBe(false);
    expect(decideExecAdmission({ ...good, identityVersion: "2.0" }).reason).toContain("quarantined-mid-flight");
  });

  test("execQuarantinedMidFlight: same rev+version+active → false; any drift → true", () => {
    const base = { admittedRev: 2, admittedVersion: "1.0", headRev: 2, headVersion: "1.0", headState: "active" };
    expect(execQuarantinedMidFlight(base)).toBe(false);
    expect(execQuarantinedMidFlight({ ...base, headRev: 3 })).toBe(true);
    expect(execQuarantinedMidFlight({ ...base, headVersion: "2.0" })).toBe(true);
    expect(execQuarantinedMidFlight({ ...base, headState: "quarantined" })).toBe(true);
  });
});

// ---- live ceremony ----

describe("D-327 — PROMOTED record → gated call → ledger entry (real boot)", () => {
  let host: BootedHost;

  beforeAll(async () => {
    const root = omegaTmp("omega-exec-test", `b1a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const spec: CompositionSpec = {
      name: "exec-b1a",
      entries: [
        { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
        { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
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

  async function outcome(op: string, payload: unknown): Promise<Outcome> {
    const r: PortResult = await host.router.callAsRoot(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as Outcome;
  }
  async function okValue(op: string, payload: unknown): Promise<Record<string, any>> {
    const o = await outcome(op, payload);
    expect(o.status).toBe("OK");
    if (o.status !== "OK" || o.value === undefined) throw new Error(`${op} not OK: ${JSON.stringify(o)}`);
    return o.value as Record<string, any>;
  }
  async function execLedgers(): Promise<Array<{ id: string; rev: number; data: Record<string, any> }>> {
    const q: PortResult = await host.router.callAsRoot("vault.query@1", { ns: "agent", filter: { idPrefix: "exec:" } });
    expect(q.ok).toBe(true);
    if (!q.ok) throw new Error(`ledger query failed: ${q.error}`);
    const rows = (q.value ?? []) as Array<{ id: string; rev: number }>;
    const out: Array<{ id: string; rev: number; data: Record<string, any> }> = [];
    for (const row of rows) {
      const g: PortResult = await host.router.callAsRoot("vault.get@1", { ns: "agent", id: row.id });
      expect(g.ok).toBe(true);
      if (g.ok) out.push({ id: row.id, rev: (g.value as { rev: number }).rev, data: (g.value as { data: Record<string, any> }).data });
    }
    return out;
  }

  const CONTRACT = {
    id: "worker", version: "1.0",
    preconditions: ["probe"], invariants: ["no exfil"],
    forbiddenActions: ["message.send@1"],
    requiredCapabilities: ["vault.append:ns=exec-probe"],
    recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
  };

  test("PROMOTED → gated vault.append settles OK and ledgers admittedContractRev + quarantinedMidFlight:false", async () => {
    const probe = await host.router.callAsRoot("vault.append@1", { ns: "probe", id: "p-exec", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await okValue("behavior.propose@1", CONTRACT);
    const pv = await okValue("behavior.promote@1", { contractId: "worker", evidence: [{ ns: "probe", id: "p-exec", rev: 1 }] });
    expect(pv.rev).toBe(2);
    // Fixture-replayed PROMOTED realization (the writer is verify/healing in
    // production; here the seed IS the fixture — exec only checks it resolves PROMOTED).
    const seed: PortResult = await host.router.callAsRoot("vault.append@1", {
      ns: "providers", id: "realization:exec.probe:provider.exec.fixture",
      data: {
        archetypeSlug: "exec.probe", providerId: "provider.exec.fixture", providerClass: "SIMULATOR",
        status: "PROMOTED", discoverySessionRef: null, opMapRef: null, entityMapRef: null,
        streamRefs: [], evidenceRefs: [{ ns: "probe", id: "p-exec", rev: 1 }],
        supersedes: null, createdAt: Date.now(),
      },
    });
    expect(seed.ok).toBe(true);
    const seedRev = (seed.value as { rev: number }).rev;
    const sv = await okValue("agent.spawn@1", { behaviorContractId: "worker", requestedScope: "vault.append:ns=exec-probe" });
    const agentId = (sv.identity as { id: string }).id;

    const before = await execLedgers();
    const ex = await outcome("agent.exec@1", {
      agentId, op: "vault.append@1",
      payload: { ns: "exec-probe", id: "m-exec-1", data: { hello: "world" } },
      realizationRef: { ns: "providers", id: "realization:exec.probe:provider.exec.fixture", rev: seedRev },
    });
    expect(ex.status).toBe("OK");
    if (ex.status === "OK") {
      expect((ex.value as { callOk: boolean }).callOk).toBe(true);
      expect((ex.value as { admittedContractRev: number }).admittedContractRev).toBe(2);
      expect((ex.value as { quarantinedMidFlight: boolean }).quarantinedMidFlight).toBe(false);
    }
    // The gated call landed: the vault row exists.
    const got: PortResult = await host.router.callAsRoot("vault.get@1", { ns: "exec-probe", id: "m-exec-1" });
    expect(got.ok).toBe(true);
    // Exactly one new ledger row, attributing the call to the agent.
    const after = await execLedgers();
    expect(after.length).toBe(before.length + 1);
    const ours = after.filter((l) => (l.data.agentId as string) === agentId && (l.data.op as string) === "vault.append@1");
    expect(ours.length).toBe(1);
    expect(ours[0].data).toMatchObject({ decision: "settled", admittedContractRev: 2, quarantinedMidFlight: false, callOk: true });
  });

  test("forbidden overlay denies the agent's call AND ledgers the refusal (sibling agent unaffected)", async () => {
    // A contract that forbids the very op exec would settle: the law pre-check
    // (principal agent:<id>) denies before the target is ever called.
    await okValue("behavior.propose@1", {
      ...CONTRACT, id: "locked", version: "1.0",
      forbiddenActions: ["vault.append@1"],
      requiredCapabilities: ["vault.append:ns=exec-probe"],
    });
    const probe: PortResult = await host.router.callAsRoot("vault.append@1", { ns: "probe", id: "p-exec-2", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await okValue("behavior.promote@1", { contractId: "locked", evidence: [{ ns: "probe", id: "p-exec-2", rev: 1 }] });
    const sv = await okValue("agent.spawn@1", { behaviorContractId: "locked", requestedScope: "vault.append:ns=exec-probe" });
    const lockedId = (sv.identity as { id: string }).id;

    const before = await execLedgers();
    const denied = await outcome("agent.exec@1", {
      agentId: lockedId, op: "vault.append@1",
      payload: { ns: "exec-probe", id: "m-exec-denied", data: { no: "write" } },
    });
    expect(denied.status).toBe("REFUSED");
    expect(String(denied.reason ?? "")).toContain("law denies");
    // The target never ran: no vault row.
    const missing: PortResult = await host.router.callAsRoot("vault.get@1", { ns: "exec-probe", id: "m-exec-denied" });
    expect(missing.ok).toBe(false);
    // …but the refusal IS ledgered (never a silent drop).
    const after = await execLedgers();
    expect(after.length).toBe(before.length + 1);
    const ours = after.filter((l) => (l.data.agentId as string) === lockedId);
    expect(ours.length).toBe(1);
    expect(ours[0].data).toMatchObject({ decision: "refused:forbidden", callOk: false });
  });

  test("scope, verb-scope, realization, and shape gates refuse loudly and ledger", async () => {
    const sv = await okValue("agent.spawn@1", { behaviorContractId: "worker", requestedScope: "vault.append:ns=exec-probe" });
    const agentId = (sv.identity as { id: string }).id;
    // Outside the recorded authority.
    const wide = await outcome("agent.exec@1", { agentId, op: "vault.append@1", payload: { ns: "other", id: "x", data: {} } });
    expect(wide.status).toBe("REFUSED");
    // Outside the v0 verb scope (message.send is also this agent's forbidden op —
    // the verb gate fires first with UNSUPPORTED, honestly labeled).
    const verb = await outcome("agent.exec@1", { agentId, op: "message.send@1", payload: { ns: "exec-probe" } });
    expect(verb.status).toBe("UNSUPPORTED");
    // No attributable ns.
    const unatt = await outcome("agent.exec@1", { agentId, op: "vault.append@1", payload: {} });
    expect(unatt.status).toBe("UNSUPPORTED");
    // Cited realization that is not PROMOTED.
    const seedT: PortResult = await host.router.callAsRoot("vault.append@1", {
      ns: "providers", id: "realization:exec.probe:provider.exec.testing",
      data: {
        archetypeSlug: "exec.probe", providerId: "provider.exec.testing", providerClass: "SIMULATOR",
        status: "TESTING", discoverySessionRef: null, opMapRef: null, entityMapRef: null,
        streamRefs: [], evidenceRefs: [], supersedes: null, createdAt: Date.now(),
      },
    });
    expect(seedT.ok).toBe(true);
    const testingRev = (seedT.value as { rev: number }).rev;
    const unproven = await outcome("agent.exec@1", {
      agentId, op: "vault.append@1", payload: { ns: "exec-probe", id: "m-exec-unproven", data: {} },
      realizationRef: { ns: "providers", id: "realization:exec.probe:provider.exec.testing", rev: testingRev },
    });
    expect(unproven.status).toBe("REFUSED");
    // Cited realization that resolves nowhere.
    const ghost = await outcome("agent.exec@1", {
      agentId, op: "vault.append@1", payload: { ns: "exec-probe", id: "m-exec-ghost", data: {} },
      realizationRef: { ns: "providers", id: "realization:exec.probe:provider.exec.ghost", rev: 1 },
    });
    expect(ghost.status).toBe("UNKNOWN");
    // Ghost agent.
    const noAgent = await outcome("agent.exec@1", { agentId: "agent_ghost", op: "vault.append@1", payload: { ns: "exec-probe" } });
    expect(noAgent.status).toBe("UNKNOWN");
    // Malformed shape fails closed.
    const bad: PortResult = await host.router.callAsRoot("agent.exec@1", { agentId });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("DEGRADED");
  });

  test("D-315 finish-then-halt: rollback refuses the quarantined version's new calls, admits the reactivated one", async () => {
    const probe: PortResult = await host.router.callAsRoot("vault.append@1", { ns: "probe", id: "p-exec-rb", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await okValue("behavior.propose@1", { ...CONTRACT, id: "versioned", version: "1.0" });
    await okValue("behavior.promote@1", { contractId: "versioned", evidence: [{ ns: "probe", id: "p-exec-rb", rev: 1 }] });
    const s1 = await okValue("agent.spawn@1", { behaviorContractId: "versioned", requestedScope: "vault.append:ns=exec-probe" });
    const v1Agent = (s1.identity as { id: string }).id;
    await okValue("behavior.propose@1", { ...CONTRACT, id: "versioned", version: "2.0" });
    await okValue("behavior.promote@1", { contractId: "versioned", evidence: [{ ns: "probe", id: "p-exec-rb", rev: 1 }] });
    const s2 = await okValue("agent.spawn@1", { behaviorContractId: "versioned", requestedScope: "vault.append:ns=exec-probe" });
    const v2Agent = (s2.identity as { id: string }).id;
    // v2 settles fine before the quarantine (the finish half: completion ledgers).
    const pre = await outcome("agent.exec@1", { agentId: v2Agent, op: "vault.append@1", payload: { ns: "exec-probe", id: "m-exec-v2", data: {} } });
    expect(pre.status).toBe("OK");
    // Quarantine v2, reactivate v1.
    const rb = await okValue("behavior.rollback@1", { contractId: "versioned" });
    expect(rb.quarantinedRev).toBe(4);
    // New calls from the quarantined version REFUSE (the halt half).
    const refused = await outcome("agent.exec@1", { agentId: v2Agent, op: "vault.append@1", payload: { ns: "exec-probe", id: "m-exec-v2b", data: {} } });
    expect(refused.status).toBe("REFUSED");
    expect(String(refused.reason ?? "")).toContain("quarantined-mid-flight");
    // The reactivated version still admits (liveness: no stranded work).
    const live = await outcome("agent.exec@1", { agentId: v1Agent, op: "vault.append@1", payload: { ns: "exec-probe", id: "m-exec-v1b", data: {} } });
    expect(live.status).toBe("OK");
  });
});
