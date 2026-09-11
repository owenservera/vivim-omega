// nlcl-pure/src/types.ts — every public shape of the language layer.
// This file is the CONTRACT between: vivim.mind (WorldModel producer),
// vivim.nlcl (compartment engine), surfaces/web (server) and the browser
// (keystroke-latency feedback). Zero imports — browser-safe by construction.

/** Risk classes mirrored from the router's manifest view (ENGINE = no declared risk). */
export type RiskClass = "EXTERNAL_MUTATION" | "MUTATION" | "READ" | "ENGINE";

/** The 17 core-primitive command symbol families (D-217). */
export type FamilyChar =
  | "/" | "@" | "#" | "!" | "?" | "+" | "-" | "&" | "$" | "*" | "%" | "∆" | "✓" | "=" | "^" | "~" | "→";

export interface PluginView { id: string; version: string; state: string }

/** One routable op as the mind sees it (risk + provider come from the registry). */
export interface OpView { op: string; risk: RiskClass; provider: string; title: string }

/** A groundable thing in the world (contact, message, rule, …). `names` are grounding aliases. */
export interface EntityView {
  id: string;                // "contact:peter-miller" | "message:msg_ab12cd"
  type: string;              // "contact" | "message" | "rule" | ...
  label: string;             // "Peter Miller"
  names: string[];           // lowercased aliases used by grounding
  data?: Record<string, unknown>; // bounded projection (address, subject, body, folder…)
  at?: number;               // recency key (epoch ms or vault seq) — larger = newer
}

/** A taught word (vault ns "nlcl"): word → op. Survives plugin swaps (D-218). */
export interface LexiconEntry { word: string; op: string; note?: string; source: string; createdAt: number }

/** A director rule (vault ns "automation"). */
export interface RuleView {
  id: string; enabled: boolean; summary: string;
  when: { event: string; from?: string };
  then: { op: string; to?: string };
}

/** THE grounding target — everything NCLL knows about the world it commands. */
export interface WorldModel {
  v: number;                 // version; bumped on any change
  t: number;                 // built-at (epoch ms) — the only clock, supplied by the producer
  kernel: { composition: string; nlclVersion: string; plugins: PluginView[] };
  ops: OpView[];
  entities: EntityView[];
  lexicon: LexiconEntry[];
  rules: RuleView[];
  context: { latestMessageId: string | null; latestEntityId: string | null };
}

// ---- interpretation result ----

export type InterpStatus = "empty" | "ok" | "partial" | "ambiguous" | "unknown" | "invalid";

export type TokKind = "word" | "symbol" | "quote" | "arrow" | "number" | "punct" | "ref" | "cmd" | "tag" | "var";

export interface Token {
  i: number;
  text: string;              // raw slice
  norm: string;              // folded (lowercase, diacritics stripped)
  kind: TokKind;
  family?: FamilyChar;       // for symbol/arrow/ref/cmd/tag/var tokens
  quote?: string;            // decoded contents when kind === "quote"
  start: number; end: number; // character spans in the input
}

export interface EntityMatch { entity: EntityView; score: number; reason: string }

/** A filled slot on an IR — display + canonical + executable value + ranked alternatives. */
export interface IRSlot {
  value: unknown;            // executable payload value (payloadKey-mapped)
  display: string;           // "Peter Miller" / "'hello there'" / "the latest message"
  canonical: string;         // "@peter-miller" / "'hello there'" / "@this"
  entityId?: string;
  contextRef?: string;       // "world.latestMessage" | "trigger.message" when value is deferred
  confidence: number;
  matches?: EntityMatch[];   // ranked grounding alternatives (shown when >1)
  note?: string;
  tokens?: number[];         // input token indices this slot consumed (live attribution)
}

export interface IR {
  intent: string;            // op id ("message.send@1") or surface pseudo-intent ("surface.help")
  family: FamilyChar;
  slots: Record<string, IRSlot>;
  payload: Record<string, unknown>; // fully-mapped op payload (deterministic; server re-derives)
  modifiers: { force?: boolean; query?: boolean; priority?: boolean; fuzzy?: boolean };
  canonical: string;         // "/send @this → @peter-miller"
  reading: string;           // "Send the latest message to Peter Miller"
  confidence: number;
  provenance: { verbs: string[]; taught?: string };
}

/** Per-input-token annotation — the live underlines in the console. */
export interface TokenNote {
  i: number; text: string; start: number; end: number; kind: TokKind;
  family?: FamilyChar; role?: string; note?: string;
}

/** Effect preview: what WILL happen if executed (risk/gate come from WorldModel ops). */
export interface EffectView {
  op: string; risk: RiskClass; provider: string; title: string;
  gate: "consent" | "journal" | "open";
}

export type SuggestionKind =
  | "verb" | "completion" | "disambiguation" | "correction" | "teach" | "symbol" | "slot" | "example";

export interface Suggestion {
  kind: SuggestionKind;
  text: string;              // what to insert / the command to run
  display: string;           // human label
  detail?: string;
  op?: string;
  entityId?: string;
}

export type GapKind = "unknown-word" | "unresolved-slot" | "empty-context" | "ambiguity" | "syntax";

export interface GapNote { kind: GapKind; text: string; hint?: string }

/** One pipeline stage of the trace — explainability is a feature (no clocks: N1). */
export interface StageTrace { stage: string; notes: string[] }

export interface Interpretation {
  input: string;
  status: InterpStatus;
  nlclVersion: string;
  worldV: number;
  ir: IR | null;             // primary candidate
  alternatives: IR[];
  tokens: TokenNote[];
  canonical: string | null;
  reading: string | null;
  confidence: number;
  effects: EffectView[];
  suggestions: Suggestion[];
  gaps: GapNote[];
  stages: StageTrace[];
}

// ---- symbol families ----

export interface FamilyDef {
  char: FamilyChar;
  name: string;              // "command"
  meaning: string;           // one-line semantics
  nl: string[];              // natural-language triggers (data, upgradable)
  examples: string[];
  colorHint: string;         // console color token (mapped by the surface, not us)
}

// ---- frames (language data — D-218) ----

export type SlotKind = "entity" | "text" | "content" | "enum" | "rest";

export interface FrameSlot {
  role: string;
  kind: SlotKind;
  preps?: string[];          // "to" | "about" | "from" …
  entityTypes?: string[];    // grounding filter for entity slots
  enumValues?: string[];
  required?: boolean;
  patient?: boolean;         // filled from the bare position after the verb
  payloadKey?: string;       // op payload key this slot maps to
  family?: FamilyChar;       // symbolic hint for the canonical form
}

export interface OpFrame {
  op: string;
  verbs: string[];
  title: string;
  slots: FrameSlot[];
  reading: string;           // "Send {message} to {to}" — {slot} interpolation
  examples: string[];
  family: FamilyChar;
  surfaceOnly?: boolean;     // pseudo-intents served by surfaces, never routed
}
