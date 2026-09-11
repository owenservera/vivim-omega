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

export interface ExecuteOutcome {
  interpretation: Interpretation;
  surface?: { kind: "help" | "entity" | "assist"; payload: Record<string, unknown> };
  executed: boolean;
  op?: string;
  result?: unknown;
  refused?: { op: string; principal: string; consentId?: string; detail: string };
  ruleActionConsent?: { principal: string; op: string; consentId?: string; decision: string };
  worldV: number;
}

export interface ConsoleService {
  host: BootedHost;
  /** mind.snapshot@1 through the router (root principal). */
  world(): Promise<WorldModel>;
  /** Authoritative interpret (same pure engine the browser runs). */
  interpretText(text: string): Promise<Interpretation>;
  /** NL → interpret → route. Consent refusals pass through as data for the confirm card. */
  execute(text: string): Promise<ExecuteOutcome>;
  /** The ✓ confirm card: grant a consent (optionally for a specific principal). */
  consent(consentId: string, principal?: string): Promise<{ granted: boolean; detail?: string }>;
  /** The opt-in LLM edge (N2): a SUGGESTION, never an execution. */
  assist(text: string): Promise<{ suggestion: string; sim: boolean }>;
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

  const interpretText = async (text: string): Promise<Interpretation> => {
    if (typeof text !== "string") throw new Error("text must be a string");
    const w = await world();
    return interpret(text, w);
  };

  const execute = async (text: string): Promise<ExecuteOutcome> => {
    const interp = await interpretText(text);
    const w = await world();
    const ir = interp.ir;
    const out: ExecuteOutcome = { interpretation: interp, executed: false, worldV: w.v };

    // surface pseudo-intents (the language layer describes them; the SURFACE serves them)
    if (!ir || ir.intent.startsWith("surface.")) {
      out.surface = surfacePayload(ir, interp, w);
      out.executed = false;
      return out;
    }

    // the consent pre-check for rule actions: one combined card at rule creation
    if (ir.intent === "director.rule@1") {
      const check = await call("law.check@1", { principal: "vivim.director", op: "message.send@1" });
      if (check.ok) {
        const d = check.value as LawDecisionResult;
        if (d.decision === "require-consent") {
          out.ruleActionConsent = { principal: "vivim.director", op: "message.send@1", consentId: d.consentId, decision: d.decision };
        }
      }
    }

    const r = await call(ir.intent, ir.payload);
    out.op = ir.intent;
    if (r.ok) {
      out.executed = true;
      out.result = r.value;
    } else {
      // REFUSED with a consentId → the confirm card (the ✓ family); other errors pass raw
      const consentId = extractConsentId(r.detail ?? "");
      out.refused = { op: ir.intent, principal: "root", consentId, detail: r.detail ?? r.error };
    }
    return out;
  };

  const consent = async (consentId: string, principal?: string): Promise<{ granted: boolean; detail?: string }> => {
    if (typeof consentId !== "string" || !/^consent_[0-9a-f]+$/.test(consentId)) {
      return { granted: false, detail: "consentId must match consent_<hex>" };
    }
    const r = await call("law.consent.grant@1", { consentId, ...(principal !== undefined ? { principal } : {}) });
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

  return { host, world, interpretText, execute, consent, assist, uptimeMs: () => Date.now() - startedAt };
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
