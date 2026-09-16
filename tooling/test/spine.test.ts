// SPINE INTEGRATION — the existence proof for waves Ω0–Ω3 together: the real law plugin,
// the real vault plugin, and the real run plugin boot as ONE composition and the full
// Gate→Resolve→Execute→Verify loop works end-to-end with real capability tokens.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const SPEC = join(import.meta.dir, "../../compositions/spine.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
// E-9: unique run root (vault home AND vault dataDir) — the shipped spec's
// ${TMP}/omega-spine/vault-data would otherwise collide across parallel
// workers or concurrent gates on one box.
const runRoot = omegaTmp("omega-spine", `run-${Date.now()}-${process.pid}`);
const vaultDir = join(runRoot, "host");
for (const e of spec.entries) {
  if (e.id === "vivim.vault" && e.config) e.config["dataDir"] = join(runRoot, "vault-data");
}
let host: BootedHost;

beforeAll(async () => {
  rmSync(runRoot, { recursive: true, force: true });
  mkdirSync(vaultDir, { recursive: true });
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vaultDir, rootKey);
  host = await bootComposition(recipe, buildDir, vaultDir);
});

afterAll(async () => { await host.shutdown(); });

describe("the spine boots and the loop closes", () => {
  test("law eager at boot, the rest dormant (D-331); routing covers everything granted", () => {
    const st = host.router.status();
    const compartments = st.compartments as Record<string, { state: string }>;
    expect(compartments["vivim.law"]?.state).toBe("active"); // bootPhase 0 gates from the first tick
    expect(st.dormant).toEqual(["omega.echo", "omega.risky", "vivim.run", "vivim.vault"]); // never started, not degraded
    for (const op of ["law.check@1", "vault.append@1", "echo.ping@1"]) {
      expect(st.routedOps).toContain(op);
    }
  });

  test("vault.append passes the REAL law gate (MUTATION → allow + journal)", async () => {
    const r = await host.router.callAsRoot("vault.append@1", {
      ns: "email", id: "m1", data: { subject: "hello spine", body: "the vault works" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as any).rev).toBe(1);
    const jf = join(vaultDir, "law-journal.jsonl");
    expect(existsSync(jf)).toBe(true);
    const lines = readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.some((l: any) => l.op === "vault.append@1" && l.decision === "allow")).toBe(true);
  });

  test("risky.op hits the consent gate: REFUSED → grant → allowed (the full consent ceremony)", async () => {
    const first = await host.router.callAsRoot("risky.op@1", { hello: "world" });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error).toBe("REFUSED");
      expect(first.detail).toContain("consent required");
    }
    const consentId = (first as { detail?: string }).detail?.split(":")[1]?.trim();
    expect(consentId).toBeTruthy();
    const grant = await host.router.callAsRoot("law.consent.grant@1", { consentId });
    expect(grant.ok).toBe(true);
    const retry = await host.router.callAsRoot("risky.op@1", { hello: "world" });
    expect(retry.ok).toBe(true);
  });

  test("vault data round-trips: get, search (FTS5), verify (Merkle)", async () => {
    await host.router.callAsRoot("vault.append@1", { ns: "email", id: "m2", data: { subject: "second", body: "merkle chain intact" } });
    const got = await host.router.callAsRoot("vault.get@1", { ns: "email", id: "m1" });
    expect(got.ok).toBe(true);
    if (got.ok) expect((got.value as any).data.subject).toBe("hello spine");
    const found = await host.router.callAsRoot("vault.search@1", { ns: "email", q: "merkle" });
    expect(found.ok).toBe(true);
    if (found.ok) expect((found.value as any[]).length).toBeGreaterThan(0);
    const v = await host.router.callAsRoot("vault.verify@1", {});
    expect(v.ok).toBe(true);
    if (v.ok) expect((v.value as any).ok).toBe(true);
  });

  test("run schedules a task through the pool with freshness", async () => {
    const r = await host.router.callAsRoot("run.submit@1", { op: "echo.ping@1", payload: { via: "run" }, deadlineMs: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as any;
      expect(v.status).toBe("ok");
      expect(v.freshness).toBe("CURRENT");
      expect(v.result?.ok).toBe(true);
    }
  });

  test("run health observes the composition; law registry reports it", async () => {
    const h = await host.router.callAsRoot("run.health@1", {});
    expect(h.ok).toBe(true);
    if (h.ok) expect(Object.keys((h.value as any).compartments).length).toBeGreaterThanOrEqual(5);
    const reg = await host.router.callAsRoot("law.registry@1", {});
    expect(reg.ok).toBe(true);
  });

  test("amendment machinery: shadow law policy records divergence without swapping", async () => {
    const reg = await host.router.callAsRoot("law.amendment@1", { action: "register-shadow", policy: { denyExternalMutations: true } });
    expect(reg.ok).toBe(true);
    // under the shadow, risky.op would deny; the PRIMARY still holds (no swap) → allow path intact
    const r = await host.router.callAsRoot("risky.read@1", {});
    expect(r.ok).toBe(true);
  });
});
