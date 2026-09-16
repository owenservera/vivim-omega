// D-325 — forbidden-overlay durability through a real boot.
// Proves, against the live µhost (not a pure-function unit test):
//   1. restart-preserves-forbidden: set → vault record → shutdown → reboot same
//      dataDir → reload → law.check still denies (fail-closed across restarts).
//   2. boot-ordering: law+vault present → reload succeeds; vault ABSENT but caps
//      granted → set aborts fail-closed with a typed DEGRADED naming
//      vivim.vault (no hang, no silent empty table); empty overlay reloads to 0.
// Patterns copied from test/integration.test.ts (compileComposition → bootComposition).
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, Outcome } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");

const LAW_CONTRACTS = [
  "law.check@1",
  "law.registry@1",
  "law.consent.grant@1",
  "law.tokens.revoke@1",
  "law.forbidden.set@1",
  "law.forbidden.reload@1",
  "law.amendment@1",
];
const LAW_CAPS = ["host.journal.append", "host.tokens.revoke", "port:vault.append@1", "port:vault.query@1", "port:vault.get@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 30_000);

function lawVaultSpec(name: string, dataDir: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: LAW_CAPS, contracts: LAW_CONTRACTS } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
    ],
  };
}

async function bootCase(spec: CompositionSpec, vaultDir: string): Promise<BootedHost> {
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return host;
}

async function shutdown(host: BootedHost): Promise<void> {
  const i = hosts.indexOf(host);
  if (i >= 0) hosts.splice(i, 1);
  await host.shutdown().catch(() => {});
}

describe("D-325 — restart preserves the forbidden overlay (real boot, same dataDir)", () => {
  test("set → vault record → reboot → reload → law.check still denies", async () => {
    const root = omegaTmp("omega-law-d325", `restart-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    mkdirSync(vaultDir, { recursive: true });

    const principal = "agent:d325-restart-probe";
    const op = "message.send@1";

    // --- boot 1: set the overlay, prove the vault record exists ---
    const host1 = await bootCase(lawVaultSpec("d325-restart", dataDir), vaultDir);
    const set: PortResult = await host1.router.callAsRoot("law.forbidden.set@1", { principal, ops: [op] });
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect((set.value as { persisted: boolean }).persisted).toBe(true);
      expect((set.value as { count: number }).count).toBe(1);
    }
    const rec: PortResult = await host1.router.callAsRoot("vault.get@1", { ns: "law", id: `forbidden:${principal}` });
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      const data = (rec.value as { data: { principal: string; ops: string[] } }).data;
      expect(data.principal).toBe(principal);
      expect(data.ops).toEqual([op]);
    }
    const denied1: PortResult = await host1.router.callAsRoot("law.check@1", { principal, op });
    expect(denied1.ok).toBe(true);
    if (denied1.ok) expect((denied1.value as { decision: string }).decision).toBe("deny");
    await shutdown(host1);

    // --- boot 2: same vaultDir/dataDir (restart), reload, still denied ---
    const host2 = await bootCase(lawVaultSpec("d325-restart", dataDir), vaultDir);
    // Deterministic close of the phase-0/phase-1 race: the boot path already
    // retried, this pins the assertion to the reloaded state.
    const reload: PortResult = await host2.router.callAsRoot("law.forbidden.reload@1", {});
    expect(reload.ok).toBe(true);
    if (reload.ok) expect((reload.value as { count: number }).count).toBe(1);
    const denied2: PortResult = await host2.router.callAsRoot("law.check@1", { principal, op });
    expect(denied2.ok).toBe(true);
    if (denied2.ok) {
      expect((denied2.value as { decision: string }).decision).toBe("deny");
      expect((denied2.value as { reason: string }).reason).toContain("forbidden action");
    }
    // Sibling op unaffected after the restart — the reload was exact, not a blanket deny.
    const sibling: PortResult = await host2.router.callAsRoot("law.check@1", { principal, op: "message.list@1" });
    expect(sibling.ok).toBe(true);
    // Registry reports the durable state loudly (never a silent empty table).
    const reg: PortResult = await host2.router.callAsRoot("law.registry@1", {});
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      const forbidden = (reg.value as { forbidden?: { persistence: boolean; loaded: boolean; count: number } }).forbidden;
      expect(forbidden?.persistence).toBe(true);
      expect(forbidden?.loaded).toBe(true);
      expect(forbidden?.count).toBe(1);
    }
    // Clearing persists too: empty-ops tombstone survives the next reload.
    const cleared: PortResult = await host2.router.callAsRoot("law.forbidden.set@1", { principal, ops: [] });
    expect(cleared.ok).toBe(true);
    const reload2: PortResult = await host2.router.callAsRoot("law.forbidden.reload@1", {});
    expect(reload2.ok).toBe(true);
    if (reload2.ok) expect((reload2.value as { count: number }).count).toBe(0);
    await shutdown(host2);
  }, 60_000);
});

describe("D-325 — committed agent.json: spawn persists the overlay, restart keeps it", () => {
  test("propose → promote → spawn → vault record → reboot → reload → still denies", async () => {
    const root = omegaTmp("omega-law-d325", `agentjson-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    mkdirSync(vaultDir, { recursive: true });

    // The COMMITTED composition (not an inline copy): load agent.json, point
    // its vault dataDir at temp. Any grant drift from this file fails here first.
    const spec = JSON.parse(readFileSync(join(OMEGA_ROOT, "compositions/agent.json"), "utf-8")) as CompositionSpec;
    for (const e of spec.entries) {
      if (e.id === "vivim.vault") e.config = { dataDir };
    }

    const bootIt = async (): Promise<BootedHost> => {
      const { rootKey } = ensureVault(vaultDir);
      const { recipe, buildDir } = compileComposition(spec, join(OMEGA_ROOT, "compositions"), vaultDir, rootKey);
      const host = await bootComposition(recipe, buildDir, vaultDir);
      hosts.push(host);
      return host;
    };
    const outcomeOk = async (host: BootedHost, op: string, payload: unknown): Promise<Record<string, any>> => {
      const r: PortResult = await host.router.callAsRoot(op, payload);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
      const o = r.value as Outcome;
      expect(o.status).toBe("OK");
      if (o.status !== "OK" || o.value === undefined) throw new Error(`${op} not OK: ${JSON.stringify(o)}`);
      return o.value as Record<string, any>;
    };

    const host1 = await bootIt();
    await outcomeOk(host1, "behavior.propose@1", {
      id: "d325-worker", version: "1.0",
      preconditions: ["test"], invariants: ["test"],
      forbiddenActions: ["message.send@1"],
      requiredCapabilities: ["vault.append:ns=agent"],
      recovery: { onAmbiguity: "escalate", onContradiction: "halt" },
    });
    const probe = await host1.router.callAsRoot("vault.append@1", { ns: "probe", id: "p1", data: { pass: true } });
    expect(probe.ok).toBe(true);
    await outcomeOk(host1, "behavior.promote@1", {
      contractId: "d325-worker", evidence: [{ ns: "probe", id: "p1", rev: 1 }],
    });
    const sv = await outcomeOk(host1, "agent.spawn@1", {
      behaviorContractId: "d325-worker", requestedScope: "vault.append:ns=agent",
    });
    const agentId = (sv.identity as { id: string }).id;
    // Spawn registered the overlay AND persisted it (agent.json grants the caps).
    const rec: PortResult = await host1.router.callAsRoot("vault.get@1", { ns: "law", id: `forbidden:${agentId}` });
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      expect(((rec.value as { data: { ops: string[] } }).data).ops).toEqual(["message.send@1"]);
    }
    await shutdown(host1);

    const host2 = await bootIt();
    const reload: PortResult = await host2.router.callAsRoot("law.forbidden.reload@1", {});
    expect(reload.ok).toBe(true);
    const denied: PortResult = await host2.router.callAsRoot("law.check@1", { principal: agentId, op: "message.send@1" });
    expect(denied.ok).toBe(true);
    if (denied.ok) expect((denied.value as { decision: string }).decision).toBe("deny");
    await shutdown(host2);
  }, 60_000);
});

