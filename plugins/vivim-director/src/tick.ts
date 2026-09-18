// vivim.director — tick.ts (Ω12): the deterministic fire pass.
//
// THE LOOP (every step journaled/ledgered — no silent state):
//   1. vault.query ns "email" (bounded 200 rows); (id → rev) memory from the
//      previous tick cheaply finds NEW/CHANGED objects (unchanged rows cost one
//      query row, not a get).
//   2. ONE vault.getmany@1 fetches EVERY candidate still new/changed (D-388:
//      the per-row get loop was up to 200 sequential port hops; candidates that
//      fail to resolve keep their rev unrecorded — the next tick retries
//      honestly). Keep only meta.type "message" AND folder "inbox" AND
//      flags.seen false AND from not a self address.
//   3. ONE vault.getmany@1 checks the fired ledger for every trigger candidate
//      (ns "automation" id fired:<messageId> ok ⇒ processed) — the ledger, not
//      memory, is the no-refire authority (fresh boots stay no-refire by
//      construction). Rule loading stays lazy + per-row (skip-not-fatal there
//      would be lost to a batch-all-fail; see D-388).
//   4. load rules (query ns "automation" idPrefix "rule:" + bounded gets),
//      keep enabled only, sort by id asc (deterministic).
//   5. match: rule.when.from === null (anyone) OR
//      rule.when.from === contactFromAddress(message.from).id — the SHARED
//      derivation (byte-identical to the NCLL/console mind, D-216).
//   6. fire each match THROUGH THE PORT under principal vivim.director — the
//      LAW still gates the action (a REFUSED/consent-required result is a
//      LEGITIMATE outcome: recorded in the ledger, never retried in a spin;
//      the user grants through the console, the next trigger fires clean).
//   7. ledger: ONE vault.append ns "automation" id fired:<messageId> per
//      processed message (after all rules attempted).
//   8. return {scanned, processed, fired} — the tick NEVER throws to the
//      caller: per-rule errors are captured into the result/ledger; a vault
//      failure mid-tick logs and returns the partial report.
//
// Run semantics: at-least-once w.r.t. the ledger append — if the ledger append
// itself fails (vault failure), the message is retried on the next tick and
// the report carries the error. Exactly-once whenever the vault is healthy.
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { contactFromAddress } from "@vivim/omega-nlcl-pure";
import {
  AUTOMATION_NS, EMAIL_NS, FIRED_PREFIX, MESSAGE_META_TYPE, RULE_PREFIX,
  asRule, type RuleData,
} from "./rules.ts";

// ---- shared vault wire shapes (mirrored per the B2 import law) ----

export interface VaultQueryRow { id: string; rev: number; cid: string }
// VaultGetResult was the vault.get@1 body shape (D-388 moved the tick's read
// phase onto vault.getmany@1 rows); kept exported for wire-shape mirror tests.
export interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** vault.getmany@1 row (D-388): missing is DATA ({found:false}), never an error —
 *  a batch must not lose its other rows; a malformed envelope still THROWS
 *  (fail-closed, identical to vault.get@1). Mirrored per the B2 import law. */
export interface VaultGetManyRowFound { id: string; found: true; rev: number; cid: string; data: unknown; meta: unknown }
export interface VaultGetManyRowMissing { id: string; found: false }
export type VaultGetManyRow = VaultGetManyRowFound | VaultGetManyRowMissing;

/** v1 scan bound: at most 200 email rows examined per tick (bounded by contract doc). */
export const TICK_SCAN_CAP = 200;
/** v1 rule bound: at most 200 rule fetches per tick. */
export const TICK_RULE_CAP = 200;
/** Live loop period (ms) — config.intervalMs overrides; <= 0 disables the live loop. */
export const DEFAULT_TICK_MS = 500;
/** Addresses treated as self (their inbox messages are never triggers). */
export const DEFAULT_SELF_ADDRESSES = ["me@omega.local", "demo@omega.local"];

export interface TickConfig { selfAddresses: string[] }
/** (id → rev) memory: cheap new/changed detection — NEVER the no-refire authority. */
export interface TickState { prevRevs: Map<string, number> }

export interface TickFiredRow {
  messageId: string;
  ruleId: string;
  ok: boolean;
  error?: string;
  /** The law's consent id when the action was REFUSED for consent (the honest ceremony). */
  consentId?: string;
}

export interface TickReport {
  scanned: number;
  processed: number;
  fired: TickFiredRow[];
  at: number;
  error?: string;
}

// ---- read-path defense ----

/** The trigger-message fields the tick needs (defended read of ns "email" rows). */
interface TriggerMessage { id: string; folder: string; from: string; subject: string; body: string; seen: boolean }

function asTriggerMessage(op: string, id: string, value: unknown): TriggerMessage | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v["id"] !== id) return null;
  const folder = v["folder"];
  const from = v["from"];
  const subject = v["subject"];
  const body = v["body"];
  if (typeof folder !== "string" || typeof from !== "string" || typeof subject !== "string" || typeof body !== "string") return null;
  const flags = v["flags"];
  if (flags === null || typeof flags !== "object" || Array.isArray(flags)) return null;
  const seen = (flags as Record<string, unknown>)["seen"];
  if (typeof seen !== "boolean") return null;
  return { id, folder, from, subject, body, seen };
}

