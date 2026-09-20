// vivim.law — index.ts (Ω1 spine)
// The gate. Wiring: policy (data) + consent table + forbidden-action overlay +
// shadow amendment + registry, exposed as eight READ-risk contracts. Mutating host
// capabilities (journal append, tokens revoke) are exercised ONLY through ports,
// and journaling is best-effort — a law decision is never blocked by a journal failure.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { HOST_OPS, principalKind } from "@vivim/omega-contracts";
import type { LawDecision, PortResult, ConsentGrant, PrincipalKind } from "@vivim/omega-contracts";
import { LAW_POLICY_V1, evalPolicy, type PolicyDoc } from "./policy.ts";
import { ConsentTable } from "./consent.ts";
import { ForbiddenTable, FORBIDDEN_NS, FORBIDDEN_ID_PREFIX, forbiddenVaultId, toRecord, fromRecord } from "./forbidden.ts";
import { PRINCIPAL_NS, principalVaultId, newRecord, retireRecord, fromRecord as fromPrincipalRecord, type PrincipalRecord } from "./principal.ts"; // D-412 (S2) — fromRecord ALIASED: forbidden.ts owns the bare name (the silent-shadowing lesson: two same-named imports, bun binds the last)
import { mintCap, attenuate } from "./tokens.ts";
import { ShadowAmendment, AMENDMENT_SWAP_NOTE } from "./amendment.ts";
import { LawRegistry } from "./registry.ts";

// ---- shared law state (single compartment, single thread) ----
const consentTable = new ConsentTable();
const forbiddenTable = new ForbiddenTable();
const shadow = new ShadowAmendment(LAW_POLICY_V1);
const registry = new LawRegistry();
const rootConsentCap = mintCap("law.consent"); // attenuated per grant — the algebra in live use
let generation = 1;                            // law state generation (bumps on every state change)

// ---- forbidden durability (D-325): vault-backed overlay -------------------
// Persistence is composition-granted, never assumed: the law entry must grant
// BOTH port:vault.append@1 and port:vault.query@1 (agent.json first; audited
// across the rest by the W1 composition-conformance net). Without both caps
// the overlay stays memory-only — the pre-D-325 behavior, byte for byte.
let forbiddenPersistence = false;
let forbiddenLoaded = false;
let forbiddenLoadedCount = 0;
let forbiddenLastError: string | null = null;

function hasVaultCaps(ctx: PluginContext | null): boolean {
  if (!ctx) return false;
  return ctx.capabilities.includes("port:vault.append@1") && ctx.capabilities.includes("port:vault.query@1");
}

interface VaultQueryRow { id: string; rev: number; cid: string }
interface VaultGetResult { rev: number; cid: string; data: unknown }

/** Single reload attempt: query ns "law" prefix "forbidden:", fetch each record, rebuild the table. */
async function reloadForbidden(ctx: PluginContext): Promise<number> {
  const q = await ctx.port.call("vault.query@1", { ns: FORBIDDEN_NS, filter: { idPrefix: FORBIDDEN_ID_PREFIX } });
  if (!q.ok) {
    throw new Error(
      `vivim.law: forbidden persistence requires vivim.vault queryable — missing dependency vivim.vault ` +
      `(vault.query@1 ${q.error}: ${q.detail ?? "no detail"})`,
    );
  }
  const rows = (q.value ?? []) as VaultQueryRow[];
  let count = 0;
  for (const row of rows) {
    if (typeof row?.id !== "string" || !row.id.startsWith(FORBIDDEN_ID_PREFIX)) continue;
    const g = await ctx.port.call("vault.get@1", { ns: FORBIDDEN_NS, id: row.id });
    if (!g.ok) continue; // cold gap or compacted past keep — skip honestly, never fabricate
    const entry = fromRecord((g.value as VaultGetResult).data);
    if (!entry) continue; // malformed record — skipped, never throws the reload
    forbiddenTable.set(entry.principal, entry.ops);
    if (entry.ops.length > 0) count++;
  }
  forbiddenLoaded = true;
  forbiddenLoadedCount = count;
  forbiddenLastError = null;
  return count;
}

/** Boot-time reload with bounded retries: the vault boots phase 1, after law
 *  phase 0, so the first query can race a still-booting vault (DEGRADED /
 *  absent → retry). A composition with NO vault entry fails permanently
 *  (REFUSED no-routed-implementation → missing dependency, no retry loop). */
