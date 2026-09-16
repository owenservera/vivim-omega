// D-326 — G1 closure: healing writes DEGRADED/TESTING to ns "providers".
// Full lifecycle round trip through a REAL boot (law+vault+verification+
// healing+providers): verify PROMOTED → heal/reject DEGRADED →
// heal/hold TESTING → registry reflects TESTING (real-vault-read assertion) →
// verify/failed REQUIRES_REDISCOVERY → verify/passing PROMOTED. Every status
// transition is asserted by reading the vault back, never by trusting the
// op's own return.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 30_000);

function lifecycleSpec(name: string, dataDir: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      {
        id: "discovery.verification", source: "plugins/discovery-verification", bootPhase: 1,
        grant: { capabilities: ["port:vault.append@1", "port:vault.get@1"], contracts: ["discovery.verify@1"] },
      },
      {
        id: "discovery.healing", source: "plugins/discovery-healing", bootPhase: 1,
        grant: { capabilities: ["port:vault.append@1", "port:vault.get@1"], contracts: ["discovery.heal@1"] },
      },
      {
        id: "vivim.providers", source: "plugins/vivim-providers", bootPhase: 1,
        grant: {
          capabilities: ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.registry@1"],
          contracts: ["providers.registry@1", "providers.realization.get@1", "providers.session.start@1"],
        },
      },
    ],
  };
}

async function vaultGet(host: BootedHost, ns: string, id: string): Promise<{ rev: number; data: any }> {
  const r: PortResult = await host.router.callAsRoot("vault.get@1", { ns, id });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`vault.get ${ns}/${id} failed: ${r.error} ${r.detail ?? ""}`);
  return r.value as { rev: number; data: any };
}

