// @vivim/omega-platform — containment tests (D-386 falsifier suite).
// The falsifier has two halves, per the record:
//   1. THE HONESTY CORE (pure, exhaustive): enforcement is claimed ONLY from
//      kernel measurements that demonstrate bounding; every non-claim names why.
//   2. THE REAL PROBE (live): on whatever host runs the suite, the end-to-end
//      probe never returns "enforced" without measurements that prove it — and
//      the real-kernel enforcement case (128MB attempt under a 32MB cap) runs
//      wherever the cgroup v2 hierarchy is writable, skipping honestly elsewhere.
// This container (read-only /sys/fs/cgroup) exercises the honest-unavailable path;
// a delegated-cgroup host exercises the kernel-bounded path. Neither is faked.
import { describe, test, expect } from "bun:test";
import {
  detectCgroupV2, parseMemoryEvents, parseMemoryPeak, verdictFrom,
  probeMemoryEnforcement, PEAK_SLACK_BYTES, DEFAULT_CAP_BYTES, DEFAULT_ATTEMPT_BYTES,
  type VerdictInput,
} from "../src/containment.ts";

const MB = 1024 * 1024;

describe("cgroup accounting parsers (fail-closed: unparseable is never 0)", () => {
  test("memory.peak parses integer bytes; anything else refuses to null", () => {
    expect(parseMemoryPeak("33554432\n")).toBe(33554432);
    expect(parseMemoryPeak("0\n")).toBe(0);
    expect(parseMemoryPeak("")).toBeNull();
    expect(parseMemoryPeak("max\n")).toBeNull(); // not a measurement — refuse
    expect(parseMemoryPeak("12ab\n")).toBeNull();
    expect(parseMemoryPeak("-1\n")).toBeNull();
    expect(parseMemoryPeak("  4096  ")).toBe(4096);
  });

  test("memory.events parses the oom_kill counter; malformed refuses to null", () => {
    expect(parseMemoryEvents("populated 0\noom 0\noom_kill 1\noom_group_kill 0\n")).toEqual({ oomKill: 1 });
    expect(parseMemoryEvents("populated 0\noom 0\noom_kill 0\n")).toEqual({ oomKill: 0 });
    expect(parseMemoryEvents("populated 1\noom 3\n")).toEqual({ oomKill: null }); // counter absent — refuse
    expect(parseMemoryEvents("garbage")).toEqual({ oomKill: null });
    expect(parseMemoryEvents("")).toEqual({ oomKill: null });
  });
});

describe("verdictFrom — the honesty core (enforcement is only ever claimed from kernel measurements)", () => {
  const base: VerdictInput = {
    capBytes: 32 * MB, attemptedBytes: 128 * MB, peakBytes: 32 * MB,
    peakSource: "memory.peak", oomKilled: false, swapBounded: true,
    placedInCgroup: true, timedOut: false,
  };

  test("enforced via OOM kill (swap unbounded is acceptable when the kernel killed the child)", () => {
    const v = verdictFrom({ ...base, oomKilled: true, swapBounded: false });
    expect(v.verdict).toBe("enforced");
    expect(v.reason).toMatch(/OOM-killed/);
  });

  test("enforced via bounded peak + swap disabled", () => {
    const v = verdictFrom({ ...base, peakBytes: 30 * MB });
    expect(v.verdict).toBe("enforced");
    expect(v.reason).toMatch(/memory\.peak/);
  });

  test("peak inside the slack window still counts as bounded (cap + PEAK_SLACK)", () => {
    const v = verdictFrom({ ...base, peakBytes: base.capBytes + PEAK_SLACK_BYTES });
    expect(v.verdict).toBe("enforced");
  });

  test("advisory: kernel did NOT bound the child (peak over cap — the process-tier L-1 analog)", () => {
    const v = verdictFrom({ ...base, peakBytes: 64 * MB });
    expect(v.verdict).toBe("advisory");
    expect(v.reason).toMatch(/did NOT bound/);
  });

  test("one byte past the slack window is over-cap (the boundary is pinned)", () => {
    const v = verdictFrom({ ...base, peakBytes: base.capBytes + PEAK_SLACK_BYTES + 1 });
    expect(v.verdict).toBe("advisory");
  });

  test("advisory downgrade: peak under cap but swap not bounded (under-enforcement unruled)", () => {
    const v = verdictFrom({ ...base, peakBytes: 30 * MB, swapBounded: false, oomKilled: false });
    expect(v.verdict).toBe("advisory");
    expect(v.reason).toMatch(/swap could not be bounded/);
    expect(v.reason).toMatch(/NOT claimed/);
  });

  test("unavailable: kernel accounting unreadable (no peak, no live sample)", () => {
    const v = verdictFrom({ ...base, peakBytes: null, peakSource: "none" });
    expect(v.verdict).toBe("unavailable");
    expect(v.reason).toMatch(/fail-closed/);
  });

  test("unavailable: attempted ≤ cap (enforcement was never tested)", () => {
    const v = verdictFrom({ ...base, attemptedBytes: 16 * MB });
    expect(v.verdict).toBe("unavailable");
    expect(v.reason).toMatch(/never tested/);
  });

  test("unavailable: child never placed in the cgroup", () => {
    const v = verdictFrom({ ...base, placedInCgroup: false });
    expect(v.verdict).toBe("unavailable");
    expect(v.reason).toMatch(/never placed/);
  });

  test("unavailable: probe deadline (killed before measurement — nothing claimed)", () => {
    const v = verdictFrom({ ...base, timedOut: true });
    expect(v.verdict).toBe("unavailable");
    expect(v.reason).toMatch(/deadline/);
  });

  test("kernel-side live sampling (memory.current) is a legitimate peak source when OOM killed", () => {
    const v = verdictFrom({ ...base, peakSource: "memory.current", oomKilled: true, swapBounded: false });
    expect(v.verdict).toBe("enforced");
  });

  test("self-reported numbers are not a verdict input anywhere in the shape", () => {
    // structural honesty: VerdictInput carries only cap/attempt/peak/source/oom/
    // swap/placed/timedOut — no self-reported field exists to feed in.
    const keys = Object.keys(base).sort();
    expect(keys).toEqual(["attemptedBytes", "capBytes", "oomKilled", "peakBytes", "peakSource", "placedInCgroup", "swapBounded", "timedOut"]);
  });
});

