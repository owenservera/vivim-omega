// vivim.mind — derive.ts (Ω10)
//
// The DERIVATION MACHINERY: pure functions from evidence (law registry snapshot,
// vault rows, composition-config projections) to the WorldModel. No ports, no I/O,
// no clocks — import-safe outside a worker (unit-tested directly); src/index.ts
// layers the port calls on top.
//
// D-215 (quoted): "Self-knowledge is a PLUGIN (vivim.mind, Ω10), not µhost code.
// The mind derives the WorldModel from law.registry + vault + composition-config
// projections; it writes nothing, so a wrong self-model is falsifiable against
// intact evidence."  This module is that lens. There is NO other input path: a
// hallucinated self-model is impossible by construction.
//
// The WorldModel shapes (EntityView/OpView/LexiconEntry/RuleView/PluginView) are
// EXACTLY the types from @vivim/omega-nlcl-pure — the contract between the mind
// (producer), vivim.nlcl (compartment engine), surfaces (server) and the browser.
// contactFromAddress / fold / words / slug come from the same package so derived
// contacts and name folding are byte-identical everywhere (determinism law N1).
//
// The one clock: t is a PARAMETER here (supplied by the plugin wiring, which lives
// outside the pure package). v is a deterministic function of the evidence counts.
import type {
  EntityView, LexiconEntry, OpView, PluginView, RiskClass, RuleView, WorldModel,
} from "@vivim/omega-nlcl-pure";
import { contactFromAddress, fold, slug, words } from "@vivim/omega-nlcl-pure";

// ---- constants (mirrored, not imported: the mind must not depend on provider code) ----

export const EMAIL_NS = "email";            // messages (meta.type "message")
export const AUTOMATION_NS = "automation";  // director rules
export const NLCL_NS = "nlcl";              // taught lexicon
export const MESSAGE_META_TYPE = "message";
/** Default total-entity cap: the mind is a lens, not a warehouse (docs/NCLL-AND-SELF-KNOWLEDGE §1). */
export const DEFAULT_ENTITY_CAP = 200;
/** Per-namespace vault.query bound: at most this many vault.get fetches per namespace per snapshot. */
export const QUERY_BOUND = 200;

/** Risk classes the config ops catalog may declare (nlcl-pure RiskClass — includes ENGINE). */
export const OP_RISK_CLASSES: readonly RiskClass[] = ["EXTERNAL_MUTATION", "MUTATION", "READ", "ENGINE"];

// ---- config (composition entry passthrough — data, never authority) ----

/** One row of the composition's ops catalog: RECIPE DATA (the user-signed grant is the
 *  authority for what the system can do; the registry cross-check adds liveness). */
export interface OpRow { op: string; risk: RiskClass; provider: string; title: string }

export interface MindConfig {
  composition: string;
  nlclVersion: string;
  selfAddresses: string[];
  entityCap: number;
  ops: OpRow[];
}

function configError(field: string, detail: string): Error {
  return new Error(`vivim.mind: config.${field} ${detail}`);
}

/** Parse + validate the composition config (fail-closed: a bad config throws → DEGRADED).
 *  Defaults mirror the documented shape: composition "unknown", nlclVersion "",
 *  selfAddresses [], entityCap 200, ops []. */
