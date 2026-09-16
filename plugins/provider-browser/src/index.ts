// plugins/provider-browser — index.ts (D-357, M0: the BROWSER_MEDIATED realization)
// The first provider to hold a categorically larger trust surface than any
// capability token before it (D-338): it reads and writes another
// application's UI state. In-sandbox it is a FIXTURE realization — the CDP
// leg is owner-machine-only, future work, and never silently simulated.
//
// Ops exposed (PROVIDER contributions, see plugin.json — risk lives on
// pack.domain-email's contract declarations, the cross-plugin pattern):
//   browser.attach@1   {captureText, archetypeSlug?, parserVersion?}
//                      → {sessionId, captureRef, redactions, integrity}
//                      M12/D-356 ordering law: the capture runs through
//                      credential.redact@1 BEFORE the vault sees it; the
//                      integrity hash is computed over the already-redacted
//                      bytes, which are the only bytes that exist.
//   browser.release@1  {sessionId} → {sessionId, status: "RELEASED", rev}
//   message.send@1     {sessionId, to, subject, body, threadId?}
//                      → {messageId, rev, sentAt, chunks}
//                      FOUR FAIL-CLOSED BARS (all four, in order, every send):
//                        1. the day-one fence holds (forbidden entries
//                           registered at onInit; sends fail closed while not)
//                        2. the session is attached (row resolves, ATTACHED,
//                           provider browser, archetype message.send)
//                        3. the realization is PROMOTED (discovery.verify's
//                           standard lifecycle — never self-declared)
//                        4. a pin covers the parser version (D-355 — the pin
//                           the run verified against covers BOTH the session's
//                           parser version and the manifest's)
//                      The replay emits ordered chunks via meta.emit (D-352
//                      sequence discipline); the message lands ns "email"
//                      pack-schema-exact with provenance refs.
//
// Handlers throw on bad payloads / failed port calls → DEGRADED at the boundary.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult, ProviderRealization, StreamChunk } from "@vivim/omega-contracts";
import { buildChunkEnvelope, pinMatches } from "@vivim/omega-contracts";
import { createHash, randomBytes } from "node:crypto";
import { PARSER_VERSION, resolveParser } from "./parsers.ts";
import {
  asCaptureRecord, asSessionRecord, buildCaptureRecord, buildSessionRecord,
  captureId, PROVIDERS_NS, sessionId,
} from "./session.ts";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`provider-browser: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

/** Read-or-null: a failed get becomes null so the caller's BAR can produce
 *  the attributable refusal (a missing session/realization is a BAR error,
 *  not a raw vault DEGRADED — the bars name themselves). */
async function tryGet<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T | null> {
  const r: PortResult = await ctx.port.call(op, payload);
  return r.ok ? (r.value as T) : null;
}

function reqStr(op: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${op}: ${field} must be a non-empty string`);
  return v;
}

interface BrowserConfig {
  from: string;
  fencePrincipals: string[];
  fenceOps: string[];
  fencedRecipients: string[];
}

function resolveConfig(ctx: PluginContext): BrowserConfig {
  const c = (ctx.config ?? {}) as Record<string, unknown>;
  return {
    from: typeof c.from === "string" && c.from.length > 0 ? c.from : "pilot@omega.local",
    fencePrincipals: Array.isArray(c.fencePrincipals) ? (c.fencePrincipals as string[]) : ["agent:pilot"],
    fenceOps: Array.isArray(c.fenceOps) && c.fenceOps.length > 0
      ? (c.fenceOps as string[])
      : ["credential.use@1", "browser.navigate@1", "browser.eval@1"],
    fencedRecipients: Array.isArray(c.fencedRecipients) ? (c.fencedRecipients as string[]) : [],
  };
}

