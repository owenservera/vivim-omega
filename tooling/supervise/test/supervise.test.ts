// D-397 supervisor tests: crash restarts with backoff, clean never restarts, loop stops loud.
import { describe, test, expect } from "bun:test";
import { supervise } from "../supervise.ts";

describe("D-397 supervisor", () => {
  test("clean exit 0 never restarts", async () => {
    let calls = 0;
    const r = await supervise({ cmd: ["x"], maxRestarts: 3, baseBackoffMs: 1, spawn: async () => { calls++; return { exited: Promise.resolve(0) }; } });
    expect(calls).toBe(1);
    expect(r).toEqual({ restarts: 0, stoppedLoud: false });
  });

  test("crash exits restart then stop loud past max", async () => {
    let calls = 0;
    const logs: string[] = [];
    const r = await supervise({ cmd: ["x"], maxRestarts: 2, baseBackoffMs: 1, log: (m) => logs.push(m), spawn: async () => { calls++; return { exited: Promise.resolve(1) }; } });
    expect(calls).toBe(3);
    expect(r.stoppedLoud).toBe(true);
    expect(logs.join("\n")).toContain("stopping LOUD");
  });

  test("flaky then clean stops restarting", async () => {
    const codes = [1, 0];
    const r = await supervise({ cmd: ["x"], maxRestarts: 5, baseBackoffMs: 1, spawn: async () => ({ exited: Promise.resolve(codes.shift() ?? 0) }) });
    expect(r).toEqual({ restarts: 1, stoppedLoud: false });
  });
});
