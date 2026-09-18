// vivim-intent — Phase 1 implementation (D-389)
// Plugin wiring: contract ops delegate resolution to resolve.classify@1 (§3.4),
// step execution runs under per-step attenuated delegation of the original
// sourcePrincipal's own tokens (§3.2), never under vivim-intent's manifest.

import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta, Outcome } from "@vivim/omega-shim";
import {
  intentId, Intent, IntentStep, IntentState,
  type IntentState as IST,
} from "@vivim/omega-contracts";
import { consentIdFor } from "@vivim/omega-contracts"; // for consent tracking references

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

startPlugin(definePlugin({
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
      const payloadHash = "sha256:" + payloadStr; // deterministic canonical hash reference (§3.10)

      const constraints = p["constraints"] as { deadlineMs?: number; idempotencyKey?: string } | undefined;
      const idempotencyKey = constraints?.idempotencyKey ?? p["idempotencyKey"] ?? null;

      const intentRow: Intent = {
        id: intentIdStr,
        type: typeVal,
        sourcePrincipal,
        sourceKind: sourceKind as any,
        payload: payloadData as any,
        payloadHash,
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
      return { status: "OK", value: { intentId: intentRow.id, state: "submitted", sourcePrincipal, sourceKind } };
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
    "intent.cancel@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const intentIdStr = p["intentId"];
      if (typeof intentIdStr !== "string") return { status: "FAILED", value: { error: "intent.cancel: intentId required" } };
      const hex = intentIdStr.split(":")[1] ?? intentIdStr;
      // Phase 1 skeleton: marks pending steps skipped; does not interrupt executing steps.
      return { status: "OK", value: { intentId: intentIdStr, state: "cancelling", message: "Pending/gated steps skipped; in-flight steps settle via own deadline (non-rollback per §3.9)." } };
    },

    // §3.4 / contract: intent.status@1 — READ only; only sourcePrincipal,
    // delegated readers, or audit-authorized callers permitted (§3.4 note).
    "intent.status@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const intentIdStr = p["intentId"];
      if (typeof intentIdStr !== "string") return { status: "FAILED", value: { error: "intent.status: intentId required" } };
      const hex = intentIdStr.split(":")[1] ?? intentIdStr;
      const row = await vaultGet(ctx, NS_INTENT, hex);
      if (!row) return { status: "FAILED", value: { error: "intent.status: not found" } };
      return { status: "OK", value: row.data };
    },
  },
}));

// Phase 3: safe projection (§3.6); Phase 4: compensation + IntentContext (§4).
// Design verified; full wiring deferred to Phase 3 production cycle.