function isMessageMeta(meta: unknown): boolean {
  return typeof meta === "object" && meta !== null && (meta as { type?: unknown }).type === MESSAGE_META_TYPE;
}

function isSelf(cfg: TickConfig, from: string): boolean {
  return cfg.selfAddresses.includes(from.toLowerCase());
}

// ---- rule loading (step 4) ----

async function loadEnabledRules(ctx: PluginContext): Promise<{ rules: RuleData[]; total: number; error?: string }> {
  const qr: PortResult = await ctx.port.call("vault.query@1", { ns: AUTOMATION_NS, filter: { idPrefix: RULE_PREFIX } });
  if (!qr.ok) return { rules: [], total: 0, error: `vault.query@1 ${qr.error}: ${qr.detail ?? ""}` };
  const rows = ((qr.value as VaultQueryRow[]) ?? []).slice(0, TICK_RULE_CAP);
  const total = rows.length; // rule ROWS (incl. disabled) — distinguishes "no rules yet" from "rules, none enabled"
  const rules: RuleData[] = [];
  for (const row of rows) {
    const gr: PortResult = await ctx.port.call("vault.get@1", { ns: AUTOMATION_NS, id: row.id });
    if (!gr.ok) continue; // a row that cannot be read cannot fire — skipped, not fatal
    const rule = asRule("director.tick@1", row.id, (gr.value as VaultGetResult).data);
    if (rule && rule.enabled) rules.push(rule);
  }
  rules.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // deterministic order
  return { rules, total };
}

// ---- firing (step 6) ----

/** The stable consent-id grammar surfaced by the law's REFUSED detail. */
const CONSENT_ID_RE = /consent_[0-9a-f]{16}/;

function extractConsentId(detail: unknown): string | undefined {
  if (typeof detail !== "string") return undefined;
  const m = CONSENT_ID_RE.exec(detail);
  return m ? m[0] : undefined;
}

interface FiredOutcome { ruleId: string; ok: boolean; error?: string; consentId?: string }

/** Fire one rule's action through the port (principal vivim.director — the law gates it). */
async function fireRule(ctx: PluginContext, message: TriggerMessage, rule: RuleData): Promise<FiredOutcome> {
  const action: Record<string, unknown> = { ...rule.then.payload };
  delete action["messageFromTrigger"]; // an IR directive, not a send slot
  if (rule.then.payload["messageFromTrigger"] === true) {
    // trigger-bound action: body = the trigger message's body,
    // subject = the rule's explicit subject ?? "Fwd: <trigger subject>"
    action["body"] = message.body;
    const explicit = rule.then.payload["subject"];
    action["subject"] = typeof explicit === "string" && explicit.length > 0 ? explicit : `Fwd: ${message.subject}`;
  }
  try {
    const r: PortResult = await ctx.port.call(rule.then.op, action);
    if (r.ok) return { ruleId: rule.id, ok: true };
    const consentId = extractConsentId(r.detail);
    return { ruleId: rule.id, ok: false, error: `${r.error}: ${r.detail ?? ""}`, ...(consentId !== undefined ? { consentId } : {}) };
  } catch (e) {
    return { ruleId: rule.id, ok: false, error: `threw: ${String(e)}` };
  }
}

// ---- the deterministic fire pass ----

/**
 * One tick. Never throws — vault failures produce a partial report (logged).
 * v1 action vocabulary: rule.then.op is "message.send@1" by construction
 * (rules.ts enforces the boundary at creation; asRule defends the read path).
 */
