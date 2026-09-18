// D-323 + D-324 — computation routing + provenance linkage, through a REAL boot.
// Rule table branches (rule → PROMOTED realization → HUMAN default) + a
// classify→report→scorecard round trip with exact arithmetic + the
// INFERRED-vs-VERIFIED distinction surviving a vault round trip +
// decision.record accepting/rejecting buildDecisionRef. No new plugin, no
// composition edits, no host/law/vault changes (inline spec only).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, Outcome, PortResult } from "@vivim/omega-contracts";
import {
  asResolveDecision, classifyPure, parseClassifyInput, parseReportInput, scorecardPure,
} from "../src/resolve.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.forbidden.set@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const DIRECTOR_CONTRACTS = ["director.rule@1", "director.registry@1", "director.teach@1", "director.tick@1", "resolve.classify@1", "resolve.report@1", "strategy.scorecard@1"];
const DIRECTOR_CAPS = ["port:vault.append@1", "port:vault.query@1", "port:vault.get@1", "port:vault.getmany@1"]; // D-388: batched tick read phase
const VERIFY_CONTRACTS = ["discovery.verify@1"];
const VERIFY_CAPS = ["port:vault.append@1", "port:vault.get@1"];

// ---- pure tables (no ports) ----

describe("resolve pure — rule table, report parsing, scorecard arithmetic", () => {
  test("parseClassifyInput: contradictory op/slug refused fail-closed; shapes validated", () => {
    expect(parseClassifyInput({})).toEqual({ op: null, slug: null, event: null, from: null });
    expect(parseClassifyInput({ op: "message.send@1" })).toMatchObject({ op: "message.send@1", slug: "message.send" });
    expect(parseClassifyInput({ op: "message.send@1", archetypeSlug: "message.send" }).slug).toBe("message.send");
    expect(() => parseClassifyInput({ op: "message.send@1", archetypeSlug: "other" })).toThrow(/contradicts/);
    expect(() => parseClassifyInput({ op: "banana" })).toThrow(/<id>@<version>/);
    expect(() => parseClassifyInput([])).toThrow(/object/);
  });

  test("classifyPure branch 1: first enabled rule matching event+from; disabled never routes", () => {
    const rules = [
      { id: "rule:a-forward", rev: 1, event: "message.received", from: null, op: "message.send@1", enabled: true },
      { id: "rule:b-forward", rev: 2, event: "message.received", from: "contact:bob" as string | null, op: "message.send@1", enabled: true },
      { id: "rule:off", rev: 1, event: "message.received", from: null, op: "message.send@1", enabled: false },
    ];
    // First match in arrival order wins (the wiring sorts id-asc before calling).
    const v = classifyPure({ input: { event: "message.received", from: "contact:bob", slug: null }, rules, realizations: [] });
    expect(v).toMatchObject({ kind: "DETERMINISTIC", capability: "message.send@1", branch: "rule" });
    expect(v.evidenceRefs).toEqual([{ ns: "automation", id: "rule:a-forward", rev: 1, epistemicStatus: "INFERRED" }]);
    // Contact-specific row matches its contact when the wildcard is absent.
    const specific = classifyPure({
      input: { event: "message.received", from: "contact:bob", slug: null },
      rules: [rules[1]!], realizations: [],
    });
    expect(specific.evidenceRefs).toEqual([{ ns: "automation", id: "rule:b-forward", rev: 2, epistemicStatus: "INFERRED" }]);
    // No event → rule branch skipped even with rules loaded.
    expect(classifyPure({ input: { event: null, from: null, slug: null }, rules, realizations: [] }).branch).toBe("human");
    // Only a disabled rule matches → falls through.
    const off = classifyPure({
      input: { event: "message.received", from: "contact:zed", slug: null },
      rules: [{ id: "rule:off", rev: 1, event: "message.received", from: null, op: "message.send@1", enabled: false }],
      realizations: [],
    });
    expect(off.branch).toBe("human");
  });

  test("classifyPure branch 2: first PROMOTED id-asc; SIMULATOR→DETERMINISTIC, else PROBABILISTIC; revs exact", () => {
    const realizations = [
      { id: "realization:mail:provider.b", rev: 3, archetypeSlug: "mail", providerClass: "API_NATIVE" as const, status: "PROMOTED" },
      { id: "realization:mail:provider.a", rev: 2, archetypeSlug: "mail", providerClass: "SIMULATOR" as const, status: "PROMOTED" },
      { id: "realization:mail:provider.t", rev: 1, archetypeSlug: "mail", providerClass: "SIMULATOR" as const, status: "TESTING" },
    ];
    const v = classifyPure({ input: { event: null, from: null, slug: "mail" }, rules: [], realizations });
    expect(v).toMatchObject({ kind: "DETERMINISTIC", capability: "mail@1", branch: "realization" });
    expect(v.evidenceRefs).toEqual([{ ns: "providers", id: "realization:mail:provider.a", rev: 2, epistemicStatus: "VERIFIED" }]);
    const api = classifyPure({
      input: { event: null, from: null, slug: "mail" },
      rules: [],
      realizations: [{ id: "realization:mail:provider.b", rev: 3, archetypeSlug: "mail", providerClass: "BROWSER_MEDIATED" as const, status: "PROMOTED" }],
    });
    expect(api.kind).toBe("PROBABILISTIC");
    // TESTING-only → human (never route on unproven status).
    expect(classifyPure({
      input: { event: null, from: null, slug: "mail" }, rules: [],
      realizations: [{ id: "r", rev: 1, archetypeSlug: "mail", providerClass: "SIMULATOR" as const, status: "TESTING" }],
    }).branch).toBe("human");
  });

  test("classifyPure branch 3: HUMAN carries an empty capability (routes nowhere)", () => {
    const v = classifyPure({ input: { event: null, from: null, slug: "ghost" }, rules: [], realizations: [] });
    expect(v).toEqual({ kind: "HUMAN", branch: "human", capability: "", reason: expect.any(String), evidenceRefs: [] });
  });

  test("parseReportInput: status + execMs validated; shapes throw", () => {
    expect(parseReportInput({ decisionId: "res_x", status: "ok", execMs: 0 })).toEqual({ decisionId: "res_x", status: "ok", execMs: 0 });
    expect(() => parseReportInput({ decisionId: "", status: "ok", execMs: 1 })).toThrow(/decisionId/);
    expect(() => parseReportInput({ decisionId: "x", status: "maybe", execMs: 1 })).toThrow(/"ok" \| "failed"/);
    expect(() => parseReportInput({ decisionId: "x", status: "ok", execMs: -1 })).toThrow(/execMs/);
  });

  test("scorecardPure: exact grouping, okRate, lower-median p50, (kind, capability) sort", () => {
    const rows = scorecardPure([
      { kind: "HUMAN", capability: "", status: "ok", execMs: 40 },
      { kind: "DETERMINISTIC", capability: "probe.a@1", status: "failed", execMs: 30 },
      { kind: "DETERMINISTIC", capability: "probe.a@1", status: "ok", execMs: 10 },
      { kind: "HUMAN", capability: "", status: "ok", execMs: 20 },
      { kind: "DETERMINISTIC", capability: "message.send@1", status: "failed", execMs: 50 },
    ]);
    expect(rows).toEqual([
      { kind: "DETERMINISTIC", capability: "message.send@1", n: 1, okRate: 0, p50ExecMs: 50 },
      { kind: "DETERMINISTIC", capability: "probe.a@1", n: 2, okRate: 0.5, p50ExecMs: 10 },
      { kind: "HUMAN", capability: "", n: 2, okRate: 1, p50ExecMs: 20 },
    ]);
  });

  test("asResolveDecision narrows stored rows; malformed reads as null", () => {
    expect(asResolveDecision({ decisionId: "x", kind: "HUMAN", capability: "" })).toMatchObject({ decisionId: "x" });
    expect(asResolveDecision(null)).toBeNull();
    expect(asResolveDecision({ decisionId: "x", kind: "ORACLE", capability: "" })).toBeNull();
  });
});

