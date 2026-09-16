// D-324 — decision.record accepts/rejects buildDecisionRef (real boot).
// The doc pointer ("D-###") rides the genealogy record so a reader can tell
// which build decision authorized the deciding logic; old records without it
// validate untouched.
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

describe("D-324 — buildDecisionRef through a real boot", () => {
  let host: BootedHost;
  beforeAll(async () => {
    const root = omegaTmp("omega-decref-test", `d324-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const spec: CompositionSpec = {
      name: "decref-d324",
      entries: [
        {
          id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0,
          grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"] },
        },
        {
          id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1,
          grant: { capabilities: [], contracts: ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"] },
          config: { dataDir },
        },
        {
          id: "vivim.agent", source: "plugins/vivim-agent", bootPhase: 1,
          grant: {
            capabilities: ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.forbidden.set@1", "port:law.check@1"],
            contracts: ["agent.spawn@1", "agent.describe@1", "agent.exec@1", "behavior.propose@1", "behavior.promote@1", "behavior.rollback@1", "decision.record@1"],
          },
        },
      ],
    };
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  async function record(payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot("decision.record@1", payload);
  }
  async function stored(id: string): Promise<Record<string, any>> {
    const r: PortResult = await host.router.callAsRoot("vault.get@1", { ns: "decision", id });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`vault.get decision/${id} failed`);
    return (r.value as { data: Record<string, any> }).data;
  }

  test("resolver-style record cites D-323 and survives the vault round trip", async () => {
    const r = await record({
      decisionId: "dec-resolve-1", subject: "route probe.a", priorState: "unrouted",
      proposedState: "DETERMINISTIC", actor: "vivim.director", evidence: [],
      parentDecisions: [], buildDecisionRef: "D-323",
    });
    expect(r.ok).toBe(true);
    expect((await stored("dec-resolve-1")).buildDecisionRef).toBe("D-323");
  });

  test("records without the pointer still validate (old rows untouched)", async () => {
    const r = await record({
      decisionId: "dec-legacy-1", subject: "old", priorState: "a",
      proposedState: "b", actor: "human", evidence: [], parentDecisions: [],
    });
    expect(r.ok).toBe(true);
    expect("buildDecisionRef" in (await stored("dec-legacy-1"))).toBe(false);
  });

  test("non-pointer shapes fail closed (DEGRADED, never stored)", async () => {
    for (const bad of ["banana", "D-", "D-ABC", "323", 323, "d-323"]) {
      const r = await record({
        decisionId: `dec-bad-${String(bad)}`, subject: "x", priorState: "a",
        proposedState: "b", actor: "human", evidence: [], parentDecisions: [],
        buildDecisionRef: bad,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("DEGRADED");
    }
    const missing: PortResult = await host.router.callAsRoot("vault.get@1", { ns: "decision", id: "dec-bad-banana" });
    expect(missing.ok).toBe(false); // refused at the boundary — nothing stored
  });
});