describe("D-325 — boot-ordering: vault absent fails closed and loudly", () => {
  test("law grants vault caps but boots no vault → set aborts DEGRADED naming vivim.vault; reload refuses; no hang", async () => {
    const root = omegaTmp("omega-law-d325", `novault-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const spec: CompositionSpec = {
      name: "d325-novault",
      entries: [
        { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: LAW_CAPS, contracts: LAW_CONTRACTS } },
      ],
    };
    const host = await bootCase(spec, vaultDir);

    const set: PortResult = await host.router.callAsRoot("law.forbidden.set@1", { principal: "agent:ghost", ops: ["message.send@1"] });
    expect(set.ok).toBe(false);
    if (!set.ok) {
      expect(set.error).toBe("DEGRADED");
      expect(set.detail ?? "").toContain("vivim.vault");
    }
    // The aborted set left no in-memory residue — the table is honestly empty.
    const check: PortResult = await host.router.callAsRoot("law.check@1", { principal: "agent:ghost", op: "message.send@1" });
    expect(check.ok).toBe(true); // the gate answers; the overlay simply holds nothing

    const reload: PortResult = await host.router.callAsRoot("law.forbidden.reload@1", {});
    expect(reload.ok).toBe(false);
    if (!reload.ok) {
      expect(reload.error).toBe("DEGRADED");
      expect(reload.detail ?? "").toContain("vivim.vault");
    }
    const reg: PortResult = await host.router.callAsRoot("law.registry@1", {});
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      const forbidden = (reg.value as { forbidden?: { persistence: boolean; loaded: boolean } }).forbidden;
      expect(forbidden?.persistence).toBe(true);
      expect(forbidden?.loaded).toBe(false); // UNLOADED and reported — never a silent empty table
    }
    await shutdown(host);
  }, 60_000);

  test("law+vault present, empty overlay → reload 0, registry count 0 (the `0 forbidden entries` state)", async () => {
    const root = omegaTmp("omega-law-d325", `empty-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    mkdirSync(vaultDir, { recursive: true });
    const host = await bootCase(lawVaultSpec("d325-empty", dataDir), vaultDir);
    const reload: PortResult = await host.router.callAsRoot("law.forbidden.reload@1", {});
    expect(reload.ok).toBe(true);
    if (reload.ok) {
      expect((reload.value as { count: number }).count).toBe(0);
      expect((reload.value as { loaded: boolean }).loaded).toBe(true);
    }
    await shutdown(host);
  }, 60_000);
});
