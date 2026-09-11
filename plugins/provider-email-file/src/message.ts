// provider.email.file — message.ts (Ω5; v0.2.0 adds the receive helpers — Ω10/Ω11b)
// Pure email-domain helpers: payload validation, Message construction, summary
// projection, thread derivation, and the pure revisions (seen / move).
// No ports, no I/O — import-safe outside a worker (unit-tested directly);
// index.ts wiring layers the vault port calls on top.
//
// The Message shape mirrors the SCHEMA contribution email.Message@1 declared by
// pack.domain-email: id, threadId, folder, from, to, subject, body, sentAt, flags.

import { createHash, randomBytes } from "node:crypto";

export const EMAIL_NS = "email";
export const DEFAULT_FROM = "me@local";
export const DEFAULT_FOLDER = "sent";
export const MESSAGE_META_TYPE = "message";
/** v1 list hard cap: at most 50 vault.get fetches per message.list call (bounded by contract doc). */
export const LIST_HARD_CAP = 50;

export interface MessageFlags { seen: boolean; flagged: boolean; draft: boolean }

export interface Message {
  id: string;
  threadId: string;
  folder: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt: number;
  flags: MessageFlags;
}

/** Summary projection: everything EXCEPT the body (bodies only leave the vault via message.read@1). */
export type MessageSummary = Omit<Message, "body">;

export interface SendInput { to: string; subject: string; body: string; threadId?: string }

/** The folders message.receive@1 accepts (the default is "inbox" — the inbound leg). */
export const RECEIVE_FOLDERS = ["inbox", "sent", "archive", "trash"] as const;
export type ReceiveFolder = (typeof RECEIVE_FOLDERS)[number];

export interface ReceiveInput { from: string; subject: string; body: string; folder?: string }

// ---- validation (fail-closed: throw → DEGRADED at the port boundary) ----

function requireStr(op: string, field: string, value: unknown, opts: { allowEmpty?: boolean } = {}): string {
  if (typeof value !== "string") throw new Error(`${op}: ${field} must be a string`);
  if (!opts.allowEmpty && value.length === 0) throw new Error(`${op}: ${field} must be non-empty`);
  if (value.length > 2000) throw new Error(`${op}: ${field} exceeds 2000 chars`);
  return value;
}

/** message.send@1 payload: {to, subject, body, threadId?} — to must contain '@', subject non-empty. */
export function validateSendPayload(op: string, payload: unknown): SendInput {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  const to = requireStr(op, "to", p.to);
  if (!to.includes("@")) throw new Error(`${op}: to must be an email address containing '@' (got "${to}")`);
  const subject = requireStr(op, "subject", p.subject);
  const body = requireStr(op, "body", p.body, { allowEmpty: true });
  const threadId = p.threadId === undefined || p.threadId === null ? undefined : requireStr(op, "threadId", p.threadId);
  return { to, subject, body, ...(threadId !== undefined ? { threadId } : {}) };
}

/** message.move@1 payload: {id, folder}. */
export function validateMovePayload(op: string, payload: unknown): { id: string; folder: string } {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  const id = requireStr(op, "id", p.id);
  const folder = requireStr(op, "folder", p.folder);
  if (/[|\u0000]/.test(folder)) throw new Error(`${op}: folder must not contain '|' or NUL`);
  return { id, folder };
}

/**
 * message.receive@1 payload: {from, subject, body, folder?} — from must contain '@',
 * subject non-empty, body a string (may be empty), folder one of
 * inbox|sent|archive|trash when provided (default inbox, applied by buildReceivedMessage).
 */
export function validateReceivePayload(op: string, payload: unknown): ReceiveInput {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  const from = requireStr(op, "from", p.from);
  if (!from.includes("@")) throw new Error(`${op}: from must be an email address containing '@' (got "${from}")`);
  const subject = requireStr(op, "subject", p.subject);
  const body = requireStr(op, "body", p.body, { allowEmpty: true });
  const folder = p.folder === undefined || p.folder === null ? undefined : requireStr(op, "folder", p.folder);
  if (folder !== undefined && !(RECEIVE_FOLDERS as readonly string[]).includes(folder)) {
    throw new Error(`${op}: folder must be one of ${RECEIVE_FOLDERS.join("|")} when provided (got "${folder}")`);
  }
  return { from, subject, body, ...(folder !== undefined ? { folder } : {}) };
}

