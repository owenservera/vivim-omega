// vivim.director — rules.ts (Ω12)
// The pure rule + teaching vocabulary: fail-closed validation, deterministic id
// slugs, deterministic human summaries, and read-path defense for stored rows.
// No ports, no I/O — import-safe outside a worker (unit-testable directly);
// index.ts layers the vault port calls on top.
//
// Everything the director persists is DATA (D-219): a rule is a vault object in
// ns "automation"; a teaching is a vault object in ns "nlcl". No code is ever
// generated from either — the tick loop INTERPRETS them, deterministically.
import { fold, prettifyLocalPart } from "@vivim/omega-nlcl-pure";

// ---- shared vocabulary constants (duplicated per the B2 import law: plugins
// never import each other; these mirror the DOCUMENTED email/vault interfaces) ----

/** Vault ns holding rules (rule:*) and the fired ledger (fired:*). */
export const AUTOMATION_NS = "automation";
/** Vault ns holding taught words (lexicon:*). */
export const NLCL_NS = "nlcl";
/** Vault ns holding email messages (the tick's scan target). */
export const EMAIL_NS = "email";
/** meta.type of an email message object (shared ns discipline: threads/contacts may coexist). */
export const MESSAGE_META_TYPE = "message";

/** id prefixes in ns "automation". */
export const RULE_PREFIX = "rule:";
export const FIRED_PREFIX = "fired:";
/** id prefix in ns "nlcl". */
export const LEXICON_PREFIX = "lexicon:";

