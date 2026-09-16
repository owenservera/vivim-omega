// discovery.healing — integration tests (Ω9, GATE-Ω9 evidence).
//
// THE HEADLINE (one test, the wave's existence proof): a deliberately broken
// provider heals itself through the full loop, live, over real compartments:
//
//   drift           the promoted SurfaceContract cites "#compose-btn" but the
//                   fresh observation says the button moved to
//                   button[data-testid='compose'] — heal@1 scores the drift
//   rediscovery     a DRAFT replacement candidate citing fresh-capture evidence
//   probation       3/3 postcondition probes pass (policy: ≥0.95, 3 probes)
//   promotion       heal@1 returns {action: "promote"} + the evidence chain,
//                   journaled into the user's vault (ns "discovery")
//   atomic install  the amendment transport: re-compile the composition with the
//                   provider's FIXED source (test/fixtures/provider-fixed — the
//                   selector now matches the observation) into the SAME vault,
//                   pinRecipe, bootWithRecovery — Ω0 machinery swaps the pin
//                   atomically — and the healed provider serves the new selector
//
// Everything runs through the real µhost: compileComposition, bootWithRecovery,
// router.callAsRoot, real capability tokens, real law gate, real Merkle vault.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault, loadPinnedRecipe, pinRecipe } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");          // vivim-omega/
const SPEC = join(OMEGA_ROOT, "compositions", "healing.json");  // committed source spec
const SPEC_DIR = join(OMEGA_ROOT, "compositions");
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

async function retire(host: BootedHost): Promise<void> {
  const i = hosts.indexOf(host);
  if (i >= 0) hosts.splice(i, 1);
  await host.shutdown().catch(() => {});
}