async function reloadForbiddenAtBoot(ctx: PluginContext): Promise<void> {
  const MAX_ATTEMPTS = 40;
  const WAIT_MS = 125;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const count = await reloadForbidden(ctx);
      if (count === 0) ctx.log(`0 forbidden entries`);
      else ctx.log(`forbidden overlay: ${count} entries reloaded from vault ns "law"`);
      return;
    } catch (e) {
      const msg = String(e);
      forbiddenLastError = msg;
      // Permanent: this composition boots no vault — stop retrying, stay loud.
      if (msg.includes("no routed implementation")) {
        ctx.log(
          `vivim.law: forbidden persistence requires vivim.vault queryable — missing dependency vivim.vault ` +
          `in this composition (law grants vault caps but boots no vivim.vault). Overlay stays UNLOADED; ` +
          `law.forbidden.set@1 aborts fail-closed until the vault is present.`,
        );
        return;
      }
      if (attempt === MAX_ATTEMPTS) {
        ctx.log(
          `vivim.law: forbidden overlay reload failed after ${MAX_ATTEMPTS} attempts — missing dependency vivim.vault ` +
          `queryable (${msg}). Overlay stays UNLOADED; law.forbidden.set@1 aborts fail-closed. ` +
          `Recover with law.forbidden.reload@1 once the vault is queryable.`,
        );
        return;
      }
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
  }
}

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

/** D-412 (S2): read a principal identity row — null when absent or malformed
 *  (skipped honestly, never fabricated — the forbidden-reload discipline). */
async function readPrincipalRecord(ctx: PluginContext, principal: string): Promise<PrincipalRecord | null> {
  try {
    const g = await ctx.port.call("vault.get@1", { ns: PRINCIPAL_NS, id: principalVaultId(principal) });
    if (!g.ok) return null;
    return fromPrincipalRecord((g.value as VaultGetResult).data);
  } catch {
    return null;
  }
}

/** D-412 (S2): ensure a principal identity row exists (register when absent).
 *  Throws on write failure — callers decide rollback (fail-closed, D-325 pattern). */