describe("D-326 — PROMOTED → DEGRADED → TESTING → REQUIRES_REDISCOVERY → PROMOTED (real vault reads)", () => {
  test("full lifecycle round trip through discovery.verify@1 + discovery.heal@1", async () => {
    const root = omegaTmp("omega-heal-d326", `lifecycle-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    mkdirSync(vaultDir, { recursive: true });
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(lifecycleSpec("d326-lifecycle", dataDir), OMEGA_ROOT, vaultDir, rootKey);
    const host = await bootComposition(recipe, buildDir, vaultDir);
    hosts.push(host);

    const PROVIDER = "provider.email.file";
    const OP = "message.send@1";
    const RID = "realization:message.send:provider.email.file";

    // Seed probe evidence (verify resolves every cited ref — unresolvable refs never promote).
    const seed: PortResult = await host.router.callAsRoot("vault.append@1", { ns: "probe", id: "p-ev", data: { suite: "lifecycle", pass: true } });
    expect(seed.ok).toBe(true);
    const ev = [{ ns: "probe", id: "p-ev", rev: 1 }];

    // 1 · verify PROMOTED (3/3 passing, proof complete).
    const v1: PortResult = await host.router.callAsRoot("discovery.verify@1", {
      mapping: { satisfied: true, bindings: [{ blueprintOp: OP, candidateId: "cand-1" }] },
      probes: [0, 1, 2].map(() => ({ candidateId: "cand-1", passed: true, evidence: ev })),
      provider: { id: PROVIDER },
      runId: "d326-promote",
    });
    expect(v1.ok).toBe(true);
    let row = await vaultGet(host, "providers", RID);
    expect(row.data.status).toBe("PROMOTED");
    const revPromoted = row.rev;

    // 2 · seeded drift → PROMOTED→DEGRADED (reject: drift, no admissible candidate).
    const driftedContract = {
      op: OP, selector: "#compose-old", actionType: "click", riskHint: "dom",
      address: { ns: "discovery", id: "promotion:d326-promote", rev: 1 },
    };
    const fresh = { selector: "#compose-new-totally-different", actionType: "type", riskHint: "dom" };
    const h1: PortResult = await host.router.callAsRoot("discovery.heal@1", {
      contractEvidence: driftedContract, freshObservation: fresh, now: 1735689600100,
      provider: { id: PROVIDER },
    });
    expect(h1.ok).toBe(true);
    if (h1.ok) {
      const rep = h1.value as { action: string; realization: { written: boolean; status: string; rev: number } };
      expect(rep.action).toBe("reject");
      expect(rep.realization.written).toBe(true);
      expect(rep.realization.status).toBe("DEGRADED");
    }
    row = await vaultGet(host, "providers", RID);
    expect(row.data.status).toBe("DEGRADED");
    expect(row.rev).toBeGreaterThan(revPromoted);
    expect(row.data.supersedes).toMatchObject({ ns: "providers", id: RID, rev: revPromoted });
    // evidenceRefs cite the drift observation (the drifted contract's vault address).
    expect(row.data.evidenceRefs).toContainEqual({ ns: "discovery", id: "promotion:d326-promote", rev: 1 });

    // 3 · probation entry → TESTING (candidate admitted, 1/3 probes → hold).
    const candidate = { id: "cand-1", op: OP, selector: "#compose-new-totally-different", evidence: [{ capture: "fresh" }] };
    const h2: PortResult = await host.router.callAsRoot("discovery.heal@1", {
      contractEvidence: driftedContract, freshObservation: fresh,
      candidate, probes: [{ candidateId: "cand-1", passed: true }],
      now: 1735689600200, provider: { id: PROVIDER },
    });
    expect(h2.ok).toBe(true);
    if (h2.ok) {
      const rep = h2.value as { action: string; realization: { written: boolean; status: string } };
      expect(rep.action).toBe("hold-in-probation");
      expect(rep.realization.written).toBe(true);
      expect(rep.realization.status).toBe("TESTING");
    }
    row = await vaultGet(host, "providers", RID);
    expect(row.data.status).toBe("TESTING");
    const revTesting = row.rev;

    // 4 · registry reflects TESTING from a real vault read (D-307 non-vacuous).
    const reg: PortResult = await host.router.callAsRoot("providers.registry@1", {});
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      const entries = (reg.value as { entries: Array<{ providerId: string; status: string; realizationRef: { rev: number } }> }).entries;
      const ours = entries.find((e) => e.providerId === PROVIDER);
      expect(ours?.status).toBe("TESTING");
      expect(ours?.realizationRef.rev).toBe(revTesting);
    }

    // 5 · failed probation → REQUIRES_REDISCOVERY (verify: probes ran, some failed).
    const v2: PortResult = await host.router.callAsRoot("discovery.verify@1", {
      mapping: { satisfied: true, bindings: [{ blueprintOp: OP, candidateId: "cand-1" }] },
      probes: [
        { candidateId: "cand-1", passed: true, evidence: ev },
        { candidateId: "cand-1", passed: false, evidence: ev },
        { candidateId: "cand-1", passed: true, evidence: ev },
      ],
      provider: { id: PROVIDER },
      runId: "d326-fail",
    });
    expect(v2.ok).toBe(true);
    row = await vaultGet(host, "providers", RID);
    expect(row.data.status).toBe("REQUIRES_REDISCOVERY");

    // 6 · successful re-probe → PROMOTED.
    const v3: PortResult = await host.router.callAsRoot("discovery.verify@1", {
      mapping: { satisfied: true, bindings: [{ blueprintOp: OP, candidateId: "cand-1" }] },
      probes: [0, 1, 2].map(() => ({ candidateId: "cand-1", passed: true, evidence: ev })),
      provider: { id: PROVIDER },
      runId: "d326-repromote",
    });
    expect(v3.ok).toBe(true);
    row = await vaultGet(host, "providers", RID);
    expect(row.data.status).toBe("PROMOTED");

    await host.shutdown();
  }, 90_000);

  test("heal without provider identity still decides (realization skipped loudly, decision stands)", async () => {
    const root = omegaTmp("omega-heal-d326", `noid-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    mkdirSync(vaultDir, { recursive: true });
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(lifecycleSpec("d326-noid", dataDir), OMEGA_ROOT, vaultDir, rootKey);
    const host = await bootComposition(recipe, buildDir, vaultDir);
    hosts.push(host);
    const h: PortResult = await host.router.callAsRoot("discovery.heal@1", {
      contractEvidence: { op: "message.send@1", selector: "#a", actionType: "click" },
      freshObservation: { selector: "#b-totally-different", actionType: "type" },
      now: 1735689600300,
    });
    expect(h.ok).toBe(true);
    if (h.ok) {
      const rep = h.value as { action: string; realization: { written: boolean; detail: string } };
      expect(rep.action).toBe("reject");
      expect(rep.realization.written).toBe(false);
      expect(rep.realization.detail).toContain("provider");
    }
    await host.shutdown();
  }, 90_000);
});
