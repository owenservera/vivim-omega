// discovery.mapping — index.ts (Ω8 + D-308), the ENGINE plugin wiring.
//
// Ops exposed (ENGINE contributions, see plugin.json):
//   discovery.map@1 {candidates, blueprint?, runId?, candidatesRef?}
//     → {satisfied, bindings[], gaps[], surplus[], stats, vaultRef}
//   discovery.variations@1 {candidates, providerId, runId?, discoveredAt?}
//     → {variations[], byContract, vaultRef} — same candidates grouped by
//     canonical contract id as co-promotable Variations (D-308)
//
// INPUT: `candidates` is the discovery.infer@1 result — accepted as the bare
// array OR the whole result object ({runId, candidates, ...}) — and `blueprint`
// is the domain pack's manifest (parsed plugin.json) OR a normalized
// {ops: [...]} doc, passed as payload; when omitted, the engine reads the
// fixed path in its composition config (blueprintPath, resolved relative to
// the host process cwd; absolute paths pass through). The engine never
// imports pack code — the blueprint is declarations, consumed as data.
//
// OUTPUT (the engine's only output): the mapping report persisted to the
// USER'S VAULT — one append per run: {ns: "discovery", id: "mapping:<runId>",
// data: the report, meta: {type: "mapping"}, refs: candidatesRef + the bound
// candidates' evidence refs} (provenance edges, Merkle-sealed).
//
// Handlers throw on bad payloads / failed port calls — the shim converts
// throws into DEGRADED returns (fail-closed propagation).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { normalizeBlueprint, type Blueprint } from "./blueprint.ts";
import { solveMapping, type CandidateLike, type MappingReport } from "./solve.ts";
import { deriveVariations, groupVariations } from "./variations.ts";

export const DISCOVERY_NS = "discovery";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface EvidenceRefShape { ns: string; id: string; rev: number }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`discovery.mapping: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function requirePayloadObject(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("discovery.map@1: payload must be an object {candidates, blueprint?}");
  }
  return payload as Record<string, unknown>;
}

/** Tolerant candidates input: the bare array, the whole infer result object, or {candidates: [...]}. */
function normalizeCandidates(v: unknown): CandidateLike[] {
  let list: unknown = v;
  if (list !== null && typeof list === "object" && !Array.isArray(list)) {
    const obj = list as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) list = obj.candidates;
  }
  if (!Array.isArray(list)) {
    throw new Error("discovery.map@1: candidates must be an array (or an object with a candidates array — the discovery.infer@1 result)");
  }
  const out: CandidateLike[] = [];
  for (const c of list) {
    if (c === null || typeof c !== "object" || Array.isArray(c)) {
      throw new Error("discovery.map@1: each candidate must be an object (discovery.surfacecontract@1)");
    }
    const o = c as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.length === 0) throw new Error("discovery.map@1: candidate.id must be a non-empty string");
    if (typeof o.op !== "string" || o.op.length === 0) throw new Error(`discovery.map@1: candidate ${o.id}: op must be a non-empty string`);
    const selector = typeof o.selector === "string" ? o.selector : "";
    const riskHint = typeof o.riskHint === "string" ? o.riskHint : "";
    const evidence = Array.isArray(o.evidence)
      ? (o.evidence.filter((e) =>
        e !== null && typeof e === "object" && !Array.isArray(e)
        && typeof (e as Record<string, unknown>).ns === "string"
        && typeof (e as Record<string, unknown>).id === "string"
        && typeof (e as Record<string, unknown>).rev === "number",
      ) as EvidenceRefShape[])
      : [];
    const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : undefined;
    out.push({ id: o.id, op: o.op, selector, riskHint, evidence, confidence });
    if (typeof o.channel === "string" && o.channel.length > 0) out[out.length - 1]!.channel = o.channel;
    if (typeof o.status === "string" && o.status.length > 0) out[out.length - 1]!.status = o.status;
  }
  return out;
}

/** Blueprint input: payload first (pack manifest or normalized doc), then the config's fixed path. */
function loadBlueprint(ctx: PluginContext, payloadBlueprint: unknown): Blueprint {
  if (payloadBlueprint !== undefined && payloadBlueprint !== null) {
    return normalizeBlueprint(payloadBlueprint, "payload");
  }
  const path = ctx.config["blueprintPath"];
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("discovery.map@1: blueprint is required — pass it as payload or set config.blueprintPath in the composition entry");
  }
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  let text: string;
  try {
    text = readFileSync(abs, "utf-8");
  } catch (e) {
    throw new Error(`discovery.map@1: cannot read blueprintPath ${abs} (cwd ${process.cwd()}): ${String(e)}`);
  }
  return normalizeBlueprint(JSON.parse(text), `config:${path}`);
}

/** The provenance refs for the mapping append: candidatesRef (when supplied) + bound candidates' evidence. */
function mappingRefs(candidatesRef: unknown, report: MappingReport, candidates: CandidateLike[]): EvidenceRefShape[] {
  const out: EvidenceRefShape[] = [];
  const seen = new Set<string>();
  const push = (r: EvidenceRefShape) => {
    const key = `${r.ns}|${r.id}|${r.rev}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...r });
  };
  if (candidatesRef !== null && candidatesRef !== undefined) {
    const o = candidatesRef as Record<string, unknown>;
    if (typeof o.ns === "string" && typeof o.id === "string" && typeof o.rev === "number") {
      push({ ns: o.ns, id: o.id, rev: o.rev });
    }
  }
  const boundIds = new Set(report.bindings.map((b) => b.candidateId));
  for (const c of candidates) {
    if (!boundIds.has(c.id)) continue;
    for (const r of c.evidence ?? []) push({ ns: r.ns, id: r.id, rev: r.rev });
  }
  return out;
}

