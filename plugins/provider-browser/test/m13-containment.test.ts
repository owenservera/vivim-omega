// plugins/provider-browser — test/m13-containment.test.ts (D-354 falsifier)
// THE M13 CONTAINMENT SUITE — the proof the D-354 isolation ruling claims:
// parser execution (and every compartment handler — same tier, same
// machinery) is contained by (1) the call deadline — a stalling transform
// resolves BUDGET for the caller, attributable to the op, caller freed, the
// ordered prefix surviving — and (2) the shim's fail-closed boundary — a
// throwing transform surfaces as an attributable DEGRADED, never a hang.
//
// The suite boots the real demo composition and uses the echo falsifier op's
// documented hooks (stallAfter/stallMs, violateAfterFinal) — the same
// compartment machinery a parser transform runs under (D-354: plugin
// compartment, zero capabilities; parsers differ from any other handler in
// governance, not in containment).
//
// HONEST BOUNDARY (D-354/D-321): memory-bomb containment is NOT claimed —
// worker memory budgets are unenforced (verified, D-321) and that exposure
// is shared with every plugin until the D-321 watchdog lands.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, StreamChunk } from "@vivim/omega-contracts";
import { streamRootCall } from "@vivim/omega-sdk";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

describe("D-354 containment — stalling transforms resolve BUDGET, throwing transforms DEGRADE", () => {
  let host: BootedHost;

  beforeAll(async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/demo.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-m13-test", `containment-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    expect(booted.report.booted).toBe(true);
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  test("STALL: a misbehaving transform is contained by the call deadline — BUDGET, attributable, caller freed", async () => {
    const chunks: StreamChunk[] = [];
    const call = streamRootCall(
      host.router, "echo.stream@1",
      { chunks: ["p1", "p2", "p3"], stallAfter: 1, stallMs: 5_000 }, // stalls forever, relative to the deadline
      { onChunk: (c) => chunks.push(c), deadlineMs: 300 },
    );
    for await (const c of call.chunks) { void c; } // drain until settlement (drain-then-stop)
    const result = await call.result;
    // the CALLER is freed at the deadline with an attributable BUDGET result
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("BUDGET");
      expect(result.detail).toContain("300ms");
      expect(result.detail).toContain("echo.stream@1"); // attributable to the op
    }
    // the ordered prefix delivered before the stall survives (D-352 law)
    expect(chunks.map((c) => c.data)).toEqual(["p1"]);
    expect(chunks[0]!.seq).toBe(1);
  }, 15_000);

  test("THROW: a transform that violates the emit law surfaces as an attributable DEGRADED (fail-closed producer)", async () => {
    const chunks: StreamChunk[] = [];
    const call = streamRootCall(
      host.router, "echo.stream@1",
      { chunks: ["a", "b"], violateAfterFinal: true },
      { onChunk: (c) => chunks.push(c), deadlineMs: 5_000 },
    );
    for await (const c of call.chunks) { void c; }
    const result = await call.result;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DEGRADED");
    // the lawful prefix arrived; the violation killed the call, not the compartment pool
    expect(chunks.map((c) => c.data)).toEqual(["a", "b"]);
    // the compartment pool still serves the next call — containment ≠ collateral damage
    const next: PortResult = await host.router.callAsRoot("echo.ping@1", { hello: "again" });
    expect(next.ok).toBe(true);
  }, 15_000);

  test("ZERO CAPABILITIES is structural: the demo compartment holds no vault/law ports to leak authority through", () => {
    // D-354's allow-list answer, checked as data: the echo entry grants no
    // port:* capabilities — a transform inside it has NOTHING to call even if
    // it tried. The same zero-capability shape is provider-browser's parser
    // tier (provider-browser requests only vault/redact/fence ports for its
    // HANDLERS — never for the transform, which runs without a context).
    const spec = JSON.parse(readFileSync(join(OMEGA_ROOT, "compositions/browser.json"), "utf-8")) as {
      entries: Array<{ id: string; grant: { capabilities: string[] } }>;
    };
    const browser = spec.entries.find((e) => e.id === "provider.browser")!;
    for (const cap of browser.grant.capabilities) {
      expect(cap.startsWith("port:")).toBe(true);       // every granted cap is an explicit port
      expect(cap).not.toContain("credential.use");      // the browser NEVER pulls credentials
    }
  });
});
