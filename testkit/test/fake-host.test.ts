// Ω4 testkit — FakeHost B1–B4 semantics: routing, gate walk, token law, budgets,
// degradation, lifecycle, causation ids. All in-process, no workers, no vault.
import { describe, test, expect } from "bun:test";
import { definePlugin, type PluginDef } from "@vivim/omega-shim";
import type { PortResult, PluginManifest, StreamChunk } from "@vivim/omega-contracts";
import { HOST_OPS } from "@vivim/omega-contracts";
import { FakeHost, consentIdFor } from "@vivim/omega-testkit";

// ---- fixture defs -----------------------------------------------------------

function echoLike(): PluginDef {
  return definePlugin({
    ops: { "fx.echo@1": async (payload) => ({ echo: true, payload, at: Date.now() }) },
  });
}

function manifest(id: string, contracts: Array<{ id: string; risk?: string }>, extra: PluginManifest["contributions"] = {}): ManifestLike {
  return {
    id,
    contributions: {
      contract: contracts.map((c) => ({ kind: "contract" as const, id: c.id, version: "1", ...(c.risk ? { risk: c.risk as never } : {}) })),
      ...extra,
    },
  };
}
type ManifestLike = { id: string; contributions?: PluginManifest["contributions"] };

describe("Ω4 FakeHost — B1: only declared ops route", () => {
  test("unknown op → REFUSED 'no routed implementation'", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    const r = await fake.call("no.such.op@1", {});
    expect(r).toEqual({ ok: false, error: "REFUSED", detail: "no routed implementation for no.such.op@1" });
  });

  test("handler exists in the def but NOT declared in the manifest → still REFUSED (B1)", async () => {
    const fake = new FakeHost();
    const sneaky = definePlugin({
      ops: { "fx.echo@1": () => ({}), "fx.hidden@1": () => ({ secret: true }) },
    });
    await fake.install(sneaky, manifest("omega.fx", [{ id: "fx.echo" }]));
    const r = await fake.call("fx.hidden@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("REFUSED"); expect(r.detail).toContain("no routed implementation"); }
  });

  test("declared op without a handler → REFUSED 'no handler'", async () => {
    const fake = new FakeHost();
    const empty = definePlugin({ ops: {} });
    await fake.install(empty, manifest("omega.fx", [{ id: "fx.echo" }]));
    const r = await fake.call("fx.echo@1", {});
    expect(r).toEqual({ ok: false, error: "REFUSED", detail: "no handler for fx.echo@1" });
  });

  test("installing a second owner of a routed op throws (fail-closed ownership)", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    await expect(fake.install(echoLike(), manifest("omega.other", [{ id: "fx.echo" }]))).rejects.toThrow("routed op conflict");
    expect(fake.states["omega.other"]).toBe("degraded");
  });
});