function optionalRunId(v: unknown): string {
  if (v === undefined || v === null) return `run-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (typeof v !== "string" || v.length === 0 || v.length > 128) {
    throw new Error("discovery.map@1: runId must be a non-empty string (≤128 chars) when provided");
  }
  return v;
}

export const def = definePlugin({
  onInit: (ctx: PluginContext) => {
    const engineIds = (ctx.manifest.contributions.engine ?? []).map((c) => `${c.id}@${c.version}`);
    ctx.log(`discovery.mapping up (Ω8) — ops ${engineIds.join(", ")}, constraint solving against the blueprint (payload or config.blueprintPath)`);
  },

  ops: {
    "discovery.map@1": async (payload: unknown, ctx: PluginContext, _meta: CallMeta) => {
      const p = requirePayloadObject(payload);
      const runId = optionalRunId(p.runId);
      const candidates = normalizeCandidates(p.candidates);
      const blueprint = loadBlueprint(ctx, p.blueprint ?? p.blueprintPath);
      const report = solveMapping(candidates, blueprint);
      const refs = mappingRefs(p.candidatesRef, report, candidates);
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: DISCOVERY_NS,
        id: `mapping:${runId}`,
        data: { runId, engine: "discovery.map@1", ...report },
        meta: { type: "mapping", runId },
        refs,
      });
      return {
        runId,
        engine: "discovery.map@1",
        ...report,
        vaultRef: { ns: DISCOVERY_NS, id: `mapping:${runId}`, rev: append.rev },
      };
    },

    "discovery.variations@1": async (payload: unknown, ctx: PluginContext, _meta: CallMeta) => {
      const p = requirePayloadObject(payload);
      const runId = optionalRunId(p.runId);
      const providerId = typeof p.providerId === "string" && p.providerId.length > 0
        ? p.providerId
        : (() => { throw new Error("discovery.variations@1: providerId must be a non-empty string (whose candidates these are)"); })();
      const candidates = normalizeCandidates(p.candidates);
      const discoveredAt = typeof p.discoveredAt === "string" && p.discoveredAt.length > 0
        ? p.discoveredAt
        : new Date().toISOString();
      const variations = deriveVariations(candidates, { providerId, discoveredAt });
      const byContract = groupVariations(variations);
      const refs: EvidenceRefShape[] = [];
      const seen = new Set<string>();
      for (const v of variations) {
        for (const r of v.evidence) {
          const key = `${r.ns}|${r.id}|${r.rev}`;
          if (seen.has(key)) continue;
          seen.add(key);
          refs.push({ ns: r.ns, id: r.id, rev: r.rev });
        }
      }
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: DISCOVERY_NS,
        id: `variations:${runId}`,
        data: { runId, engine: "discovery.variations@1", providerId, discoveredAt, variations },
        meta: { type: "variations", runId },
        refs,
      });
      return {
        runId,
        engine: "discovery.variations@1",
        variations,
        byContract,
        vaultRef: { ns: DISCOVERY_NS, id: `variations:${runId}`, rev: append.rev },
      };
    },
  },
});

startPlugin(def);