/** The send payload validation (pack-schema inputs; fail-closed). */
function validateSendPayload(op: string, payload: unknown): { sessionId: string; to: string; subject: string; body: string; threadId?: string } {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object {sessionId, to, subject, body}`);
  }
  const p = payload as Record<string, unknown>;
  const sessionIdV = reqStr(op, "sessionId", p.sessionId);
  if (!sessionIdV.startsWith("session:")) throw new Error(`${op}: sessionId must use the session: prefix`);
  const to = reqStr(op, "to", p.to);
  if (!to.includes("@")) throw new Error(`${op}: to must be an address (contains '@')`);
  const subject = reqStr(op, "subject", p.subject);
  if (typeof p.body !== "string") throw new Error(`${op}: body must be a string`);
  const threadId = p.threadId === undefined ? undefined : reqStr(op, "threadId", p.threadId);
  return { sessionId: sessionIdV, to, subject, body: p.body, ...(threadId !== undefined ? { threadId } : {}) };
}

function threadIdFor(subject: string, to: string): string {
  return `thread_${createHash("sha256").update(`${subject}\u0000${to}`).digest("hex").slice(0, 12)}`;
}

/** Fence coverage snapshot from the last onInit (E-6): which pilot principals
 *  registered their day-one forbidden entries. Bar 1 cites these counts so a
 *  half-registered fence is machine-readable in the refusal, not just in logs. */
export const fenceSnapshot: { registered: string[]; failed: string[] } = { registered: [], failed: [] };

export const def = definePlugin({
  onInit: async (ctx: PluginContext) => {
    const cfg = resolveConfig(ctx);
    // The DAY-ONE FENCE (D-338): before any send can even be attempted, this
    // plugin registers the never-invocations for its pilot principals through
    // law.forbidden.set@1 — the law-reviewed authority D-338 ratified. Sends
    // fail closed while the registration has not succeeded (bar 1).
    let registered = 0;
    fenceSnapshot.registered.length = 0;
    fenceSnapshot.failed.length = 0;
    for (const principal of cfg.fencePrincipals) {
      try {
        await portCall<VaultAppendResult>(ctx, "law.forbidden.set@1", { principal, ops: cfg.fenceOps });
        registered += 1;
        fenceSnapshot.registered.push(principal);
      } catch (e) {
        fenceSnapshot.failed.push(principal);
        ctx.log(`provider-browser: fence registration for ${principal} FAILED (${String(e)}) — sends stay fail-closed for that principal's checks`);
      }
    }
    // Gate-scoped flag: the fence holds only when every configured principal
    // registered. (Vault-durable law reloads these rows at ITS boot; the
    // plugin's own bar is that ITS registration call succeeded this boot.)
    (ctx as PluginContext & { __browserFenceHolds?: boolean }).__browserFenceHolds = registered === cfg.fencePrincipals.length;
    ctx.log(
      `provider-browser up (D-357) — fixture realization, parser v${PARSER_VERSION}, ` +
      `fence ${registered}/${cfg.fencePrincipals.length} principals ` +
      `(ops: ${cfg.fenceOps.join(", ")}), CDP leg owner-machine-only`,
    );
  },

  ops: {
    "browser.attach@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "browser.attach@1";
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`${op}: payload must be an object {captureText, archetypeSlug?, parserVersion?}`);
      }
      const p = payload as Record<string, unknown>;
      const captureText = reqStr(op, "captureText", p.captureText);
      const manifestParserVersion = ctx.manifest.contributions.parser?.[0]?.version;
      if (typeof manifestParserVersion !== "string") {
        throw new Error(`${op}: manifest declares no parser contribution — refusing (fail-closed)`);
      }
      const parserVersion = p.parserVersion === undefined ? manifestParserVersion : reqStr(op, "parserVersion", p.parserVersion);
      if (parserVersion !== manifestParserVersion) {
        throw new Error(`${op}: requested parser version ${parserVersion} does not match the manifest's ${manifestParserVersion} — refusing (fail-closed genealogy)`);
      }
      const archetypeSlug = p.archetypeSlug === undefined ? "message.send" : reqStr(op, "archetypeSlug", p.archetypeSlug);

      // M12/D-356 ordering law: REDACT BEFORE the vault sees the bytes.
      const red = await portCall<{ redacted: string; redactions: number; policyVersion: string }>(
        ctx, "credential.redact@1", { bytes: captureText },
      );
      const integrity = createHash("sha256").update(red.redacted, "utf-8").digest("hex");

      const capture = buildCaptureRecord({
        archetypeSlug, parserVersion,
        redactedText: red.redacted, redactions: red.redactions, integrity,
      });
      const capId = captureId(`cap_${randomBytes(8).toString("hex")}`);
      const capAppend = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: PROVIDERS_NS, id: capId, data: capture,
        meta: { type: "capture", kind: "browser-page", archetype: archetypeSlug, parserVersion, redactions: red.redactions },
        refs: [],
      });

      const session = buildSessionRecord({
        sessionId: sessionId(`sess_${randomBytes(8).toString("hex")}`),
        archetypeSlug, parserVersion,
        captureRef: { ns: PROVIDERS_NS, id: capId, rev: capAppend.rev },
      });
      const sessAppend = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: PROVIDERS_NS, id: session.sessionId, data: session,
        meta: { type: "session", archetype: archetypeSlug, provider: "browser", status: session.status },
        refs: [{ ns: PROVIDERS_NS, id: capId, rev: capAppend.rev }],
      });

      ctx.log(`provider-browser: attached ${session.sessionId} (${archetypeSlug}, parser v${parserVersion}, ${red.redactions} redaction(s) before vault)`);
      return {
        sessionId: session.sessionId,
        captureRef: session.captureRef,
        redactions: red.redactions,
        integrity,
        rev: sessAppend.rev,
      };
    },

    "browser.release@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "browser.release@1";
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`${op}: payload must be an object {sessionId}`);
      }
      const sid = reqStr(op, "sessionId", (payload as Record<string, unknown>).sessionId);
      const got = await portCall<VaultGetResult>(ctx, "vault.get@1", { ns: PROVIDERS_NS, id: sid });
      const session = asSessionRecord(got.data);
      if (!session) throw new Error(`${op}: session ${sid} is malformed — refusing (fail-closed)`);
      if (session.status !== "ATTACHED") throw new Error(`${op}: session ${sid} is ${session.status}, not ATTACHED`);
      const w = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: PROVIDERS_NS, id: session.sessionId,
        data: { ...session, status: "RELEASED" },
        meta: { type: "session", archetype: session.archetypeSlug, provider: "browser", status: "RELEASED" },
        refs: [session.captureRef],
      });
      return { sessionId: session.sessionId, status: "RELEASED", rev: w.rev };
    },

    "message.send@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta) => {
      const op = "message.send@1";
      const cfg = resolveConfig(ctx);

      // ── Bar 1 — the day-one fence holds ────────────────────────────────
      const fenceHolds = (ctx as PluginContext & { __browserFenceHolds?: boolean }).__browserFenceHolds === true;
      if (!fenceHolds) {
        throw new Error(
          `${op}: browser fence incomplete (registered ${fenceSnapshot.registered.length}, failed [${fenceSnapshot.failed.join(", ")}]) — day-one forbidden entries are not registered; sends fail closed (D-338/D-357 bar 1)`,
        );
      }
      const input = validateSendPayload(op, payload);
      if (cfg.fencedRecipients.some((r) => input.to === r || input.to.endsWith(`@${r}`))) {
        throw new Error(`${op}: recipient ${input.to} is fenced by the composition's day-one entries — refusing`);
      }

      // ── Bar 2 — the session is attached ────────────────────────────────
      const sessGot = await tryGet<VaultGetResult>(ctx, "vault.get@1", { ns: PROVIDERS_NS, id: input.sessionId });
      const session = sessGot ? asSessionRecord(sessGot.data) : null;
      if (!session) throw new Error(`${op}: session ${input.sessionId} is missing or malformed — refusing (bar 2)`);
      if (session.status !== "ATTACHED") throw new Error(`${op}: session ${input.sessionId} is ${session.status} — refusing (bar 2)`);
      if (session.archetypeSlug !== "message.send") throw new Error(`${op}: session realizes ${session.archetypeSlug}, not message.send (bar 2)`);

      // ── Bar 3 — the realization is PROMOTED (standard lifecycle) ───────
      const realId = `realization:message.send:browser`;
      const realGot = await tryGet<VaultGetResult>(ctx, "vault.get@1", { ns: PROVIDERS_NS, id: realId });
      const realization = realGot ? (realGot.data as ProviderRealization | null) : null;
      if (!realization || typeof realization !== "object") {
        throw new Error(`${op}: no realization row for ${realId} — run discovery.verify@1 first (bar 3)`);
      }
      if (realization.status !== "PROMOTED") {
        throw new Error(`${op}: realization ${realId} is ${String((realization as { status?: unknown }).status)}, not PROMOTED — refusing (bar 3)`);
      }
      if (realization.providerClass !== "BROWSER_MEDIATED") {
        throw new Error(`${op}: realization ${realId} is ${String(realization.providerClass)} — the browser bar demands BROWSER_MEDIATED (bar 3)`);
      }

      // ── Bar 4 — a pin covers the parser version ────────────────────────
      const manifestParserVersion = ctx.manifest.contributions.parser?.[0]?.version ?? PARSER_VERSION;
      if (session.parserVersion !== manifestParserVersion) {
        throw new Error(`${op}: session parser v${session.parserVersion} does not match the manifest's v${manifestParserVersion} — refusing (bar 4)`);
      }
      const pins = realization.parserPins ?? [];
      const covered = pins.some((pin) => pinMatches(pin, "browser", "message.send", session.parserVersion));
      if (!covered) {
        throw new Error(`${op}: no verified pin covers browser/message.send v${session.parserVersion} (pins: ${pins.length}) — refusing (bar 4)`);
      }

      // ── The gated replay ───────────────────────────────────────────────
      const capGot = await portCall<VaultGetResult>(ctx, "vault.get@1", {
        ns: session.captureRef.ns, id: session.captureRef.id, rev: session.captureRef.rev,
      });
      const capture = asCaptureRecord(capGot.data);
      if (!capture) throw new Error(`${op}: capture row ${session.captureRef.id} is malformed — refusing (fail-closed)`);
      const parsed = resolveParser(session.parserVersion).transform(capture.redactedText);
      const chunks: StreamChunk[] = buildChunkEnvelope(meta.causationId, parsed); // exactly-one-final, seq discipline pre-checked
      for (const c of chunks) meta.emit(c.data, c.final); // the shim enforces strict seq + close-once (D-352)

      const id = `msg_${randomBytes(8).toString("hex")}`;
      const sentAt = Date.now();
      const message = {
        id,
        threadId: input.threadId ?? threadIdFor(input.subject, input.to),
        folder: "sent",
        from: cfg.from,
        to: input.to,
        subject: input.subject,
        body: input.body,
        sentAt,
        flags: { seen: true, flagged: false, draft: false }, // materialized in state sent (pack state machine)
      };
      const append = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: "email", id, data: message,
        meta: { type: "message", provider: "browser", sessionId: session.sessionId, captureRef: session.captureRef },
        refs: [{ ns: PROVIDERS_NS, id: session.sessionId, rev: sessGot.rev }, session.captureRef],
      });
      void meta.causationId; // stamped into the vault changelog by the vault itself
      return { messageId: id, rev: append.rev, sentAt, chunks: chunks.length };
    },
  },
});

startPlugin(def);