async function ensurePrincipalRecord(ctx: PluginContext, principal: string): Promise<PrincipalRecord> {
  const existing = await readPrincipalRecord(ctx, principal);
  if (existing !== null) return existing;
  const rec = newRecord(principal);
  const r = await ctx.port.call("vault.append@1", { ns: PRINCIPAL_NS, id: principalVaultId(principal), data: rec });
  if (!r.ok) throw new Error(`vault.append@1 ${r.error}: ${r.detail ?? "no detail"}`);
  return rec;
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
export const def = definePlugin({
  onInit: async (ctx) => {
    const init = registry.init(ctx.config["journalPath"], ctx.manifest.id);
    ctx.log(`vivim.law up (Ω1) — policy ${LAW_POLICY_V1.policyId}@${LAW_POLICY_V1.version}, journal replay: ${init.replayed} events`);
    // D-325: reload the forbidden overlay once the vault is queryable. Law is
    // bootPhase 0, vault is bootPhase 1 — never assume the vault is up at
    // law-init time. Without vault caps this stays memory-only (pre-D-325).
    forbiddenPersistence = hasVaultCaps(ctx);
    if (!forbiddenPersistence) {
      forbiddenLoaded = true; // nothing to load — memory-only by composition, not by failure
      return;
    }
    forbiddenLoaded = false;
    await reloadForbiddenAtBoot(ctx);
  },

  ops: {
    /** THE gate. Payload: {principal, op, payload, causationId} — plus, since
     *  D-411 (S1, the canonical-intent seam), OPTIONAL {intentRef, payloadHash}:
     *  callers that resolved a canonical intent before invoking cite it here,
     *  and every journaled law decision carries the citation (evidence binding,
     *  not new policy — evalPolicy stays typed on who/which-op; callers without
     *  a citation journal exactly as before). Returns LawDecision. */
    "law.check@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      const op = str(p["op"]);
      const causationId = optStr(p["causationId"]) ?? meta.causationId;
      // D-411 (S1): the canonical-intent citation — optional, additive, journaled.
      const intentRef = optStr(p["intentRef"]);
      const payloadHash = optStr(p["payloadHash"]);

      let primary = resolve(LAW_POLICY_V1, principal, op);
      // Forbidden-action overlay (D-310): a per-principal deny that precedes
      // policy evaluation — forbidden holds regardless of what the token
      // would otherwise permit. Memory-only; recipe amendment is durable.
      if (forbiddenTable.isForbidden(principal, op)) {
        primary = {
          decision: "deny",
          reason: `forbidden action for principal "${principal}" (behavior-contract policy overlay)`,
          journal: true,
        };
      }
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
          // D-411 (S1): the canonical-intent citation — present iff the caller
          // resolved a canonical intent before invoking (falsifier F-3).
          ...(intentRef !== undefined ? { intentRef } : {}),
          ...(payloadHash !== undefined ? { payloadHash } : {}),
          ...(shadowDoc ? { shadow: { decision: divergence ? divergence.shadow.decision : primary.decision, diverged: divergence !== null } } : {}),
        });
      }
      return decision;
    },

    /** Lifecycle registry: ids seen, journal events, active consents, law generation. */
    "law.registry@1": (_payload: unknown, _ctx: PluginContext | null, meta: CallMeta) => {
      registry.observe(meta.from, "active", "op");
      registry.countEvent();
      return registry.snapshot(consentTable.activeCount(), generation, {
        persistence: forbiddenPersistence,
        loaded: forbiddenLoaded,
        count: forbiddenLoaded ? forbiddenTable.list().filter((e) => e.ops.length > 0).length : forbiddenLoadedCount,
        ...(forbiddenLastError !== null ? { lastError: forbiddenLastError } : {}),
      });
    },

    /** Grant a consent (default) or explicitly deny-revoke it ({action:"revoke"}).
     *  D-384 principal binding: a non-root caller may only manage consents for
     *  ITSELF. Root — the surfaces' human proxy (console/CLI) — may grant for
     *  any principal; that delegation is the consent ceremony. Anything else is
     *  cross-principal forgery and refuses before any state change. */
    "law.consent.grant@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const consentId = str(p["consentId"]);
      const action = p["action"] === "revoke" || p["action"] === "deny-revoke" ? "revoke" : "grant";
      const principal = optStr(p["principal"]);
      const scope = optStr(p["scope"]);
      if (principal !== undefined && meta.from !== "root" && principal !== meta.from) {
        throw new Error(`law.consent.grant: caller '${meta.from}' may not manage consents for principal '${principal}' (cross-principal refusal, D-384)`);
      }

      if (action === "revoke") {
        const revoked = consentTable.revoke(consentId);
        const gen = bump();
        registry.countEvent();
        await journal(ctx, { source: "vivim.law", op: "law.consent.grant", action: "revoke", consentId, revoked, principal: meta.from, causationId: meta.causationId });
        return { action, consentId, revoked, generation: gen, active: consentTable.activeCount() };
      }

      const rec = consentTable.grant(consentId, { ...(principal !== undefined ? { principal } : {}), ...(scope !== undefined ? { scope } : {}) });
      // D-412 (S2): the consent ceremony is the identity-bearing write — when
      // it names a principal AND law holds vault caps, the grant resolves
      // through the principal record (ensured to exist). Fail-closed on the
      // record write: the in-memory grant rolls back, the ceremony aborts —
      // never half-done (the D-325 forbidden-durability pattern). Without
      // vault caps the grant behaves exactly as before (memory-only posture).
      let principalRecord: PrincipalRecord | null = null;
      if (principal !== undefined && forbiddenPersistence) {
        if (!ctx) throw new Error("law.consent.grant: no plugin context — principal record impossible, grant aborted fail-closed");
        try {
          principalRecord = await ensurePrincipalRecord(ctx, principal);
        } catch (e) {
          consentTable.revoke(consentId);
          throw new Error(`law.consent.grant: principal record write failed — grant aborted fail-closed (missing dependency vivim.vault?): ${String(e)}`);
        }
      }
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
        // D-412 (S2): the principal-record posture of this grant — resolved
        // (record exists), memory-only (no vault caps), or unnamed.
        ...(principalRecord !== null ? { principalRecord: { principal: principalRecord.principal, state: principalRecord.state, generation: principalRecord.generation } } : principal !== undefined ? { principalRecord: null } : {}),
      };
    },

    /** Delegate token revocation to the host generation bump (capability: host.tokens.revoke). */
    "law.tokens.revoke@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const pluginId = str(p["pluginId"]);
      if (!pluginId) throw new Error("law.tokens.revoke: payload requires {pluginId}");
      registry.observe(pluginId, "active", "tokens.revoke");
      // journal the intent BEFORE delegating. D-384: a scoped revoke no longer
      // touches this compartment's own tokens (per-record revocation, not a
      // global generation bump) — the intent-first order is kept anyway so the
      // intent is durable even for the revoke-all path, which does invalidate
      // our own journal token (post-revoke appends then fail closed, best-effort).
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

    /** Forbidden-action overlay: replace a principal's forbidden op list (empty array clears).
     *  Payload {principal, ops: string[]}. READ-risk like every law contract — the
     *  enforcement lives in law.check@1, which denies matches before policy eval.
     *  D-325: with vault caps granted, the write is journaled to vault ns "law"
     *  AFTER the in-memory set — an append failure rolls the set back and aborts
     *  fail-closed (the spawn that triggered it aborts too, per agent.spawn). */
    "law.forbidden.set@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      // set() validates shape at runtime (fail-closed → DEGRADED); casts only satisfy the signature.
      const rawPrincipal = p["principal"] as string;
      const prior = forbiddenTable.list().find((e) => e.principal === rawPrincipal)?.ops;
      const entry = forbiddenTable.set(p["principal"] as string, p["ops"] as string[]);
      bump();
      registry.countEvent();
      if (forbiddenPersistence) {
        if (!ctx) {
          // No port outside a worker — roll back, never leave a write half-done.
          if (prior === undefined) forbiddenTable.clear(entry.principal);
          else forbiddenTable.set(entry.principal, prior);
          throw new Error("law.forbidden.set: no plugin context — vault append impossible, set aborted fail-closed");
        }
        try {
          const r = await ctx.port.call("vault.append@1", {
            ns: FORBIDDEN_NS,
            id: forbiddenVaultId(entry.principal),
            data: toRecord(entry),
          });
          if (!r.ok) throw new Error(`vault.append@1 ${r.error}: ${r.detail ?? "no detail"}`);
        } catch (e) {
          // Roll the in-memory set back — a half-persisted overlay is worse than none.
          if (prior === undefined) forbiddenTable.clear(entry.principal);
          else forbiddenTable.set(entry.principal, prior);
          throw new Error(
            `law.forbidden.set: vault append failed — set aborted fail-closed ` +
            `(missing dependency vivim.vault queryable?): ${String(e)}`,
          );
        }
      }
      await journal(ctx, {
        source: "vivim.law", op: "law.forbidden.set", action: "set",
        principal: entry.principal, ops: entry.ops,
        caller: meta.from, causationId: meta.causationId,
      });
      return { principal: entry.principal, ops: entry.ops, count: entry.ops.length, generation, persisted: forbiddenPersistence };
    },

    /** Forbidden-overlay reload (D-325): re-read vault ns "law" prefix
     *  "forbidden:" into the in-memory table. READ-risk. The boot path calls
     *  the same mapping automatically; this op is the deterministic handle for
     *  tests and for operator recovery after a vault outage. Throws DEGRADED
     *  naming vivim.vault when the vault is absent or unqueryable — never an
     *  empty-table silent success. */
    "law.forbidden.reload@1": async (_payload: unknown, ctx: PluginContext | null, _meta: CallMeta) => {
      registry.countEvent();
      if (!forbiddenPersistence) {
        return { loaded: true, persistence: false, count: forbiddenTable.list().filter((e) => e.ops.length > 0).length };
      }
      if (!ctx) throw new Error("law.forbidden.reload: no plugin context — missing dependency vivim.vault queryable");
      const count = await reloadForbidden(ctx);
      return { loaded: true, persistence: true, count };
    },

    /** D-412 (S2) — register a principal identity row. Idempotent while
     *  active (returns the existing record); REFUSES PRINCIPAL_REUSED when
     *  the id was retired — the string can never become a different record
     *  (the non-reuse invariant, enforced). */
    "law.principal.register@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      if (!principal) throw new Error("law.principal.register: payload requires {principal}");
      registry.countEvent();
      if (!ctx || !ctx.capabilities.includes("port:vault.append@1") || !ctx.capabilities.includes("port:vault.get@1")) {
        throw new Error("law.principal.register: requires port:vault.append@1 + port:vault.get@1 (identity rows ARE the seam — memory-only is not a posture here, unlike the forbidden overlay)");
      }
      const existing = await readPrincipalRecord(ctx, principal);
      if (existing !== null && existing.state === "retired") {
        throw new Error(`law.principal.register: PRINCIPAL_REUSED — '${principal}' was retired and can never be re-registered (non-reuse invariant, D-412)`);
      }
      if (existing !== null) {
        return { principal: existing.principal, kind: existing.kind, state: existing.state, generation: existing.generation, registeredAt: existing.registeredAt, alreadyRegistered: true };
      }
      const rec = newRecord(principal);
      const r = await ctx.port.call("vault.append@1", { ns: PRINCIPAL_NS, id: principalVaultId(principal), data: rec });
      if (!r.ok) throw new Error(`law.principal.register: vault append ${r.error}: ${r.detail ?? "no detail"} — refused fail-closed`);
      registry.observe(principal, "active", "principal.register");
      await journal(ctx, { source: "vivim.law", op: "law.principal.register", principal, kind: rec.kind, caller: meta.from, causationId: meta.causationId });
      return { principal: rec.principal, kind: rec.kind, state: rec.state, generation: rec.generation, registeredAt: rec.registeredAt, alreadyRegistered: false };
    },

    /** D-412 (S2) — retire a principal identity row. Retired is FOREVER:
     *  the row stays (retention: forever), the id is dead. Refuses
     *  PRINCIPAL_UNKNOWN (absent) and PRINCIPAL_RETIRED (already retired). */
    "law.principal.retire@1": async (payload: unknown, ctx: PluginContext | null, meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      if (!principal) throw new Error("law.principal.retire: payload requires {principal}");
      registry.countEvent();
      if (!ctx || !ctx.capabilities.includes("port:vault.append@1") || !ctx.capabilities.includes("port:vault.get@1")) {
        throw new Error("law.principal.retire: requires port:vault.append@1 + port:vault.get@1");
      }
      const existing = await readPrincipalRecord(ctx, principal);
      if (existing === null) {
        throw new Error(`law.principal.retire: PRINCIPAL_UNKNOWN — '${principal}' has no identity row`);
      }
      if (existing.state === "retired") {
        throw new Error(`law.principal.retire: PRINCIPAL_RETIRED — '${principal}' is already retired (retired is forever, D-412)`);
      }
      const rec = retireRecord(existing);
      const r = await ctx.port.call("vault.append@1", { ns: PRINCIPAL_NS, id: principalVaultId(principal), data: rec });
      if (!r.ok) throw new Error(`law.principal.retire: vault append ${r.error}: ${r.detail ?? "no detail"} — refused fail-closed`);
      registry.observe(principal, "retired", "principal.retire");
      await journal(ctx, { source: "vivim.law", op: "law.principal.retire", principal, caller: meta.from, causationId: meta.causationId });
      return { principal: rec.principal, state: rec.state, retiredAt: rec.retiredAt, generation: rec.generation };
    },

    /** D-412 (S2) — READ a principal identity row: the record or
     *  {found: false}. Never throws on absence — absence is data. */
    "law.principal.get@1": async (payload: unknown, ctx: PluginContext | null, _meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      if (!principal) throw new Error("law.principal.get: payload requires {principal}");
      registry.countEvent();
      if (!ctx || !ctx.capabilities.includes("port:vault.get@1")) {
        throw new Error("law.principal.get: requires port:vault.get@1");
      }
      const rec = await readPrincipalRecord(ctx, principal);
      if (rec === null) return { found: false, principal };
      return { found: true, ...rec };
    },

    /** D-353 — the principal describe read (agent.describe@1's law-side mirror).
     *  One call answers: who is this principal (kind), what may they NEVER do
     *  (the forbidden overlay, with its persistence posture), which consents
     *  are theirs (principal-narrowed active grants only), and the law
     *  generation they were described at. READ — mutates nothing; the
     *  combination rule (identity.state × contract.state, D-315) is realized
     *  by the same per-principal walk every other law op uses: forbidden,
     *  policy, and consent tables are all keyed per-principal already, so
     *  `user:<id>` needs zero new tables — only this acceptance of the prefix. */
    "law.describe@1": (payload: unknown, _ctx: PluginContext | null, _meta: CallMeta) => {
      const p = asObj(payload);
      const principal = str(p["principal"]);
      if (!principal) throw new Error("law.describe: payload requires {principal}");
      registry.countEvent();
      const entry = forbiddenTable.list().find((e) => e.principal === principal);
      const forbidden: { ops: string[]; persisted: boolean } = {
        ops: entry?.ops ?? [],
        persisted: forbiddenPersistence,
      };
      const consents = consentTable.listFor(principal).map((r) => ({
        consentId: r.consentId,
        grantedAt: r.grantedAt,
        generation: r.generation,
        active: r.active,
        ...(r.scope !== undefined ? { scope: r.scope } : {}),
      }));
      const out: { principal: string; kind: PrincipalKind; forbidden: { ops: string[]; persisted: boolean }; consents: ReturnType<typeof consents>; generation: number } = {
        principal,
        kind: principalKind(principal),
        forbidden,
        consents,
        generation,
      };
      return out;
    },
  },
});

startPlugin(def); // no-op outside a worker (tests / FakeHost): the def stays pure
