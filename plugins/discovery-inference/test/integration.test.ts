// discovery.inference — test/integration.test.ts (Ω8, GATE-Ω8 evidence)
//
// THE DISCOVERY-MIND PIPELINE through the real µhost, booting
// compositions/discovery-mind.json (unique temp dirs, modified spec copies):
//
//   perceive (root stands in for Ω7 — capture spans in the vault)
//     → INFER  discovery.infer@1 {graph}            → 12 DRAFT candidates, evidence-cited
//     → MAP    discovery.map@1 {candidates, pack}   → 5 bindings + 7 surplus, satisfied
//     → VERIFY discovery.verify@1 {mapping, probes} → 3/3 probes per binding → PROMOTED
//       then the broken variant (1/3 fail on send) → stays DRAFT with a gap report
//
// The probe harness simulates executing each mapped op against the webmail
// fixture state and checks the postcondition (e.g. click send → a new message
// node appears in the outbox region) — probes are CALLER-supplied by design;
// the engine verifies, never fabricates. Every candidate/promotion decision
// is evidence-bound to vault objects (ns "discovery") and Merkle-sealed.
//
// The full pipeline runs on the inline webmail-like graph (deterministic);
// a separate test runs INFER + MAP against Ω7's committed fixture data
// (fixtures/webmail-inbox/page.json read directly from disk — it is just
// data; their code dirs remain untouched) whenever it exists, asserting the
// honest outcome: core webmail surfaces bind, any missing surface is a
// recorded GAP (constraint solving on real perception data).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";
import {
  webmailGraphFixture, fixtureWebmailGraph, buildProbes, initialWebmailState, applyAction,
  type EvidenceRef, type WebmailState,
} from "./utils.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → discovery-inference/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const BLUEPRINT_OPS = ["message.send@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1"];
const DISCOVERY_NS = "discovery";
const WEBMAIL_NODES = 13; // the inline webmail surface (deterministic full-pipeline fixture; D-222 adds btn-receive)

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

/** Spec copy of compositions/discovery-mind.json with a per-case dataDir. */
function makeMindSpec(name: string, dataDir: string, opts: { blueprintPath?: string } = {}): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "discovery.inference", source: "plugins/discovery-inference", bootPhase: 1, grant: { capabilities: ["port:vault.append@1", "port:vault.get@1"], contracts: ["discovery.infer@1"] } },
      {
        id: "discovery.mapping", source: "plugins/discovery-mapping", bootPhase: 1,
        grant: { capabilities: ["port:vault.append@1"], contracts: ["discovery.map@1"] },
        config: { blueprintPath: opts.blueprintPath ?? "packs/domain-email/plugin.json" },
      },
      { id: "discovery.verification", source: "plugins/discovery-verification", bootPhase: 1, grant: { capabilities: ["port:vault.append@1", "port:vault.get@1"], contracts: ["discovery.verify@1"] } },
    ],
  };
}