describe("Ω4 FakeHost — B-gate: risk walk with and without a law", () => {
  test("EXTERNAL_MUTATION with NO law → REFUSED consent-required naming the derived consent id (fail-closed default)", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({ ops: { "fx.risky@1": (p) => ({ mutated: p }) } }), manifest("omega.fx", [{ id: "fx.risky", risk: "EXTERNAL_MUTATION" }]));
    const r = await fake.call("fx.risky@1", { x: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("REFUSED");
      expect(r.detail).toContain("consent required");
      expect(r.detail).toContain("EXTERNAL_MUTATION");
      expect(r.detail).toContain(consentIdFor("root", "fx.risky@1")); // the ceremony names its id
      // E-7: the refusal names its gate (attributable, not just a register)
      expect(r.refusal?.rule).toBe("default-gate (no law.check@1 routed)");
      expect(r.refusal?.principal).toBe("root");
      expect(r.refusal?.op).toBe("fx.risky@1");
      expect(r.refusal?.consentId).toBe(consentIdFor("root", "fx.risky@1"));
    }
    // journaled as require-consent, with a causation id
    const j = fake.journal;
    expect(j.some((e) => e.op === "fx.risky@1" && e.decision === "require-consent")).toBe(true);
    expect(typeof j[0].causationId).toBe("string");
  });

  test("MUTATION with NO law → allow + journal (the declared-data default)", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({ ops: { "fx.write@1": (p) => ({ wrote: p }) } }), manifest("omega.fx", [{ id: "fx.write", risk: "MUTATION" }]));
    const r = await fake.call("fx.write@1", { v: 42 });
    expect(r.ok).toBe(true);
    const j = fake.journal.find((e) => e.op === "fx.write@1");
    expect(j?.decision).toBe("allow");
    expect(String(j?.reason)).toContain("MUTATION");
  });

  test("with a law installed: require-consent → REFUSED with consentId; deny → REFUSED denied-by-law; allow → proceeds", async () => {
    const fake = new FakeHost();
    const lawDef = definePlugin({
      ops: {
        "law.check@1": (payload: { op?: string }) => {
          if (payload?.op === "fx.risky@1") return { decision: "require-consent", consentId: "consent_fx1", reason: "external" };
          if (payload?.op === "fx.doom@1") return { decision: "deny", reason: "never" };
          return { decision: "allow", reason: "ok" };
        },
      },
    });
    await fake.install(lawDef, manifest("vivim.law", [{ id: "law.check" }]));
    await fake.install(definePlugin({
      ops: {
        "fx.risky@1": (p) => ({ mutated: p }),
        "fx.doom@1": (p) => ({ doomed: p }),
        "fx.write@1": (p) => ({ wrote: p }),
      },
    }), manifest("omega.fx", [
      { id: "fx.risky", risk: "EXTERNAL_MUTATION" },
      { id: "fx.doom", risk: "EXTERNAL_MUTATION" },
      { id: "fx.write", risk: "MUTATION" },
    ]));

    const risky = await fake.call("fx.risky@1", {});
    expect(risky.ok).toBe(false);
    if (!risky.ok) { expect(risky.error).toBe("REFUSED"); expect(risky.detail).toBe("consent required: consent_fx1"); }

    const doom = await fake.call("fx.doom@1", {});
    expect(doom.ok).toBe(false);
    if (!doom.ok) { expect(doom.error).toBe("REFUSED"); expect(doom.detail).toContain("denied by law"); }

    const write = await fake.call("fx.write@1", { ok: 1 });
    expect(write.ok).toBe(true);
    // every gated decision journaled: require-consent, deny, allow
    const decisions = fake.journal.filter((e) => e.op?.startsWith("fx.")).map((e) => e.decision).sort();
    expect(decisions).toEqual(["allow", "deny", "require-consent"]);
  });

  test("READ ops never touch the gate (no journal entry)", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo", risk: "READ" }]));
    const r = await fake.call("fx.echo@1", { hi: 1 });
    expect(r.ok).toBe(true);
    expect(fake.journal.filter((e) => e.op === "fx.echo@1")).toEqual([]);
  });
});

