// plugins/provider-browser — test/browser-falsifier.test.ts (D-357, M0/D-338 falsifier)
// THE D-338 SHIP-BLOCKER: one real message sent through a BROWSER_MEDIATED
// realization from a fixture-recorded session, gated by law.check@1 exactly
// like every other op, realized through the STANDARD discovery lifecycle —
// on one real boot of the shipped compositions/browser.json.
//
// Gate-vs-bars ordering is itself proven: the law gate fires BEFORE the
// handler bars (µhost dispatch law.checks before delivery), and the bars fire
// BEFORE any replay or vault write (fail-closed inside the handler).
//
// Also proves the wave's other ships: XC-2's put ceremony + redact-before-
// vault (M12/D-356: the stored capture bytes contain NONE of the fixture's
// known secrets), D-355 pins written by verification and enforced by bar 4,
// and D-352's ordered-chunk replay observed through the streaming call shape.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, StreamChunk } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const FIXTURE_TEXT = readFileSync(join(OMEGA_ROOT, "fixtures/browser/session-fixture.json"), "utf-8");
// The KNOWN SECRETS planted in the fixture (request header, response cookie,
// redirect URL) — M12's falsifier proves they never land in the vault.
const KNOWN_SECRETS = ["sk-fixture-0123456789abcdef", "9f8e7d6c5b4a", "q99topsecret"];

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 30_000);

