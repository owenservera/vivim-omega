// surfaces/web/src/api.ts — the console HTTP surface (Ω13).
//
// The ROOT PRINCIPAL pattern (docs/SURFACES.md): this process holds the booted host and
// calls router.callAsRoot — every NL command enters the SAME Gate → Resolve → Execute
// flow as any in-compartment call. The surface adds NO policy of its own: consent ids
// come from the law, refusals pass through, the NCLL interpretation is the deterministic
// pure engine (same bytes as the browser runs — N1).
import type { BootedHost } from "@vivim/omega-host";
import type { PortResult } from "@vivim/omega-contracts";
import { interpret } from "@vivim/omega-nlcl-pure";
import type { Interpretation, IR, WorldModel } from "@vivim/omega-nlcl-pure";
import { consentIdFor } from "@vivim/omega-contracts"; // stable (principal, op) derivation — the single contracts definition
import { journalTail as vaultJournalTail, journalHistory as vaultJournalHistory, type JournalLine } from "./events.ts";

export interface ExecuteOutcome {
  interpretation: Interpretation;
  surface?: { kind: "help" | "entity" | "assist"; payload: Record<string, unknown> };
  executed: boolean;
  op?: string;
  result?: unknown;
  refused?: { op: string; principal: string; consentId?: string; detail: string };
  ruleActionConsent?: { principal: string; op: string; consentId?: string; decision: string };
  /** D-411 (S1) — the canonical-intent seam: the persisted artifact this
   *  command resolved through (undefined iff the seam was unavailable or the
   *  command never reached a submit). */
  intentRef?: string;
  payloadHash?: string;
  /** D-411 (S1) — the four-state terminal resolution of this command
   *  (UNDERSTOOD is the submit state itself, not an outcome field). */
  resolution?: "AMBIGUOUS" | "REFUSED" | "EXECUTED";
  /** D-411 (S1) — true iff the `:res` row write came back OK (the seam's
   *  bookkeeping is best-effort by the surface, but its success is reported,
   *  never assumed). */
  resolutionRecorded?: boolean;
  worldV: number;
}

export interface ConsoleService {
  host: BootedHost;
  /** mind.snapshot@1 through the router (root principal). */
  world(): Promise<WorldModel>;
  /** mind.snapshot@1 with includeBodies:false — the poll's version-check path
   *  (D-387): v is a function of evidence counts, so the light snapshot detects
   *  exactly the same version bumps without re-fetching every body. */
  worldLight(): Promise<WorldModel>;
  /** Authoritative interpret (same pure engine the browser runs). */
  interpretText(text: string): Promise<Interpretation>;
  /** NL → interpret → route. Consent refusals pass through as data for the confirm card. */
  execute(text: string): Promise<ExecuteOutcome>;
  /** The ✓ confirm card: grant a consent. D-384: the consent id is the ONLY client
   *  input — principal is NOT client-suppliable. Ids are deterministic hashes of
   *  (principal, op), so the id alone carries the ceremony; letting a network
   *  client name an arbitrary principal enabled cross-principal consent forgery. */
  consent(consentId: string): Promise<{ granted: boolean; detail?: string }>;
  /** The opt-in LLM edge (N2): a SUGGESTION, never an execution. */
  assist(text: string): Promise<{ suggestion: string; sim: boolean }>;
  /** D-416 (S3, the fold's read side): the journal tail's one tick — new ns-law
   *  vault rows since `seen` (ids added to the set on success; a failed fetch
   *  retries the same rows next tick, never drops them). */
  journalTail(seen: Set<string>): Promise<JournalLine[]>;
  /** D-416 (S3): the connect-time bounded history — the last `maxLines`
   *  journal rows from the vault (one light query + getmany for ONLY those
   *  bodies — cost tracks what is shown, the D-387 discipline). */
  journalHistory(maxLines?: number): Promise<JournalLine[]>;
  /** D-416 (S3): the audit-chain persistence point at close — drains the
   *  kernel's signed chain into vault ns "audit" through law.audit.drain@1.
   *  Best-effort at close: the outcome is reported, never thrown. */
  auditDrain(): Promise<{ drained?: number; headHash?: string; verified?: boolean; detail?: string }>;
  uptimeMs(): number;
}