describe("Ω4 FakeHost — B4 consent ceremony (.grantConsent / .revokeConsent)", () => {
  test("refuse → grant the named consent → retry ok + journaled allow with consentId → revoke → refused again", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({ ops: { "fx.risky@1": (p) => ({ mutated: p }) } }), manifest("omega.fx", [{ id: "fx.risky", risk: "EXTERNAL_MUTATION" }]));

    const first = await fake.callAsRoot("fx.risky@1", { x: 1 });
    expect(first.ok).toBe(false);
    const consentId = consentIdFor("root", "fx.risky@1");
    if (!first.ok) expect(first.detail).toContain(consentId);

    const grant = fake.grantConsent(consentId);
    expect(grant.consentId).toBe(consentId);
    expect(grant.grantedAt).toBeGreaterThan(0);
    expect(fake.journal.some((e) => e.op === "consent.grant" && e.consentId === consentId)).toBe(true);

    const retry = await fake.callAsRoot("fx.risky@1", { x: 2 });
    expect(retry.ok).toBe(true);
    if (retry.ok) expect((retry.value as { mutated: { x: number } }).mutated.x).toBe(2);
    const allowEntry = fake.journal.find((e) => e.op === "fx.risky@1" && e.decision === "allow");
    expect(allowEntry?.consentId).toBe(consentId); // the allow cites the consent it ran under

    expect(fake.revokeConsent(consentId)).toBe(true);
    const after = await fake.callAsRoot("fx.risky@1", { x: 3 });
    expect(after.ok).toBe(false);
    if (!after.ok) { expect(after.error).toBe("REFUSED"); expect(after.detail).toContain("consent required"); }
    expect(fake.revokeConsent(consentId)).toBe(false); // already revoked
  });

  test("consent narrowing: a grant scoped to another principal or op does not satisfy the gate", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({
      ops: { "fx.r1@1": (p) => p, "fx.r2@1": (p) => p },
    }), manifest("omega.fx", [
      { id: "fx.r1", risk: "EXTERNAL_MUTATION" },
      { id: "fx.r2", risk: "EXTERNAL_MUTATION" },
    ]));

    const idRootR1 = consentIdFor("root", "fx.r1@1");
    fake.grantConsent(idRootR1, { principal: "omega.someone-else" }); // wrong principal
    const a = await fake.callAsRoot("fx.r1@1", {});
    expect(a.ok).toBe(false);

    fake.grantConsent(consentIdFor("root", "fx.r2@1")); // consent for the OTHER op
    const b = await fake.callAsRoot("fx.r1@1", {});
    expect(b.ok).toBe(false);

    fake.grantConsent(idRootR1, { op: "fx.r2@1" }); // derived id for r1, but scoped to op r2 → mismatch
    const c = await fake.callAsRoot("fx.r1@1", {});
    expect(c.ok).toBe(false);

    fake.grantConsent(idRootR1, { principal: "root", op: "fx.r1@1" }); // exact narrow → ok
    const d = await fake.callAsRoot("fx.r1@1", {});
    expect(d.ok).toBe(true);
  });

  test("grantConsent rejects malformed ids; consent ids match the vivim.law derivation shape", () => {
    const fake = new FakeHost();
    expect(() => fake.grantConsent("banana")).toThrow("malformed consent id");
    for (const [principal, op] of [["root", "vault.roundtrip@1"], ["omega.echo", "risky.op@1"]] as const) {
      expect(consentIdFor(principal, op)).toMatch(/^consent_[0-9a-f]{16}$/);
    }
    // stable: same pair → same id; different pair → different id
    expect(consentIdFor("root", "x.y@1")).toBe(consentIdFor("root", "x.y@1"));
    expect(consentIdFor("root", "x.y@1")).not.toBe(consentIdFor("root", "x.z@1"));
  });

  test("with a law installed, the LAW decides — the default consent table is not consulted (host parity)", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({
      ops: { "law.check@1": () => ({ decision: "require-consent", consentId: "consent_lawknowsbest" }) },
    }), manifest("vivim.law", [{ id: "law.check" }]));
    await fake.install(definePlugin({ ops: { "fx.risky@1": (p) => p } }), manifest("omega.fx", [{ id: "fx.risky", risk: "EXTERNAL_MUTATION" }]));

    fake.grantConsent(consentIdFor("root", "fx.risky@1")); // the DEFAULT gate's table — must not override the law
    const r = await fake.callAsRoot("fx.risky@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("REFUSED"); expect(r.detail).toContain("consent_lawknowsbest"); }
  });
});