/** v1 event vocabulary — the ONLY trigger event the director understands. */
export const TRIGGER_EVENT = "message.received";
/** v1 action vocabulary — the ONLY action op the director executes (documented boundary). */
export const ACTION_OP = "message.send@1";
/** Op-id grammar (mirrors the NCLL/surface IR: <id>@<bare-major>). */
export const OP_ID_RE = /^[a-z0-9.]+@[0-9]+$/;
/** Contact-id grammar (derived contact ids: contact:<slug>). */
export const CONTACT_ID_RE = /^contact:[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Taught-word grammar (folded). */
export const WORD_RE = /^[a-z0-9-]{2,20}$/;

// ---- payload shapes ----

export interface RuleWhen {
  event: typeof TRIGGER_EVENT;
  from: string | null; // "contact:<slug>" or null (anyone)
}

export interface RuleThen {
  op: string; // v1: "message.send@1"
  payload: Record<string, unknown>;
}

/** The stored rule object (ns "automation", id rule:*). */
export interface RuleData {
  id: string;
  when: RuleWhen;
  then: RuleThen;
  enabled: boolean;
  summary: string;
  createdAt: number;
}

/** The stored teaching object (ns "nlcl", id lexicon:<word>). */
export interface TeachData {
  word: string;
  op: string | null; // null = removed (the mind skips op:null rows — that IS the removal)
  action: "add" | "remove";
  source: "taught";
  createdAt: number;
}

// ---- validation (fail-closed: throw → DEGRADED at the port boundary) ----

function requireObject(op: string, value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${op}: payload must be an object`);
  }
  return value as Record<string, unknown>;
}

export interface RuleInput {
  when: RuleWhen;
  then: RuleThen;
  /** then.payload.messageFromTrigger === true — the action binds the trigger message. */
  messageFromTrigger: boolean;
}

/**
 * director.rule@1 payload validation (v1 vocabulary, fail-closed):
 *   when.event MUST be "message.received";
 *   when.from is a contact id "contact:<slug>" or null (anyone);
 *   then.op must match /^[a-z0-9.]+@[0-9]+$/ and MUST be "message.send@1" in v1;
 *   then.payload must be an object.
 */
export function validateRuleInput(op: string, payload: unknown): RuleInput {
  const p = requireObject(op, payload);
  const when = requireObject(`${op}: when`, p["when"]);
  const then = requireObject(`${op}: then`, p["then"]);

  const event = when["event"];
  if (event !== TRIGGER_EVENT) {
    throw new Error(`${op}: when.event must be "${TRIGGER_EVENT}" (v1 event vocabulary, got ${JSON.stringify(event)})`);
  }
  const fromRaw = when["from"] === undefined ? null : when["from"];
  if (fromRaw !== null) {
    if (typeof fromRaw !== "string" || !CONTACT_ID_RE.test(fromRaw)) {
      throw new Error(`${op}: when.from must be a contact id "contact:<slug>" or null (anyone), got ${JSON.stringify(fromRaw)}`);
    }
  }

  const actionOp = then["op"];
  if (typeof actionOp !== "string" || !OP_ID_RE.test(actionOp)) {
    throw new Error(`${op}: then.op must match /^[a-z0-9.]+@[0-9]+$/, got ${JSON.stringify(actionOp)}`);
  }
  if (actionOp !== ACTION_OP) {
    throw new Error(`${op}: then.op must be "${ACTION_OP}" in v1 — the only action op the director executes (vocabulary boundary, got "${actionOp}")`);
  }

  const actionPayload = then["payload"] === undefined ? null : then["payload"];
  if (actionPayload === null || typeof actionPayload !== "object" || Array.isArray(actionPayload)) {
    throw new Error(`${op}: then.payload must be an object`);
  }

  return {
    when: { event: TRIGGER_EVENT, from: fromRaw },
    then: { op: actionOp, payload: actionPayload as Record<string, unknown> },
    messageFromTrigger: (actionPayload as Record<string, unknown>)["messageFromTrigger"] === true,
  };
}

export interface TeachInput {
  word: string; // folded
  op: string | null;
  action: "add" | "remove";
}

/**
 * director.teach@1 payload validation (fail-closed): word folds to
 * ^[a-z0-9-]{2,20}$; op matches the op-id grammar when action is "add"
 * (remove ignores op — the op:null revision IS the removal).
 */
export function validateTeachInput(op: string, payload: unknown): TeachInput {
  const p = requireObject(op, payload);
  const wordRaw = p["word"];
  if (typeof wordRaw !== "string") throw new Error(`${op}: word must be a string`);
  const word = fold(wordRaw);
  if (!WORD_RE.test(word)) {
    throw new Error(`${op}: word must fold to ^[a-z0-9-]{2,20}$ (got ${JSON.stringify(word)})`);
  }
  const actionRaw = p["action"] === undefined || p["action"] === null ? "add" : p["action"];
  if (actionRaw !== "add" && actionRaw !== "remove") {
    throw new Error(`${op}: action must be "add" or "remove" (got ${JSON.stringify(actionRaw)})`);
  }
  if (actionRaw === "add") {
    const opId = p["op"];
    if (typeof opId !== "string" || !OP_ID_RE.test(opId)) {
      throw new Error(`${op}: op must match /^[a-z0-9.]+@[0-9]+$/ when action is add (got ${JSON.stringify(opId)})`);
    }
    return { word, op: opId, action: "add" };
  }
  // remove: op is never stored — the op:null revision is the whole mechanism
  return { word, op: null, action: "remove" };
}

// ---- deterministic ids + human summaries ----

/** Rule id slug: rule:<from-slug|any>-forward (from null ⇒ "any"). */
export function ruleSlug(from: string | null): string {
  const key = from === null ? "any" : from.slice("contact:".length);
  return `${RULE_PREFIX}${key}-forward`;
}

/** First free rule id against the occupied set: base, base-2, base-3, … */
export function nextFreeRuleId(base: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(base)) return base;
  for (let n = 2; n <= 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("director.rule@1: rule id space exhausted (10000 collisions)");
}

/** Trigger label: contact:peter-miller → "Peter Miller"; null → "anyone". */
export function triggerLabel(from: string | null): string {
  return from === null ? "anyone" : prettifyLocalPart(from.slice("contact:".length));
}

/** Action summary: then.payload.to local part → "send to Sarah Chen". */
export function actionSummary(then: RuleThen): string {
  const to = then.payload["to"];
  if (typeof to === "string" && to.includes("@")) {
    return `send to ${prettifyLocalPart(to.split("@")[0] ?? to)}`;
  }
  return `run ${then.op}`;
}

/** Deterministic human summary: `When <label> messages me, <action summary>`. */
export function ruleSummary(when: RuleWhen, then: RuleThen): string {
  return `When ${triggerLabel(when.from)} messages me, ${actionSummary(then)}`;
}

// ---- read-path defense (whatever the vault returns must BE a rule/teaching) ----

/**
 * Validate a stored automation row as a rule. Returns null on anything malformed
 * (foreign objects under rule:*, hand-tampered rows) — the tick/registry skip it;
 * a wrong row can never fire.
 */
export function asRule(op: string, id: string, value: unknown): RuleData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v["id"] !== id) return null;
  try {
    const input = validateRuleInput(op, { when: v["when"], then: v["then"] });
    if (typeof v["enabled"] !== "boolean") return null;
    if (typeof v["summary"] !== "string" || v["summary"].length === 0) return null;
    if (typeof v["createdAt"] !== "number" || !Number.isInteger(v["createdAt"]) || v["createdAt"] < 0) return null;
    return { id, when: input.when, then: input.then, enabled: v["enabled"], summary: v["summary"], createdAt: v["createdAt"] };
  } catch {
    return null;
  }
}

/** Validate a stored nlcl row as a teaching (op:null rows are valid — they ARE the removal). */
export function asTeaching(op: string, id: string, value: unknown): TeachData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v["word"] !== id.slice(LEXICON_PREFIX.length)) return null;
  const action = v["action"];
  if (action !== "add" && action !== "remove") return null;
  const opField = v["op"];
  if (opField !== null && (typeof opField !== "string" || !OP_ID_RE.test(opField))) return null;
  if (v["source"] !== "taught") return null;
  if (typeof v["createdAt"] !== "number" || !Number.isInteger(v["createdAt"]) || v["createdAt"] < 0) return null;
  return { word: v["word"] as string, op: opField as string | null, action, source: "taught", createdAt: v["createdAt"] as number };
}
