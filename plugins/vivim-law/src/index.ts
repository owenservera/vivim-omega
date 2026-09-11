// vivim.law — index.ts (Ω1 spine)
// The gate. Wiring: policy (data) + consent table + shadow amendment + registry,
// exposed as five READ-risk contracts. Mutating host capabilities (journal append,
// tokens revoke) are exercised ONLY through ports, and journaling is best-effort —
// a law decision is never blocked by a journal failure.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { HOST_OPS } from "@vivim/omega-contracts";
import type { LawDecision, PortResult, ConsentGrant } from "@vivim/omega-contracts";
import { LAW_POLICY_V1, evalPolicy, type PolicyDoc } from "./policy.ts";
import { ConsentTable } from "./consent.ts";
import { mintCap, attenuate } from "./tokens.ts";
import { ShadowAmendment, AMENDMENT_SWAP_NOTE } from "./amendment.ts";
import { LawRegistry } from "./registry.ts";

// ---- shared law state (single compartment, single thread) ----
const consentTable = new ConsentTable();
const shadow = new ShadowAmendment(LAW_POLICY_V1);
const registry = new LawRegistry();
const rootConsentCap = mintCap("law.consent"); // attenuated per grant — the algebra in live use
let generation = 1;                            // law state generation (bumps on every state change)

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function bump(): number {
  return ++generation;
}

/** Best-effort journal append through the host op (capability: host.journal.append). */
async function journal(ctx: PluginContext | null, entry: Record<string, unknown>): Promise<void> {
  if (!ctx) return;
  try {
    const r: PortResult = await ctx.port.call(HOST_OPS.journalAppend, entry);
    if (!r.ok) ctx.log(`law: journal append ${r.error} (${r.detail ?? ""}) — decision stands, journaling skipped`);
  } catch (e) {
    ctx.log(`law: journal append failed: ${String(e)} — decision stands, journaling skipped`);
  }
}

// ---- the gate resolver: policy doc → decision, consent applied ----
interface Resolved {
  decision: LawDecision["decision"];
  reason: string;
  journal: boolean;
  consentId?: string;
}

function resolve(doc: PolicyDoc, principal: string, op: string): Resolved {
  const ev = evalPolicy(doc, principal, op);
  if (ev.action.decision === "require-consent") {
    const grant = consentTable.hasMatchingGrant(principal, op);
    if (grant) {
      return { decision: "allow", reason: `${ev.action.reason} — consent ${grant.consentId} active (gen ${grant.generation})`, journal: ev.action.journal };
    }
    return { decision: "require-consent", reason: ev.action.reason, journal: ev.action.journal, consentId: consentTable.requireConsent(principal, op) };
  }
  return { decision: ev.action.decision, reason: ev.action.reason, journal: ev.action.journal };
}

