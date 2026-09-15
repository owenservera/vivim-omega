// discovery.perception — index.ts (Ω7), the perception engine (wiring only).
//
// ENGINE contribution discovery.perceive@1 (see plugin.json for the SCHEMA
// contributions that define the ApplicationGraph evidence model):
//
//   discovery.perceive@1 {fixture: {name, pageRef? {ns, id}}}
//     → {graphId: {ns, id, rev, cid}, nodeCount, edgeCount}
//
// The op is an ORDINARY plugin op — no special spine hooks. It:
//   1. loads the captured page JSON from the config-passed fixtures dir
//      (ctx.config.fixturesDir — in-sandbox fixtures, never network);
//   2. appends the page JSON bytes as a VAULT EVIDENCE OBJECT
//      (default ns "discovery", id "capture:<name>") and reads them back
//      through port:vault.get@1 (integrity self-check — the round trip must
//      return the exact bytes);
//   3. walks the DOM tree classifying nodes (src/model.ts — pure), every node
//      citing the capture revision (P5: provenance is constitutional);
//   4. appends the graph itself to the vault (ns "discovery",
//      id "graph:<name>") with a vault-level refs edge to the capture;
//   5. returns {graphId, nodeCount, edgeCount: 0}.
//
// Handlers throw on bad payloads/failed port calls — the shim converts throws
// into DEGRADED returns at the port boundary (fail-closed propagation).
// Determinism: no clock, no random — same fixture bytes → same graph bytes
// (the only run-varying field is the vault revision number, which is 1 in a
// fresh vault; the CAS cid is content-addressed and identical across runs).
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { buildGraph, type PageCapture } from "./model.ts";

const DISCOVERY_NS = "discovery";

// ---- vault port plumbing (fail-closed) -----------------------------------------

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

// ---- config + payload validation ------------------------------------------------

/** fixturesDir from composition config (data passthrough, never authority). Relative paths resolve against CWD. */
function resolveFixturesDir(config: Record<string, unknown> | undefined | null): string {
  const raw = config?.fixturesDir;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("discovery.perceive@1: ctx.config.fixturesDir must be a non-empty string (composition passthrough)");
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

/** Fixture names are single path segments — no traversal, ever. */
const FIXTURE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function requireString(op: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${op}: ${field} must be a non-empty string`);
  return value;
}

function requireVaultRef(op: string, field: string, value: unknown): { ns: string; id: string } {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${op}: ${field} must be an object {ns, id}`);
  }
  const ref = value as Record<string, unknown>;
  return { ns: requireString(op, `${field}.ns`, ref.ns), id: requireString(op, `${field}.id`, ref.id) };
}

// ---- the engine op ----------------------------------------------------------------

startPlugin(definePlugin({
  onInit: (ctx) => {
    const dir = typeof (ctx.config as Record<string, unknown> | undefined)?.fixturesDir === "string"
      ? String((ctx.config as Record<string, unknown>).fixturesDir)
      : "<unset>";
    ctx.log(`discovery.perception up (Ω7) — fixturesDir=${dir}, vault ns "${DISCOVERY_NS}", zero LLM, zero network`);
  },

  ops: {
    "discovery.perceive@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "discovery.perceive@1";
      if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`${op}: payload must be an object`);
      }
      const p = payload as Record<string, unknown>;
      if (p.fixture === null || p.fixture === undefined || typeof p.fixture !== "object" || Array.isArray(p.fixture)) {
        throw new Error(`${op}: payload.fixture must be an object {name, pageRef?}`);
      }
      const f = p.fixture as Record<string, unknown>;
      const name = requireString(op, "fixture.name", f.name);
      if (!FIXTURE_NAME.test(name)) {
        throw new Error(`${op}: fixture.name must match ^[a-z0-9][a-z0-9-]*$ (single path segment, got "${name}")`);
      }
      const pageRef = f.pageRef === undefined || f.pageRef === null
        ? { ns: DISCOVERY_NS, id: `capture:${name}` }
        : requireVaultRef(op, "fixture.pageRef", f.pageRef);

      // 1. load the captured page (fixture bytes — the capture stands in for a live CDP snapshot)
      const fixturesDir = resolveFixturesDir(ctx.config);
      const raw = readFileSync(join(fixturesDir, name, "page.json"), "utf-8");
      let page: PageCapture;
      try {
        page = JSON.parse(raw) as PageCapture;
      } catch (e) {
        throw new Error(`${op}: fixture ${name}/page.json is not valid JSON: ${String(e)}`);
      }
      if (page === null || typeof page !== "object" || typeof page.capturedAt !== "number" || !Number.isInteger(page.capturedAt)) {
        throw new Error(`${op}: fixture ${name}/page.json must carry an integer capturedAt`);
      }
      if (page.root === null || typeof page.root !== "object" || typeof page.root.tag !== "string") {
        throw new Error(`${op}: fixture ${name}/page.json must carry a root DOM node {tag}`);
      }
      page.fixture = page.fixture ?? name;

      // 2. append the capture bytes as a vault evidence object; read them back (integrity self-check)
      const capture = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: pageRef.ns,
        id: pageRef.id,
        data: raw,
        meta: { type: "capture", kind: "page", fixture: name, bytes: Buffer.byteLength(raw, "utf-8") },
        refs: [],
      });
      const readBack = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: pageRef.ns, id: pageRef.id, rev: capture.rev });
      if (readBack.data !== raw) {
        throw new Error(`${op}: capture round-trip mismatch — vault.get returned different bytes than were appended (rev ${capture.rev})`);
      }

      // 3. walk + classify; every node cites the capture revision (evidence is constitutional)
      // D-357 G0 fix: the evidence ref carries the {ns, id, rev} triple (inference's
      // normalizeEvidence requirement) + the derived casRef — casRef-only refs were
      // silently dropped downstream, zeroing the perceive→infer seam.
      const captureRef = {
        ns: pageRef.ns,
        id: pageRef.id,
        rev: capture.rev,
        casRef: `${pageRef.ns}/${pageRef.id}@${capture.rev}`,
      };
      const graph = buildGraph(page, [captureRef]);

      // 4. persist the graph in the vault, with a vault-level provenance edge to the capture
      const graphId = { ns: DISCOVERY_NS, id: `graph:${name}` };
      const appended = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: graphId.ns,
        id: graphId.id,
        data: graph,
        meta: { type: "graph", fixture: name, nodeCount: graph.nodes.length, evidenceObject: captureRef.casRef },
        refs: [{ ns: pageRef.ns, id: pageRef.id, rev: capture.rev }],
      });

      // 5. result — structured graphId so callers (Ω8/Ω9) can vault.get it directly
      return {
        graphId: { ns: graphId.ns, id: graphId.id, rev: appended.rev, cid: appended.cid },
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    },
  },
}));