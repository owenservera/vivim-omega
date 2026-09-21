// tooling/gates/test/f-gov.test.ts — the F-GOV falsifier.
// Generated from D-432 by `omega:loop --stub D-432` (D-426, Ω-DEV.2).
// Implemented (D-432): every clause runs a real verdict against
// tooling/gates/gov.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  claimsOnDevice,
  decideClaim,
  enforceWatchdog,
  evictByBadge,
  evictColdest,
  exemptSelf,
  inspect,
  setBudget,
  syncBudgetsToDevice,
  transition,
  type Budget,
  type Claim,
} from "../gov.ts";

const BUDGET_2GB: Budget = {
  id: "device.default",
  scope: "device",
  caps: { ramMB: 2048, cpuShares: 100, gpu: 0, procs: 16 },
  onPressure: "evict-coldest",
  namedBy: "alice",
};

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: "c-1",
    claimant: "tile:inbox",
    request: { ramMB: 412, cpuShares: 10, gpu: 0, procs: 2 },
    mode: "firm",
    origin: "user-intent",
    deviceId: "desktop",
    gateRef: "law:row:881",
    evidenceRef: "vault:offset=99120",
    ...over,
  };
}

describe("F-GOV (D-432)", () => {
  test("F-GOV.1 (claim-refusal) — 3 GB on a 2 GB cap refuses with a sentence, nothing executes", () => {
    const r = decideClaim(BUDGET_2GB, claim({ request: { ramMB: 3072, cpuShares: 10, gpu: 0, procs: 2 } }), "hydrated");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("GOV_OVER_BUDGET");
    expect(r.sentence).toContain("2 GB");
    const noBudget = decideClaim(null, claim(), "hydrated");
    expect(noBudget.ok).toBe(false);
    if (noBudget.ok) throw new Error("unreachable");
    expect(noBudget.code).toBe("GOV_NO_BUDGET");
  });

  test("F-GOV.2 (pressure-eviction) — 50 dormant under caps for 10 ghost the 40 coldest as named rows", () => {
    const tiles = Array.from({ length: 50 }, (_, i) => ({ tileRef: `t-${i}`, lastAccessMs: i * 1000, rehydrateCost: 10 }));
    const { keep, ghost } = evictColdest(tiles, 10);
    expect(keep).toHaveLength(10);
    expect(ghost).toHaveLength(40);
    expect(keep).toContain("t-49"); // warmest survives
    const rows = ghost.map((t) =>
      transition(t, "dormant", "ghost", "pressure", { isGovernor: true, at: 1, deviceId: "desktop" }),
    );
    expect(rows.every((r) => r.ok)).toBe(true);
    const outsider = transition("t-0", "dormant", "ghost", "pressure", { isGovernor: false, at: 1, deviceId: "desktop" });
    expect(outsider.ok).toBe(false);
    if (outsider.ok) throw new Error("unreachable");
    expect(outsider.code).toBe("GOV_NOT_SOLE_WRITER");
  });

  test("F-GOV.3 (coldness-real) — touched A survives, untouched B ghosts", () => {
    const { ghost } = evictColdest(
      [
        { tileRef: "A", lastAccessMs: 9999, rehydrateCost: 50 },
        { tileRef: "B", lastAccessMs: 1, rehydrateCost: 5 },
      ],
      1,
    );
    expect(ghost).toEqual(["B"]);
  });

  test("F-GOV.4 (provisional-ceiling) — prediction warms ghost→dormant only, never hydrates", () => {
    const warm = transition("C", "ghost", "dormant", "prediction", {
      isGovernor: true,
      at: 1,
      deviceId: "desktop",
      mode: "provisional",
    });
    expect(warm.ok).toBe(true);
    const hydrate = transition("C", "ghost", "hydrated", "prediction", {
      isGovernor: true,
      at: 1,
      deviceId: "desktop",
      mode: "provisional",
    });
    expect(hydrate.ok).toBe(false);
    if (hydrate.ok) throw new Error("unreachable");
    expect(hydrate.code).toBe("GOV_PROVISIONAL_CEILING");
    const claimRefused = decideClaim(BUDGET_2GB, claim({ mode: "provisional" }), "hydrated");
    expect(claimRefused.ok).toBe(false);
  });

  test("F-GOV.5 (watchdog-enforcement) — over-grant burn stopped with cause=enforcement, zero host LOC", () => {
    const killed = enforceWatchdog("tile:forge-x", 3000, 2048, { at: 7, deviceId: "desktop", forged: true });
    expect(killed.ok).toBe(true);
    if (!killed.ok) throw new Error("unreachable");
    expect(killed.value.row.cause).toBe("enforcement");
    expect(killed.value.row.to).toBe("ghost");
    expect(killed.value.sentence).toContain("stopped");
    const quiet = enforceWatchdog("tile:ok", 100, 2048, { at: 7, deviceId: "desktop", forged: true });
    expect(quiet.ok).toBe(false); // within grant: watchdog stays quiet
  });

  test("F-GOV.6 (headless-inspect) — CLI answers ghosted, browser holders, costliest from rows", () => {
    const view = inspect([
      { tileRef: "inbox", state: "hydrated", holder: "provider.browser", ramMB: 412, vaultWrites: 90, ghosted: false },
      { tileRef: "notes", state: "ghost", holder: "", ramMB: 0, vaultWrites: 1200, ghosted: true },
    ]);
    expect(view.ghosted).toEqual(["notes"]);
    expect(view.browserHolders).toEqual([{ tileRef: "inbox", ramMB: 412 }]);
    expect(view.costliest).toBe("notes"); // 0 + 1200 > 412 + 90
  });

  test("F-GOV.7 (locality) — policies sync, claims never execute remotely", () => {
    const synced = syncBudgetsToDevice([BUDGET_2GB]);
    expect(synced).toHaveLength(1);
    expect(synced[0].id).toBe("device.default");
    const local = claimsOnDevice([claim({ deviceId: "desktop" }), claim({ id: "c-2", deviceId: "laptop" })], "laptop");
    expect(local.map((c) => c.id)).toEqual(["c-2"]); // desktop grants mean nothing here
  });

  test("F-GOV.8 (healing-reclaim) — stale claims refused after promotion; badge/self carve-outs refused", () => {
    const stale = decideClaim(BUDGET_2GB, claim({ gateRef: "" }), "hydrated"); // promotion wiped the law ref
    expect(stale.ok).toBe(false);
    const badge = evictByBadge();
    expect(badge.code).toBe("GOV_BADGE_WEIGHTED");
    const self = exemptSelf();
    expect(self.code).toBe("GOV_SELF_EXEMPTION");
    const budget = setBudget({ ...BUDGET_2GB, namedBy: "" });
    expect(budget.ok).toBe(false);
  });
});
