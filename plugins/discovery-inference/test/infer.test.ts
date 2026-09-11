// discovery.inference — test/infer.test.ts (Ω8)
//
// Unit evidence for the inference core:
//   • inline graph → candidates with correct ops / actionTypes / riskHints /
//     confidence tiers, EVERY candidate citing the node's evidence refs
//   • EVIDENCE IS MANDATORY: nodes without evidence yield NO candidate
//   • handler behavior through a fake port (inline graph + graph-as-vault-ref
//     resolution + fail-closed vault append), the manifest declares the
//     SCHEMA contribution discovery.surfacecontract@1 and parses green through
//     the sdk mirror (borrowed by relative path like the pack test does).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inferCandidates, CONFIDENCE_EXACT, CONFIDENCE_PARTIAL, CONFIDENCE_GENERIC } from "../src/infer.ts";
import { normalizeGraph, isVaultRef, looksLikeGraph, type GraphNode } from "../src/model.ts";
import { def } from "../src/index.ts";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "..");

// ---- fixtures ---------------------------------------------------------------

const EV = [
  { ns: "discovery", id: "capture:btn-send", rev: 1 },
  { ns: "discovery", id: "capture:btn-compose", rev: 1 },
  { ns: "discovery", id: "capture:btn-reply", rev: 1 },
  { ns: "discovery", id: "capture:btn-delete", rev: 1 },
  { ns: "discovery", id: "capture:btn-search", rev: 1 },
  { ns: "discovery", id: "capture:btn-archive", rev: 1 },
  { ns: "discovery", id: "capture:btn-open", rev: 1 },
  { ns: "discovery", id: "capture:field-search", rev: 1 },
  { ns: "discovery", id: "capture:field-subject", rev: 1 },
  { ns: "discovery", id: "capture:field-to", rev: 1 },
  { ns: "discovery", id: "capture:field-body", rev: 1 },
  { ns: "discovery", id: "capture:list-inbox", rev: 1 },
];
const ev = (i: number) => [EV[i]];

function graphOf(nodes: Array<Partial<GraphNode> & { id: string }>) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.kind ?? "button",
      label: n.label ?? "",
      selectorHint: n.selectorHint ?? "#x",
      evidence: n.evidence ?? [],
    })),
    edges: [],
  };
}

// ---- the pure core ----------------------------------------------------------