async function bootMind(caseName: string, spec: CompositionSpec): Promise<Case> {
  const root = omegaTmp("omega-discovery-mind-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = join(root, "vault-data");
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

function journalLines(vaultDir: string): Array<Record<string, unknown>> {
  const jf = join(vaultDir, "law-journal.jsonl");
  if (!existsSync(jf)) return [];
  return readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function rootCall<T>(host: BootedHost, op: string, payload: unknown): Promise<T> {
  const r = await host.router.callAsRoot(op, payload);
  if (!r.ok) throw new Error(`${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: EvidenceRef[] }

interface Candidate {
  id: string; nodeId: string; op: string; selector: string; actionType: string;
  riskHint: string; evidence: EvidenceRef[]; status: string; confidence: number;
}
interface InferResult { runId: string; candidates: Candidate[]; graphSummary: { nodes: number; edges: number; source?: string }; vaultRef: EvidenceRef }
interface Binding { blueprintOp: string; candidateId: string; selector: string; riskHint: string; confidence: number; alternatives: string[] }
interface MapResult {
  runId: string; satisfied: boolean; bindings: Binding[]; gaps: Array<{ missingOp: string; reason: string }>;
  surplus: Array<{ candidateId: string; op: string; reason: string }>; blueprintSource: string; vaultRef: EvidenceRef;
}
interface VerifyResult {
  runId: string; policy: { policyId: string; version: string; threshold: number; requiredProbes: number; evidenceRequired: boolean; source: string };
  promoted: string[]; stillDraft: string[]; results: Array<{ candidateId: string; probeCount: number; passed: number; score: number; status: string; gaps: string[] }>;
  candidates?: Candidate[]; vaultRef: EvidenceRef; resolutionNotes: string[];
}
interface Probe { candidateId: string; preState: WebmailState; postState: WebmailState; passed: boolean; evidence: EvidenceRef[]; note: string }

// ---- the gate ------------------------------------------------------------------

describe("GATE-Ω8 — the discovery-mind pipeline (compositions/discovery-mind.json)", () => {
  let c: Case;
  let inferResult: InferResult;
  let mapResult: MapResult;
  const captureIds: string[] = [];

  /** Root stands in for the Ω7 perception engine: capture spans land in the vault FIRST. */
  const captureEvidenceFor = (nodeId: string): EvidenceRef => ({ ns: DISCOVERY_NS, id: `capture:${nodeId}`, rev: 1 });

  beforeAll(async () => {
    c = await bootMind("gate", makeMindSpec("discovery-mind-gate", omegaTmp("omega-discovery-mind-test", `data-${Date.now()}`), { blueprintPath: join(OMEGA_ROOT, "packs/domain-email/plugin.json") }));
  });

  test("law eager, discovery pipeline dormant at boot (D-331); routes intact", () => {
    const st = c.host.router.status();
    const compartments = st.compartments as Record<string, { state: string }>;
    expect(compartments["vivim.law"]?.state).toBe("active");
    expect(st.dormant).toEqual(["discovery.inference", "discovery.mapping", "discovery.verification", "vivim.vault"]);
    expect(st.routedOps).toEqual(expect.arrayContaining([
      "discovery.infer@1", "discovery.map@1", "discovery.verify@1", ...VAULT_CONTRACTS, ...LAW_CONTRACTS,
    ]));
  });

  test("PERCEIVE — root (standing in for Ω7) appends capture spans to the vault, journaled as MUTATION", async () => {
    const graph = webmailGraphFixture(captureEvidenceFor);
    for (const node of graph.nodes) {
      await rootCall<VaultAppendResult>(c.host, "vault.append@1", {
        ns: DISCOVERY_NS, id: `capture:${node.id}`,
        data: { kind: "capture-span", node: node.id, label: node.label, fixture: "inline:webmail" },
        meta: { type: "capture-span", node: node.id },
      });
      captureIds.push(`capture:${node.id}`);
    }
    const rows = await rootCall<Array<{ id: string }>>(c.host, "vault.query@1", { ns: DISCOVERY_NS, filter: { idPrefix: "capture:" } });
    expect(rows).toHaveLength(WEBMAIL_NODES);
    // every capture append passed the law gate (vault.append@1 = MUTATION → allow + journal, principal root)
    const journaled = journalLines(c.vaultDir).filter((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "root");
    expect(journaled.length).toBe(WEBMAIL_NODES);
  });

  test("INFER — the graph becomes DRAFT candidates citing the capture evidence, persisted to the vault", async () => {
    const graph = webmailGraphFixture(captureEvidenceFor);
    const r = await rootCall<InferResult>(c.host, "discovery.infer@1", { graph, runId: "gate-1" });
    inferResult = r;
    expect(r.graphSummary.nodes).toBe(WEBMAIL_NODES);
    expect(r.candidates).toHaveLength(WEBMAIL_NODES);
    // every candidate: DRAFT, evidenced, selector carried
    for (const cand of r.candidates) {
      expect(cand.status).toBe("DRAFT");
      expect(cand.evidence).toHaveLength(1);
      expect(cand.evidence[0].ns).toBe(DISCOVERY_NS);
      expect(cand.selector.length).toBeGreaterThan(0);
      expect(cand.confidence).toBeGreaterThan(0);
      expect(cand.confidence).toBeLessThanOrEqual(1);
    }
    const byOp = new Map(r.candidates.map((cand) => [cand.op, cand]));
    expect(byOp.get("message.send")).toMatchObject({ riskHint: "EXTERNAL_MUTATION", actionType: "click" });
    expect(byOp.get("message.search")).toMatchObject({ riskHint: "READ", actionType: "click" });
    expect(byOp.get("message.move")).toMatchObject({ riskHint: "MUTATION", actionType: "click" });
    expect(byOp.get("message.list")).toMatchObject({ riskHint: "READ", actionType: "read" });
    // the candidate set is vault data: refs = the cited capture spans (provenance edges)
    const got = await rootCall<VaultGetResult>(c.host, "vault.get@1", { ns: DISCOVERY_NS, id: "candidates:gate-1" });
    const data = got.data as { candidates: Candidate[]; graphSummary: { nodes: number } };
    expect(data.candidates).toHaveLength(WEBMAIL_NODES);
    expect(got.refs).toHaveLength(WEBMAIL_NODES);
    expect(got.meta).toMatchObject({ type: "candidates", runId: "gate-1" });
    // the engine's append passed the gate under the ENGINE's principal (capability port:vault.append@1)
    const engine = journalLines(c.vaultDir).find((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "discovery.inference");
    expect(engine).toBeTruthy();
  });

  test("MAP — candidates solve against the email pack blueprint (read from packs/domain-email/plugin.json, READ ONLY)", async () => {
    const packManifest = JSON.parse(readFileSync(join(OMEGA_ROOT, "packs/domain-email/plugin.json"), "utf-8"));
    const r = await rootCall<MapResult>(c.host, "discovery.map@1", {
      candidates: inferResult.candidates, // bare array form
      blueprint: packManifest,
      runId: "gate-1",
      candidatesRef: inferResult.vaultRef,
    });
    mapResult = r;
    expect(r.satisfied).toBe(true);
    expect(r.gaps).toEqual([]);
    expect(r.bindings).toHaveLength(6); // send / list / search / read / move / receive — each bound to EXACTLY ONE candidate
    const send = r.bindings.find((b) => b.blueprintOp === "message.send@1")!;
    expect(send).toMatchObject({ riskHint: "EXTERNAL_MUTATION", selector: "form.compose button[type=submit]" });
    expect(send.candidateId).toBe(inferResult.candidates.find((cand) => cand.op === "message.send")!.id);
    // surplus: compose/reply/delete + the four typing contracts — recorded, NOT an error
    expect(r.surplus.map((s) => s.op).sort()).toEqual([
      "message.compose", "message.delete", "message.field.body", "message.field.search", "message.field.subject", "message.field.to", "message.reply",
    ]); // receive now BINDS (D-222); the surplus set is unchanged otherwise
    // persisted with provenance: the candidates object + the five bound capture spans
    const got = await rootCall<VaultGetResult>(c.host, "vault.get@1", { ns: DISCOVERY_NS, id: "mapping:gate-1" });
    expect(got.refs).toHaveLength(7); // candidates ref + 6 bound capture spans
    expect(got.refs).toContainEqual(inferResult.vaultRef);
    expect(got.meta).toMatchObject({ type: "mapping", runId: "gate-1" });
    const engine = journalLines(c.vaultDir).find((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "discovery.mapping");
    expect(engine).toBeTruthy();
  });

  test("VERIFY (3/3 passing probes per binding) — every mapped candidate PROMOTES on evidence, sealed in the vault", async () => {
    // the probe harness's own replay spans land in the vault first (probe evidence = vault refs)
    const replayEvidenceFor = (candidateId: string): EvidenceRef => ({ ns: DISCOVERY_NS, id: `replay:gate-1:${candidateId}`, rev: 1 });
    for (const b of mapResult.bindings) {
      await rootCall<VaultAppendResult>(c.host, "vault.append@1", {
        ns: DISCOVERY_NS, id: `replay:gate-1:${b.candidateId}`,
        data: { kind: "replay-span", candidateId: b.candidateId, op: b.blueprintOp, fixture: "webmail" },
        meta: { type: "replay-span", candidateId: b.candidateId },
      });
    }
    // the caller simulates executing each mapped op against the fixture and checks the postcondition
    const probes: Probe[] = buildProbes(mapResult.bindings, replayEvidenceFor);
    expect(probes).toHaveLength(18); // 3 probes × 6 bindings

    const r = await rootCall<VerifyResult>(c.host, "discovery.verify@1", {
      mapping: mapResult, probes, runId: "gate-1-ok",
      candidates: inferResult.candidates, candidatesRef: inferResult.vaultRef, mappingRef: mapResult.vaultRef,
    });
    // the thresholds came from the POLICY contribution the booted manifest carries — DATA, not constants
    expect(r.policy).toEqual({
      policyId: "discovery.promotion-policy", version: "1.0.0",
      threshold: 0.95, requiredProbes: 3, evidenceRequired: true,
      source: "manifest:discovery.promotion-policy@1",
    });
    expect(r.promoted).toHaveLength(6);
    expect(r.stillDraft).toEqual([]);
    for (const res of r.results) {
      expect(res.status).toBe("PROMOTED");
      expect(res.probeCount).toBe(3);
      expect(res.passed).toBe(3);
      expect(res.score).toBe(1);
      expect(res.gaps).toEqual([]);
    }
    expect(r.resolutionNotes).toEqual([]);
    // the returned report rewrites candidate status (copies; the vault object is append-only)
    for (const cand of r.candidates ?? []) {
      expect(cand.status).toBe(r.promoted.includes(cand.id) ? "PROMOTED" : "DRAFT");
    }
    // the promotion event carries the full proof chain: 5 replay spans + candidates + mapping
    const got = await rootCall<VaultGetResult>(c.host, "vault.get@1", { ns: DISCOVERY_NS, id: "promotion:gate-1-ok" });
    const data = got.data as { promoted: string[]; policy: { threshold: number } };
    expect(data.promoted).toHaveLength(6);
    expect(data.policy.threshold).toBe(0.95);
    expect(got.refs).toHaveLength(8); // 6 replay spans + candidates:gate-1 + mapping:gate-1
    expect(got.meta).toMatchObject({ type: "promotion", runId: "gate-1-ok" });
    const engine = journalLines(c.vaultDir).find((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "discovery.verification");
    expect(engine).toBeTruthy();
    // the Merkle chain seals the whole pipeline: 12 captures + candidates + mapping + 5 replays + promotion
    const verify = await rootCall<{ ok: boolean; entries: number; headHash: string }>(c.host, "vault.verify@1", {});
    expect(verify.ok).toBe(true);
    expect(verify.entries).toBe(WEBMAIL_NODES + 1 + 1 + mapResult.bindings.length + 1);
    expect(verify.headHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("VERIFY broken variant (1/3 fail on send) — the candidate STAYS DRAFT with a gap report; the rejection is evidence too", async () => {
    const replayEvidenceFor = (candidateId: string): EvidenceRef => ({ ns: DISCOVERY_NS, id: `replay:gate-1:${candidateId}`, rev: 1 });
    const sendCandidate = mapResult.bindings.find((b) => b.blueprintOp === "message.send@1")!.candidateId;
    const probes = buildProbes(mapResult.bindings, replayEvidenceFor, [{ candidateId: sendCandidate, probeIndex: 1 }]);
    const sendProbe = probes.find((p) => p.candidateId === sendCandidate && p.note.includes("2/3"));
    expect(sendProbe?.passed).toBe(false);
    expect(sendProbe?.note).toContain("BROKEN"); // the replay harness observed a silent drop

    const r = await rootCall<VerifyResult>(c.host, "discovery.verify@1", {
      mapping: mapResult, probes, runId: "gate-1-broken",
      candidates: inferResult.candidates, candidatesRef: inferResult.vaultRef, mappingRef: mapResult.vaultRef,
    });
    expect(r.promoted).toHaveLength(5); // everything except send promotes (6 bindings now)
    expect(r.stillDraft).toEqual([sendCandidate]);
    const send = r.results.find((res) => res.candidateId === sendCandidate)!;
    expect(send.status).toBe("DRAFT");
    expect(send.probeCount).toBe(3);
    expect(send.passed).toBe(2);
    expect(send.score).toBe(0.67);
    expect(send.gaps).toEqual(["score 0.67 < policy.threshold 0.95"]);
    // confidence 0.9 on the send candidate and it STILL stays DRAFT — confidence never promotes
    expect(mapResult.bindings.find((b) => b.candidateId === sendCandidate)!.confidence).toBeGreaterThanOrEqual(0.9);
    // the rejection event is persisted (the gap is data)
    const got = await rootCall<VaultGetResult>(c.host, "vault.get@1", { ns: DISCOVERY_NS, id: "promotion:gate-1-broken" });
    const data = got.data as { promoted: string[]; stillDraft: string[] };
    expect(data.stillDraft).toEqual([sendCandidate]);
  });

  test("INPUT TOLERANCE — a graph passed as a VAULT REF resolves through the port (the Ω7 output form)", async () => {
    const graph = webmailGraphFixture(captureEvidenceFor);
    const appended = await rootCall<VaultAppendResult>(c.host, "vault.append@1", {
      ns: DISCOVERY_NS, id: "graph:webmail", data: graph, meta: { type: "application-graph", fixture: "webmail" },
    });
    const r = await rootCall<InferResult>(c.host, "discovery.infer@1", {
      graph: { ns: DISCOVERY_NS, id: "graph:webmail", rev: appended.rev },
      runId: "gate-2",
    });
    expect(r.candidates).toHaveLength(WEBMAIL_NODES);
    expect(r.graphSummary.source).toBe(`vault:${DISCOVERY_NS}/graph:webmail@${appended.rev}`);
  });

  test("the SHIPPED compositions/discovery-mind.json boots; mapping falls back to the config blueprint path", async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/discovery-mind.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-discovery-mind-test", `shipped-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const shipped = JSON.parse(JSON.stringify(spec));
    const vaultEntry = shipped.entries.find((e: { id: string }) => e.id === "vivim.vault");
    vaultEntry.config.dataDir = join(root, "vault-data");
    // the shipped spec's relative blueprintPath resolves against the host cwd (repo root under bun test)
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(shipped, join(SPEC, ".."), vaultDir, rootKey);
    const host = await bootComposition(recipe, buildDir, vaultDir);
    hosts.push(host);
    try {
      const st = host.router.status();
      expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
      expect(st.dormant).toEqual([
        "discovery.inference", "discovery.mapping", "discovery.verification",
        // W1 (D-385): the parser-contribution carriers ride dormant with empty grants
        "provider.llm", "vivim.chat",
        "vivim.providers", "vivim.vault",
      ]); // D-331: verified-but-unspawned; the infer call below is the first touch
      // perception + inference on the shipped composition, then map WITHOUT a payload
      // blueprint — the engine reads config.blueprintPath (the pack's CONTRACT
      // declarations consumed as DATA from a fixed path)
      const graph = webmailGraphFixture(captureEvidenceFor);
      const inferred = await rootCall<InferResult>(host, "discovery.infer@1", { graph, runId: "shipped-1" });
      const mapped = await rootCall<MapResult>(host, "discovery.map@1", {
        candidates: inferred.candidates, runId: "shipped-1", candidatesRef: inferred.vaultRef,
      });
      expect(mapped.satisfied).toBe(true);
      expect(mapped.bindings).toHaveLength(6);
      expect(mapped.blueprintSource).toContain("domain-email");
    } finally {
      const i = hosts.indexOf(host);
      if (i >= 0) hosts.splice(i, 1);
      await host.shutdown().catch(() => {});
    }
  });

  test("Ω7's committed fixture data (fixtures/webmail-inbox/page.json) drives INFER+MAP honestly — gaps are data, never crashes", async () => {
    const graph = fixtureWebmailGraph(captureEvidenceFor);
    if (!graph) {
      // Ω7 mid-flight: their dirs are off-limits, their DATA shape is not; the
      // inline graph above keeps the gate deterministic in the meantime.
      console.log("[GATE-Ω8] fixtures/webmail-inbox absent — inline webmail graph carried the gate");
      return;
    }
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3); // a real DOM walk found controls
    // perception over the fixture nodes
    for (const node of graph.nodes) {
      await rootCall<VaultAppendResult>(c.host, "vault.append@1", {
        ns: DISCOVERY_NS, id: `capture:${node.id}`,
        data: { kind: "capture-span", node: node.id, label: node.label, fixture: "webmail-inbox" },
        meta: { type: "capture-span", node: node.id },
      });
    }
    const r = await rootCall<InferResult>(c.host, "discovery.infer@1", { graph, runId: "fixture-1" });
    expect(r.candidates.length).toBeGreaterThanOrEqual(3);
    for (const cand of r.candidates) {
      expect(cand.evidence.length).toBeGreaterThan(0); // evidence mandatory, even from a real capture
      expect(cand.status).toBe("DRAFT");
    }
    // core webmail surfaces are present in the committed fixture: send + search buttons, the message list
    const ops = new Set(r.candidates.map((cand) => cand.op));
    expect(ops.has("message.send")).toBe(true);
    expect(ops.has("message.search")).toBe(true);
    expect(ops.has("message.list")).toBe(true);
    // map against the email blueprint: EVERY op is either bound or gapped (constraint
    // solving is complete + honest — a surface the fixture genuinely lacks is a GAP)
    const packManifest = JSON.parse(readFileSync(join(OMEGA_ROOT, "packs/domain-email/plugin.json"), "utf-8"));
    const m = await rootCall<MapResult>(c.host, "discovery.map@1", { candidates: r.candidates, blueprint: packManifest, runId: "fixture-1" });
    const bound = new Set(m.bindings.map((b) => b.blueprintOp));
    const gapped = new Set(m.gaps.map((g) => g.missingOp));
    for (const op of BLUEPRINT_OPS) {
      expect(bound.has(op) !== gapped.has(op)).toBe(true); // exactly one of bound/gapped
    }
    expect(bound.has("message.send@1")).toBe(true);
    for (const gap of m.gaps) expect(gap.reason.length).toBeGreaterThan(0);
    // the fixture pipeline is persisted too
    expect(m.vaultRef).toMatchObject({ ns: DISCOVERY_NS, id: "mapping:fixture-1" });
  });
});

// A tiny sanity guard on the simulator itself (the probe harness must be honest):
describe("GATE-Ω8 — the probe harness simulator is honest", () => {
  test("message.send postcondition: outbox grows by exactly one; unknown ops fail closed", () => {
    const state = initialWebmailState();
    const send = applyAction(state, "message.send");
    expect(send.passed).toBe(true);
    expect(send.post.outbox).toHaveLength(1);
    expect(send.post.outbox[0].folder).toBe("outbox");
    const unknown = applyAction(state, "message.nope");
    expect(unknown.passed).toBe(false);
    expect(JSON.stringify(unknown.post)).toBe(JSON.stringify(unknown.pre));
  });

  test("move/read/search/list postconditions on the initial webmail state", () => {
    const state = initialWebmailState();
    expect(applyAction(state, "message.list").passed).toBe(true);
    expect(applyAction(state, "message.search", { q: "merkle" }).passed).toBe(true);
    expect(applyAction(state, "message.read", { id: "m1" }).passed).toBe(true);
    const moved = applyAction(state, "message.move", { id: "m2" });
    expect(moved.passed).toBe(true);
    expect(moved.post.archive).toHaveLength(1);
    expect(moved.post.inbox).toHaveLength(1);
  });
});
