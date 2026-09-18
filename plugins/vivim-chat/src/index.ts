// plugins/vivim-chat — index.ts (D-358 + D-359, the chat pilot wave)
// The FIRST WRITER of vault ns "chat" (D-335's email-style convention; the
// namespace row in docs/VAULT-NAMESPACES.md lands in the same commit).
//
// Ops exposed (CONTRACT contributions, see plugin.json):
//   chat.open@1     MUTATION  {principal, title?} → {conversationId, rev, createdAt}
//                             the conversation row D-353's consequence names —
//                             principal is a plain string (user:<id> / agent:<id> /
//                             composition principals — classification is never rejection).
//   chat.append@1   MUTATION  {conversationId, role, content, providerId?,
//                             realizationRef?, streamRef?} → {messageId, rev, seq}
//                             conversation must resolve (attributable refusal);
//                             seq assigned by the writer (prior count + 1).
//   chat.history@1  READ      {conversationId, limit?} → {conversation, messages, scanned}
//                             bounded (CHAT_HISTORY_CAP), seq-ascending, sibling-proof.
//   chat.resolve@1  READ      {conversationId, utterance, capabilities} → resolution
//                             (D-359/M4): deterministic half here (exact command /
//                             known op name → rule branch), ambiguous half via the
//                             SHARED classifier resolve.classify@1 — no parallel
//                             resolution logic (D-337). Resolution ≠ execution.
//
// Handlers throw on bad payloads / failed port calls → DEGRADED at the boundary.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult, ResolveDecision, ChatConversation, ChatMessage } from "@vivim/omega-contracts";
import {
  CHAT_NS, asChatConversation, asChatMessage, chatConversationId, chatMessageId, resolveDecisionId,
} from "@vivim/omega-contracts";
import { randomBytes } from "node:crypto";
import {
  CHAT_HISTORY_CAP, checkContent, checkPrincipal, checkRole, chatIndexId, asChatIndex,
  nextChatIndex, nextMessageSeq, orderMessages, parseAppendInput, parseHistoryInput,
} from "./chat.ts";
import type { PrincipalRefusal, ChatIndex } from "./chat.ts";
import {
  CHAT_CONSULT_OP, deterministicMatch, deterministicVerdict, parseResolveInput,
} from "./resolve.ts";
import type { ChatResolveVerdict } from "./resolve.ts";

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }
interface VaultQueryRow { id: string; rev: number; cid: string }

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`vivim.chat: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

/** Read-or-null: a failed get becomes null so the caller's BAR can produce
 *  the attributable refusal (a missing conversation is a named error, not a
 *  raw vault DEGRADED). */
async function tryGet<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T | null> {
  const r: PortResult = await ctx.port.call(op, payload);
  return r.ok ? (r.value as T) : null;
}

async function getRow(ctx: PluginContext, ns: string, id: string): Promise<VaultGetResult | null> {
  return tryGet<VaultGetResult>(ctx, "vault.get@1", { ns, id });
}

/** Load + narrow a conversation row, or throw the attributable refusal.
 *  Returns the record AND its vault rev (callers cite the real rev in
 *  evidence refs — never a hardcoded 1). */
async function mustLoadConversation(ctx: PluginContext, conversationId: string): Promise<{ conv: ChatConversation; rev: number }> {
  const got = await getRow(ctx, CHAT_NS, conversationId);
  if (!got) throw new Error(`vivim.chat: conversation ${conversationId} does not exist in ns ${CHAT_NS} — refusing (attributable)`);
  const conv = asChatConversation(got.data);
  if (!conv) throw new Error(`vivim.chat: conversation row ${conversationId} is malformed — refusing (fail-closed)`);
  return { conv, rev: got.rev };
}

/** Per-conversation append serialization (C-1): the compartment is
 *  single-threaded but async handlers interleave — two concurrent appends
 *  would otherwise read the same prior count and mint the same seq. Calls
 *  for one conversation run strictly in arrival order; different
 *  conversations proceed in parallel. First-writer discipline (one vivim.chat
 *  instance owns ns "chat") makes this in-compartment chain sufficient — no
 *  second writer exists to race it. */
const appendChains = new Map<string, Promise<void>>();
async function serializeAppend<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const tail = appendChains.get(conversationId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  appendChains.set(conversationId, tail.then(() => mine));
  await tail;
  try {
    return await fn();
  } finally {
    release();
    if (appendChains.get(conversationId) === mine) appendChains.delete(conversationId);
  }
}

/** All messages of one conversation (sibling-proof by data filter) — the
 *  LEGACY fallback path (W0-3/D-378: used only when the conversation has no
 *  index row yet). C-2: filter BEFORE any bound — slicing the raw row list
 *  first would let sibling conversations crowd out this conversation's
 *  messages (undercounted history AND duplicated seqs). The per-conversation
 *  CHAT_HISTORY_CAP is enforced by the caller (append refuses at cap); the
 *  scan itself is bounded by total ns size — the D-378 index makes the
 *  INDEXED path O(cap) instead of O(ns), and this scan remains only for
 *  rows written before the index existed (Wave3 backfill retires it). */
async function loadConversationMessages(ctx: PluginContext, conversationId: string) {
  const rows = await portCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: CHAT_NS, filter: { idPrefix: "msg_" } });
  const messages = [];
  for (const row of rows) {
    const got = await getRow(ctx, CHAT_NS, row.id);
    if (!got) continue; // unreadable rows can't be history — skipped, not fatal
    const m = asChatMessage(got.data);
    if (!m || m.conversationId !== conversationId) continue; // sibling conversations never leak
    messages.push(m);
  }
  return messages;
}

/** The indexed read path (W0-3/D-378): fetch exactly the index's entries —
 *  ≤ CHAT_HISTORY_CAP gets, flat vs total ns size. Same skip-unreadable
 *  discipline as the scan path; the index's own seq order is preserved. */
async function fetchByIndex(ctx: PluginContext, idx: ChatIndex): Promise<ChatMessage[]> {
  const ordered = [...idx.entries].sort((a, b) => a.seq - b.seq);
  const out: ChatMessage[] = [];
  for (const e of ordered) {
    const got = await tryGet<VaultGetResult>(ctx, "vault.get@1", { ns: CHAT_NS, id: e.id });
    if (!got) continue; // unreadable rows can't be history — skipped, not fatal
    const m = asChatMessage(got.data);
    if (m && m.conversationId === idx.conversationId) out.push(m);
  }
  return out;
}

/** Load the conversation's index row. Returns null when absent (legacy
 *  conversation); a PRESENT-but-corrupt row throws (fail-closed — a corrupt
 *  index must never silently downgrade to a full-scan read). */
async function loadIndex(ctx: PluginContext, op: string, conversationId: string): Promise<ChatIndex | null> {
  const got = await tryGet<VaultGetResult>(ctx, "vault.get@1", { ns: CHAT_NS, id: chatIndexId(conversationId) });
  if (!got) return null;
  const idx = asChatIndex(got.data);
  if (!idx) throw new Error(`${op}: index row ${chatIndexId(conversationId)} is malformed — refusing fail-closed (D-378)`);
  return idx;
}

export const def = definePlugin({
  ops: {
    "chat.open@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "chat.open@1";
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`${op}: payload must be an object {principal, title?}`);
      }
      const p = payload as Record<string, unknown>;
      const principal = checkPrincipal(op, p["principal"]);
      if (p["title"] !== undefined && (typeof p["title"] !== "string" || p["title"].length === 0)) {
        throw new Error(`${op}: title must be a non-empty string when provided`);
      }
      const title = p["title"] as string | undefined;
      const id = chatConversationId(`conv_${randomBytes(8).toString("hex")}`);
      const createdAt = Date.now();
      const append = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: CHAT_NS, id,
        data: { id, principal, ...(title !== undefined ? { title } : {}), createdAt },
        meta: { type: "conversation", principal },
        refs: [],
      });
      ctx.log(`vivim.chat: opened ${id} for ${principal}`);
      return { conversationId: id, rev: append.rev, createdAt };
    },

    "chat.append@1": async (payload: unknown, ctx: PluginContext) => {
      const op = "chat.append@1";
      const input = parseAppendInput(payload); // throws → DEGRADED
      // Serialized per conversation (C-1): seq assignment + append + index
      // update are one critical section — concurrent appends can neither
      // duplicate seqs nor interleave reads and writes.
      return serializeAppend(input.conversationId, async () => {
        const { conv, rev: convRev } = await mustLoadConversation(ctx, input.conversationId);
        // W0-3/D-378: the writer-maintained index decides count + seq when it
        // exists (O(1) vault ops); legacy conversations backfill from the scan.
        const idx = await loadIndex(ctx, op, conv.id);
        const priorMessages = idx ? [] : await loadConversationMessages(ctx, input.conversationId);
        const priorCount = idx ? idx.count : priorMessages.length;
        if (priorCount >= CHAT_HISTORY_CAP) {
          throw new Error(`${op}: conversation ${conv.id} reached the ${CHAT_HISTORY_CAP}-message ${idx ? "indexed" : "scan"} cap — compaction/retention revisit trigger (D-335/D-378), refusing fail-closed`);
        }
        const seq = nextMessageSeq(priorCount);
        const id = chatMessageId(`msg_${randomBytes(8).toString("hex")}`);
        const createdAt = Date.now();
        const message = {
          id,
          conversationId: conv.id,
          role: input.role,
          seq,
          content: input.content,
          ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
          ...(input.realizationRef !== undefined ? { realizationRef: input.realizationRef } : {}),
          ...(input.streamRef !== undefined ? { streamRef: input.streamRef } : {}),
          createdAt,
        };
        const append = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
          ns: CHAT_NS, id, data: message,
          meta: { type: "message", conversationId: conv.id, role: input.role, seq },
          refs: [{ ns: CHAT_NS, id: conv.id, rev: convRev }],
        });
        // index rides the SAME critical section as the message append (C-1);
        // latest-wins row, bounded by the cap enforced above.
        const index = nextChatIndex(conv.id, idx, priorMessages, { id, seq });
        await portCall<VaultAppendResult>(ctx, "vault.append@1", {
          ns: CHAT_NS, id: chatIndexId(conv.id), data: index,
          meta: { type: "conversation-index", conversationId: conv.id },
          refs: [{ ns: CHAT_NS, id: conv.id, rev: convRev }],
        });
        return { messageId: id, rev: append.rev, seq };
      });
    },

    "chat.history@1": async (payload: unknown, ctx: PluginContext) => {
      const input = parseHistoryInput(payload); // throws → DEGRADED
      const { conv } = await mustLoadConversation(ctx, input.conversationId);
      // W0-4/D-379 single-principal fence: a read presented under a DIFFERENT
      // principal than the conversation's owner refuses as a verdict (REFUSED
      // envelope, never a bare DEGRADED) and the attempt is LEDGERED in the
      // writer's own namespace. Absent principal = Phase-1 trusted-reader path.
      if (input.principal !== undefined && input.principal !== conv.principal) {
        const ledgerId = `refusal_${randomBytes(8).toString("hex")}`;
        const ledger = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
          ns: CHAT_NS, id: ledgerId,
          data: { conversationId: conv.id, owner: conv.principal, caller: input.principal, op: "chat.history@1", at: Date.now() },
          meta: { type: "principal-refusal", conversationId: conv.id },
          refs: [],
        });
        const refusal: PrincipalRefusal = {
          refused: true,
          error: "REFUSED",
          op: "chat.history@1",
          detail: `cross-principal read refused: conversation ${conv.id} belongs to ${conv.principal}, caller presented ${input.principal} (D-379 single-principal fence, Phase 1 — sharing reopens only by a new decision record)`,
          ledgered: true,
          ledgerRef: { ns: CHAT_NS, id: ledgerId, rev: ledger.rev },
        };
        return refusal;
      }
      // W0-3/D-378: indexed read (bounded by the cap) when the index row
      // exists; the legacy scan remains the fallback for un-indexed rows.
      const idx = await loadIndex(ctx, "chat.history@1", conv.id);
      const messages = idx
        ? await fetchByIndex(ctx, idx)
        : orderMessages(await loadConversationMessages(ctx, input.conversationId));
      const limit = input.limit ?? messages.length;
      return {
        conversation: conv,
        messages: messages.slice(0, limit),
        total: messages.length,
      };
    },

    "chat.resolve@1": async (payload: unknown, ctx: PluginContext) => {
      const input = parseResolveInput(payload); // throws → DEGRADED
      const { conv, rev: convRev } = await mustLoadConversation(ctx, input.conversationId);

      // ── Deterministic half (D-337): exact command / known op name ──────
      const hit = deterministicMatch(input.utterance, input.capabilities);
      let verdict: ChatResolveVerdict;
      let decisionId: string;
      if (hit !== null) {
        verdict = deterministicVerdict(hit);
        // Ledger it as a ResolveDecision row (ns resolve, rev 1) — the same
        // record shape the director writes; vivim.chat is the writer for
        // chat-originated deterministic verdicts (D-359; the ns resolve row
        // in VAULT-NAMESPACES.md names this writer same-commit).
        decisionId = `chat_${randomBytes(8).toString("hex")}`;
        const data: ResolveDecision = {
          decisionId,
          kind: verdict.kind,
          capability: verdict.capability,
          branch: verdict.branch,
          reason: verdict.reason,
          evidenceRefs: [{ ns: CHAT_NS, id: conv.id, rev: convRev, epistemicStatus: "INFERRED" }],
          buildDecisionRef: "D-323",
          createdAt: Date.now(),
        };
        await portCall<VaultAppendResult>(ctx, "vault.append@1", {
          ns: "resolve", id: resolveDecisionId(decisionId), data,
          meta: { type: "resolve-decision", kind: verdict.kind, branch: verdict.branch, source: verdict.source },
          refs: [{ ns: CHAT_NS, id: conv.id, rev: convRev }],
        });
      } else {
        // ── Ambiguous half (D-337): the SHARED classifier decides ─────────
        // resolve.classify@1 rules on the chat archetype: a PROMOTED
        // realization → the realization branch (class-mapped kind per
        // D-323), none → HUMAN (empty capability — routes nowhere). The
        // director writes its own decision row; never duplicated here.
        const cr: PortResult = await ctx.port.call("resolve.classify@1", { op: CHAT_CONSULT_OP });
        if (!cr.ok) throw new Error(`vivim.chat: chat.resolve@1 resolve.classify@1 ${cr.error}: ${cr.detail ?? ""}`);
        const c = cr.value as { decisionId: string; kind: string; capability: string; branch: string; reason: string };
        verdict = {
          source: "resolve-classify",
          branch: c.branch as ChatResolveVerdict["branch"],
          kind: c.kind as ChatResolveVerdict["kind"],
          capability: c.capability,
          reason: c.reason,
        };
        decisionId = c.decisionId;
      }
      return {
        decisionId,
        conversationId: conv.id,
        utterance: input.utterance,
        branch: verdict.branch,
        kind: verdict.kind,
        capability: verdict.capability,
        reason: verdict.reason,
        source: verdict.source,
      };
    },
  },
});

startPlugin(def);
