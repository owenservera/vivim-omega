// vivim.chat — chat.ts (D-358, M2)
// The PURE storage core: payload validation + record construction + seq
// discipline. No ports, no I/O — import-safe outside a worker; index.ts
// layers the vault calls on top (same split as director's resolve.ts).
import {
  CHAT_HISTORY_CAP, CHAT_HISTORY_DEFAULT_LIMIT,
  asChatConversation, asChatMessage, chatConversationId, chatMessageId,
} from "@vivim/omega-contracts";
import type { ChatMessage, ChatRole, ChatStreamRef, VaultProvenanceRef } from "@vivim/omega-contracts";

export { CHAT_HISTORY_CAP, CHAT_HISTORY_DEFAULT_LIMIT, asChatConversation, asChatMessage };

const ROLES: ReadonlySet<string> = new Set(["user", "assistant", "system"]);

/** A principal is a plain non-empty string (D-353: classification is never
 *  rejection — `user:ada`, `agent:pilot`, composition principals all legal).
 *  Only structural junk is refused. */
export function checkPrincipal(op: string, v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`${op}: principal must be a non-empty string (D-353: any principal string is legal — user:<id>, agent:<id>, …)`);
  }
  if (/[\u0000|]/.test(v)) throw new Error(`${op}: principal must not contain NUL or '|'`);
  return v;
}

export function checkConversationRef(op: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${op}: conversationId must be a non-empty string`);
  return chatConversationId(v);
}

export function checkRole(op: string, v: unknown): ChatRole {
  if (typeof v !== "string" || !ROLES.has(v)) {
    throw new Error(`${op}: role must be one of user|assistant|system (got ${JSON.stringify(v)})`);
  }
  return v as ChatRole;
}

export function checkContent(op: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${op}: content must be a non-empty string`);
  if (v.length > 100_000) throw new Error(`${op}: content exceeds 100k chars — refused fail-closed, never silently truncated`);
  return v;
}

/** Validate the optional stream provenance (M1/D-352 discipline). */
export function checkStreamRef(op: string, v: unknown): ChatStreamRef {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${op}: streamRef must be an object {streamId, chunks, finalSeq}`);
  }
  const s = v as Record<string, unknown>;
  if (typeof s["streamId"] !== "string" || s["streamId"].length === 0) {
    throw new Error(`${op}: streamRef.streamId must be a non-empty string`);
  }
  if (typeof s["chunks"] !== "number" || !Number.isInteger(s["chunks"]) || s["chunks"] < 1) {
    throw new Error(`${op}: streamRef.chunks must be a positive integer`);
  }
  if (typeof s["finalSeq"] !== "number" || !Number.isInteger(s["finalSeq"]) || s["finalSeq"] < 1) {
    throw new Error(`${op}: streamRef.finalSeq must be a positive integer (the final chunk's seq)`);
  }
  return { streamId: s["streamId"], chunks: s["chunks"], finalSeq: s["finalSeq"] };
}

/** Validate the optional realization provenance (VaultProvenanceRef shape). */
export function checkRealizationRef(op: string, v: unknown): VaultProvenanceRef {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${op}: realizationRef must be a {ns, id, rev} ref`);
  }
  const r = v as Record<string, unknown>;
  if (typeof r["ns"] !== "string" || r["ns"].length === 0) throw new Error(`${op}: realizationRef.ns must be a non-empty string`);
  if (typeof r["id"] !== "string" || r["id"].length === 0) throw new Error(`${op}: realizationRef.id must be a non-empty string`);
  if (typeof r["rev"] !== "number" || !Number.isInteger(r["rev"]) || r["rev"] < 1) {
    throw new Error(`${op}: realizationRef.rev must be an integer >= 1 (vault ref grammar)`);
  }
  return { ns: r["ns"], id: r["id"], rev: r["rev"] };
}

export interface AppendInput {
  conversationId: string;
  role: ChatRole;
  content: string;
  providerId?: string;
  realizationRef?: VaultProvenanceRef;
  streamRef?: ChatStreamRef;
}

/** Parse + validate the chat.append@1 payload (throws → DEGRADED). */
export function parseAppendInput(payload: unknown): AppendInput {
  const op = "chat.append@1";
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object {conversationId, role, content, providerId?, realizationRef?, streamRef?}`);
  }
  const p = payload as Record<string, unknown>;
  const input: AppendInput = {
    conversationId: checkConversationRef(op, p["conversationId"]),
    role: checkRole(op, p["role"]),
    content: checkContent(op, p["content"]),
  };
  if (p["providerId"] !== undefined) {
    if (typeof p["providerId"] !== "string" || p["providerId"].length === 0) throw new Error(`${op}: providerId must be a non-empty string when provided`);
    input.providerId = p["providerId"];
  }
  if (p["realizationRef"] !== undefined) input.realizationRef = checkRealizationRef(op, p["realizationRef"]);
  if (p["streamRef"] !== undefined) input.streamRef = checkStreamRef(op, p["streamRef"]);
  return input;
}