describe("Ω4 FakeHost — B3: token law outside the plugin", () => {
  async function armed(): Promise<{ fake: FakeHost; tokens: Record<string, string> }> {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    await fake.install(definePlugin({ ops: { "fx.other@1": () => ({}) } }), manifest("omega.other", [{ id: "fx.other" }]));
    const tokens = fake.grant("omega.fx", ["port:fx.echo@1"]);
    return { fake, tokens };
  }

  test("forged token → REFUSED 'unknown capability token'", async () => {
    const { fake } = await armed();
    const r = await fake.call("fx.echo@1", {}, { principal: "omega.fx", token: "tok_forged" });
    expect(r).toEqual({ ok: false, error: "REFUSED", detail: "unknown capability token" });
  });

  test("non-root principal without a token → REFUSED", async () => {
    const { fake } = await armed();
    const r = await fake.call("fx.echo@1", {}, { principal: "omega.fx" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("capability token required");
  });

  test("borrowed token (issued to another compartment) → REFUSED 'token not issued to this compartment'", async () => {
    const { fake, tokens } = await armed();
    const r = await fake.call("fx.echo@1", {}, { principal: "omega.attacker", token: tokens["port:fx.echo@1"] });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("REFUSED"); expect(r.detail).toContain("not issued to this compartment"); }
  });

  test("wrong-capability token → SCOPE; right token → ok", async () => {
    const { fake, tokens } = await armed();
    const echoTok = tokens["port:fx.echo@1"];
    const other = fake.grant("omega.other", ["port:fx.other@1"]);
    const scope = await fake.call("fx.echo@1", {}, { principal: "omega.other", token: other["port:fx.other@1"] });
    expect(scope.ok).toBe(false);
    if (!scope.ok) { expect(scope.error).toBe("SCOPE"); expect(scope.detail).toContain("port:fx.echo@1"); }
    const ok = await fake.call("fx.echo@1", { z: 1 }, { principal: "omega.fx", token: echoTok });
    expect(ok.ok).toBe(true);
  });

  test("REVOKED after generation bump; re-grant issues live tokens again", async () => {
    const { fake, tokens } = await armed();
    const { generation } = fake.revoke("omega.fx");
    expect(generation).toBe(2);
    const r = await fake.call("fx.echo@1", {}, { principal: "omega.fx", token: tokens["port:fx.echo@1"] });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("REVOKED"); expect(r.detail).toContain("generation 1 revoked"); }
    // the OTHER plugin's tokens also revoked (generation is global, mirrors the host)
    const other = fake.grant("omega.other", ["port:fx.other@1"]);
    const r2 = await fake.call("fx.other@1", {}, { principal: "omega.other", token: other["port:fx.other@1"] });
    expect(r2.ok).toBe(true); // minted AFTER the bump — live
    const fresh = fake.grant("omega.fx", ["port:fx.echo@1"]);
    const r3 = await fake.call("fx.echo@1", {}, { principal: "omega.fx", token: fresh["port:fx.echo@1"] });
    expect(r3.ok).toBe(true);
  });

  test("ctx.port.call uses the granted token; ungranted op → REFUSED 'no capability token' (shim semantics)", async () => {
    const fake = new FakeHost();
    const probe = definePlugin({
      ops: {
        "fx.probe@1": async (_p, ctx) => {
          const r: PortResult = await ctx.port.call("host.journal.append@1", { via: "ctx.port" });
          return { journalResult: r };
        },
      },
    });
    await fake.install(probe, manifest("omega.probe", [{ id: "fx.probe" }]), { capabilities: ["host.journal.append"] });
    fake.grant("omega.probe", ["host.journal.append"]);
    const r = await fake.call("fx.probe@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { journalResult: PortResult }).journalResult.ok).toBe(true);
      expect(fake.journal.some((e) => e.via === "ctx.port")).toBe(true);
    }
    // without the grant the same call short-circuits before the router
    const fake2 = new FakeHost();
    await fake2.install(probe, manifest("omega.probe", [{ id: "fx.probe" }]), { capabilities: [] });
    const r2 = await fake2.call("fx.probe@1", {});
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const jr = (r2.value as { journalResult: PortResult }).journalResult;
      expect(jr.ok).toBe(false);
      if (!jr.ok) { expect(jr.error).toBe("REFUSED"); expect(jr.detail).toContain("no capability token"); }
    }
  });
});

