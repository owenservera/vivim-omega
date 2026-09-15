// vivim.chat — resolve.ts (D-359, M4)
// The PURE chat-resolution core: the deterministic half of D-337's
// philosophy (exact command / known op name → rule branch, DETERMINISTIC)
// plus the consult shape handed to the SHARED classifier
// (`resolve.classify@1`, D-323) for the ambiguous half.
//
// NO PARALLEL RESOLUTION LOGIC (D-337's binding consequence): the
// realization and human branches are resolve.classify@1's, verbatim — this
// module only decides WHETHER the deterministic half hits, and validates
// the caller-side capability set (D-359: derived via contracts
// `capabilityNamesFromRouted` from the booted composition's routed ops —
// the same derivation MCP's tools/list consults; A2: one source, N
// consumers, never a third binding).
import type { ResolveBranch, ComputationKind } from "@vivim/omega-contracts";

/** Bound: at most this many capability names accepted per resolve call. */
export const CHAT_CAPABILITY_CAP = 500;

const OP_RE = /^[A-Za-z0-9_.-]+@[0-9]+$/;

export interface ChatResolveInput {
  conversationId: string;
  utterance: string;
  capabilities: string[];
}

/** Parse + validate the chat.resolve@1 payload (throws → DEGRADED).
 *  `capabilities` must be the caller-side derivation output: op-grammar
 *  strings, dup-checked (a duplicated name means the caller did not derive
 *  the set — refused fail-closed). */
export function parseResolveInput(payload: unknown): ChatResolveInput {
  const op = "chat.resolve@1";
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object {conversationId, utterance, capabilities}`);
  }
  const p = payload as Record<string, unknown>;
  if (typeof p["conversationId"] !== "string" || p["conversationId"].length === 0) {
    throw new Error(`${op}: conversationId must be a non-empty string`);
  }
  if (!p["conversationId"].startsWith("conv_")) {
    throw new Error(`${op}: conversationId must use the conv_ prefix`);
  }
  if (typeof p["utterance"] !== "string" || p["utterance"].trim().length === 0) {
    throw new Error(`${op}: utterance must be a non-empty string`);
  }
  if (p["utterance"].length > 10_000) {
    throw new Error(`${op}: utterance exceeds 10k chars — refused fail-closed`);
  }
  if (!Array.isArray(p["capabilities"])) {
    throw new Error(`${op}: capabilities must be an array of op ids (the shared derivation output)`);
  }
  if (p["capabilities"].length > CHAT_CAPABILITY_CAP) {
    throw new Error(`${op}: capabilities exceeds ${CHAT_CAPABILITY_CAP} entries — refused`);
  }
  const seen = new Set<string>();
  for (const c of p["capabilities"]) {
    if (typeof c !== "string" || !OP_RE.test(c)) {
      throw new Error(`${op}: capabilities entries must look like <id>@<version> (got ${JSON.stringify(c)})`);
    }
    if (seen.has(c)) throw new Error(`${op}: capabilities contains duplicate "${c}" — pass the derivation output verbatim`);
    seen.add(c);
  }
  return {
    conversationId: p["conversationId"],
    utterance: p["utterance"],
    capabilities: p["capabilities"] as string[],
  };
}

/** The deterministic half (D-337): does the utterance EXACTLY name a known
 *  capability? Normalization is trim-only — an op id is matched as itself
 *  (case-sensitive, no fuzzy matching; the ambiguous half exists precisely
 *  for everything this refuses to guess). Pure. */
export function deterministicMatch(utterance: string, capabilities: readonly string[]): string | null {
  const candidate = utterance.trim();
  return capabilities.includes(candidate) ? candidate : null;
}

export type ChatVerdictSource = "chat-deterministic" | "resolve-classify";

/** The verdict shape chat.resolve@1 returns and (for the deterministic half)
 *  ledgers as a ResolveDecision row. The ambiguous half's verdict fields
 *  come from the director's own row — never rewritten here. */
export interface ChatResolveVerdict {
  source: ChatVerdictSource;
  branch: ResolveBranch;
  kind: ComputationKind;
  capability: string;
  reason: string;
}

/** Build the deterministic verdict (D-Pilot §M4 mapping: exact command /
 *  known op name → ResolveBranch "rule", ComputationKind DETERMINISTIC). */
export function deterministicVerdict(capability: string): ChatResolveVerdict {
  return {
    source: "chat-deterministic",
    branch: "rule",
    kind: "DETERMINISTIC",
    capability,
    reason: `exact command names routed capability ${capability} (D-337 deterministic half; names derived from the booted composition's routed ops)`,
  };
}

/** The consult payload for the shared classifier: the chat archetype's op.
 *  resolve.classify@1 derives the slug (`chat.complete`) and scans ns
 *  providers for a PROMOTED realization — its branches (2)/(3) decide. */
export const CHAT_CONSULT_OP = "chat.complete@1";
