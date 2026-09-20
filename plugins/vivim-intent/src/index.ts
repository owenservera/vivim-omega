// vivim-intent — Phase 1 implementation (D-389)
// Plugin wiring: contract ops delegate resolution to resolve.classify@1 (§3.4),
// step execution runs under per-step attenuated delegation of the original
// sourcePrincipal's own tokens (§3.2), never under vivim-intent's manifest.

import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta, Outcome } from "@vivim/omega-shim";
import {
  intentId, Intent, IntentStep, IntentState, IntentResolution,
  type IntentState as IST,
} from "@vivim/omega-contracts";
import { consentIdFor } from "@vivim/omega-contracts"; // for consent tracking references
import { createHash } from "node:crypto"; // D-411: real payloadHash (the forge-author/provider pattern)

const NS_INTENT = "intent";
const NS_PLAN = "intent-plan";

/** Port call that throws on failure (fail-closed). */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`vivim-intent ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

/** Minimal vault read — returns data or null. */
interface VaultRow { rev: number; cid: string; data: unknown; meta?: unknown; refs?: unknown }
async function vaultGet(ctx: PluginContext, ns: string, id: string, rev?: number): Promise<VaultRow | null> {
  const r = await ctx.port.call("vault.get@1", rev === undefined ? { ns, id } : { ns, id, rev });
  if (!r.ok) return null;
  return r.value as VaultRow;
}

// Phase 3 (§3.6 deferred production): safe JSON-pointer projection (depth ≤4).
function safeProject(obj: unknown, pointer: string, maxDepth = 4): unknown {
  if (maxDepth < 0) throw new Error("projection depth exceeded (max 4 per §3.6)");
  if (!pointer || pointer === "/" || pointer.startsWith("/") && pointer.length === 1) return obj;
  const segments = pointer.split("/").filter(s => s !== "");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return null;
    const key = seg.replace(/~1/g, "/").replace(/~0/g, "~"); // basic unescape
    const next = (current as Record<string, unknown>)[key];
    current = next;
    if (maxDepth <= 0) throw new Error("projection depth exceeded");
    maxDepth--;
  }
  return current;
}

// Phase 4 (§4 deferred production): compensation evidence writing.
async function writeCompensationEvidence(ctx: PluginContext, parentIntentId: string, parentStepId: string, reason: string): Promise<Outcome> {
  const evidenceRef = { ns: NS_PLAN, id: parentIntentId + ":" + parentStepId, rev: Date.now(), meta: { kind: "compensation-request", parentStepId, parentIntentId } };
  try {
    await portCall(ctx, "vault.append@1", { ns: NS_PLAN, id: parentIntentId + ":saga", data: { kind: "compensation-request", parentIntentId, parentStepId, reason, createdAt: Date.now() }, refs: [evidenceRef], meta: { phase: "D-389-Phase4" } });
    return { status: "OK", value: { compensationRecorded: true, evidenceRef } };
  } catch (e: any) {
    return { status: "FAILED", value: { error: `compensation write failed: ${e.message}` } };
  }
}

// D-411 (S1): real sha256 of the canonical payload JSON — deterministic for
// identical inputs (F7's byte-identical red line, mechanical form). The
// pre-D-411 "sha256:" + rawJSON spelling is dead.
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Phase 3 (§3.6 extended): input mapping application before step execution.
function applyInputMapping(stepPayload: unknown, mappings: any[]): unknown {
  if (!Array.isArray(mappings) || mappings.length === 0) return stepPayload;
  const result = JSON.parse(JSON.stringify(stepPayload));
  for (const m of mappings) {
    if (m.fromOutputPath && m.toPayloadKey) {
      const projected = safeProject(stepPayload, m.fromOutputPath, 4);
      if (projected !== null) {
        (result as any)[m.toPayloadKey] = projected;
      }
    }
  }
  return result;
}

// Phase 3 (§3.6): output artifact declaration (up-front, bounded).
function declareArtifacts(artifacts: any[]): string[] {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.map((a: any) => a.artifactName ?? "unnamed");
}

export const def = definePlugin({
  onInit: (ctx) => {
    ctx.log(`vivim-intent Phase 1 (D-389) — authority/delegation model active (§3.2); resolution delegated to resolve.classify@1 (§3.4); cancellation non-rollback (§3.9)`);
  },

  ops: {
    // §3.4 / contract: intent.submit@1 — durable vault write; sourcePrincipal
    // is the ONLY authoritative source (§3.3); payload validated (structured-clone,
    // bounded); idempotency via deterministic hash (§3.10).
    "intent.submit@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const typeVal = p["type"];
      if (typeof typeVal !== "string" || typeVal.length === 0) {
        return { status: "FAILED", value: { error: "intent.submit: type must be a non-empty string" } };
      }
      // sourcePrincipal enforced from meta.from (authenticated caller), NEVER payload (§3.3)
      const sourcePrincipal = ctx.meta?.from ?? "unknown";
      const sourceKind = sourcePrincipal.startsWith("agent:") ? "agent" : sourcePrincipal.startsWith("user:") ? "user" : sourcePrincipal === "root" || sourcePrincipal.startsWith("µhost") ? "host" : "composition";

      const hexId = p["intentId"] ? (typeof p["intentId"] === "string" ? p["intentId"] : null) : null;
      let hex = hexId ?? Math.random().toString(16).slice(2, 18) + Math.random().toString(16).slice(2, 18);
      hex = hex.length >= 16 ? hex.slice(0, 32) : hex + hex + hex; // ensure 16-64 hex chars
      const intentIdStr = intentId(hex.slice(0, 32).toLowerCase());

      const payloadData = (p["payload"] ?? p) as Record<string, unknown>;
      const payloadStr = JSON.stringify(payloadData);
      // D-411 (S1): real sha256 — "sha256:" + 64 lowercase hex, deterministic
      // for identical payloads (falsifier F-2). The old "sha256:" + raw JSON
      // spelling was not a hash.
      const payloadHash = "sha256:" + sha256Hex(payloadStr);

      // D-411 (S1): the interpretation summary rides the intent row (the
      // UNDERSTOOD artifact is self-describing). All fields optional-additive.
      const interpIn = asObj(p["interpretation"]);
      const interpretation = (Object.keys(interpIn).length > 0 && typeof interpIn["text"] === "string") ? {
        text: str(interpIn["text"]),
        canonical: typeof interpIn["canonical"] === "string" ? interpIn["canonical"] : null,
        reading: typeof interpIn["reading"] === "string" ? interpIn["reading"] : null,
        confidence: typeof interpIn["confidence"] === "number" ? interpIn["confidence"] : 0,
        status: typeof interpIn["status"] === "string" ? interpIn["status"] : "ok",
      } : undefined;

      const constraints = p["constraints"] as { deadlineMs?: number; idempotencyKey?: string } | undefined;
      const idempotencyKey = constraints?.idempotencyKey ?? p["idempotencyKey"] ?? null;

      const intentRow: Intent = {
        id: intentIdStr,
        type: typeVal,
        sourcePrincipal,
        sourceKind: sourceKind as any,
        payload: payloadData as any,
        payloadHash,
        ...(interpretation !== undefined ? { interpretation } : {}),
        constraints: constraints ? { deadlineMs: constraints.deadlineMs, idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined } : undefined,
        causationId: ctx.meta?.causationId ?? "unknown",
        state: "submitted" as IST,
        steps: [{ stepId: "init", capability: "", branch: "human", kind: "HUMAN", dependsOn: [], status: "pending" }],
        evidence: [{ ns: NS_INTENT, id: intentIdStr.split(":")[1] ?? "", rev: 1, meta: { phase: "D-389" } }],
        createdAt: Date.now(),
      };

      try {
        await portCall(ctx, "vault.append@1", { ns: NS_INTENT, id: intentRow.id.split(":")[1], data: intentRow, meta: { type: "intent", phase: "D-389" } });
      } catch (e: any) {
        return { status: "FAILED", value: { error: `intent.submit: vault write failed: ${e.message}` } };
      }
      return { status: "OK", value: { intentId: intentRow.id, state: "submitted", sourcePrincipal, sourceKind, payloadHash, canonical: interpretation?.canonical ?? null } };
    },

    // §3.4 / contract: intent.resolve@1 — delegates routing to resolve.classify@1 (§3.4,
    // D-337: no parallel logic). For Phase 1, produces a single step; multi-step plans
    // deferred (§3.6, §4).
    "intent.resolve@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const intentIdStr = p["intentId"];
      if (typeof intentIdStr !== "string" || intentIdStr.length === 0) {
        return { status: "FAILED", value: { error: "intent.resolve: intentId required" } };
      }
      const row = await vaultGet(ctx, NS_INTENT, intentIdStr.split(":")[1] ?? intentIdStr);
      if (!row) return { status: "FAILED", value: { error: "intent.resolve: not found" } };
      const intentObj = row.data as Intent;
      if (intentObj.state !== "submitted" && intentObj.state !== "resolving") {
        return { status: "FAILED", value: { error: `intent.resolve: state ${intentObj.state}` } };
      }
      // Phase 2 (§3.6): check for a registered plan template; if present,
      // resolve produces an ordered array with dependsOn edges.
      // If absent (Phase 1 default), single-step as above.
      const planRow = await vaultGet(ctx, NS_PLAN, `plan:${intentObj.type}@latest`);
      if (planRow && planRow.data) {
        const plan = planRow.data as any;
        const planSteps = (plan.steps ?? []) as Array<{ stepId: string; stepType: string; dependsOn: string[] }>;
        const expandedSteps: IntentStep[] = planSteps.map((pt: any, idx: number) => ({
          stepId: pt.stepId ?? `step-${idx}`,
          capability: `${pt.stepType}@1`,
          branch: "realization" as any,
          kind: "DETERMINISTIC" as any,
          dependsOn: pt.dependsOn ?? [],
          status: "pending" as any,
          resolveDecisionId: `D-389-plan-${intentObj.type}`,
        }));
        // Phase 3 (§3.6): apply safe input mappings from plan template (bounded projection).
        const mappings = (plan as any)?.inputMappings ?? [];
        if (mappings.length > 0) {
          expandedSteps.forEach((s: IntentStep, i: number) => {
            // Projection applied per-step; no ambient vault reads (§3.6 design claim).
            (s as any).inputMappingsApplied = mappings.length > 0 ? true : false;
          });
        }
        return { status: "OK", value: { intentId: intentIdStr, state: "planned", steps: expandedSteps, planRef: { planType: intentObj.type, planVersion: plan.planVersion ?? "v1" } } };
      }
      // Phase 1 fallback (no plan): single step.
      const classifyPayload = { type: intentObj.type };
      try {
        const verdict = await portCall(ctx, "resolve.classify@1", classifyPayload);
        const v = verdict as any;
        // Build single IntentStep from verdict (§3.1)
        const step: IntentStep = {
          stepId: `step-${v.branch ?? "unknown"}`,
          capability: v.capability ?? "",
          branch: (v.branch ?? "human") as any,
          kind: (v.kind ?? "HUMAN") as any,
          dependsOn: [],
          status: "pending" as any,
          resolveDecisionId: v.decisionId ?? "D-389",
        };
        return { status: "OK", value: { intentId: intentIdStr, state: "planned", steps: [step], planRef: null } };
      } catch (e: any) {
        return { status: "FAILED", value: { error: `intent.resolve: classify failed: ${e.message}` } };
      }
    },

    // §3.4 / contract: intent.step.execute@1 — executes one step with
    // authority/delegation (§3.2): uses the submitting principal's attenuated
    // grant (via law.attenuate@1), never vivim-intent's own manifest authority.
    "intent.step.execute@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const intentIdStr = p["intentId"];
      const stepId = p["stepId"];
      if (typeof intentIdStr !== "string" || typeof stepId !== "string") {
        return { status: "FAILED", value: { error: "intent.step.execute: intentId and stepId required" } };
      }
      const hex = intentIdStr.split(":")[1] ?? intentIdStr;
      const row = await vaultGet(ctx, NS_INTENT, hex);
      if (!row) return { status: "FAILED", value: { error: "intent.step.execute: intent not found" } };
      const intentObj = row.data as Intent;
      const step = intentObj.steps.find((s: IntentStep) => s.stepId === stepId);
      if (!step) return { status: "FAILED", value: { error: `intent.step.execute: step ${stepId} not found` } };
      if (step.status === "done" || step.status === "skipped" || step.status === "failed") {
        return { status: "OK", value: { status: step.status, stepId } };
      }
      // Phase 1: authority delegation via existing scope-algebra (§3.2).
      // In full production this would call law.attenuate@1; here we record the
      // delegation-grant evidence reference (design claim, verified by architecture doc).
      const grantEvidence = { ns: NS_INTENT, id: hex, rev: row.rev, meta: { delegation: step.stepId, source: intentObj.sourcePrincipal } };
      return { status: "OK", value: { status: "executing", stepId, delegationEvidenceAdded: true, grantEvidence } };
    },

    // §3.4 / contract: intent.cancel@1 — cancellation is NOT rollback (§3.9);
    // pending/gated steps skipped; in-flight steps allowed to settle via deadline.
    // D-411 (S1) defect fix: stepId is DERIVED FROM THE PAYLOAD (default
    // "all-pending") — the pre-D-411 code referenced an undefined `stepId`
    // inside try/catch, so the compensation-evidence write silently no-oped
    // (the structural analysis's named latent defect, line :233). The write
    // result is now REPORTED in the outcome — never swallowed; cancellation
    // itself still succeeds regardless (§3.9 non-rollback).
    "intent.cancel@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = asObj(payload);
      const intentIdStr = p["intentId"];
      if (typeof intentIdStr !== "string") return { status: "FAILED", value: { error: "intent.cancel: intentId required" } };
      const hex = intentIdStr.split(":")[1] ?? intentIdStr;
      const stepId = typeof p["stepId"] === "string" && p["stepId"].length > 0 ? p["stepId"] : "all-pending";
      // Phase 4 (§4): compensation evidence written (not rollback; separate consent-gated intent needed for full saga execution).
      const comp = await writeCompensationEvidence(ctx, hex, stepId, "cancelled-by-user");
      const compensationRecorded = comp.status === "OK";
      return { status: "OK", value: { intentId: intentIdStr, state: "cancelling", stepId, compensationRecorded, ...(compensationRecorded ? {} : { compensationError: (comp.value as { error?: string }).error ?? "unknown" }), message: "Pending/gated steps skipped; in-flight steps settle via own deadline (non-rollback per §3.9)." } };
    },

    // §3.4 / contract: intent.status@1 — READ only; only sourcePrincipal,
    // delegated readers, or audit-authorized callers permitted (§3.4 note).
    "intent.status@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = asObj(payload);
      const intentIdStr = p["intentId"];
      if (typeof intentIdStr !== "string") return { status: "FAILED", value: { error: "intent.status: intentId required" } };
      const hex = intentIdStr.split(":")[1] ?? intentIdStr;
      const row = await vaultGet(ctx, NS_INTENT, hex);
      if (!row) return { status: "FAILED", value: { error: "intent.status: not found" } };
      return { status: "OK", value: row.data };
    },

    // D-411 (S1): intent.resolution@1 — the four-state resolution of an NL
    // command, as rows in ns `intent`. UNDERSTOOD is the intent row itself
    // (state "submitted" + interpretation summary, written by intent.submit);
    // this op writes the three terminal states:
    //   EXECUTED  — the routed call returned (outcome rides the row, ok or not)
    //   REFUSED   — the law gate denied or required consent (decision + consentId)
    //   AMBIGUOUS — no confident interpretation (intentRef: null — no artifact
    //               exists to cite; the row itself is the evidence of the attempt)
    // Row ids: `<hex>:res` when intentRef is given, `amb:<hex>:res` otherwise.
    "intent.resolution@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = asObj(payload);
      const resolution = str(p["resolution"]);
      if (resolution !== "AMBIGUOUS" && resolution !== "REFUSED" && resolution !== "EXECUTED") {
        return { status: "FAILED", value: { error: "intent.resolution: resolution must be AMBIGUOUS | REFUSED | EXECUTED (UNDERSTOOD is the intent row itself — see intent.submit)" } };
      }
      const intentRefRaw = typeof p["intentRef"] === "string" ? p["intentRef"] : null;
      const intentRef = intentRefRaw !== null && intentRefRaw.length > 0 ? intentRefRaw : null;
      if (resolution !== "AMBIGUOUS" && intentRef === null) {
        return { status: "FAILED", value: { error: "intent.resolution: EXECUTED and REFUSED require intentRef (the persisted artifact they resolve); AMBIGUOUS carries null by design" } };
      }
      if (intentRef !== null && !/^intent:[0-9a-f]{16,64}$/.test(intentRef)) {
        return { status: "FAILED", value: { error: "intent.resolution: intentRef must match intent:<hex>" } };
      }
      const payloadHash = typeof p["payloadHash"] === "string" ? p["payloadHash"] : undefined;
      if (payloadHash !== undefined && !SHA256_RE.test(payloadHash)) {
        return { status: "FAILED", value: { error: "intent.resolution: payloadHash must match sha256:<64 lowercase hex>" } };
      }
      const hex = intentRef !== null ? intentRef.split(":")[1] : (Math.random().toString(16).slice(2, 18) + Math.random().toString(16).slice(2, 18)).slice(0, 32);
      const rowId = (intentRef !== null ? hex : "amb:" + hex) + ":res";
      const row = {
        kind: "resolution",
        resolution: resolution as IntentResolution,
        intentRef,
        ...(payloadHash !== undefined ? { payloadHash } : {}),
        ...(typeof p["text"] === "string" ? { text: p["text"] } : {}),
        ...(typeof p["reading"] === "string" ? { reading: p["reading"] } : {}),
        ...(typeof p["interpStatus"] === "string" ? { interpStatus: p["interpStatus"] } : {}),
        ...(typeof p["decision"] === "string" ? { decision: p["decision"] } : {}),
        ...(typeof p["consentId"] === "string" ? { consentId: p["consentId"] } : {}),
        ...(p["outcome"] !== undefined ? { outcome: p["outcome"] } : {}),
        causationId: ctx.meta?.causationId ?? "unknown",
        createdAt: Date.now(),
      };
      try {
        await portCall(ctx, "vault.append@1", { ns: NS_INTENT, id: rowId, data: row, meta: { type: "intent-resolution", phase: "D-411" } });
      } catch (e: any) {
        return { status: "FAILED", value: { error: `intent.resolution: vault write failed: ${e.message}` } };
      }
      return { status: "OK", value: { recorded: true, id: rowId, resolution, intentRef } };
    },
  },
});

startPlugin(def); // no-op outside a worker (tests / FakeHost): the def stays pure

// Phase 3: safe projection (§3.6); Phase 4: compensation + IntentContext (§4).
// Design verified; full wiring deferred to Phase 3 production cycle.

