// D-399 steward live-pressure tests: scoped re-sweep, idempotent confirm, loud escalate.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureVault, compileComposition, bootComposition, type BootedHost } from "@vivim/omega-host";

const REPO = join(import.meta.dir, "../..");
const TMP = join(REPO, "testkit/test/fixtures/ghosts/.gen-steward");
const REPO_ROOT = "../../../../..";
let host: BootedHost;

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const vault = join(TMP, "vault");
  const { rootKey } = ensureVault(vault);
  const entries = [
    { id: "vivim.law", source: `${REPO_ROOT}/plugins/law-stub`, bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
    { id: "omega.echo", source: `${REPO_ROOT}/examples/plugin-echo`, bootPhase: 1, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
    { id: "ghost.load", source: `../ghost-load`, bootPhase: 1, grant: { capabilities: ["port:echo.ping@1"], contracts: ["ghost.load@1"] } },
    { id: "vivim.kernel-lens", source: `${REPO_ROOT}/plugins/vivim-kernel-lens`, bootPhase: 2, grant: { capabilities: ["host.kernel.lens"], contracts: ["kernel.centrality@1", "kernel.audit.verify@1"] } },
    { id: "vivim.steward", source: `${REPO_ROOT}/plugins/vivim-steward`, bootPhase: 2, grant: { capabilities: ["host.kernel.lens", "host.compartment.admin", "host.journal.append"], contracts: ["steward.sweep@1", "steward.confirm@1", "steward.escalate@1"] } },
  ];
  const compiled = compileComposition({ name: "steward", entries } as never, TMP, vault, rootKey);
  host = await bootComposition(compiled.recipe, compiled.buildDir, vault);
}, 60_000);

afterAll(async () => {
  await host.shutdown();
  rmSync(TMP, { recursive: true, force: true });
});

describe("D-399 steward narrow autonomy", () => {
  test("crossed → re-sweep only, never quarantines load-bearing", async () => {
    const touch = await host.router.callAsRoot("ghost.load@1", { from: "steward-test" });
    expect(touch.ok).toBe(true);
    const r = await host.router.callAsRoot("steward.sweep@1", {});
    expect(r.ok).toBe(true);
    const st = host.router.status().compartments["ghost.load"] as { state: string } | undefined;
    expect(st?.state).toBe("active");
  });
  test("breach confirm is idempotent with watchdog sync action", async () => {
    const r = await host.router.callAsRoot("steward.confirm@1", { pluginId: "ghost.load", alreadyQuarantined: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { idempotent: boolean }).idempotent).toBe(true);
  });
  test("chain-broken escalates, audit stays verifiable", async () => {
    const e = await host.router.callAsRoot("steward.escalate@1", { reason: "test-tamper" });
    expect(e.ok).toBe(true);
    const v = await host.router.callAsRoot("kernel.audit.verify@1", {});
    expect(v.ok).toBe(true);
  });
});