describe("D-357 — the M0 falsifier on one real boot of compositions/browser.json", () => {
  let host: BootedHost;

  beforeAll(async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/browser.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-browser-test", `falsifier-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const shipped = JSON.parse(JSON.stringify(spec));
    shipped.entries.find((e: { id: string }) => e.id === "vivim.vault").config.dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(shipped, join(SPEC, ".."), vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    expect(booted.report.booted).toBe(true);
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
    const st = host.router.status();
    expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
  }, 90_000);

  async function raw<T>(op: string, payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot(op, payload);
  }
  async function root<T>(op: string, payload: unknown): Promise<T> {
    const r = await raw<T>(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as T;
  }

  test("XC-2 put ceremony: credential.put@1 requires consent (policy 1.2.0 rule) → grant → seeded", async () => {
    const first = await raw("credential.put@1", { credentialId: "webmail-fixture", sim: true, meta: { purpose: "m0-falsifier" } });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error).toBe("REFUSED");
      expect(first.detail).toContain("consent required");
      const consentId = /consent required: (consent_[0-9a-f]+)/.exec(first.detail ?? "")?.[1];
      expect(consentId).toMatch(/^consent_[0-9a-f]+$/);
      await root("law.consent.grant@1", { consentId });
    }
    const second = await raw<{ credentialId: string }>("credential.put@1", { credentialId: "webmail-fixture", sim: true, meta: { purpose: "m0-falsifier" } });
    expect(second.ok).toBe(true);
  });

  test("attach: redact-before-vault — the stored capture bytes contain NONE of the known secrets", async () => {
    const r = await root<{ sessionId: string; captureRef: { ns: string; id: string; rev: number }; redactions: number; integrity: string }>(
      "browser.attach@1", { captureText: FIXTURE_TEXT },
    );
    expect(r.redactions).toBeGreaterThanOrEqual(3); // request header + cookie pair + URL param (value shapes may add more)
    expect(r.integrity).toMatch(/^[0-9a-f]{64}$/);
    const cap = await root<{ data: { redactedText: string } }>("vault.get@1", { ns: r.captureRef.ns, id: r.captureRef.id });
    for (const s of KNOWN_SECRETS) expect(cap.data.redactedText).not.toContain(s);
    // the redacted bytes are still VALID JSON — the parser must replay them
    expect(() => JSON.parse(cap.data.redactedText)).not.toThrow();
    const sess = await root<{ data: { status: string; providerId: string; sim: boolean; captureRef: unknown } }>(
      "vault.get@1", { ns: "providers", id: r.sessionId },
    );
    expect(sess.data).toMatchObject({ status: "ATTACHED", providerId: "browser", sim: true });
    expect(sess.data.captureRef).toEqual(r.captureRef); // the session cites the capture BY REFERENCE
    // integrity is the hash over the ALREADY-REDACTED bytes (the only bytes that exist)
    const h = new Bun.CryptoHasher("sha256"); h.update(cap.data.redactedText);
    expect(h.digest("hex")).toBe(r.integrity);
    sessionIdGlobal = r.sessionId;
  });

  let sessionIdGlobal = "";

  test("the day-one fence is REAL (first touch registered it): law holds the never-invocations", async () => {
    const d = await root<{ forbidden: { ops: string[]; persisted: boolean } }>("law.describe@1", { principal: "agent:pilot" });
    expect(d.forbidden.ops).toContain("credential.use@1");     // the browser pilot may NEVER pull a credential
    expect(d.forbidden.ops).toContain("browser.navigate@1");
    expect(d.forbidden.ops).toContain("browser.eval@1");
    expect(d.forbidden.persisted).toBe(true);                  // vault-durable law (D-325 shape)
  });

  test("the GATE fires before the handler bars: ungated send → REFUSED require-consent (no replay, no rows)", async () => {
    const r = await raw("message.send@1", { sessionId: sessionIdGlobal, to: "peter@fixture.test", subject: "Quarterly report", body: "Hello Peter, the quarterly report is attached." });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("REFUSED");
      expect(r.detail).toContain("consent required"); // EXTERNAL_MUTATION (pack-declared) — the gate, not a bar
      const consentId = /consent required: (consent_[0-9a-f]+)/.exec(r.detail ?? "")?.[1];
      expect(consentId).toMatch(/^consent_[0-9a-f]+$/);
      await root("law.consent.grant@1", { consentId });
    }
    // consent active → the handler now runs → bar 3 refuses (no realization yet)
    const b3 = await raw("message.send@1", { sessionId: sessionIdGlobal, to: "peter@fixture.test", subject: "Quarterly report", body: "Hello Peter, the quarterly report is attached." });
    expect(b3.ok).toBe(false);
    if (!b3.ok) expect(b3.detail).toContain("bar 3");
  });

  test("the STANDARD discovery lifecycle promotes the BROWSER_MEDIATED realization with parser pins", async () => {
    const perceived = await root<{ graphId: { ns: string; id: string; rev: number } }>("discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
    expect(perceived.graphId.id).toBe("graph:webmail-inbox");
    const graph = await root<{ data: unknown }>("vault.get@1", { ns: perceived.graphId.ns, id: perceived.graphId.id });
    const inferred = await root<{ candidates: Array<{ id: string; op: string; evidence: Array<{ ns: string; id: string; rev: number }> }> }>(
      "discovery.infer@1", { graph: graph.data, runId: "browser-falsifier" },
    );
    const send = inferred.candidates.find((c) => c.op === "message.send");
    expect(send).toBeDefined();
    expect(send!.evidence.length).toBeGreaterThan(0); // the G0 seam fix: evidence survives perceive→infer
    const mapped = await root<{ satisfied: boolean; bindings: Array<{ blueprintOp: string; candidateId: string }> }>(
      "discovery.map@1", { candidates: inferred.candidates, runId: "browser-falsifier" },
    );
    const binding = mapped.bindings.find((b) => b.blueprintOp === "message.send@1");
    expect(binding).toBeDefined();
    const probes = [0, 1, 2].map((k) => ({
      candidateId: binding!.candidateId,
      passed: true,
      evidence: send!.evidence.map((e) => ({ ns: e.ns, id: e.id, rev: e.rev })),
      note: `browser falsifier probe ${k}`,
    }));
    const v = await root<{ promoted: string[]; realizations: Array<{ id: string; status: string }> }>("discovery.verify@1", {
      mapping: { bindings: mapped.bindings, satisfied: mapped.satisfied },
      probes, runId: "browser-falsifier-1",
      provider: { id: "browser", class: "BROWSER_MEDIATED", parserPins: [{ providerId: "browser", archetypeSlug: "message.send", version: "1" }] },
    });
    expect(v.promoted).toContain(send!.id);
    expect(v.realizations.some((x) => x.id === "realization:message.send:browser" && x.status === "PROMOTED")).toBe(true);
    const row = await root<{ data: { parserPins?: Array<{ providerId: string; archetypeSlug: string; version: string }>; providerClass: string } }>(
      "vault.get@1", { ns: "providers", id: "realization:message.send:browser" },
    );
    expect(row.data.providerClass).toBe("BROWSER_MEDIATED");
    expect(row.data.parserPins).toEqual([{ providerId: "browser", archetypeSlug: "message.send", version: "1" }]);
  });

  test("bar 4: an UNPINNED realization supersedes → send refuses on pin coverage → re-verify restores", async () => {
    const perceived = await root<{ graphId: { ns: string; id: string } }>("discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
    const graph = await root<{ data: unknown }>("vault.get@1", { ns: perceived.graphId.ns, id: perceived.graphId.id });
    const inferred = await root<{ candidates: Array<{ id: string; op: string; evidence: Array<{ ns: string; id: string; rev: number }> }> }>(
      "discovery.infer@1", { graph: graph.data, runId: "browser-falsifier-nopin" },
    );
    const send = inferred.candidates.find((c) => c.op === "message.send")!;
    const mapped = await root<{ bindings: Array<{ blueprintOp: string; candidateId: string }> }>(
      "discovery.map@1", { candidates: inferred.candidates, runId: "browser-falsifier-nopin" },
    );
    const binding = mapped.bindings.find((b) => b.blueprintOp === "message.send@1")!;
    const probes = [0, 1, 2].map((k) => ({
      candidateId: binding.candidateId, passed: true,
      evidence: send.evidence.map((e) => ({ ns: e.ns, id: e.id, rev: e.rev })), note: `nopin probe ${k}`,
    }));
    const v = await root<{ promoted: string[] }>("discovery.verify@1", {
      mapping: { bindings: mapped.bindings, satisfied: mapped.satisfied },
      probes, runId: "browser-falsifier-nopin",
      provider: { id: "browser", class: "BROWSER_MEDIATED" }, // no parserPins — absence = unpinned (D-355)
    });
    expect(v.promoted).toContain(send.id);
    const refused = await raw("message.send@1", { sessionId: sessionIdGlobal, to: "peter@fixture.test", subject: "Quarterly report", body: "x" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.detail).toContain("bar 4");
    // restore the pinned realization
    await root("discovery.verify@1", {
      mapping: { bindings: mapped.bindings, satisfied: mapped.satisfied },
      probes, runId: "browser-falsifier-restore",
      provider: { id: "browser", class: "BROWSER_MEDIATED", parserPins: [{ providerId: "browser", archetypeSlug: "message.send", version: "1" }] },
    });
  });

  test("fires clean: consented, PROMOTED, pinned send lands the message pack-schema-exact", async () => {
    const sent = await root<{ messageId: string; rev: number; sentAt: number; chunks: number }>(
      "message.send@1",
      { sessionId: sessionIdGlobal, to: "peter@fixture.test", subject: "Quarterly report", body: "Hello Peter, the quarterly report is attached." },
    );
    expect(sent.chunks).toBe(7); // start + message + 4 events + done
    const msg = await root<{ data: Record<string, unknown>; meta: Record<string, unknown> }>("vault.get@1", { ns: "email", id: sent.messageId });
    expect(msg.data).toMatchObject({
      id: sent.messageId, folder: "sent", from: "pilot@omega.local", to: "peter@fixture.test",
      subject: "Quarterly report", flags: { seen: true, flagged: false, draft: false },
    });
    expect(msg.meta).toMatchObject({ type: "message", provider: "browser" });
    for (const s of KNOWN_SECRETS) expect(JSON.stringify(msg)).not.toContain(s); // no secrets ride the message
  });

  test("the replay streams ordered chunks through the D-352 shape (streamId = causation, seq contiguous, one final)", async () => {
    const chunks: StreamChunk[] = [];
    const r = await host.router.callAsRootStream(
      "message.send@1",
      { sessionId: sessionIdGlobal, to: "ana@fixture.test", subject: "Streaming replay", body: "second send, streamed" },
      (c) => chunks.push(c),
      10_000,
    );
    expect(r.result.ok).toBe(true);
    expect(chunks.length).toBe(7);
    expect(chunks.every((c) => c.streamId === r.streamId)).toBe(true);
    let prev = 0;
    for (const c of chunks) { expect(c.seq).toBe(prev + 1); prev = c.seq; }
    expect(chunks[chunks.length - 1]!.final).toBe(true);
    expect(chunks.filter((c) => c.final)).toHaveLength(1);
    expect((r.result.value as { chunks: number }).chunks).toBe(7);
  });

  test("bar 2: released and unknown sessions refuse (fail-closed)", async () => {
    const unknown = await raw("message.send@1", { sessionId: "session:does-not-exist", to: "x@y.test", subject: "s", body: "" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.detail).toContain("bar 2");
    const rel = await root<{ status: string }>("browser.release@1", { sessionId: sessionIdGlobal });
    expect(rel.status).toBe("RELEASED");
    const released = await raw("message.send@1", { sessionId: sessionIdGlobal, to: "x@y.test", subject: "s", body: "" });
    expect(released.ok).toBe(false);
    if (!released.ok) expect(released.detail).toContain("bar 2");
  });

  test("the vault's Merkle chain verifies and holds no known secret anywhere we wrote", async () => {
    const v = await root<{ ok: boolean; entries: number }>("vault.verify@1", {});
    expect(v.ok).toBe(true);
    expect(v.entries).toBeGreaterThan(4);
    const rows = await root<Array<{ id: string }>>("vault.query@1", { ns: "providers", filter: {} });
    for (const row of rows.slice(0, 20)) {
      const got = await root<{ data: unknown }>("vault.get@1", { ns: "providers", id: row.id });
      for (const s of KNOWN_SECRETS) expect(JSON.stringify(got.data)).not.toContain(s);
    }
  });
});