/** The writer-assigned seq: prior message count + 1 (1-based, contiguous —
 *  the same discipline the vault's revs follow). Pure. */
export function nextMessageSeq(priorCount: number): number {
  if (!Number.isInteger(priorCount) || priorCount < 0) {
    throw new Error("nextMessageSeq: priorCount must be a non-negative integer");
  }
  return priorCount + 1;
}

export interface HistoryInput { conversationId: string; limit?: number; principal?: string }

/** Parse + validate the chat.history@1 payload (throws → DEGRADED).
 *  `principal` (W0-4/D-379): when provided and it differs from the
 *  conversation's owner, the read is REFUSED (policy refusal, not DEGRADED)
 *  and the attempt is ledgered. Absent principal keeps the Phase-1 behavior
 *  (single-principal deployments; the compartment itself is the trusted reader). */
export function parseHistoryInput(payload: unknown): HistoryInput {
  const op = "chat.history@1";
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object {conversationId, limit?, principal?}`);
  }
  const p = payload as Record<string, unknown>;
  const out: HistoryInput = { conversationId: checkConversationRef(op, p["conversationId"]) };
  if (p["limit"] !== undefined) {
    if (typeof p["limit"] !== "number" || !Number.isInteger(p["limit"]) || p["limit"] < 1 || p["limit"] > CHAT_HISTORY_CAP) {
      throw new Error(`${op}: limit must be an integer in [1, ${CHAT_HISTORY_CAP}]`);
    }
    out.limit = p["limit"];
  }
  if (p["principal"] !== undefined) out.principal = checkPrincipal(op, p["principal"]);
  return out;
}

// ---- W0-3/D-378: the per-conversation writer-maintained index row ----
// INTERNAL to vivim.chat (single writer, single reader — no contracts churn):
// ids derive conv_<hex> → idx_<hex>; entries are bounded by the SAME
// CHAT_HISTORY_CAP the append path enforces, so the index row is bounded by
// construction. History reads fetch ≤ CAP message rows instead of scanning
// the whole ns + N gets (the Wave3 full build adds retention enforcement +
// formal backfill; the legacy scan stays as the fallback for un-indexed rows).

/** The index row id for a conversation (pure TOTAL — throws on foreign ids). */
export function chatIndexId(conversationId: string): string {
  if (typeof conversationId !== "string" || !conversationId.startsWith("conv_")) {
    throw new Error(`chatIndexId: expected a conv_ id (got ${JSON.stringify(conversationId)})`);
  }
  return `idx_${conversationId.slice("conv_".length)}`;
}

export interface ChatIndexEntry { id: string; seq: number }

export interface ChatIndex { conversationId: string; count: number; entries: ChatIndexEntry[] }

/** Narrow a stored index row (malformed reads as null, never throws). A row
 *  whose count disagrees with its entries, carries foreign ids, or exceeds
 *  the cap is corrupt — the callers refuse fail-closed on corrupt rows. */
export function asChatIndex(data: unknown): ChatIndex | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["conversationId"] !== "string" || !d["conversationId"].startsWith("conv_")) return null;
  if (typeof d["count"] !== "number" || !Number.isInteger(d["count"]) || d["count"] < 0 || d["count"] > CHAT_HISTORY_CAP) return null;
  if (!Array.isArray(d["entries"]) || d["entries"].length !== d["count"]) return null;
  const entries: ChatIndexEntry[] = [];
  for (const e of d["entries"]) {
    if (e === null || typeof e !== "object" || Array.isArray(e)) return null;
    const x = e as Record<string, unknown>;
    if (typeof x["id"] !== "string" || !x["id"].startsWith("msg_")) return null;
    if (typeof x["seq"] !== "number" || !Number.isInteger(x["seq"]) || x["seq"] < 1) return null;
    entries.push({ id: x["id"], seq: x["seq"] });
  }
  return { conversationId: d["conversationId"], count: d["count"], entries };
}

/** The next index state after one append (pure). `prior` null = legacy
 *  conversation: the index backfills from the caller's scan (priorMessages) —
 *  the caller already enforced the cap on that scan, so the result stays bounded. */
export function nextChatIndex(
  conversationId: string, prior: ChatIndex | null, priorMessages: ChatMessage[], added: ChatIndexEntry,
): ChatIndex {
  const entries = prior
    ? [...prior.entries, added]
    : [...priorMessages.map((m) => ({ id: m.id, seq: m.seq })), added];
  return { conversationId, count: entries.length, entries };
}

/** The W0-4/D-379 refusal envelope: the cross-principal read refuses as DATA
 *  (the vivim-run REFUSED-verdict pattern) — ok:true at the port boundary
 *  carrying the REFUSED verdict + the ledger ref. DEGRADED is for broken
 *  handlers; a policy refusal is a verdict, not a failure. */
export interface PrincipalRefusal {
  refused: true;
  error: "REFUSED";
  op: "chat.history@1";
  detail: string;
  ledgered: true;
  ledgerRef: { ns: string; id: string; rev: number };
}

/** Sort messages seq-ascending (stable tie-break on id) — the history order. */
export function orderMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => (a.seq - b.seq) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