export function parseMindConfig(config: Record<string, unknown> | null | undefined): MindConfig {
  const c = config ?? {};
  if (typeof c !== "object" || Array.isArray(c)) throw configError("(root)", "must be an object");

  const composition = c["composition"] === undefined || c["composition"] === null ? "unknown" : c["composition"];
  if (typeof composition !== "string") throw configError("composition", "must be a string when provided");

  const nlclVersion = c["nlclVersion"] === undefined || c["nlclVersion"] === null ? "" : c["nlclVersion"];
  if (typeof nlclVersion !== "string") throw configError("nlclVersion", "must be a string when provided");

  const selfAddresses: string[] = [];
  const rawSelf = c["selfAddresses"];
  if (rawSelf !== undefined && rawSelf !== null) {
    if (!Array.isArray(rawSelf)) throw configError("selfAddresses", "must be an array of addresses");
    for (const a of rawSelf) {
      if (typeof a !== "string" || a.length === 0 || !a.includes("@")) {
        throw configError("selfAddresses", `entries must be non-empty addresses containing '@' (got ${JSON.stringify(a)})`);
      }
      selfAddresses.push(a);
    }
  }

  const entityCap = c["entityCap"] === undefined || c["entityCap"] === null ? DEFAULT_ENTITY_CAP : c["entityCap"];
  if (typeof entityCap !== "number" || !Number.isInteger(entityCap) || entityCap < 1) {
    throw configError("entityCap", `must be an integer >= 1 when provided (got ${JSON.stringify(entityCap)})`);
  }

  const ops: OpRow[] = [];
  const rawOps = c["ops"];
  if (rawOps !== undefined && rawOps !== null) {
    if (!Array.isArray(rawOps)) throw configError("ops", "must be an array of {op, risk, provider, title} rows");
    for (const row of rawOps) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw configError("ops", `rows must be objects (got ${JSON.stringify(row)})`);
      }
      const r = row as Record<string, unknown>;
      const op = r["op"];
      if (typeof op !== "string" || op.length === 0) throw configError("ops", "row.op must be a non-empty string");
      const risk = r["risk"];
      if (typeof risk !== "string" || !OP_RISK_CLASSES.includes(risk as RiskClass)) {
        throw configError("ops", `row.risk must be one of ${OP_RISK_CLASSES.join("|")} (row ${op}: ${JSON.stringify(risk)})`);
      }
      const provider = r["provider"];
      if (typeof provider !== "string" || provider.length === 0) throw configError("ops", `row.provider must be a non-empty string (row ${op})`);
      const title = r["title"];
      if (typeof title !== "string") throw configError("ops", `row.title must be a string (row ${op})`);
      ops.push({ op, risk: risk as RiskClass, provider, title });
    }
  }

  return { composition, nlclVersion, selfAddresses, entityCap, ops };
}

/** Config-default advisories (E-5): name every field the producer defaulted,
 *  so a defaulted (possibly empty) world explains itself. Pure over the RAW
 *  config — the parsed MindConfig can no longer tell defaulted from explicit.
 *  Empty = fully specified (callers omit `warnings`, keeping the wire clean). */
export function mindConfigWarnings(raw: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  const c = raw ?? {};
  if (c["composition"] === undefined || c["composition"] === null) {
    out.push(`composition defaulted to "unknown" (provide the composition name)`);
  }
  if (c["nlclVersion"] === undefined || c["nlclVersion"] === null) {
    out.push(`nlclVersion defaulted to "" (provide the language version)`);
  }
  const self = c["selfAddresses"];
  if (self === undefined || self === null || (Array.isArray(self) && self.length === 0)) {
    out.push(`selfAddresses empty — no self grounding (provide owner addresses)`);
  }
  if (c["entityCap"] === undefined || c["entityCap"] === null) {
    out.push(`entityCap defaulted to ${DEFAULT_ENTITY_CAP}`);
  }
  const ops = c["ops"];
  if (ops === undefined || ops === null || (Array.isArray(ops) && ops.length === 0)) {
    out.push(`ops catalog empty — the world has no routable ops (provide the recipe ops catalog)`);
  }
  return out;
}

// ---- evidence shapes (what the wiring fetches through the ports) ----

/** The slice of law.registry@1's snapshot the mind consumes (validated by the wiring). */
export interface RegistrySnapshotView {
  plugins: string[];                                  // sorted ids the registry has observed
  events: number;                                     // journal events in known history
  states: Record<string, { state: string }>;          // id → lifecycle state
}

/** One vault object row (latest revision per id), as fetched per namespace. */
export interface EvidenceRow { id: string; data: unknown }

export interface WorldEvidence {
  registry: RegistrySnapshotView;
  messageRows: EvidenceRow[];  // ns "email", meta.type "message" (filtered by the wiring)
  ruleRows: EvidenceRow[];     // ns "automation"
  lexiconRows: EvidenceRow[];  // ns "nlcl"
}

// ---- ops catalog: config rows (RECIPE DATA) → OpView ----