describe("Ω8 discovery.inference — inferCandidates (pure)", () => {
  test("buttons with action words → click contracts with label-derived ops and risk hints", () => {
    const g = normalizeGraph(graphOf([
      { id: "btn-send", kind: "button", label: "Send", selectorHint: "form.compose button[type=submit]", evidence: ev(0) },
      { id: "btn-compose", kind: "button", label: "Compose", selectorHint: "button.new", evidence: ev(1) },
      { id: "btn-reply", kind: "button", label: "Reply", selectorHint: "button.reply", evidence: ev(2) },
      { id: "btn-delete", kind: "button", label: "Delete", selectorHint: "button.delete", evidence: ev(3) },
      { id: "btn-search", kind: "button", label: "Search", selectorHint: "button.search", evidence: ev(4) },
      { id: "btn-archive", kind: "button", label: "Move to archive", selectorHint: "button.archive", evidence: ev(5) },
      { id: "btn-open", kind: "button", label: "Open", selectorHint: "button.open", evidence: ev(6) },
    ])).graph;
    const candidates = inferCandidates(g);
    const byNode = new Map(candidates.map((c) => [c.nodeId, c]));
    expect(candidates).toHaveLength(7);
    expect(byNode.get("btn-send")).toMatchObject({ op: "message.send", actionType: "click", riskHint: "EXTERNAL_MUTATION", status: "DRAFT" });
    expect(byNode.get("btn-compose")).toMatchObject({ op: "message.compose", riskHint: "MUTATION" });
    expect(byNode.get("btn-reply")).toMatchObject({ op: "message.reply", riskHint: "EXTERNAL_MUTATION" });
    expect(byNode.get("btn-delete")).toMatchObject({ op: "message.delete", riskHint: "EXTERNAL_MUTATION" });
    expect(byNode.get("btn-search")).toMatchObject({ op: "message.search", riskHint: "READ" });
    expect(byNode.get("btn-archive")).toMatchObject({ op: "message.move", riskHint: "MUTATION" }); // "move" partial match
    expect(byNode.get("btn-open")).toMatchObject({ op: "message.read", riskHint: "READ" });
    // every candidate carries the node's selector + evidence (cited, copied)
    for (const c of candidates) {
      expect(c.selector.length).toBeGreaterThan(0);
      expect(c.evidence.length).toBe(1);
    }
    // ids are unique
    expect(new Set(candidates.map((c) => c.id)).size).toBe(7);
  });

  test("confidence tiers: exact domain word 0.9, partial 0.6, generic 0.4", () => {
    const g = normalizeGraph(graphOf([
      { id: "b1", kind: "button", label: "Send", evidence: ev(0) },          // exact token → 0.9
      { id: "b2", kind: "button", label: "Resend now", evidence: ev(5) },    // substring ("send" inside "resend") → 0.6
      { id: "b3", kind: "button", label: "Forward", evidence: ev(2) },        // no action word → generic 0.4
      { id: "l1", kind: "list", label: "Message list", evidence: ev(11) },    // exact "list" → 0.9
      { id: "l2", kind: "list", label: "Inbox", evidence: ev(11) },           // partial noun → 0.6
      { id: "l3", kind: "list", label: "Folders", evidence: ev(11) },         // generic → 0.4
    ])).graph;
    const byNode = new Map(inferCandidates(g).map((c) => [c.nodeId, c]));
    expect(byNode.get("b1")!.confidence).toBe(CONFIDENCE_EXACT);
    expect(byNode.get("b2")!.confidence).toBe(CONFIDENCE_PARTIAL);
    expect(byNode.get("b3")!.confidence).toBe(CONFIDENCE_GENERIC);
    expect(byNode.get("b3")).toMatchObject({ op: "message.forward", riskHint: "EXTERNAL_MUTATION" }); // fail-closed hint for unknown labels
    expect(byNode.get("l1")!.confidence).toBe(CONFIDENCE_EXACT);
    expect(byNode.get("l2")!.confidence).toBe(CONFIDENCE_PARTIAL);
    expect(byNode.get("l3")!.confidence).toBe(CONFIDENCE_GENERIC);
    expect(byNode.get("l1")).toMatchObject({ op: "message.list", actionType: "read", riskHint: "READ" });
  });

  test("fields → typing contracts; search field READ, compose fields MUTATION", () => {
    const g = normalizeGraph(graphOf([
      { id: "f-search", kind: "field", label: "Search", selectorHint: "input.search", evidence: ev(7) },
      { id: "f-subject", kind: "field", label: "Subject", selectorHint: "input.subject", evidence: ev(8) },
      { id: "f-to", kind: "field", label: "To", selectorHint: "input.to", evidence: ev(9) },
      { id: "f-body", kind: "field", label: "Body", selectorHint: "textarea.body", evidence: ev(10) },
    ])).graph;
    const byNode = new Map(inferCandidates(g).map((c) => [c.nodeId, c]));
    expect(byNode.get("f-search")).toMatchObject({ op: "message.field.search", actionType: "type", riskHint: "READ", confidence: 0.9 });
    expect(byNode.get("f-subject")).toMatchObject({ op: "message.field.subject", actionType: "type", riskHint: "MUTATION" });
    expect(byNode.get("f-to")).toMatchObject({ op: "message.field.to", riskHint: "MUTATION" });
    expect(byNode.get("f-body")).toMatchObject({ op: "message.field.body", riskHint: "MUTATION" });
  });

  test("EVIDENCE IS MANDATORY: no evidence refs → no candidate (the hallucination guard)", () => {
    const g = normalizeGraph(graphOf([
      { id: "btn-evidenced", kind: "button", label: "Send", evidence: ev(0) },
      { id: "btn-bare", kind: "button", label: "Send", evidence: [] },        // empty evidence → dropped
      { id: "btn-none", kind: "button", label: "Compose", evidence: undefined as never }, // no evidence field → dropped
      { id: "list-bare", kind: "list", label: "Inbox", evidence: [] },
    ])).graph;
    const candidates = inferCandidates(g);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].nodeId).toBe("btn-evidenced");
  });

  test("label normalization: case-insensitive labels, dotted labels bind directly, evidence deduped", () => {
    const dup = [{ ns: "discovery", id: "capture:x", rev: 2 }, { ns: "discovery", id: "capture:x", rev: 2 }, { ns: "discovery", id: "capture:x", rev: 3 }];
    const g = normalizeGraph(graphOf([
      { id: "b-upper", kind: "button", label: "  SEND  ", evidence: ev(0) },
      { id: "b-dotted", kind: "button", label: "message.send", evidence: dup },
    ])).graph;
    const byNode = new Map(inferCandidates(g).map((c) => [c.nodeId, c]));
    expect(byNode.get("b-upper")!.op).toBe("message.send");
    expect(byNode.get("b-dotted")).toMatchObject({ op: "message.send", riskHint: "EXTERNAL_MUTATION", confidence: CONFIDENCE_EXACT });
    expect(byNode.get("b-dotted")!.evidence).toHaveLength(2); // deduped, both revisions kept
  });

  test("tolerant graph: missing edges, unknown kinds, malformed nodes — skipped and counted, not fatal", () => {
    const raw = {
      nodes: [
        { id: "ok", kind: "button", label: "Send", evidence: ev(0) },
        { kind: "button", label: "no id", evidence: ev(1) },   // malformed: no id
        { id: "nolabel", kind: "button", evidence: ev(2) },     // malformed: no label
        { id: "unknown-kind", kind: "region", label: "banner", evidence: ev(3) }, // no inference signal
      ],
      // no edges key at all
    };
    const { graph, summary } = normalizeGraph(raw);
    expect(graph.edges).toEqual([]);
    expect(summary.nodes).toBe(2); // "ok" + "unknown-kind" (normalized; the kind has no inference signal)
    expect(summary.skippedNodes).toBe(2); // no-id node + labelless node
    const candidates = inferCandidates(graph);
    expect(candidates).toHaveLength(1); // region has no signal; only the Send button survives
    expect(candidates[0].nodeId).toBe("ok");
  });

  test("vault-ref detection: {ns,id,rev} without nodes/edges is a ref; a nodes array is a graph", () => {
    expect(isVaultRef({ ns: "discovery", id: "graph:1", rev: 3 })).toBe(true);
    expect(isVaultRef({ nodes: [], ns: "discovery", id: "g", rev: 1 })).toBe(false);
    expect(looksLikeGraph({ nodes: [] })).toBe(true);
    expect(looksLikeGraph({ edges: [] })).toBe(false);
    expect(looksLikeGraph({ ns: "discovery", id: "g", rev: 1 })).toBe(false);
  });
});

