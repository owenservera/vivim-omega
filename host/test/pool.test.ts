// D-329 host-side contract: pool-aware checkout degrades to cold spawn when
// the pool is absent, empty, or failing. The pooled path itself is proven in
// surfaces/daemon/test/pool.test.ts (the pool lives outside host/src); here
// only the fallback discipline is pinned — correctness never depends on pool.
import { describe, test, expect, afterAll } from "bun:test";
import { join } from "node:path";
import {
  checkoutCompartment, setPoolHook, spawnCompartment, type CompartmentHandle,
} from "../src/worker.ts";

const OMEGA_ROOT = join(import.meta.dir, "../..");
const handles: CompartmentHandle[] = [];
afterAll(async () => {
  setPoolHook(null);
  for (const h of handles) await h.terminate().catch(() => {});
});

describe("D-329 checkout fallback — cold spawn when the pool cannot serve", () => {
  test("no hook: cold spawn works and terminates", async () => {
    setPoolHook(null);
    const h = await checkoutCompartment("omega.echo", join(OMEGA_ROOT, "examples/plugin-echo"), "src/index.ts");
    handles.push(h);
    expect(h.pluginId).toBe("omega.echo");
    expect(["booting", "active"]).toContain(h.state);
  });

  test("hook returning null: cold fallback works", async () => {
    setPoolHook({ acquire: async () => null });
    const h = await checkoutCompartment("omega.echo", join(OMEGA_ROOT, "examples/plugin-echo"), "src/index.ts");
    handles.push(h);
    expect(h.pluginId).toBe("omega.echo");
  });

  test("hook throwing: cold fallback works (failure degrades, never errors)", async () => {
    setPoolHook({
      acquire: async () => {
        throw new Error("pool exploded");
      },
    });
    const h = await checkoutCompartment("omega.echo", join(OMEGA_ROOT, "examples/plugin-echo"), "src/index.ts");
    handles.push(h);
    expect(h.pluginId).toBe("omega.echo");
  });

  test("plain spawnCompartment is untouched by the hook machinery", () => {
    setPoolHook({ acquire: async () => null });
    const h = spawnCompartment("omega.echo", join(OMEGA_ROOT, "examples/plugin-echo"), "src/index.ts");
    handles.push(h);
    expect(h.state).toBe("booting");
  });
});