describe("Ω4 FakeHost — BUDGET / DEGRADED / lifecycle", () => {
  test("slow handler + small deadline → BUDGET register", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({
      ops: { "fx.slow@1": async () => { await new Promise((res) => setTimeout(res, 250)); return { late: true }; } },
    }), manifest("omega.slow", [{ id: "fx.slow" }]));
    const r = await fake.call("fx.slow@1", {}, { deadlineMs: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("BUDGET"); expect(r.detail).toContain("deadline"); expect(r.detail).toContain("50"); }
    // the plugin itself is NOT degraded by a deadline miss (mirrors the host)
    expect(fake.states["omega.slow"]).toBe("active");
  });

  test("handler throws → DEGRADED register, but the compartment STAYS alive (shim parity); a sibling op keeps working", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({
      ops: {
        "fx.boom@1": () => { throw new Error("kaboom"); },
        "fx.fine@1": () => ({ fine: true }),
      },
    }), manifest("omega.boom", [{ id: "fx.boom" }, { id: "fx.fine" }]));
    const r = await fake.call("fx.boom@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("DEGRADED"); expect(r.detail).toContain("kaboom"); }
    // real-host parity: the worker did not crash — the compartment is still active
    expect(fake.states["omega.boom"]).toBe("active");
    const fine = await fake.call("fx.fine@1", {});
    expect(fine.ok).toBe(true);
    const again = await fake.call("fx.boom@1", {});
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("DEGRADED"); // same register every time — from the handler, not the state
  });

  test("quarantine(id): state quarantined, ops answer DEGRADED, journal records it", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    expect(fake.quarantine("omega.fx")).toBe(true);
    expect(fake.states["omega.fx"]).toBe("quarantined");
    const r = await fake.call("fx.echo@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("DEGRADED"); expect(r.detail).toContain("quarantined"); }
    expect(fake.journal.some((e) => e.op === "quarantine" && e.pluginId === "omega.fx")).toBe(true);
    expect(fake.quarantine("nope")).toBe(false);
  });

  test("lifecycle: staged→verified→active; onInit failure → still active (shim sends ready) + journaled init-failed", async () => {
    const fake = new FakeHost();
    const good = definePlugin({ onInit: () => {}, ops: { "fx.a@1": () => 1 } });
    await fake.install(good, manifest("omega.good", [{ id: "fx.a" }]));
    expect(fake.states["omega.good"]).toBe("active");

    const bad = definePlugin({ onInit: () => { throw new Error("init failed"); }, ops: { "fx.b@1": () => 1 } });
    await fake.install(bad, manifest("omega.bad", [{ id: "fx.b" }]));
    // MIRRORS the shim: onInit failure logs and sends `ready` anyway — active but
    // journaled; the real host marks this compartment ACTIVE too (differential law).
    expect(fake.states["omega.bad"]).toBe("active");
    const ev = fake.journal.find((e) => e.op === "init-failed" && e.pluginId === "omega.bad");
    expect(ev).toBeTruthy();
    expect(String(ev?.reason)).toContain("init failed");
  });

  test("degrade(id): the crash/health observation surface — v1 crashed compartments never come back", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    expect(fake.degrade("omega.fx", "crash-loop observed (rule B)")).toBe(true);
    expect(fake.states["omega.fx"]).toBe("degraded");
    const r = await fake.call("fx.echo@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe("DEGRADED"); expect(r.detail).toContain("degraded"); }
    expect(fake.journal.some((e) => e.op === "degrade" && e.pluginId === "omega.fx" && String(e.reason).includes("crash-loop"))).toBe(true);
    expect(fake.degrade("nope")).toBe(false);
    // journal event carries the observed crash count (status() exposes it too)
    expect((fake.status().compartments as Record<string, { crashes: number }>)["omega.fx"].crashes).toBe(1);
  });

  test("host ops through the fake: stats, journal append, revoke, terminate (capability-gated)", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    const hostCaps = fake.grant("omega.fx", ["host.journal.append", "host.tokens.revoke"]);
    const tok = fake.grant("omega.fx", ["port:fx.echo@1"]);

    const stats = await fake.call(HOST_OPS.compartmentStats, {}, { principal: "omega.fx", token: tok["port:fx.echo@1"] });
    // wrong cap for a host op → SCOPE (compartment stats needs host.compartment.admin, never granted)
    expect(stats.ok).toBe(false);
    if (!stats.ok) expect(stats.error).toBe("SCOPE");

    const jr = await fake.call(HOST_OPS.journalAppend, { marker: "host-op" }, { principal: "omega.fx", token: hostCaps["host.journal.append"] });
    expect(jr.ok).toBe(true);
    expect(fake.journal.some((e) => e.marker === "host-op")).toBe(true);

    const revoked = await fake.call(HOST_OPS.tokensRevoke, { pluginId: "omega.fx" }, { principal: "omega.fx", token: hostCaps["host.tokens.revoke"] });
    expect(revoked.ok).toBe(true);

    const root = await fake.callAsRoot(HOST_OPS.compartmentTerminate, { pluginId: "omega.fx" });
    expect(root.ok).toBe(true);
    expect(fake.states["omega.fx"]).toBe("retired");
    // root needs no token (mirrors callAsRoot), and spawn is REFUSED in v1
    const spawn = await fake.callAsRoot(HOST_OPS.compartmentSpawn, { pluginId: "omega.fx" });
    expect(spawn.ok).toBe(false);
    if (!spawn.ok) { expect(spawn.error).toBe("REFUSED"); expect(spawn.detail).toContain("reboot via recipe"); }
  });

  test("status(): routed ops + generation + compartment stats are attributable", async () => {
    const fake = new FakeHost();
    await fake.install(echoLike(), manifest("omega.fx", [{ id: "fx.echo" }]));
    await fake.call("fx.echo@1", {});
    const st = fake.status();
    expect(st.routedOps).toContain("fx.echo@1");
    expect(st.generation).toBe(1);
    expect((st.compartments as Record<string, { delivered: number }>)["omega.fx"].delivered).toBe(1);
  });

  test("causation ids are host-minted, chained, and journaled (increasing)", async () => {
    const fake = new FakeHost();
    await fake.install(definePlugin({ ops: { "fx.w@1": (p) => p, "fx.w2@1": (p) => p } }), manifest("omega.fx", [
      { id: "fx.w", risk: "MUTATION" }, { id: "fx.w2", risk: "MUTATION" },
    ]));
    await fake.call("fx.w@1", {});
    await fake.call("fx.w2@1", {});
    const ids = fake.journal.map((e) => String(e.causationId));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.every((id) => /^c_\d+$/.test(id))).toBe(true);
    const nums = ids.map((id) => Number(id.slice(2)));
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThan(nums[i - 1]);
  });
});