// ---- the handler (fake port; startPlugin no-ops outside a worker) -----------

function fakeCtx(opts: { graphInVault?: unknown; appendOk?: boolean } = {}): { ctx: PluginContext; calls: Array<{ op: string; payload: unknown }> } {
  const calls: Array<{ op: string; payload: unknown }> = [];
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
  const ctx: PluginContext = {
    manifest,
    capabilities: ["port:vault.append@1", "port:vault.get@1"],
    config: {},
    port: {
      call: async (op: string, payload?: unknown) => {
        calls.push({ op, payload });
        if (op === "vault.get@1") {
          if (opts.appendOk === false) return { ok: false, error: "REFUSED", detail: "no capability token for vault.get@1" };
          return { ok: true, value: { rev: 3, cid: "sha256:x", data: opts.graphInVault ?? null, meta: null, refs: [] } };
        }
        if (op === "vault.append@1") {
          if (opts.appendOk === false) return { ok: false, error: "REFUSED", detail: "no capability token for vault.append@1" };
          return { ok: true, value: { rev: 1, cid: "sha256:y", seq: 1 } };
        }
        return { ok: false, error: "REFUSED", detail: `unexpected op ${op}` };
      },
    },
    log: () => {},
  };
  return { ctx, calls };
}

const META: CallMeta = { causationId: "c_test", deadlineMs: 5000, from: "root" };