/** Fresh case root under /tmp (unique per run — no cross-run state). */
function caseRoot(name: string): string {
  const root = omegaTmp("omega-healing-test", `${name}-${RUN_ID}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "vault"), { recursive: true });
  return root;
}

function deepSpec(name: string, dataDir: string, providerSource?: string): CompositionSpec {
  const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
  spec.name = name;
  spec.entries[1].config = { dataDir }; // unique dataDir per case (house pattern)
  if (providerSource) {
    spec.entries.push({
      id: "provider.compose",
      source: providerSource,
      bootPhase: 1,
      grant: { capabilities: [], contracts: ["compose.click@1"] },
    });
  }
  return spec;
}

// ---- the scenario data ----------------------------------------------------------

const OLD_SELECTOR = "#compose-btn";
const NEW_SELECTOR = "button[data-testid='compose']";
const WORLD = { buttons: [NEW_SELECTOR, "button[data-testid='send']"] }; // the fresh capture's inventory

const promotedContract = {
  op: "compose.click@1",
  selector: OLD_SELECTOR,
  actionType: "click",
  riskHint: "dom",
  status: "PROMOTED",
  confidence: 0.97,
  evidence: [{ capture: "cap-0001", selector: OLD_SELECTOR }],
};

const freshObservation = {
  selector: NEW_SELECTOR,
  actionType: "click",
  outcomeRates: { success: 0.98, miss: 0.02 },
};

const replacementCandidate = {
  id: "cand-compose-2",
  op: "compose.click@1",
  selector: NEW_SELECTOR,
  actionType: "click",
  riskHint: "dom",
  evidence: [
    { capture: "cap-4821", selector: NEW_SELECTOR },
    { capture: "cap-4822", selector: NEW_SELECTOR },
  ],
  status: "DRAFT",
  confidence: 0.93,
};

const probes = [
  { candidateId: "cand-compose-2", preState: { clicked: false, triedSelector: OLD_SELECTOR }, postState: { clicked: true, triedSelector: NEW_SELECTOR }, passed: true },
  { candidateId: "cand-compose-2", preState: { inboxOpened: false }, postState: { inboxOpened: true }, passed: true },
  { candidateId: "cand-compose-2", preState: { draftFocused: false }, postState: { draftFocused: true }, passed: true },
];

// ----------------------------------------------------------------------------------

describe("GATE-Ω9 — the healing loop end-to-end (drift → rediscovery → probation → promotion → atomic install)", () => {
  test("a broken provider heals itself: promote decision, then the amendment transport installs the fixed source via atomic pin swap", async () => {
    const root = caseRoot("gate9");
    const vaultDir = join(root, "vault");
    const dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);

    // -- boot 1: the BROKEN world (committed healing spec + the stale provider) --
    const spec1 = deepSpec("healing-broken", dataDir, "../plugins/discovery-healing/test/fixtures/provider-broken");
    const c1 = compileComposition(spec1, SPEC_DIR, vaultDir, rootKey);
    const boot1 = await bootWithRecovery(vaultDir, join(c1.buildDir, "recipe.json"));
    expect(boot1.report.source).toBe("incoming");
    expect(boot1.report.booted).toBe(true);
    const host1 = boot1.host!;
    hosts.push(host1);

    // 1 · DRIFT, observed live: the broken provider is ALIVE but misses the button that moved
    const stale = await host1.router.callAsRoot("compose.click@1", WORLD);
    expect(stale.ok).toBe(true); // behavioral drift, not a crash — the op answers
    if (stale.ok) {
      expect((stale.value as { clicked: boolean }).clicked).toBe(false);
      expect((stale.value as { triedSelector: string }).triedSelector).toBe(OLD_SELECTOR);
    }

    // the promoted contract exists as a vault object (the Ω7/Ω8 promotion output, ns "discovery")
    const put = await host1.router.callAsRoot("vault.append@1", {
      ns: "discovery",
      id: "contract:compose.click",
      data: promotedContract,
      meta: { type: "surface-contract", status: "PROMOTED" },
    });
    expect(put.ok).toBe(true);
    const contractRev = put.ok ? (put.value as { rev: number }).rev : 0;

    // 2+3+4 · heal@1 — ONE call: drift → rediscovery → probation → PROMOTION
    const heal = await host1.router.callAsRoot("discovery.heal@1", {
      contractEvidence: { ...promotedContract, address: { ns: "discovery", id: "contract:compose.click", rev: contractRev } },
      freshObservation,
      candidate: replacementCandidate,
      probes,
      now: 1735689600000,
    });
    expect(heal.ok).toBe(true);
    if (heal.ok) {
      const v = heal.value as Record<string, any>;
      expect(v.action).toBe("promote");
      expect(v.reason).toContain("0.95");
      expect(v.drift.score).toBeGreaterThan(0.3);
      expect(v.probation).toMatchObject({ passed: 3, total: 3, score: 1 });
      expect(v.replacement).toMatchObject({ selector: NEW_SELECTOR, status: "PROMOTED" });
      expect((v.evidenceChain as Array<{ stage: string }>).map((c) => c.stage)).toEqual(["drift", "rediscovery", "probation", "promotion"]);
      // the healing event is IN the user's vault, with the full chain
      expect(v.journal).toMatchObject({ ns: "discovery", id: "heal:1735689600000", appended: true, rev: 1 });
    }

    // the journaled event is retrievable + Merkle-verifiable (the evidence chain lives in user data)
    const evt = await host1.router.callAsRoot("vault.get@1", { ns: "discovery", id: "heal:1735689600000" });
    expect(evt.ok).toBe(true);
    if (evt.ok) {
      const e = evt.value as { rev: number; data: Record<string, any>; refs: Array<{ ns: string; id: string; rev: number }> };
      expect(e.rev).toBe(1);
      expect(e.data.action).toBe("promote");
      expect(e.data.evidenceChain).toHaveLength(4);
      expect(e.data.install).toContain("amendment-transport");
      expect(e.refs).toEqual([{ ns: "discovery", id: "contract:compose.click", rev: contractRev }]); // provenance → the promoted contract
    }
    const verdict = await host1.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect((verdict.value as { ok: boolean; entries: number }).entries).toBe(2); // contract + heal event

    // 5 · THE AMENDMENT TRANSPORT — atomic install of the fixed provider (Ω0 machinery)
    await retire(host1); // the amendment is a reboot: the broken world stands down
    const spec2 = deepSpec("healing-fixed", dataDir, "../plugins/discovery-healing/test/fixtures/provider-fixed");
    const c2 = compileComposition(spec2, SPEC_DIR, vaultDir, rootKey);
    pinRecipe(vaultDir, c2.recipe); // the atomic pin swap (B4: write-tmp → rename)
    const boot2 = await bootWithRecovery(vaultDir, join(c2.buildDir, "recipe.json"));
    expect(boot2.report.source).toBe("incoming");
    expect(boot2.report.booted).toBe(true);
    const host2 = boot2.host!;
    hosts.push(host2);

    // the pin is the FIXED recipe — a genuinely different one (manifest AND content hashes changed)
    const pinned = loadPinnedRecipe(vaultDir);
    expect(pinned!.name).toBe("healing-fixed");
    const fixedEntry = pinned!.composition.find((e) => e.id === "provider.compose")!;
    const brokenEntry = c1.recipe.composition.find((e) => e.id === "provider.compose")!;
    expect(fixedEntry.version).toBe("0.1.1");       // the fixed fixture bumped 0.1.0 → 0.1.1
    expect(fixedEntry.contentHash).not.toBe(brokenEntry.contentHash);

    // the HEALED provider serves the new selector
    const healed = await host2.router.callAsRoot("compose.click@1", WORLD);
    expect(healed.ok).toBe(true);
    if (healed.ok) {
      const v = healed.value as { clicked: boolean; triedSelector: string; world: string };
      expect(v.clicked).toBe(true);
      expect(v.triedSelector).toBe(NEW_SELECTOR);
      expect(v.world).toBe("healed");
    }

    // data sovereignty across the amendment: the healing event survived the swap
    const evt2 = await host2.router.callAsRoot("vault.get@1", { ns: "discovery", id: "heal:1735689600000" });
    expect(evt2.ok).toBe(true);
    if (evt2.ok) {
      const e = evt2.value as { rev: number; data: Record<string, any> };
      expect(e.rev).toBe(1);
      expect(e.data.action).toBe("promote");
    }
    const verdict2 = await host2.router.callAsRoot("vault.verify@1", {});
    expect(verdict2.ok).toBe(true);
    if (verdict2.ok) expect((verdict2.value as { ok: boolean }).ok).toBe(true);

    await retire(host2);
  }, 60_000);

  test("the committed compositions/healing.json boots (law + vault + healing) and every non-promote path answers honestly", async () => {
    const root = caseRoot("committed");
    const vaultDir = join(root, "vault");
    const { rootKey } = ensureVault(vaultDir);
    const spec = deepSpec("healing-committed", join(root, "vault-data")); // the committed spec, unique dataDir
    const compiled = compileComposition(spec, SPEC_DIR, vaultDir, rootKey);
    const { host, report } = await bootWithRecovery(vaultDir, join(compiled.buildDir, "recipe.json"));
    expect(report.booted).toBe(true);
    expect(report.source).toBe("incoming");
    hosts.push(host!);

    // law eager, vault+healing dormant at boot (D-331); all spine + engine ops routed
    const st = host!.router.status();
    expect(Object.keys(st.compartments)).toEqual(["vivim.law"]);
    expect(st.dormant).toEqual(["discovery.healing", "vivim.vault"]);
    expect(st.routedOps).toContain("discovery.heal@1");
    expect(st.routedOps).toContain("vault.append@1");
    expect(st.routedOps).toContain("law.check@1");

    // no drift → none, journaled
    const none = await host!.router.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation: { selector: OLD_SELECTOR, actionType: "click", riskHint: "dom" },
      now: 1735689600100,
    });
    expect(none.ok).toBe(true);
    if (none.ok) {
      const v = none.value as Record<string, any>;
      expect(v.action).toBe("none");
      expect(v.journal.appended).toBe(true);
    }

    // drift + candidate without evidence → reject, journaled
    const reject = await host!.router.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: { ...replacementCandidate, evidence: [] },
      probes,
      now: 1735689600101,
    });
    expect(reject.ok).toBe(true);
    if (reject.ok) {
      const v = reject.value as Record<string, any>;
      expect(v.action).toBe("reject");
      expect(v.journal.appended).toBe(true);
    }

    // drift + 2/3 probes → hold-in-probation, journaled
    const hold = await host!.router.callAsRoot("discovery.heal@1", {
      contractEvidence: promotedContract,
      freshObservation,
      candidate: replacementCandidate,
      probes: probes.slice(0, 2),
      now: 1735689600102,
    });
    expect(hold.ok).toBe(true);
    if (hold.ok) {
      const v = hold.value as Record<string, any>;
      expect(v.action).toBe("hold-in-probation");
      expect(v.gap).toMatchObject({ probesNeeded: 1 });
      expect(v.journal.appended).toBe(true);
    }

    // three healing events in the vault, one per invocation — the journal IS the audit trail
    const events = await host!.router.callAsRoot("vault.query@1", { ns: "discovery" });
    expect(events.ok).toBe(true);
    if (events.ok) {
      expect(events.value as Array<{ id: string }>).toHaveLength(3);
    }
    const verdict = await host!.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect((verdict.value as { ok: boolean; entries: number }).entries).toBe(3);

    await retire(host!);
  }, 60_000);
});
