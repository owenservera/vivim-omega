// Ω4 sdk — the typed port client: UX short-circuit (the host stays the boundary).
import { describe, test, expect } from "bun:test";
import { createPortClient, describeGrants } from "@vivim/omega-sdk";
import type { PortResult } from "@vivim/omega-contracts";

function recordingTransport(calls: Array<{ op: string; payload: unknown }>): (op: string, payload: unknown, opts?: { deadlineMs?: number }) => Promise<PortResult> {
  return async (op, payload) => {
    calls.push({ op, payload });
    return { ok: true, value: { echoed: payload }, freshness: "CURRENT" };
  };
}

describe("Ω4 sdk client — grant-aware port client", () => {
  test("granted op passes through; ungranted op REFUSED before any transport hop", async () => {
    const calls: Array<{ op: string; payload: unknown }> = [];
    const client = createPortClient(["port:echo.ping@1", "port:counter.value@1"], recordingTransport(calls));
    const ok = await client.call("echo.ping@1", { hello: "omega" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.value as { echoed: { hello: string } }).echoed.hello).toBe("omega");
    expect(calls.length).toBe(1);

    const refused = await client.call("vault.append@1", { id: "x" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toBe("REFUSED");
      expect(refused.detail).toContain("client-side guard");
      expect(refused.detail).toContain("vault.append@1");
    }
    expect(calls.length).toBe(1); // zero RTTs burned on the refusal
  });

  test(".can() is host-op aware (host caps + port: aliases)", () => {
    const client = createPortClient(["host.journal.append", "port:echo.ping@1"], recordingTransport([]));
    expect(client.can("echo.ping@1")).toBe(true);
    expect(client.can("host.journal.append@1")).toBe(true);       // guarded by host.journal.append
    expect(client.can("host.tokens.revoke@1")).toBe(false);       // not granted
    expect(client.can("counter.bump@1")).toBe(false);
    // alias form also grants the host op
    const aliased = createPortClient(["port:host.compartment.stats@1"], recordingTransport([]));
    expect(aliased.can("host.compartment.stats@1")).toBe(true);
    expect(aliased.can("host.compartment.terminate@1")).toBe(false);
  });

  test(".granted accessor is a defensive copy", () => {
    const client = createPortClient(["port:echo.ping@1"], recordingTransport([]));
    const g = client.granted;
    g.push("host.tokens.revoke");
    expect(client.granted).toEqual(["port:echo.ping@1"]);
    expect(client.can("host.tokens.revoke@1")).toBe(false);
  });

  test("opts pass through to the transport (deadlineMs budget contract)", async () => {
    let seen: { deadlineMs?: number } | undefined;
    const transport = async (_op: string, _p: unknown, opts?: { deadlineMs?: number }) => {
      seen = opts ?? {};
      return { ok: true, value: null } satisfies PortResult;
    };
    const client = createPortClient(["port:x.y@1"], transport);
    await client.call("x.y@1", null, { deadlineMs: 250 });
    expect(seen?.deadlineMs).toBe(250);
  });

  test("empty grant list refuses everything with a clear message", async () => {
    const client = createPortClient([], recordingTransport([]));
    const r = await client.call("echo.ping@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("no capabilities granted");
  });
});

describe("Ω4 sdk client — describeGrants for review UIs", () => {
  test("groups host caps, port ops by namespace, and unrecognized — deterministically", () => {
    const d = describeGrants([
      "port:echo.ping@1",
      "port:counter.bump@1",
      "port:counter.value@1",
      "host.journal.append",
      "host.tokens.revoke",
      "???",
    ]);
    expect(d.total).toBe(6);
    expect(d.groups.map((g) => g.kind)).toEqual(["host", "port", "port", "other"]);
    expect(d.groups[0]).toEqual({ kind: "host", label: "host capabilities", items: ["host.journal.append", "host.tokens.revoke"] });
    expect(d.groups[1]).toEqual({ kind: "port", label: "ops via counter.*", items: ["counter.bump@1", "counter.value@1"] });
    expect(d.groups[2]).toEqual({ kind: "port", label: "ops via echo.*", items: ["echo.ping@1"] });
    expect(d.groups[3].items).toEqual(["???"]);
    // determinism
    expect(JSON.stringify(describeGrants(["b", "a"]))).toBe(JSON.stringify(describeGrants(["b", "a"])));
  });

  test("empty list → empty groups", () => {
    expect(describeGrants([])).toEqual({ total: 0, groups: [] });
  });
});
