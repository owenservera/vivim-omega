// provider.email.file — index.ts (Ω5; v0.2.0 adds message.receive@1 — Ω10/Ω11b),
// the file-backed email provider.
//
// Implements the six message.* contracts DECLARED by pack.domain-email (same
// ids/versions — cross-plugin contract implementation is the preferred state).
//
// Ops exposed (PROVIDER contributions; risk classes are declared by the pack):
//   message.send@1   (pack: EXTERNAL_MUTATION — consent) {to, subject, body, threadId?}
//   message.receive@1 (pack: READ) {from, subject, body, folder?} — the inbound-ingest simulator
//   message.list@1   (pack: READ)  {folder?, limit?}
//   message.search@1 (pack: READ)  {q}
//   message.read@1   (pack: READ)  {id}
//   message.move@1   (pack: MUTATION) {id, folder}
//
// DATA/CODE DIVORCE: the provider owns NO storage. Every message, flag flip, and
// folder move is a vault.append@1 revision in ns "email" through the port; reads
// go through vault.get/query/search. The durable ".eml-style" blob of a sent
// message IS the CAS address of that append (vault.append content-addresses the
// data: cas/<cid[0:2]>/<cid>) — the provider writes no files itself, so
// replacing this plugin keeps every message (data sovereignty).
//
// Handlers throw on bad payloads/failed port calls — the shim converts throws
// into DEGRADED returns at the port boundary (fail-closed propagation).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import {
  applyMove, applySeen, asMessage, buildMessage, buildReceivedMessage, DEFAULT_FROM, EMAIL_NS, LIST_HARD_CAP,
  MESSAGE_META_TYPE, newMessageId, resolveFrom, summarize, validateMovePayload,
  validateReceivePayload, validateSendPayload, type Message,
} from "./message.ts";

// ---- vault port plumbing ----

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }
interface VaultQueryRow { id: string; rev: number; cid: string }
interface VaultSearchRow { id: string; rev: number; cid: string | null; rank: number }

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function isMessageObject(meta: unknown): boolean {
  return typeof meta === "object" && meta !== null && (meta as { type?: unknown }).type === MESSAGE_META_TYPE;
}