// ---- the ops ----
startPlugin(definePlugin({
  onInit: (ctx) => {
    const init = registry.init(ctx.config["journalPath"], ctx.manifest.id);
    ctx.log(`vivim.law up (Ω1) — policy ${LAW_POLICY_V1.policyId}@${LAW_POLICY_V1.version}, journal replay: ${init.replayed} events`);
  },

  ops: {
    /** THE gate. Payload: {principal, op, payload, causationId}. Returns LawDecision. */
    "law.check@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      const op = str(p["op"]);
      const causationId = optStr(p["causationId"]) ?? meta.causationId;

      const primary = resolve(LAW_POLICY_V1, principal, op);
      const decision: LawDecision = {
        decision: primary.decision,
        reason: primary.reason,
        principal,
        ...(primary.consentId !== undefined ? { consentId: primary.consentId } : {}),
      };

      // shadow evaluation (amendment, Ω1): same resolver, both policies, divergences recorded
      let divergence: ReturnType<ShadowAmendment["observe"]> = null;
      const shadowDoc = shadow.doc();
      if (shadowDoc) {
        const shadowRes = resolve(shadowDoc, principal, op);
        divergence = shadow.observe(principal, op, primary, shadowRes, causationId);
      }

      registry.countEvent();
      registry.observe(principal, "active", "law.check"); // callers are composition ids (root/µhost-gate filtered)
      if (primary.journal) {
        await journal(ctx, {
          source: "vivim.law",
          op: "law.check",
          principal,
          targetOp: op,
          decision: primary.decision,
          reason: primary.reason,
          ...(primary.consentId !== undefined ? { consentId: primary.consentId } : {}),
          causationId,
          ...(shadowDoc ? { shadow: { decision: divergence ? divergence.shadow.decision : primary.decision, diverged: divergence !== null } } : {}),
        });
      }
      return decision;
    },

    /** Lifecycle registry: ids seen, journal events, active consents, law generation. */
    "law.registry@1": (_payload: unknown, _ctx: PluginContext | null, meta: CallMeta) => {
      registry.observe(meta.from, "active", "op");
      registry.countEvent();
      return registry.snapshot(consentTable.activeCount(), generation);
    },

    /** Grant a consent (default) or explicitly deny-revoke it ({action:"revoke"}). */
    "law.consent.grant@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const consentId = str(p["consentId"]);
      const action = p["action"] === "revoke" || p["action"] === "deny-revoke" ? "revoke" : "grant";
      const principal = optStr(p["principal"]);
      const scope = optStr(p["scope"]);

      if (action === "revoke") {
        const revoked = consentTable.revoke(consentId);
        const gen = bump();
        registry.countEvent();
        await journal(ctx, { source: "vivim.law", op: "law.consent.grant", action: "revoke", consentId, revoked, principal: meta.from, causationId: meta.causationId });
        return { action, consentId, revoked, generation: gen, active: consentTable.activeCount() };
      }

      const rec = consentTable.grant(consentId, { ...(principal !== undefined ? { principal } : {}), ...(scope !== undefined ? { scope } : {}) });
      const gen = bump();
      const cap = attenuate(rootConsentCap, `law.consent:id=${consentId}`); // narrowing, by construction
      registry.countEvent();
      await journal(ctx, {
        source: "vivim.law", op: "law.consent.grant", action: "grant", consentId,
        ...(principal !== undefined ? { principal } : {}), ...(scope !== undefined ? { scope } : {}),
        grantGeneration: rec.generation, caller: meta.from, causationId: meta.causationId,
      });
      return {
        action,
        grant: { consentId: rec.consentId, ...(rec.principal !== undefined ? { principal: rec.principal } : {}), ...(rec.scope !== undefined ? { scope: rec.scope } : {}), grantedAt: rec.grantedAt } satisfies ConsentGrant,
        generation: gen,
        cap,
      };
    },

    /** Delegate token revocation to the host generation bump (capability: host.tokens.revoke). */
    "law.tokens.revoke@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const pluginId = str(p["pluginId"]);
      if (!pluginId) throw new Error("law.tokens.revoke: payload requires {pluginId}");
      registry.observe(pluginId, "active", "tokens.revoke");
      // journal the intent BEFORE delegating: the host's generation bump revokes our own
      // journal token too (global bump), so post-revoke appends fail closed and best-effort.
      await journal(ctx, { source: "vivim.law", op: "law.tokens.revoke", principal: meta.from, pluginId, causationId: meta.causationId });
      const r: PortResult = await ctx!.port.call(HOST_OPS.tokensRevoke, { pluginId });
      bump();
      registry.countEvent();
      if (!r.ok) return { revoked: false, pluginId, hostResult: r };
      const v = asObj(r.value);
      return { revoked: true, pluginId, hostGeneration: v["generation"], affectedTokens: v["affectedTokens"] };
    },

    /** Shadow amendment: register/clear a shadow policy, or fetch the divergence report. */
    "law.amendment@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const action = str(p["action"] ?? "report") || "report";
      if (action === "register-shadow") {
        const spec = asObj(p["policy"]);
        if (Object.keys(spec).length === 0) throw new Error("law.amendment: register-shadow requires a policy spec");
        const status = shadow.registerShadow(spec);
        bump();
        registry.countEvent();
        await journal(ctx, { source: "vivim.law", op: "law.amendment", action, shadowPolicyId: status.policyId, principal: meta.from, causationId: meta.causationId });
        return { action, shadow: status, report: shadow.report() };
      }
      if (action === "clear-shadow") {
        const status = shadow.clearShadow();
        bump();
        registry.countEvent();
        await journal(ctx, { source: "vivim.law", op: "law.amendment", action, principal: meta.from, causationId: meta.causationId });
        return { action, shadow: status, report: shadow.report() };
      }
      // report (default): divergence ledger since shadow registration
      registry.countEvent();
      return { action: "report", report: shadow.report(), swap: AMENDMENT_SWAP_NOTE };
    },
  },
}));