/** Defend the read path: whatever the vault returns must BE an email.Message@1. */
export function asMessage(op: string, value: unknown): Message {
  if (value === null || typeof value !== "object") throw new Error(`${op}: stored object is not a message`);
  const v = value as Record<string, unknown>;
  const id = requireStr(op, "id", v.id);
  const threadId = requireStr(op, "threadId", v.threadId);
  const folder = requireStr(op, "folder", v.folder);
  const from = requireStr(op, "from", v.from);
  const to = requireStr(op, "to", v.to);
  const subject = requireStr(op, "subject", v.subject, { allowEmpty: true });
  const body = requireStr(op, "body", v.body, { allowEmpty: true });
  if (typeof v.sentAt !== "number" || !Number.isInteger(v.sentAt) || v.sentAt < 0) {
    throw new Error(`${op}: sentAt must be a non-negative integer (epoch ms)`);
  }
  const f = v.flags;
  if (f === null || typeof f !== "object" || Array.isArray(f)) throw new Error(`${op}: flags must be an object`);
  const fl = f as Record<string, unknown>;
  for (const k of ["seen", "flagged", "draft"] as const) {
    if (typeof fl[k] !== "boolean") throw new Error(`${op}: flags.${k} must be a boolean`);
  }
  return { id, threadId, folder, from, to, subject, body, sentAt: v.sentAt, flags: { seen: fl.seen as boolean, flagged: fl.flagged as boolean, draft: fl.draft as boolean } };
}

// ---- provider config ----

/** Sender resolution: composition config.from passthrough (never authority); "me@local" when absent. */
export function resolveFrom(config: Record<string, unknown> | null | undefined): string {
  const raw = config?.from;
  if (raw === undefined || raw === null) return DEFAULT_FROM;
  if (typeof raw !== "string" || raw.length === 0 || !raw.includes("@")) {
    throw new Error(`provider.email.file: config.from must be a non-empty email address containing '@' (got ${JSON.stringify(raw)})`);
  }
  return raw;
}

// ---- construction ----

/** Deterministic thread id: same (subject, to) → same thread (conversation grouping). */
export function threadIdFor(subject: string, to: string): string {
  const h = createHash("sha256").update(`${subject}\u0000${to}`).digest("hex");
  return `thread_${h.slice(0, 12)}`;
}

/** Opaque message id (provider-assigned, unique per send). */
export function newMessageId(): string {
  return `msg_${randomBytes(8).toString("hex")}`;
}

export interface BuildOptions { from: string; id: string; sentAt: number }

/**
 * Build a sent message (the draft→sent transition of email.policy@1 completes inside
 * message.send@1 — v1 persists no draft state; flags.draft is false by construction).
 */
export function buildMessage(input: SendInput, opts: BuildOptions): Message {
  return {
    id: opts.id,
    threadId: input.threadId ?? threadIdFor(input.subject, input.to),
    folder: DEFAULT_FOLDER,
    from: opts.from,
    to: input.to,
    subject: input.subject,
    body: input.body,
    sentAt: opts.sentAt,
    flags: { seen: false, flagged: false, draft: false },
  };
}

export interface ReceivedOptions { to: string; id: string; sentAt: number }

/**
 * Build a RECEIVED (inbound) message: folder inbox (or the caller's validated folder —
 * the default inbound leg is the inbox), to = the configured self address, flags
 * unseen (an unread incoming message — the director's rule loop keys on exactly this
 * state). The thread mirrors the sent side's conversation grouping, keyed by the
 * COUNTERPART address: (subject, from) here vs (subject, to) on send, so a reply
 * with the same subject lands in the same thread.
 */
export function buildReceivedMessage(input: ReceiveInput, opts: ReceivedOptions): Message {
  return {
    id: opts.id,
    threadId: threadIdFor(input.subject, input.from),
    folder: input.folder ?? "inbox",
    from: input.from,
    to: opts.to,
    subject: input.subject,
    body: input.body,
    sentAt: opts.sentAt,
    flags: { seen: false, flagged: false, draft: false },
  };
}

// ---- pure revisions (each becomes a new vault.append revision) ----

/** message.read@1 side effect: flags.seen → true (idempotent caller-side: only append when it flips). */
export function applySeen(m: Message): Message {
  return { ...m, flags: { ...m.flags, seen: true } };
}

/** message.move@1: folder changed. */
export function applyMove(m: Message, folder: string): Message {
  return { ...m, folder };
}

/** Summary projection: drop the body, keep the envelope. */
export function summarize(m: Message): MessageSummary {
  const { body: _body, ...summary } = m;
  return summary;
}
