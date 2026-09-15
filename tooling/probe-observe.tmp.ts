// One-off probe: boot the discovery spec and call observe@1, printing the raw PortResult.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";

const OMEGA_ROOT = "/home/z/my-project/workspace/vivim-omega";
const LAW = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const CAPS = ["port:vault.append@1", "port:vault.get@1"];

const spec = {
  name: "probe",
  entries: [
    { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW } },
    { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT }, config: { dataDir: "/tmp/omega-probe-observe/vault-data" } },
    { id: "discovery.perception", source: "plugins/discovery-perception", bootPhase: 1, grant: { capabilities: CAPS, contracts: ["discovery.perceive@1"] }, config: { fixturesDir: join(OMEGA_ROOT, "fixtures") } },
    { id: "discovery.observation", source: "plugins/discovery-observation", bootPhase: 1, grant: { capabilities: CAPS, contracts: ["discovery.observe@1"] }, config: { fixturesDir: join(OMEGA_ROOT, "fixtures") } },
  ],
};

const root = "/tmp/omega-probe-observe/boot";
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const { rootKey } = ensureVault(root);
const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, root, rootKey);
const booted = await bootWithRecovery(root, join(buildDir, "recipe.json"));
if (!booted.host) throw new Error(`boot failed: ${JSON.stringify(booted.report)}`);
const host = booted.host;
const perceive = await host.router.callAsRoot("discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
console.log("perceive:", JSON.stringify(perceive).slice(0, 300));
const observe = await host.router.callAsRoot("discovery.observe@1", {
  fixture: { name: "webmail-inbox", pageRef: { ns: "discovery", id: "capture:webmail-inbox" } },
  graphRef: { ns: "discovery", id: "graph:webmail-inbox" },
});
console.log("observe:", JSON.stringify(observe).slice(0, 500));
await host.shutdown().catch(() => {});
