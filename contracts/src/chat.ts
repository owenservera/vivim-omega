// @vivim/omega-contracts — chat.ts
// D-358: the chat pilot's record vocabulary (M-Pilot Part 1 §M2, D-335's
// storage ruling). Vault ns "chat" — the namespace row lands in
// docs/VAULT-NAMESPACES.md with the same commit that first writes it.
//
// Shape law:
//   * Conversation.principal is a PLAIN STRING (D-353: user:<id> /
//     agent:<id> / composition principals classify — they are never
//     rejected here; classification is law.describe@1's job, not storage's).
//   * Message.realizationRef ties the message to the ProviderRealization
//     that produced it (provenance, VaultProvenanceRef pattern).
//   * Message.streamRef references M1's chunk envelope when the message
//     arrived streamed — ordered chunk refs → assembled content, NOT a
//     separate store (the chunk data itself is never duplicated here;
//     `content` carries the assembled bytes).
import type { VaultProvenanceRef } from "./vocabulary.ts";

/** The vault namespace owning chat conversations + messages. */
export const CHAT_NS = "chat";

/** Roles a chat message can carry (the simulator's conversation roles). */
export type ChatRole = "user" | "assistant" | "system";

/** Conversation record (vault ns "chat", id `conv_*`, latest-wins). */
export interface ChatConversation {
  id: string;
  /** Plain principal string (D-353) — e.g. "user:ada". Not decoded here. */
  principal: string;
  title?: string;
  createdAt: number;
}

/** Stream provenance for a message that arrived via M1's chunk relay
 *  (D-352): streamId === the causationId the host minted; `chunks` counts
 *  the emitted chunk envelopes; `finalSeq` is the final chunk's sequence
 *  (exactly-one-final discipline, pre-checked by buildChunkEnvelope). */
export interface ChatStreamRef {
  streamId: string;
  chunks: number;
  finalSeq: number;
}

/** Message record (vault ns "chat", id `msg_*`, append-only ledger). */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  /** Writer-assigned position within the conversation (1-based, prior
   *  count + 1) — history order is vault-derivable, never caller-asserted. */
  seq: number;
  content: string;
  /** Which provider produced this message (e.g. "provider.llm"). */
  providerId?: string;
  /** The realization row that produced the completion (provenance). */
  realizationRef?: VaultProvenanceRef;
  /** Present when the message arrived streamed (M1/D-352). */
  streamRef?: ChatStreamRef;
  createdAt: number;
}

/** Bound: at most this many ns-chat rows scanned per history call. */
export const CHAT_HISTORY_CAP = 200;
/** Default + maximum messages returned per history call. */
export const CHAT_HISTORY_DEFAULT_LIMIT = 50;

const ROLES: ReadonlySet<string> = new Set(["user", "assistant", "system"]);

/** Id grammar: prefix + '_' + 1..64 lowercase word chars, no separators
 *  beyond the prefix's own — mirrors the vault's id discipline (no NUL, no
 *  '|', no ':'). Pure and TOTAL: valid input round-trips, invalid throws.
 *  D-369: comment corrected to match the enforced {1,64} (was stale 8..40). */
function checkId(op: string, prefix: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${op}: id must be a non-empty string`);
  }
  if (!v.startsWith(prefix) || !new RegExp(`^${prefix}_[0-9a-z_]{1,64}$`).test(v)) {
    throw new Error(`${op}: id must use the ${prefix}_ prefix and lowercase grammar (got ${JSON.stringify(v)})`);
  }
  return v;
}

/** Canonical conversation id (ns "chat"). */
export function chatConversationId(v: string): string {
  return checkId("chatConversationId", "conv", v);
}

/** Canonical message id (ns "chat"). */
export function chatMessageId(v: string): string {
  return checkId("chatMessageId", "msg", v);
}

/** Type-narrow a stored chat row to a Conversation. Null when malformed. */
export function asChatConversation(data: unknown): ChatConversation | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["id"] !== "string" || typeof d["principal"] !== "string" || d["principal"].length === 0) return null;
  if (typeof d["createdAt"] !== "number" || !Number.isFinite(d["createdAt"])) return null;
  if (d["title"] !== undefined && typeof d["title"] !== "string") return null;
  return {
    id: d["id"],
    principal: d["principal"],
    ...(d["title"] !== undefined ? { title: d["title"] as string } : {}),
    createdAt: d["createdAt"],
  };
}

/** Type-narrow a stored chat row to a Message. Null when malformed. */
export function asChatMessage(data: unknown): ChatMessage | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["id"] !== "string" || typeof d["conversationId"] !== "string") return null;
  if (typeof d["role"] !== "string" || !ROLES.has(d["role"])) return null;
  if (typeof d["seq"] !== "number" || !Number.isInteger(d["seq"]) || d["seq"] < 1) return null;
  if (typeof d["content"] !== "string") return null;
  if (typeof d["createdAt"] !== "number" || !Number.isFinite(d["createdAt"])) return null;
  if (d["providerId"] !== undefined && typeof d["providerId"] !== "string") return null;
  if (d["realizationRef"] !== undefined && (d["realizationRef"] === null || typeof d["realizationRef"] !== "object")) return null;
  const sr = d["streamRef"];
  if (sr !== undefined) {
    if (sr === null || typeof sr !== "object") return null;
    const s = sr as Record<string, unknown>;
    if (typeof s["streamId"] !== "string" || typeof s["chunks"] !== "number" || typeof s["finalSeq"] !== "number") return null;
  }
  return {
    id: d["id"],
    conversationId: d["conversationId"],
    role: d["role"] as ChatRole,
    seq: d["seq"],
    content: d["content"],
    ...(d["providerId"] !== undefined ? { providerId: d["providerId"] as string } : {}),
    ...(d["realizationRef"] !== undefined ? { realizationRef: d["realizationRef"] as VaultProvenanceRef } : {}),
    ...(sr !== undefined ? { streamRef: sr as ChatStreamRef } : {}),
    createdAt: d["createdAt"],
  };
}
