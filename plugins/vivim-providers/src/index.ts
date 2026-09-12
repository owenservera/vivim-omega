// plugins/vivim-providers/src/index.ts (Ω14.1 + D-319 — wiring only)
// The provider registry: realization records (ns "providers", written by
// discovery.verify@1 / discovery.healing) projected into registry rows,
// with liveness from law.registry@1. Read-mostly: this plugin WRITES nothing
// except session bookkeeping (session.start, consent-gated).
//
// Ops exposed (CONTRACT contributions, see plugin.json):
//   providers.registry@1        {} → {entries[], skipped[]} — all realizations
//   providers.realization.get@1 {archetypeSlug, providerId} → {realization|null, rev}
//   providers.session.start@1   {archetypeSlug, providerId, consentId} → {sessionId, status}
//
// Handlers throw on malformed payloads / failed port calls → DEGRADED at the
// op boundary (fail-closed propagation, house discipline).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult, ProviderRealization } from "@vivim/omega-contracts";
import { providerRealizationId } from "@vivim/omega-contracts";
import { asRealization, deriveRegistry } from "./registry.ts";

export const PROVIDERS_NS = "providers";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }
interface VaultRow { id: string; rev: number; cid: string }
interface RegistrySnapshot { plugins?: unknown; states?: Record<string, { state?: unknown }> }

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`vivim.providers: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function reqStr(op: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${op}: ${field} must be a non-empty string`);
  }
  return v;
}

export const def = definePlugin({
  onInit: (ctx: PluginContext) => {
    const ops = (ctx.manifest.contributions.contract ?? []).map((c) => `${c.id}@${c.version}`);
    ctx.log(`vivim.providers up (Ω14.1/D-319) — registry over vault ns "${PROVIDERS_NS}", ops ${ops.join(", ")}`);
  },

  ops: {
    "providers.registry@1": async (_payload: unknown, ctx: PluginContext) => {
      const rows = await portCall<VaultRow[]>(ctx, "vault.query@1", { ns: PROVIDERS_NS, filter: { idPrefix: "realization:" } });
      const realizations: Array<ProviderRealization & { rev: number }> = [];
      const skipped: string[] = [];
      for (const row of rows) {
        const got = await portCall<VaultGetResult>(ctx, "vault.get@1", { ns: PROVIDERS_NS, id: row.id });
        const parsed = asRealization(got.data, got.rev);
        if (!parsed) {
          skipped.push(row.id); // malformed row: visible, never fatal (registry reads, verification owns writes)
          continue;
        }
        realizations.push(parsed);
      }
      const reg = await portCall<RegistrySnapshot>(ctx, "law.registry@1", {});
      const activePluginIds = new Set(
        Object.entries(reg.states ?? {})
          .filter(([, s]) => s?.state === "active")
          .map(([id]) => id),
      );
      const entries = deriveRegistry({ realizations, activePluginIds });
      if (skipped.length > 0) ctx.log(`vivim.providers: skipped ${skipped.length} malformed realization row(s): ${skipped.join(", ")}`);
      return { entries, skipped };
    },

    "providers.realization.get@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "providers.realization.get@1";
      const p = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : (() => { throw new Error(`${op}: payload must be an object {archetypeSlug, providerId}`); })();
      const id = providerRealizationId(reqStr(op, "archetypeSlug", p.archetypeSlug), reqStr(op, "providerId", p.providerId));
      const r: PortResult = await ctx.port.call("vault.get@1", { ns: PROVIDERS_NS, id });
      if (!r.ok) return { realization: null, rev: null }; // miss reads as null (same shape as the old stub)
      const v = r.value as VaultGetResult;
      return { realization: v.data, rev: v.rev };
    },

    "providers.session.start@1": async (payload: unknown, _ctx: PluginContext, _meta: CallMeta) => {
      const op = "providers.session.start@1";
      const p = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : (() => { throw new Error(`${op}: payload must be an object {archetypeSlug, providerId, consentId}`); })();
      reqStr(op, "archetypeSlug", p.archetypeSlug);
      reqStr(op, "providerId", p.providerId);
      const consentId = reqStr(op, "consentId", p.consentId);
      if (!/^consent_[0-9a-f]+$/.test(consentId)) {
        throw new Error(`${op}: consentId must match consent_<hex> (pre-existing consent required)`);
      }
      // Deferred scope (D-319 covers registry+get; session lifecycle is later work):
      // session bookkeeping appends will land here once a session consumer exists.
      return { sessionId: `sess_${Date.now()}`, status: "INITIALIZED" };
    },
  },
});

startPlugin(def);