/**
 * The ops catalog (D-215 segmentation): config rows are RECIPE DATA — the user-signed
 * grant is the authority for what the system can do. The BOOT verified every provider
 * (B1–B4) and the ROUTER routes the granted op or the call fails — liveness is enforced
 * at call time, not guessed here. The law registry is an observation journal of gated
 * callers, NOT a compartment liveness oracle (a fresh boot has zero law.check callers),
 * so it must NOT filter the catalog: filtering on it would blank the world until
 * something happens to be gated. The catalog passes through as granted; the registry
 * still feeds kernel.plugins (what the law has actually SEEN) and the version counter.
 */
export function opsForWorld(ops: OpRow[], _registry: RegistrySnapshotView): OpView[] {
  return ops.map((o) => ({ op: o.op, risk: o.risk, provider: o.provider, title: o.title }));
}

// ---- message projection (the built-in ns-email projection, v1) ----

/** The message fields the lens reads (email.Message@1 minus threadId, which it does not project). */
interface MessageEvidence {
  id: string; folder: string; from: string; to: string; subject: string; body: string;
  sentAt: number; flags: { seen: boolean; flagged: boolean; draft: boolean };
}

/** Strict evidence check: whatever the vault returns under meta.type "message" must BE a
 *  message, and its data.id must match the vault object id. Corrupt message evidence
 *  throws → the whole snapshot fails DEGRADED (the mind never silently drops evidence). */
