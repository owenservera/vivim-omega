// plugins/vivim-credentials — index.ts (D-356, XC-2 write side)
// The credentials spine, built against docs/SURFACES.md §"The credential law"
// (the existing, live-cited spec — A1 of the 360 review: build against the
// law, don't re-derive the shape).
//
// Ops exposed (CONTRACT contributions, see plugin.json):
//   credential.put@1    {credentialId, sim: true, meta?} → {credentialId, rev, record}
//                       MUTATION — consent-gated by policy rule (D-356): storing
//                       a credential is the security-sensitive bar. Sandbox rows
//                       are sim-synthetic REFERENCES; material never enters.
//   credential.use@1    {credentialId} → {credential, rev}
//                       READ — the by-reference flow. Capability-gated at the
//                       recipe layer: only the user-signed Recipe grants
//                       port:credential.use@1, and no in-sandbox composition
//                       does — the live path is dead by construction.
//   credential.redact@1 {bytes} → {redacted, redactions, policyVersion}
//                       READ — M12's redaction-before-append surface
//                       (REDACTION_POLICY_V1, versioned policy data). Output-
//                       only: it cannot reveal what it never returns.
//
// Handlers throw on malformed payloads / failed port calls → DEGRADED at the
// op boundary (fail-closed propagation, house discipline).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { asCredentialRecord, credentialVaultId, CREDENTIALS_NS, fromRecord, type CredentialRecord } from "./record.ts";
import { applyRedaction, REDACTION_POLICY_V1 } from "./redact.ts";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`vivim.credentials: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

export const def = definePlugin({
  onInit: (ctx: PluginContext) => {
    const ops = (ctx.manifest.contributions.contract ?? []).map((c) => `${c.id}@${c.version}`);
    ctx.log(
      `vivim.credentials up (XC-2/D-356) — spine over vault ns "${CREDENTIALS_NS}", ` +
      `redaction policy ${REDACTION_POLICY_V1.version}, ops ${ops.join(", ")}`,
    );
  },

  ops: {
    "credential.put@1": async (payload: unknown, ctx: PluginContext) => {
      const record = asCredentialRecord(payload, Date.now()); // fail-closed on material or non-sim
      const id = credentialVaultId(record.credentialId);
      const w = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: CREDENTIALS_NS,
        id,
        data: record,
        meta: { type: "credential" },
      });
      ctx.log(`vivim.credentials: put ${record.credentialId} (sim-synthetic reference, rev ${w.rev})`);
      return { credentialId: record.credentialId, rev: w.rev, record };
    },

    "credential.use@1": async (payload: unknown, ctx: PluginContext) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("credential.use@1: payload must be an object {credentialId}");
      }
      const p = payload as Record<string, unknown>;
      if (typeof p.credentialId !== "string" || p.credentialId.length === 0) {
        throw new Error("credential.use@1: credentialId must be a non-empty string");
      }
      const got = await portCall<VaultGetResult>(ctx, "vault.get@1", {
        ns: CREDENTIALS_NS,
        id: credentialVaultId(p.credentialId),
      });
      const record = fromRecord(got.data);
      if (!record) {
        throw new Error(`credential.use@1: credential ${p.credentialId} is malformed — refusing (fail-closed)`);
      }
      // The by-reference flow: the caller presented a credentialId and gets
      // the reference row. No material is returned because none is stored —
      // a live owner-machine tier would exchange the reference for secret
      // material per-call, inside the spine, post-v1 (recorded, not built).
      return { credential: record, rev: got.rev };
    },

    "credential.redact@1": async (payload: unknown) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("credential.redact@1: payload must be an object {bytes}");
      }
      const p = payload as Record<string, unknown>;
      const result = applyRedaction(p.bytes as string, REDACTION_POLICY_V1); // throws on non-string / oversized
      return result;
    },
  },
});

startPlugin(def);

// Type re-exports for consumers (the hub's readers, tests).
export type { CredentialRecord };