interface MindSnapshotResult { world: WorldModel }
interface LawDecisionResult { decision: "allow" | "deny" | "require-consent"; consentId?: string; reason?: string; principal?: string }

export function createConsoleService(host: BootedHost, startedAt: number): ConsoleService {
  const call = async <T>(op: string, payload: unknown): Promise<PortResult> =>
    host.router.callAsRoot(op, payload, 8000);

  const world = async (): Promise<WorldModel> => {
    const r = await call("mind.snapshot@1", {});
    if (!r.ok) throw new Error(`mind.snapshot@1 ${r.error}: ${r.detail ?? ""}`);
    return (r.value as MindSnapshotResult).world;
  };

  // D-387 (perf review #1): bodies are the heavy half of a snapshot; the poll
  // only needs v. Same machinery, includeBodies:false (v is count-derived —
  // identical version detection, a fraction of the bytes).
  const worldLight = async (): Promise<WorldModel> => {
    const r = await call("mind.snapshot@1", { includeBodies: false });
    if (!r.ok) throw new Error(`mind.snapshot@1 ${r.error}: ${r.detail ?? ""}`);
    return (r.value as MindSnapshotResult).world;
  };

  const interpretText = async (text: string): Promise<Interpretation> => {
    if (typeof text !== "string") throw new Error("text must be a string");
    const w = await world();
    return interpret(text, w);
  };

  // D-411 (S1): the four-state resolution bookkeeping — best-effort by the
  // surface (a row-family write failure is VISIBLE: ExecuteOutcome simply
  // lacks intentRef/resolution), never a thrown error on the user's command.
  const recordResolution = async (row: Record<string, unknown>): Promise<boolean> => {
    const r = await call("intent.resolution@1", row);
    if (!r.ok) return false;
    const o = (r.value ?? {}) as { status?: string };
    return o.status === "OK";
  };

  const execute = async (text: string): Promise<ExecuteOutcome> => {
    const interp = await interpretText(text);
    const w = await world();
    const ir = interp.ir;
    const out: ExecuteOutcome = { interpretation: interp, executed: false, worldV: w.v };

    // surface pseudo-intents (the language layer describes them; the SURFACE serves them).
    // D-411 (S1): genuinely-ambiguous commands (the assist family, or no IR at
    // all, on non-empty input) record an AMBIGUOUS resolution row — the
    // clarification loop's evidence. surface.help / surface.entity are console
    // queries, not governed events — no rows.
    if (!ir || ir.intent.startsWith("surface.")) {
      if (text.trim().length > 0 && (!ir || ir.intent === "surface.assist")) {
        out.resolution = "AMBIGUOUS";
        out.resolutionRecorded = await recordResolution({
          resolution: "AMBIGUOUS",
          text,
          ...(interp.reading !== null ? { reading: interp.reading } : {}),
          interpStatus: interp.status,
        });
      }
      out.surface = surfacePayload(ir, interp, w);
      out.executed = false;
      return out;
    }

    // D-411 (S1) — the canonical-intent seam, live path:
    //   interpret -> persist (UNDERSTOOD) -> gate WITH citation -> execute -> resolve.
    // The submit persists the canonical artifact; the pre-gate call below is
    // the same law.check@1 the host's own mechanical gate runs for risky ops
    // (defense in depth — two journal rows, one citation).
    const sub = await call("intent.submit@1", {
      type: ir.intent,
      payload: ir.payload,
      interpretation: {
        text,
        canonical: interp.canonical,
        reading: interp.reading,
        confidence: interp.confidence,
        status: interp.status,
      },
    });
    if (sub.ok) {
      // the intent ops speak the Outcome convention ({status, value}) — the
      // transport result wraps it once more (r.value = the Outcome).
      const o = (sub.value ?? {}) as { status?: string; value?: { intentId?: string; payloadHash?: string } };
      if (o.status === "OK" && o.value && typeof o.value["intentId"] === "string") {
        out.intentRef = o.value["intentId"];
        if (typeof o.value["payloadHash"] === "string") out.payloadHash = o.value["payloadHash"];
      }
    }

    // the consent pre-check for rule actions: one combined card at rule creation.
    // Always emitted (both decisions): with require-consent it names the id to
    // grant; with allow it reports the already-active id (stable per
    // (principal, op), so a pre-granted consent shows the same id).
    if (ir.intent === "director.rule@1") {
      const check = await call("law.check@1", { principal: "vivim.director", op: "message.send@1" });
      if (check.ok) {
        const d = check.value as LawDecisionResult;
        out.ruleActionConsent = {
          principal: "vivim.director",
          op: "message.send@1",
          consentId: d.consentId ?? consentIdFor("vivim.director", "message.send@1"),
          decision: d.decision,
        };
      }
    }

    // D-411 (S1): the canonical gate call — principal/op identical to the
    // host's own gate for the routed call, but carrying the citation
    // {intentRef, payloadHash}. A deny or require-consent decision resolves
    // the command as REFUSED (the ✓ card carries the structured decision —
    // the consent id comes from the law, not regex extraction).
    // CONDITION: mirror the host's gating condition — only ops the host would
    // gate (catalog risk MUTATION / EXTERNAL_MUTATION; unknown ops fail-closed
    // to gated) get the pre-gate. ENGINE/READ ops are not host-gated and must
    // not be pre-gated either, or the surface would refuse commands the host
    // would run (the parity lesson: one gating condition, two enforcement
    // points — defense in depth, not divergence).
    const catalogRisk = w.ops.find((o) => o.op === ir.intent)?.risk;
    const preGate = catalogRisk === undefined || catalogRisk === "MUTATION" || catalogRisk === "EXTERNAL_MUTATION";
    if (out.intentRef !== undefined && preGate) {
      const gate = await call("law.check@1", {
        principal: "root",
        op: ir.intent,
        payload: ir.payload,
        intentRef: out.intentRef,
        ...(out.payloadHash !== undefined ? { payloadHash: out.payloadHash } : {}),
      });
      if (gate.ok) {
        const d = gate.value as LawDecisionResult;
        if (d.decision === "deny" || d.decision === "require-consent") {
          out.refused = { op: ir.intent, principal: "root", consentId: d.consentId, detail: d.reason ?? "" };
          out.resolution = "REFUSED";
          out.resolutionRecorded = await recordResolution({
            resolution: "REFUSED",
            intentRef: out.intentRef,
            ...(out.payloadHash !== undefined ? { payloadHash: out.payloadHash } : {}),
            decision: d.decision,
            ...(d.consentId !== undefined ? { consentId: d.consentId } : {}),
            text,
          });
          return out;
        }
      }
      // A failed pre-gate (e.g. DEGRADED — law unroutable) falls through to
      // the routed call: the host's own fail-closed gate decides, exactly the
      // pre-D-411 posture.
    }

    const r = await call(ir.intent, ir.payload);
    out.op = ir.intent;
    let refused: ExecuteOutcome["refused"];
    if (r.ok) {
      out.executed = true;
      out.result = r.value;
    } else {
      // REFUSED with a consentId → the confirm card (the ✓ family); other errors pass raw
      const consentId = extractConsentId(r.detail ?? "");
      refused = { op: ir.intent, principal: "root", consentId, detail: r.detail ?? r.error };
      out.refused = refused;
    }
    const resolution: "EXECUTED" | "REFUSED" = !r.ok && refused?.consentId !== undefined ? "REFUSED" : "EXECUTED";
    out.resolution = resolution;
    if (out.intentRef !== undefined) {
      out.resolutionRecorded = await recordResolution({
        resolution,
        intentRef: out.intentRef,
        ...(out.payloadHash !== undefined ? { payloadHash: out.payloadHash } : {}),
        text,
        outcome: r.ok ? { ok: true } : { ok: false, error: r.error, detail: r.detail ?? null },
      });
    }
    return out;
  };

  const consent = async (consentId: string): Promise<{ granted: boolean; detail?: string }> => {
    if (typeof consentId !== "string" || !/^consent_[0-9a-f]+$/.test(consentId)) {
      return { granted: false, detail: "consentId must match consent_<hex>" };
    }
    // D-384: no principal passthrough — the law-side binding (non-root callers may
    // only manage their own consents) plus this surface rule close the forgery path.
    const r = await call("law.consent.grant@1", { consentId });
    if (!r.ok) return { granted: false, detail: `${r.error}: ${r.detail ?? ""}` };
    const v = (r.value ?? {}) as Record<string, unknown>;
    return { granted: true, detail: `generation ${String(v["generation"] ?? "?")} · ${String(v["active"] ?? "?")} active consents` };
  };

  const assist = async (text: string): Promise<{ suggestion: string; sim: boolean }> => {
    if (typeof text !== "string" || text.trim().length === 0) throw new Error("assist: text required");
    const r = await call("chat.complete@1", {
      messages: [
        { role: "system", content: "You are the suggestion edge of the vivim-omega console. The deterministic NCLL engine could not confidently parse the user's command. Suggest ONE concrete command they could try, using the known verbs (send, list, search, read, move, simulate, when … forward it to …, teach … means …). Answer with the suggestion only." },
        { role: "user", content: text },
      ],
      temperature: 0.4,
      maxTokens: 48,
    });
    if (!r.ok) throw new Error(`chat.complete@1 ${r.error}: ${r.detail ?? ""}`);
    const v = r.value as { completion?: { content?: string }; sim?: boolean };
    return { suggestion: v.completion?.content ?? "", sim: v.sim ?? false };
  };

  // D-416 (S3): the fold's read side + the drain — the root-call adapter feeds
  // the pure readers in events.ts (same surface, no cross-surface imports).
  const rootCall = (op: string, payload?: unknown): Promise<PortResult> => call(op, payload ?? {});
  const journalTail = (seen: Set<string>): Promise<JournalLine[]> => vaultJournalTail(rootCall, seen);
  const journalHistory = (maxLines?: number): Promise<JournalLine[]> => vaultJournalHistory(rootCall, maxLines ?? 60);

  /** Best-effort by design (close must complete): the drain's failure mode is a
   *  reported detail, never a thrown error — the chain stays in memory either
   *  way, the caller decides what a skipped drain means. */
  const auditDrain = async (): Promise<{ drained?: number; headHash?: string; verified?: boolean; detail?: string }> => {
    try {
      const r = await call("law.audit.drain@1", {});
      if (!r.ok) return { detail: `law.audit.drain@1 ${r.error}: ${r.detail ?? ""}` };
      const v = (r.value ?? {}) as { drained?: number; headHash?: string; verified?: boolean };
      return { drained: v.drained, headHash: v.headHash, verified: v.verified };
    } catch (e) {
      return { detail: String(e) };
    }
  };

  return { host, world, worldLight, interpretText, execute, consent, assist, journalTail, journalHistory, auditDrain, uptimeMs: () => Date.now() - startedAt };
}