// ---- D-352 differential mirror: the FakeHost streams exactly like the real host/shim pair ----

describe("D-352 FakeHost — streaming mirror (same emit discipline, same registers)", () => {
  function streamingDef(): PluginDef {
    return definePlugin({
      ops: {
        "fx.stream@1": async (payload, _ctx, meta) => {
          const p = (payload ?? {}) as { chunks?: unknown[]; violateAfterFinal?: boolean };
          const items = Array.isArray(p.chunks) ? p.chunks : [];
          items.forEach((item, i) => meta.emit(item, i === items.length - 1));
          if (p.violateAfterFinal) meta.emit("after-final", true);
          return { streamed: items.length };
        },
      },
    });
  }

  test("callAsRootStream: ordered chunks with seq 1..n, streamId === the returned stream id, result ok", async () => {
    const fake = new FakeHost();
    await fake.install(streamingDef(), manifest("omega.fx", [{ id: "fx.stream" }]));
    const got: Array<{ seq: number; data: unknown; final: boolean; streamId: string }> = [];
    const { streamId, result } = await fake.callAsRootStream("fx.stream@1", { chunks: ["a", "b", "c"] }, (c) => got.push(c));
    expect(got.map((c) => c.data)).toEqual(["a", "b", "c"]);
    expect(got.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(got.map((c) => c.final)).toEqual([false, false, true]);
    expect(got.every((c) => c.streamId === streamId)).toBe(true); // pre-minted causation, exactly like the real host
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as { streamed: number }).streamed).toBe(3);
  });

  test("cold fallback: no sink ⇒ chunks dropped, terminating value still ok (non-streaming callers observe nothing)", async () => {
    const fake = new FakeHost();
    await fake.install(streamingDef(), manifest("omega.fx", [{ id: "fx.stream" }]));
    const r = await fake.callAsRoot("fx.stream@1", { chunks: ["x", "y"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { streamed: number }).streamed).toBe(2);
  });

  test("emit-after-final ⇒ DEGRADED (the mirrored fail-closed producer side)", async () => {
    const fake = new FakeHost();
    await fake.install(streamingDef(), manifest("omega.fx", [{ id: "fx.stream" }]));
    const got: StreamChunk[] = [];
    const { result } = await fake.callAsRootStream("fx.stream@1", { chunks: ["x"], violateAfterFinal: true }, (c) => got.push(c));
    expect(got.map((c) => c.data)).toEqual(["x"]); // the legal prefix still flowed
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.error).toBe("DEGRADED"); expect(String(result.detail)).toMatch(/emit after final/); }
  });
});