describe("live detection (real host, honest about what it finds)", () => {
  const d = detectCgroupV2();

  test("detection is coherent: reason always named, writable implies available", () => {
    expect(typeof d.available).toBe("boolean");
    expect(d.reason.length).toBeGreaterThan(0);
    if (d.writable) expect(d.available).toBe(true);
    if (d.available) expect(Array.isArray(d.controllers)).toBe(true);
  });

  test("detection is non-destructive: the writability probe subgroup is removed", () => {
    // detectCgroupV2 creates `omega-probe-*` under the root and removes it —
    // a second detection must reach the same verdict (no litter blocking mkdir).
    const d2 = detectCgroupV2(d.root);
    expect(d2.available).toBe(d.available);
    expect(d2.writable).toBe(d.writable);
  });
});

describe("probeMemoryEnforcement — end-to-end on the real host", () => {
  test("never claims enforcement without measurements that demonstrate bounding", async () => {
    const r = await probeMemoryEnforcement();
    expect(["enforced", "advisory", "unavailable"]).toContain(r.verdict);
    expect(r.reason.length).toBeGreaterThan(0);
    if (r.verdict === "enforced") {
      const m = r.measurements!;
      expect(m.attemptedBytes).toBeGreaterThan(m.declaredCapBytes);
      expect(m.peakBytes).toBeLessThanOrEqual(m.declaredCapBytes + PEAK_SLACK_BYTES);
      expect(m.peakSource).not.toBe("none");
    } else if (r.verdict === "unavailable") {
      expect(r.reason).toMatch(/refus|advisory|unavailable|not writable|hierarchy|controller|failed|aborted|misconfigured|never|deadline|unreadable|spawn|write/i);
    }
  });

  const WRITABLE = detectCgroupV2().writable;

  test.skipIf(!WRITABLE)("real kernel enforcement: 128MB attempt under a 32MB cap is bounded", async () => {
    const r = await probeMemoryEnforcement(); // defaults: 32MB cap, 128MB attempt
    expect(r.verdict).toBe("enforced");
    const m = r.measurements!;
    expect(m.attemptedBytes).toBe(DEFAULT_ATTEMPT_BYTES);
    expect(m.oomKilled || m.peakBytes <= DEFAULT_CAP_BYTES + PEAK_SLACK_BYTES).toBe(true);
  });

  test.skipIf(!WRITABLE)("probe cleans up: no probe subgroups survive the run", async () => {
    const { readdirSync } = await import("node:fs");
    const root = detectCgroupV2().root;
    const r = await probeMemoryEnforcement();
    expect(["enforced", "advisory"]).toContain(r.verdict); // writable host → real measurement
    let litter: string[] = [];
    for (let i = 0; i < 20; i++) { // the kernel releases cgroups asynchronously — poll briefly
      litter = readdirSync(root).filter((f) => f.startsWith("omega-containment-") || f.startsWith("omega-probe-"));
      if (litter.length === 0) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    expect(litter).toEqual([]);
  });
});