function surfacePayload(ir: IR | null, interp: Interpretation, w: WorldModel): { kind: "help" | "entity" | "assist"; payload: Record<string, unknown> } {
  if (ir?.intent === "surface.entity") {
    const entityId = (ir.payload as { entityId?: string })["entityId"];
    const entity = w.entities.find((e) => e.id === entityId) ?? null;
    const slot = ir.slots["entity"];
    return { kind: "entity", payload: { entity, matches: slot?.matches ?? [] } };
  }
  if (ir?.intent === "surface.assist") {
    return { kind: "assist", payload: { q: (ir.payload as { q?: string })["q"] ?? interp.input } };
  }
  // surface.help (and anything else): the capability catalog
  return {
    kind: "help",
    payload: {
      focus: (ir?.payload as { focus?: string } | undefined)?.["focus"] ?? null,
      ops: w.ops,
      examples: [
        "send this to Peter",
        "send 'quarterly numbers attached' to Maria",
        "when Peter messages me, forward it to Sarah",
        "simulate a message from Peter saying 'the report is ready'",
        "teach blitz means send",
        "list my inbox · search merkle · read the quarterly report",
        "who is Peter · what can I say?",
      ],
    },
  };
}

export function extractConsentId(detail: string): string | undefined {
  const m = detail.match(/consent_[0-9a-f]+/);
  return m ? m[0] : undefined;
}
