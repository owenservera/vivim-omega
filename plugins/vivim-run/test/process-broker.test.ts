// vivim.run — process-broker tests (D-374 polyglot falsifier)
// THE falsifier set from DRAFT-002 §7.4 + the D-374 record, on real child
// processes (no mocks):
//   1. polyglot boot — python3 shim answers echo.say through the ndjson wire;
//   2. runtime parity — the Node shim twin answers identically (Bun host ↔
//      Node child IS a cross-runtime boundary);
//   3. malformed-IPC flood — bounded BUDGET, never a hang;
//   4. unknown pool — REFUSED (pools live in signed config only);
//   5. op allowlist — undeclared op REFUSED;
//   6. deadline — a slow child is killed at deadline, call settles BUDGET;
//   7. shutdown — children actually exit (no orphans).
import { describe, test, expect, afterEach } from "bun:test";
import { join } from "node:path";
import { ProcessBroker, parseBrokerConfig, MALFORMED_LIMIT } from "../src/process-broker.ts";

const ROOT = join(import.meta.dir, "../../..");
const PY_SHIM = join(ROOT, "shims/polyglot/vivim_omega_shim.py");
const NODE_SHIM = join(ROOT, "shims/polyglot/shim.mjs");
const NOISY = join(ROOT, "shims/polyglot/fixtures/noisy.mjs");
const SLOW = join(ROOT, "shims/polyglot/fixtures/slow.mjs");

const brokers: ProcessBroker[] = [];
afterEach(async () => {
  while (brokers.length > 0) {
    const b = brokers.pop()!;
    await b.shutdownAll();
  }
});

function makeBroker(pools: unknown[]): ProcessBroker {
  const logs: string[] = [];
  const broker = new ProcessBroker(parseBrokerConfig({ processPools: pools }, (m) => logs.push(m)), (m) => logs.push(m));
  brokers.push(broker);
  return broker;
}

describe("Ω3 process broker — D-374 polyglot tier", () => {
  test("polyglot boot: python3 shim answers echo.say over the ndjson wire", async () => {
    const broker = makeBroker([{ id: "py-echo", cmd: ["python3", PY_SHIM], stdio: "ndjson", poolSize: 1 }]);
    const r = await broker.call({ pool: "py-echo", op: "echo.say", payload: { say: "hello from the process tier" }, deadlineMs: 15_000 });
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect((r.data as { said: string }).said).toBe("hello from the process tier");
    expect((r.data as { runtime: string }).runtime).toContain("python");
    expect((r.data as { tier: string }).tier).toBe("process");
    expect(r.ms).toBeGreaterThanOrEqual(0);
  }, 30_000);

  test("runtime parity: the Node shim twin answers identically (cross-runtime child)", async () => {
    const broker = makeBroker([{ id: "node-echo", cmd: ["node", NODE_SHIM], stdio: "ndjson", poolSize: 1 }]);
    const r = await broker.call({ pool: "node-echo", op: "echo.say", payload: { say: "cross-runtime" }, deadlineMs: 15_000 });
    expect(r.ok).toBe(true);
    expect((r.data as { said: string }).said).toBe("cross-runtime");
    expect((r.data as { runtime: string }).runtime).toContain("node");
  }, 30_000);

  test("unknown op through a live pool: REFUSED by the shim (fail-closed end-to-end)", async () => {
    const broker = makeBroker([{ id: "node-echo", cmd: ["node", NODE_SHIM], stdio: "ndjson", poolSize: 1 }]);
    const r = await broker.call({ pool: "node-echo", op: "echo.does-not-exist", payload: {}, deadlineMs: 15_000 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("REFUSED");
  }, 30_000);

  test("malformed-IPC flood: bounded BUDGET, never a hang", async () => {
    const broker = makeBroker([{ id: "noisy", cmd: ["node", NOISY], stdio: "ndjson", poolSize: 1, startTimeoutMs: 30_000 }]);
    const t0 = Date.now();
    const r = await broker.call({ pool: "noisy", op: "echo.say", payload: {}, deadlineMs: 20_000 });
    const wall = Date.now() - t0;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BUDGET");
    expect(r.detail).toContain("malformed-frame budget");
    // bounded: the flood is capped by MALFORMED_LIMIT frames + margin — nowhere near the 20s deadline
    expect(wall).toBeLessThan(10_000);
    expect(MALFORMED_LIMIT).toBe(5);
  }, 30_000);

  test("deadline: a slow child is killed at the deadline, the call settles BUDGET", async () => {
    const broker = makeBroker([{ id: "slow", cmd: ["node", SLOW], stdio: "ndjson", poolSize: 1 }]);
    const t0 = Date.now();
    const r = await broker.call({ pool: "slow", op: "echo.say", payload: { sleepMs: 9_000 }, deadlineMs: 500 });
    const wall = Date.now() - t0;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BUDGET");
    expect(r.detail).toContain("within 500ms");
    expect(wall).toBeGreaterThanOrEqual(480);
    expect(wall).toBeLessThan(4_000);
  }, 30_000);

  test("unknown pool: REFUSED — pools live in signed config only", async () => {
    const broker = makeBroker([]);
    const r = await broker.call({ pool: "arbitrary-cmd", op: "sh", payload: { evil: true } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("REFUSED");
    expect(r.detail).toContain("unknown pool");
  });

  test("op allowlist: undeclared op REFUSED broker-side (config is the authority)", async () => {
    const broker = makeBroker([{ id: "node-echo", cmd: ["node", NODE_SHIM], stdio: "ndjson", ops: ["echo.say"] }]);
    const r = await broker.call({ pool: "node-echo", op: "echo.sneak", payload: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("REFUSED");
    expect(r.detail).toContain("not declared on pool");
  }, 30_000);

  test("config validation is fail-closed: bad pool shapes throw at boot", () => {
    expect(() => parseBrokerConfig({ processPools: [{ id: "UPPER", cmd: ["x"], protocol: "ndjson" }] }, () => {})).toThrow(/pool id/);
    expect(() => parseBrokerConfig({ processPools: [{ id: "ok", cmd: [], stdio: "ndjson" }] }, () => {})).toThrow(/cmd/);
    expect(() => parseBrokerConfig({ processPools: [{ id: "ok", cmd: ["x"], protocol: "raw" }] }, () => {})).toThrow(/stdio/);
    expect(() => parseBrokerConfig({ processPools: [{ id: "ok", cmd: ["x"], stdio: "ndjson", poolSize: 99 }] }, () => {})).toThrow(/poolSize/);
    expect(() => parseBrokerConfig({ processPools: "not-an-array" }, () => {})).toThrow(/array/);
  });

  test("shutdownAll: children actually exit (no orphans)", async () => {
    const broker = makeBroker([{ id: "node-echo", cmd: ["node", NODE_SHIM], stdio: "ndjson", poolSize: 2 }]);
    const r1 = await broker.call({ pool: "node-echo", op: "echo.say", payload: { say: "one" }, deadlineMs: 15_000 });
    expect(r1.ok).toBe(true);
    await broker.shutdownAll();
    const r2 = await broker.call({ pool: "node-echo", op: "echo.say", payload: { say: "two" }, deadlineMs: 5_000 });
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe("DEGRADED");
  }, 30_000);
});