describe("Ω8 discovery.inference — handler (discovery.infer@1 via fake port)", () => {
  const inlineGraph = {
    nodes: [
      { id: "btn-send", kind: "button", label: "Send", selectorHint: "button.send", evidence: ev(0) },
      { id: "field-search", kind: "field", label: "Search", selectorHint: "input.search", evidence: ev(7) },
    ],
    edges: [],
  };

  test("inline graph → candidates persisted to the vault (ns discovery, id candidates:<runId>, refs = cited evidence)", async () => {
    const { ctx, calls } = fakeCtx();
    const r = await def.ops!["discovery.infer@1"]!({ graph: inlineGraph, runId: "run-unit-1" }, ctx, META);
    const v = r as { runId: string; candidates: unknown[]; vaultRef: { ns: string; id: string; rev: number } };
    expect(v.runId).toBe("run-unit-1");
    expect(v.candidates).toHaveLength(2);
    expect(v.vaultRef).toEqual({ ns: "discovery", id: "candidates:run-unit-1", rev: 1 });
    const append = calls.find((c) => c.op === "vault.append@1");
    expect(append).toBeTruthy();
    expect(append!.payload).toMatchObject({
      ns: "discovery",
      id: "candidates:run-unit-1",
      meta: { type: "candidates", runId: "run-unit-1" },
    });
    const refs = (append!.payload as { refs: unknown[] }).refs;
    expect(refs).toHaveLength(2); // the two cited capture spans, deduped
  });

  test("graph passed as a VAULT REF resolves through vault.get@1 (input tolerance)", async () => {
    const { ctx, calls } = fakeCtx({ graphInVault: inlineGraph });
    const r = await def.ops!["discovery.infer@1"]!({ graph: { ns: "discovery", id: "graph:webmail", rev: 3 }, runId: "run-unit-2" }, ctx, META);
    const v = r as { candidates: unknown[]; vaultRef: { id: string } };
    expect(v.candidates).toHaveLength(2);
    const get = calls.find((c) => c.op === "vault.get@1");
    expect(get!.payload).toEqual({ ns: "discovery", id: "graph:webmail", rev: 3 });
  });

  test("fail-closed: a refused vault.append propagates as a thrown error (DEGRADED at the boundary)", async () => {
    const { ctx } = fakeCtx({ appendOk: false });
    await expect(def.ops!["discovery.infer@1"]!({ graph: inlineGraph, runId: "run-unit-3" }, ctx, META)).rejects.toThrow(/vault.append@1 REFUSED/);
  });

  test("fail-closed: a vault-ref graph that cannot be resolved (REFUSED get) throws", async () => {
    const { ctx } = fakeCtx({ appendOk: false });
    await expect(def.ops!["discovery.infer@1"]!({ graph: { ns: "discovery", id: "graph:gone", rev: 9 }, runId: "run-unit-4" }, ctx, META))
      .rejects.toThrow(/vault.get@1 REFUSED/);
  });

  test("payload validation: non-object payload and missing graph throw (DEGRADED register upstream)", async () => {
    const { ctx } = fakeCtx();
    await expect(def.ops!["discovery.infer@1"]!(null, ctx, META)).rejects.toThrow(/payload must be an object/);
    await expect(def.ops!["discovery.infer@1"]!({ runId: "x" }, ctx, META)).rejects.toThrow(/graph is required/);
    await expect(def.ops!["discovery.infer@1"]!({ graph: 42, runId: "x" }, ctx, META)).rejects.toThrow(/graph must be/);
  });
});

// ---- the manifest (declarations are the product) ------------------------------

describe("Ω8 discovery.inference — manifest declarations", () => {
  const raw = readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8");

  test("parses + validates green through the sdk mirror (borrowed by relative path)", () => {
    const r = parseManifest(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateManifest(r.value)).toEqual([]);
  });

  test("ENGINE contribution discovery.infer@1 is routable; SCHEMA contribution declares the candidate shape", () => {
    const m = JSON.parse(raw);
    expect(m.contributions.engine).toEqual([
      expect.objectContaining({ kind: "engine", id: "discovery.infer", version: "1" }),
    ]);
    const schema = m.contributions.schema[0];
    expect(schema.id).toBe("discovery.surfacecontract");
    expect(schema.version).toBe("1");
    const fields = new Map((schema.fields as Array<{ name: string; required?: boolean }>).map((f) => [f.name, f.required]));
    for (const required of ["id", "nodeId", "op", "selector", "actionType", "riskHint", "evidence", "status", "confidence"]) {
      expect(fields.get(required)).toBe(true);
    }
  });

  test("capability request: append + get on the vault port (the engine's only outputs live in the vault)", () => {
    const m = JSON.parse(raw);
    expect(m.capabilities.requested).toEqual(["port:vault.append@1", "port:vault.get@1"]);
  });
});