export async function runTick(ctx: PluginContext, cfg: TickConfig, state: TickState): Promise<TickReport> {
  const at = Date.now();
  const fired: TickFiredRow[] = [];
  let processed = 0;
  let error: string | undefined;

  // 1. scan (bounded)
  const qr: PortResult = await ctx.port.call("vault.query@1", { ns: EMAIL_NS, filter: {} });
  if (!qr.ok) {
    error = `vault.query@1 ${qr.error}: ${qr.detail ?? ""}`;
    ctx.log(`[tick] ${error} — partial report`);
    return { scanned: 0, processed: 0, fired: [], at, error };
  }
  const rows = ((qr.value as VaultQueryRow[]) ?? []).slice(0, TICK_SCAN_CAP);
  const scanned = rows.length;
  const revById = new Map(rows.map((r) => [r.id, r.rev] as const));

  let rules: RuleData[] | null = null; // lazy: loaded once, on the first candidate that needs them
  let ruleRowsTotal = -1; // rule ROWS seen (incl. disabled); -1 = not loaded yet

  // 2. candidates = rows the (id → rev) memory has never seen (one query row each);
  //    EVERY candidate's body is fetched in ONE vault.getmany@1 hop (D-388) —
  //    the old loop paid up to 200 sequential vault.get@1 round trips per tick.
  const candidates = rows.filter((row) => state.prevRevs.get(row.id) !== row.rev);
  const bodies = new Map<string, VaultGetManyRow>();
  if (candidates.length > 0) {
    const br: PortResult = await ctx.port.call("vault.getmany@1", {
      ns: EMAIL_NS,
      ids: candidates.map((row) => row.id),
    });
    if (br.ok) {
      for (const row of (br.value as VaultGetManyRow[]) ?? []) bodies.set(row.id, row);
    } else {
      // whole-batch failure: every candidate keeps its rev unrecorded — the
      // next tick retries honestly (same posture as the old per-row get failure)
      error ??= `vault.getmany@1 (email bodies) ${br.error}: ${br.detail ?? ""}`;
    }
  }

  // predicate pass, in the scan's deterministic order
  interface TriggerJob { rowId: string; message: TriggerMessage }
  const triggers: TriggerJob[] = [];
  for (const row of candidates) {
    const got = bodies.get(row.id);
    if (!got) continue; // batch failed or row unresolved — rev stays unrecorded (retry next tick)
    if (!got.found) {
      // the row vanished between query and read (deleted): old path treated a
      // failed get the same way — error noted, rev unrecorded, next tick's
      // query simply won't list it
      error ??= `vault.getmany@1 (email bodies): row ${row.id} missing at read time`;
      continue;
    }
    const message = isMessageMeta(got.meta) ? asTriggerMessage("director.tick@1", row.id, got.data) : null;
    if (
      message === null ||
      message.folder !== "inbox" ||
      message.seen ||
      isSelf(cfg, message.from)
    ) {
      state.prevRevs.set(row.id, row.rev); // foreign/seen/self — not a trigger, cheap next tick
      continue;
    }
    triggers.push({ rowId: row.id, message });
  }

  // 3. fired-ledger check for every trigger candidate in ONE vault.getmany@1
  //    (D-388) — a found ledger row is the no-refire authority; a batch failure
  //    falls toward FIRING (at-least-once, the same direction the old per-row
  //    ledger-get failure took), bounded by the ledger append below.
  const jobs: TriggerJob[] = [];
  if (triggers.length > 0) {
    const lr: PortResult = await ctx.port.call("vault.getmany@1", {
      ns: AUTOMATION_NS,
      ids: triggers.map((t) => `${FIRED_PREFIX}${t.message.id}`),
    });
    const ledger = new Set<string>();
    if (lr.ok) {
      for (const row of (lr.value as VaultGetManyRow[]) ?? []) {
        if (row.found) ledger.add(row.id);
      }
    } else {
      error ??= `vault.getmany@1 (fired ledger) ${lr.error}: ${lr.detail ?? ""}`;
    }
    for (const t of triggers) {
      if (ledger.has(`${FIRED_PREFIX}${t.message.id}`)) {
        state.prevRevs.set(t.rowId, revById.get(t.rowId)!); // already processed — never refires
        continue;
      }
      jobs.push(t);
    }
  }

  for (const job of jobs) {
    const { rowId, message } = job;

    // 4. rules (lazy, once per tick)
    if (rules === null) {
      const loaded = await loadEnabledRules(ctx);
      rules = loaded.rules;
      ruleRowsTotal = loaded.total;
      error ??= loaded.error;
    }

    // 5. match — the shared contact derivation (D-216: byte-identical everywhere)
    const contactId = contactFromAddress(message.from).id;
    const matches = rules.filter((r) => r.when.from === null || r.when.from === contactId);

    // 6. fire each match (ordered by rule id asc — deterministic)
    const outcomes: FiredOutcome[] = [];
    for (const rule of matches) {
      const outcome = await fireRule(ctx, message, rule);
      outcomes.push(outcome);
      fired.push({ messageId: message.id, ...outcome });
    }

    // 7. ledger: one append per ATTEMPTED message (after all rules attempted).
    //    A refused firing is a legitimate ledgered outcome (ok:false + the
    //    consentId the user must grant; the grant helps FUTURE messages), and
    //    a disabled rule still processes (ledgered suppression — see test 5).
    //    But zero RULE ROWS AT ALL (a later-created rule must still fire on this
    //    message) leaves it unprocessed — the next tick retries honestly. The
    //    ledger prevents RE-fires, never first fires (pinned late-rule
    //    semantics: rules apply to the unprocessed inbox).
    if (outcomes.length === 0 && ruleRowsTotal === 0) continue;
    const append: PortResult = await ctx.port.call("vault.append@1", {
      ns: AUTOMATION_NS,
      id: `${FIRED_PREFIX}${message.id}`,
      data: { messageId: message.id, from: message.from, firedRules: outcomes, at: Date.now() },
      meta: { type: "fired" },
    });
    if (append.ok) {
      processed++;
      state.prevRevs.set(rowId, revById.get(rowId)!);
    } else {
      // at-least-once: the rev stays unrecorded so the next tick retries the
      // message (the report carries the error — never silent)
      error ??= `vault.append@1 (ledger ${message.id}) ${append.error}: ${append.detail ?? ""}`;
    }
  }

  if (error !== undefined) ctx.log(`[tick] partial: ${error}`);
  return { scanned, processed, fired, at, ...(error !== undefined ? { error } : {}) };
}