startPlugin(definePlugin({
  onInit: (ctx) => {
    ctx.log(`provider.email.file up (Ω5) — vault ns "${EMAIL_NS}", from ${resolveFrom(ctx.config)}, stateless by construction`);
  },

  ops: {
    /** send {to, subject, body, threadId?} → {messageId, rev, sentAt}. One vault append; the CAS blob is the durable .eml-style artifact. */
    "message.send@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta) => {
      const input = validateSendPayload("message.send@1", payload);
      const id = newMessageId();
      const message = buildMessage(input, { from: resolveFrom(ctx.config), id, sentAt: Date.now() });
      // meta.type lets future providers share ns "email" with threads/contacts without
      // message ops ever reading foreign objects (see isMessageObject below).
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: EMAIL_NS, id, data: message, meta: { type: MESSAGE_META_TYPE },
      });
      void meta; // causationId is stamped into the vault changelog by the vault itself
      return { messageId: id, rev: append.rev, sentAt: message.sentAt };
    },

    /**
     * receive {from, subject, body, folder?} → {messageId, rev, receivedAt, folder}.
     * The inbound-ingest SIMULATOR (D-222): the real leg of this contract is an IMAP
     * provider; this provider ingests the message directly — ONE vault.append@1
     * (ns email, meta.type message), folder inbox (or the caller's validated folder),
     * to = the configured self address, flags unseen. READ by pack declaration:
     * ingestion is vault-internal (the vault append itself is gated as vault.append@1
     * MUTATION under this provider's principal, exactly like every internal append).
     */
    "message.receive@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta) => {
      const input = validateReceivePayload("message.receive@1", payload);
      const id = newMessageId();
      const message = buildReceivedMessage(input, { to: resolveFrom(ctx.config), id, sentAt: Date.now() });
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: EMAIL_NS, id, data: message, meta: { type: MESSAGE_META_TYPE },
      });
      void meta; // causationId is stamped into the vault changelog by the vault itself
      return { messageId: id, rev: append.rev, receivedAt: message.sentAt, folder: message.folder };
    },

    /**
     * list {folder?, limit?} → {messages}. v1 semantics (bounded by contract doc):
     * latest revision per id in vault.query order (id ASC), hard-capped at 50 fetches,
     * folder-filtered, sorted newest-first (sentAt DESC), then payload limit applied.
     * Bodies never leave the vault here — summaries only.
     */
    "message.list@1": async (payload: unknown, ctx: PluginContext) => {
      const p = payload === null || payload === undefined ? {} : payload as Record<string, unknown>;
      if (typeof p !== "object" || Array.isArray(p)) throw new Error("message.list@1: payload must be an object");
      const folder = p.folder === undefined || p.folder === null ? null
        : typeof p.folder === "string" && p.folder.length > 0 ? p.folder
          : (() => { throw new Error("message.list@1: folder must be a non-empty string when provided"); })();
      const limit = p.limit === undefined || p.limit === null ? LIST_HARD_CAP
        : Number.isInteger(p.limit) && (p.limit as number) >= 1 ? Math.min(p.limit as number, LIST_HARD_CAP)
          : (() => { throw new Error("message.list@1: limit must be an integer >= 1 when provided"); })();

      const rows = await vaultCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: EMAIL_NS, filter: {} });
      const out: Array<ReturnType<typeof summarize> & { rev: number }> = [];
      for (const row of rows.slice(0, LIST_HARD_CAP)) {
        const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: EMAIL_NS, id: row.id });
        if (!isMessageObject(got.meta)) continue; // threads/contacts may share the ns; list serves messages only
        const m = asMessage("message.list@1", got.data);
        if (folder !== null && m.folder !== folder) continue;
        out.push({ ...summarize(m), rev: got.rev });
      }
      out.sort((a, b) => b.sentAt - a.sentAt);
      return { messages: out.slice(0, limit), scanned: rows.length };
    },

    /** search {q} → {matches}: vault FTS rows (rank-ordered) deduped per id, summaries back with the matched rev + rank. */
    "message.search@1": async (payload: unknown, ctx: PluginContext) => {
      const p = payload === null || payload === undefined ? {} : payload as Record<string, unknown>;
      if (typeof p.q !== "string" || p.q.length === 0) throw new Error("message.search@1: q must be a non-empty string");
      const rows = await vaultCall<VaultSearchRow[]>(ctx, "vault.search@1", { ns: EMAIL_NS, q: p.q });
      const seenIds = new Set<string>();
      const matches: Array<ReturnType<typeof summarize> & { rev: number; rank: number }> = [];
      for (const row of rows) {
        if (seenIds.has(row.id)) continue; // multiple revisions may match; keep the best-ranked one
        seenIds.add(row.id);
        if (matches.length >= LIST_HARD_CAP) break;
        const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: EMAIL_NS, id: row.id, rev: row.rev });
        if (!isMessageObject(got.meta)) continue;
        const m = asMessage("message.search@1", got.data);
        matches.push({ ...summarize(m), rev: row.rev, rank: row.rank });
      }
      return { matches, q: p.q };
    },

    /**
     * read {id} → {message, rev, seenMarked}. The op contract is READ (no gate), but
     * reading MARKS SEEN: the flag flip is a separate internal vault.append revision —
     * gated at the vault boundary as vault.append@1 (MUTATION, principal this provider).
     * Idempotent: a second read appends nothing.
     */
    "message.read@1": async (payload: unknown, ctx: PluginContext) => {
      const p = payload === null || payload === undefined ? {} : payload as Record<string, unknown>;
      if (typeof p.id !== "string" || p.id.length === 0) throw new Error("message.read@1: id must be a non-empty string");
      const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: EMAIL_NS, id: p.id });
      const message = asMessage("message.read@1", got.data);
      if (message.flags.seen) return { message, rev: got.rev, seenMarked: false };
      const updated = applySeen(message);
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: EMAIL_NS, id: p.id, data: updated, meta: { type: MESSAGE_META_TYPE },
      });
      return { message: updated, rev: append.rev, seenMarked: true };
    },

    /** move {id, folder} → {messageId, rev, folder, changed}: appends a new revision with the folder changed (no-op append skipped). */
    "message.move@1": async (payload: unknown, ctx: PluginContext) => {
      const { id, folder } = validateMovePayload("message.move@1", payload);
      const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: EMAIL_NS, id });
      const message = asMessage("message.move@1", got.data);
      if (message.folder === folder) return { messageId: id, rev: got.rev, folder, changed: false };
      const moved: Message = applyMove(message, folder);
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: EMAIL_NS, id, data: moved, meta: { type: MESSAGE_META_TYPE },
      });
      return { messageId: id, rev: append.rev, folder, changed: true };
    },
  },
}));