function asMessageEvidence(op: string, vaultId: string, value: unknown): MessageEvidence {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${op}: stored object ${EMAIL_NS}/${vaultId} is not a message`);
  }
  const v = value as Record<string, unknown>;
  const str = (field: string): string => {
    const x = v[field];
    if (typeof x !== "string") throw new Error(`${op}: message ${EMAIL_NS}/${vaultId} field ${field} must be a string`);
    return x;
  };
  const m: MessageEvidence = {
    id: str("id"), folder: str("folder"), from: str("from"), to: str("to"),
    subject: str("subject"), body: str("body"),
    sentAt: 0, flags: { seen: false, flagged: false, draft: false },
  };
  if (m.id !== vaultId) throw new Error(`${op}: message ${EMAIL_NS}/${vaultId} carries mismatched data.id "${m.id}"`);
  if (typeof v["sentAt"] !== "number" || !Number.isInteger(v["sentAt"]) || v["sentAt"] < 0) {
    throw new Error(`${op}: message ${EMAIL_NS}/${vaultId} sentAt must be a non-negative integer (epoch ms)`);
  }
  m.sentAt = v["sentAt"];
  const f = v["flags"];
  if (f === null || typeof f !== "object" || Array.isArray(f)) {
    throw new Error(`${op}: message ${EMAIL_NS}/${vaultId} flags must be an object`);
  }
  const fl = f as Record<string, unknown>;
  for (const k of ["seen", "flagged", "draft"] as const) {
    if (typeof fl[k] !== "boolean") throw new Error(`${op}: message ${EMAIL_NS}/${vaultId} flags.${k} must be a boolean`);
  }
  m.flags = { seen: fl["seen"] as boolean, flagged: fl["flagged"] as boolean, draft: fl["draft"] as boolean };
  return m;
}

/**
 * Project one message row → EntityView. Names are the grounding aliases (lowercased):
 * the subject, its words, and the from-local-part words — folded with the SAME
 * nlcl-pure text utilities the language layer uses (byte-identical grounding, N1).
 */
export function projectMessageEvidence(op: string, row: EvidenceRow, opts: { includeBodies: boolean }): EntityView {
  const m = asMessageEvidence(op, row.id, row.data);
  const fromLocal = (m.from.toLowerCase().split("@")[0] ?? "").split(/[._-]+/).filter((s) => s.length >= 1);
  const names = [...new Set([fold(m.subject), ...words(m.subject), ...fromLocal.map(fold)])].filter((s) => s.length > 0);
  return {
    id: `message:${row.id}`,
    type: "message",
    label: m.subject,
    names,
    data: {
      id: row.id,
      subject: m.subject,
      ...(opts.includeBodies ? { body: m.body } : {}),
      from: m.from,
      to: m.to,
      folder: m.folder,
      sentAt: m.sentAt,
      flags: m.flags,
    },
    at: m.sentAt,
  };
}

// ---- derived contacts (the system LEARNS who you correspond with) ----

/**
 * Derived contact entities: every from/to address across the (bounded) message set,
 * EXCLUDING the configured self addresses. Contacts are derived facts, not stored
 * authority — each contact is contactFromAddress(address, latestSentAt) from
 * @vivim/omega-nlcl-pure, so the browser, the server and the compartment derive
 * byte-identical contacts from the same evidence (N1).
 */
export function deriveContactEntities(messages: EntityView[], selfAddresses: string[]): EntityView[] {
  const self = new Set(selfAddresses.map((a) => a.toLowerCase()));
  const latestAt = new Map<string, number>();
  for (const m of messages) {
    const d = (m.data ?? {}) as Record<string, unknown>;
    for (const field of ["from", "to"] as const) {
      const addr = d[field];
      if (typeof addr !== "string" || !addr.includes("@")) continue;
      const key = addr.toLowerCase();
      if (self.has(key)) continue;
      const at = typeof m.at === "number" ? m.at : 0;
      latestAt.set(key, Math.max(latestAt.get(key) ?? 0, at));
    }
  }
  // Deterministic order: by latest-seen at desc, then address asc.
  return [...latestAt.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([address, at]) => contactFromAddress(address, at));
}

// ---- rules (vault ns "automation" — the director writes, the mind reads) ----

/** Project one rule row → {RuleView, rule EntityView}, or null when the row is not a
 *  representable rule (missing when.event / then.op). Rule objects are foreign data
 *  (the director owns the shape); the lens maps what it can and skips the rest. */
export function projectRuleEvidence(op: string, row: EvidenceRow): { rule: RuleView; entity: EntityView } | null {
  if (row.data === null || typeof row.data !== "object" || Array.isArray(row.data)) return null;
  const d = row.data as Record<string, unknown>;
  const w = d["when"];
  const t = d["then"];
  if (w === null || typeof w !== "object" || t === null || typeof t !== "object") return null;
  const wRec = w as Record<string, unknown>;
  const tRec = t as Record<string, unknown>;
  const event = wRec["event"];
  const actionOp = tRec["op"];
  if (typeof event !== "string" || event.length === 0) return null;
  if (typeof actionOp !== "string" || actionOp.length === 0) return null;

  const id = typeof d["id"] === "string" && d["id"].length > 0 ? d["id"] : row.id;
  const enabled = d["enabled"] === true;
  const summary = typeof d["summary"] === "string" ? d["summary"] : "";
  const when: RuleView["when"] = { event };
  if (typeof wRec["from"] === "string" && wRec["from"].length > 0) when.from = wRec["from"];
  // "to" maps from then.payload.to when present (the director's slot routing).
  const then: RuleView["then"] = { op: actionOp };
  const payload = tRec["payload"];
  const to = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)["to"]
    : undefined;
  if (typeof to === "string" && to.length > 0) then.to = to;

  const rule: RuleView = { id, enabled, summary, when, then };
  const createdAt = typeof d["createdAt"] === "number" && Number.isFinite(d["createdAt"]) ? d["createdAt"] : 0;
  const names = [...new Set([fold(summary), ...words(summary), slug(row.id)])].filter((s) => s.length > 0);
  const entity: EntityView = {
    id: row.id, // the VAULT object id ("rule:peter-forward") so "disable rule X" grounds
    type: "rule",
    label: summary,
    names,
    data: d,
    at: createdAt,
  };
  void op;
  return { rule, entity };
}

// ---- taught lexicon (vault ns "nlcl" — teachings survive plugin swaps, D-218) ----

/** Project one lexicon row → LexiconEntry, or null when it must be SKIPPED:
 *  op null/absent, action "remove", or a missing word (removals and malformed rows
 *  are not teachings). */
export function projectLexiconEvidence(row: EvidenceRow): LexiconEntry | null {
  if (row.data === null || typeof row.data !== "object" || Array.isArray(row.data)) return null;
  const d = row.data as Record<string, unknown>;
  if (d["action"] === "remove") return null;                       // untaught — skip
  if (typeof d["op"] !== "string" || d["op"].length === 0) return null; // op null/absent — skip
  if (typeof d["word"] !== "string" || d["word"].length === 0) return null;
  const note = typeof d["note"] === "string" && d["note"].length > 0 ? d["note"] : undefined;
  const source = typeof d["source"] === "string" && d["source"].length > 0 ? d["source"] : "taught";
  const createdAt = typeof d["createdAt"] === "number" && Number.isFinite(d["createdAt"]) ? d["createdAt"] : 0;
  return { word: d["word"], op: d["op"], ...(note !== undefined ? { note } : {}), source, createdAt };
}

// ---- the snapshot assembly ----

export interface BuildOpts { includeBodies?: boolean; t?: number }

/** Deterministic entity order: newest first (at desc), ties broken by id asc. */
function entityOrder(a: EntityView, b: EntityView): number {
  return (b.at ?? 0) - (a.at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Build the WorldModel from evidence + config. PURE given (evidence, config, opts):
 * same evidence + same config ⇒ byte-identical world (except v, which is a function
 * of the evidence counts, and t, which the caller supplies — the only clock).
 */
export function buildWorldModel(evidence: WorldEvidence, config: MindConfig, opts: BuildOpts = {}): WorldModel {
  const includeBodies = opts.includeBodies ?? true;
  const t = opts.t ?? 0;

  // messages (newest-first ordering comes from the merged sort below)
  const messages = evidence.messageRows.map((row) => projectMessageEvidence("mind.snapshot@1", row, { includeBodies }));

  // rules + rule entities (vault row order — id ASC from vault.query, deterministic)
  const rules: RuleView[] = [];
  const ruleEntities: EntityView[] = [];
  for (const row of evidence.ruleRows) {
    const p = projectRuleEvidence("mind.snapshot@1", row);
    if (!p) continue;
    rules.push(p.rule);
    ruleEntities.push(p.entity);
  }

  // taught lexicon (removals skipped)
  const lexicon: LexiconEntry[] = [];
  for (const row of evidence.lexiconRows) {
    const e = projectLexiconEvidence(row);
    if (e) lexicon.push(e);
  }

  // derived contacts from the bounded message set (self addresses excluded)
  const contacts = deriveContactEntities(messages, config.selfAddresses);

  // merge + order + cap: newest-first, contacts interleaved by their latest-seen at
  const entities = [...messages, ...contacts, ...ruleEntities].sort(entityOrder).slice(0, config.entityCap);

  // context refs are self-consistent: they resolve to entities IN the capped world
  const latestMessage = entities.find((e) => e.type === "message") ?? null;
  const context: WorldModel["context"] = {
    latestMessageId: latestMessage?.id ?? null,
    latestEntityId: entities[0]?.id ?? null,
  };

  // kernel: the LIVE registry (never config) — ids + states the registry actually holds.
  // The registry knows LIVENESS, not versions: an honest lens reports "unknown" rather
  // than inventing numbers it has no evidence for.
  const plugins: PluginView[] = evidence.registry.plugins.map((id) => ({
    id,
    version: "unknown",
    state: evidence.registry.states[id]?.state ?? "unknown",
  }));

  const ops = opsForWorld(config.ops, evidence.registry);

  // v: a deterministic function of the evidence counts (bumps when the world changes)
  const v = evidence.registry.events + entities.length + rules.length + lexicon.length;

  return {
    v,
    t,
    kernel: { composition: config.composition, nlclVersion: config.nlclVersion, plugins },
    ops,
    entities,
    lexicon,
    rules,
    context,
  };
}

// ---- the portrait (D-350 — the system seeing itself, one unified read) ----

/**
 * The FULL law.registry@1 snapshot view the portrait consumes (validated by the
 * wiring's fetchRegistryFull): everything RegistrySnapshotView carries, plus the
 * consent count and the law generation — the portrait reports the law's own
 * numbers, never a guess.
 */
export interface RegistryFullView extends RegistrySnapshotView {
  consents: number;   // active consents (law registry's own count)
  generation: number; // law state generation
}

/** The vault.verify@1 result view (the recomputed Merkle chain head). */
export interface VaultVerifyView {
  ok: boolean;
  headHash: string;
  entries: number;
}

/**
 * The namespaces the portrait counts — the mind's OWN lens, nothing else. The
 * counts come from the same bounded vault queries that feed the WorldModel, so
 * the portrait's namespaces and the world's entities trace to the same evidence.
 */
export const PORTRAIT_NAMESPACES = ["email", "automation", "nlcl", "control"] as const;

/** Everything the portrait is derived from (fetched by the wiring, all READ). */
export interface PortraitEvidence {
  registry: RegistryFullView;
  verify: VaultVerifyView;
  /** Per-namespace row counts, one entry per PORTRAIT_NAMESPACES (control may be 0). */
  namespaceCounts: ReadonlyArray<{ ns: string; entries: number }>;
  messageRows: EvidenceRow[];  // ns "email", meta.type "message"
  ruleRows: EvidenceRow[];    // ns "automation"
  lexiconRows: EvidenceRow[]; // ns "nlcl"
}

/** The portrait's world slice — the SUMMARY the artifact ships (the full
 *  WorldModel stays behind the op boundary; the portrait carries counts + the
 *  top derived contacts, exactly the first-lineage artifact shape). */
export interface PortraitWorldSummary {
  v: number;
  t: number;
  counts: {
    entities: number;
    messages: number;
    contacts: number;
    rules: number;
    lexicon: number;
    ops: number;
  };
  topContacts: Array<{ id: string; label: string; address: string }>;
}

/** The portrait view returned by mind.portrait@1 (the artifact's `runtime` minus
 *  the host-side router truth, which a plugin cannot see — the emitter merges
 *  that in from the booted host). */
export interface PortraitView {
  at: number;
  composition: string;
  nlclVersion: string;
  kernel: {
    plugins: PluginView[];
    events: number;
    consents: number;
    generation: number;
  };
  vault: {
    ok: boolean;
    headHash: string;
    entries: number;
    namespaces: Array<{ ns: string; entries: number }>;
  };
  world: PortraitWorldSummary;
  capabilities: OpRow[];
}

/**
 * Build the portrait from evidence + config. PURE given (evidence, config, opts):
 * same evidence + same config ⇒ byte-identical portrait except `at` (the one
 * clock, supplied by the wiring) and `world.t` (same clock). The world inside is
 * derived by the SAME machinery as mind.snapshot@1 — one derivation, two views
 * (the portrait ships the summary; the snapshot ships the whole model).
 */
export function buildPortrait(evidence: PortraitEvidence, config: MindConfig, opts: { t: number }): PortraitView {
  const world = buildWorldModel(
    {
      registry: evidence.registry, // RegistryFullView is a superset — the world consumes the reduced view
      messageRows: evidence.messageRows,
      ruleRows: evidence.ruleRows,
      lexiconRows: evidence.lexiconRows,
    },
    config,
    { includeBodies: true, t: opts.t },
  );
  const namespaces = PORTRAIT_NAMESPACES.map((ns) => ({
    ns,
    entries: evidence.namespaceCounts.find((c) => c.ns === ns)?.entries ?? 0,
  }));
  const contacts = world.entities.filter((e) => e.type === "contact");
  const asAddress = (data: unknown): string =>
    typeof data === "object" && data !== null && typeof (data as Record<string, unknown>)["address"] === "string"
      ? (data as Record<string, unknown>)["address"] as string
      : "";
  return {
    at: opts.t,
    composition: config.composition,
    nlclVersion: config.nlclVersion,
    kernel: {
      plugins: world.kernel.plugins,
      events: evidence.registry.events,
      consents: evidence.registry.consents,
      generation: evidence.registry.generation,
    },
    vault: {
      ok: evidence.verify.ok,
      headHash: evidence.verify.headHash,
      entries: evidence.verify.entries,
      namespaces,
    },
    world: {
      v: world.v,
      t: world.t,
      counts: {
        entities: world.entities.length,
        messages: world.entities.filter((e) => e.type === "message").length,
        contacts: contacts.length,
        rules: world.rules.length,
        lexicon: world.lexicon.length,
        ops: world.ops.length,
      },
      topContacts: contacts.slice(0, 5).map((c) => ({ id: c.id, label: c.label, address: asAddress(c.data) })),
    },
    capabilities: config.ops.map((o) => ({ ...o })),
  };
}