// ---- live round trip ----

describe("D-323 + D-324 — classify→report→scorecard through a real boot", () => {
  let host: BootedHost;

  beforeAll(async () => {
    const root = omegaTmp("omega-resolve-test", `v23-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const spec: CompositionSpec = {
      name: "resolve-v23",
      entries: [
        { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
        { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
        {
          id: "discovery.verification", source: "plugins/discovery-verification", bootPhase: 1,
          grant: { capabilities: VERIFY_CAPS, contracts: VERIFY_CONTRACTS },
        },
        {
          id: "vivim.director", source: "plugins/vivim-director", bootPhase: 1,
          grant: { capabilities: DIRECTOR_CAPS, contracts: DIRECTOR_CONTRACTS }, config: { intervalMs: 0 },
        },
      ],
    };
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  async function call(op: string, payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot(op, payload);
  }
  async function okCall(op: string, payload: unknown): Promise<Record<string, any>> {
    const r = await call(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as Record<string, any>;
  }
  async function vaultGet(ns: string, id: string): Promise<{ rev: number; data: any }> {
    const r = await call("vault.get@1", { ns, id });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`vault.get ${ns}/${id} failed`);
    return r.value as { rev: number; data: any };
  }

  test("rule branch routes DETERMINISTIC with INFERRED evidence; HUMAN defaults to empty capability", async () => {
    const rule = await okCall("director.rule@1", {
      when: { event: "message.received", from: null },
      then: { op: "message.send@1", payload: { to: "a@x.local", subject: "s", body: "b" } },
    });
    expect(rule.ruleId).toMatch(/^rule:/);
    const c = await okCall("resolve.classify@1", { event: "message.received", from: null });
    expect(c).toMatchObject({ kind: "DETERMINISTIC", capability: "message.send@1", branch: "rule", rev: 1 });
    const stored = await vaultGet("resolve", `resolve:${c.decisionId as string}`);
    expect(stored.data).toMatchObject({ kind: "DETERMINISTIC", branch: "rule", buildDecisionRef: "D-323" });
    // INFERRED survives the vault round trip (D-324 distinction, rule side).
    expect(stored.data.evidenceRefs).toEqual([
      { ns: "automation", id: rule.ruleId as string, rev: 1, epistemicStatus: "INFERRED" },
    ]);
    const h = await okCall("resolve.classify@1", { archetypeSlug: "ghost.thing" });
    expect(h).toMatchObject({ kind: "HUMAN", branch: "human", capability: "" });
  });

  test("verify PROMOTED stamps VERIFIED; realization branch cites it and routes class-mapped", async () => {
    const seed = await call("vault.append@1", { ns: "probe", id: "p-resolve", data: { pass: true } });
    expect(seed.ok).toBe(true);
    const ev = [{ ns: "probe", id: "p-resolve", rev: 1 }];
    const v = await okCall("discovery.verify@1", {
      mapping: { satisfied: true, bindings: [{ blueprintOp: "probe.a@1", candidateId: "cand-1" }] },
      probes: [0, 1, 2].map(() => ({ candidateId: "cand-1", passed: true, evidence: ev })),
      provider: { id: "provider.resolve.fixture" },
      runId: "resolve-promote",
    });
    expect(v.realizationsWritten).toBe(1);
    // D-324 adoption: passed-probe evidence is VERIFIED at the writer.
    const real = await vaultGet("providers", "realization:probe.a:provider.resolve.fixture");
    expect(real.data.status).toBe("PROMOTED");
    expect(real.data.evidenceRefs).toEqual([
      { ns: "probe", id: "p-resolve", rev: 1, epistemicStatus: "VERIFIED" },
      { ns: "probe", id: "p-resolve", rev: 1, epistemicStatus: "VERIFIED" },
      { ns: "probe", id: "p-resolve", rev: 1, epistemicStatus: "VERIFIED" },
    ]);
    const c = await okCall("resolve.classify@1", { archetypeSlug: "probe.a" });
    expect(c).toMatchObject({ kind: "DETERMINISTIC", capability: "probe.a@1", branch: "realization" });
    const stored = await vaultGet("resolve", `resolve:${c.decisionId as string}`);
    // VERIFIED survives the vault round trip (D-324 distinction, realization side).
    expect(stored.data.evidenceRefs).toEqual([
      { ns: "providers", id: "realization:probe.a:provider.resolve.fixture", rev: real.rev, epistemicStatus: "VERIFIED" },
    ]);
  });

  test("report appends outcome rev 2; UNKNOWN for missing decisions; scorecard arithmetic exact", async () => {
    const dRule = await okCall("resolve.classify@1", { event: "message.received", from: null });
    const dReal1 = await okCall("resolve.classify@1", { archetypeSlug: "probe.a" });
    const dReal2 = await okCall("resolve.classify@1", { op: "probe.a@1" });
    const dHuman1 = await okCall("resolve.classify@1", { archetypeSlug: "ghost.one" });
    const dHuman2 = await okCall("resolve.classify@1", {});
    for (const d of [dRule, dReal1, dReal2, dHuman1, dHuman2]) expect(d.rev).toBe(1);

    const r1 = await okCall("resolve.report@1", { decisionId: dRule.decisionId, status: "failed", execMs: 50 });
    expect(r1).toMatchObject({ status: "failed", rev: 2 });
    await okCall("resolve.report@1", { decisionId: dReal1.decisionId, status: "ok", execMs: 10 });
    await okCall("resolve.report@1", { decisionId: dReal2.decisionId, status: "failed", execMs: 30 });
    await okCall("resolve.report@1", { decisionId: dHuman1.decisionId, status: "ok", execMs: 20 });
    await okCall("resolve.report@1", { decisionId: dHuman2.decisionId, status: "ok", execMs: 40 });

    // Missing decision is UNKNOWN data, not a throw.
    const missing = await call("resolve.report@1", { decisionId: "res_missing", status: "ok", execMs: 1 });
    expect(missing.ok).toBe(true);
    if (missing.ok) expect((missing.value as Outcome).status).toBe("UNKNOWN");
    // Malformed report fails closed.
    const bad = await call("resolve.report@1", { decisionId: "x", status: "ok", execMs: -5 });
    expect(bad.ok).toBe(false);

    const s = await okCall("strategy.scorecard@1", {});
    expect(s.rows).toEqual([
      { kind: "DETERMINISTIC", capability: "message.send@1", n: 1, okRate: 0, p50ExecMs: 50 },
      { kind: "DETERMINISTIC", capability: "probe.a@1", n: 2, okRate: 0.5, p50ExecMs: 10 },
      { kind: "HUMAN", capability: "", n: 2, okRate: 1, p50ExecMs: 20 },
    ]);
  });

  test("stale classify input refused fail-closed (op/slug contradiction)", async () => {
    const bad = await call("resolve.classify@1", { op: "message.send@1", archetypeSlug: "probe.a" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("DEGRADED");
  });
});
