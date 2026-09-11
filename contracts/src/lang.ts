// @vivim/omega-contracts — lang.ts
// Ω13.5 — Language-as-data contribution (realizes D-218's deferred `lang` kind).
//
// A `lang` contribution lets any pack or plugin contribute vocabulary and frames as
// DATA. The NCLL merges them deterministically at boot (a pure function of the
// contribution set). Grammar (the 17 families, slot kinds) stays pinned; MEANINGS
// are data. This is the extensibility unlock for the consumer-app story: a
// third-party provider brings its own verbs/slots/lexicon declaratively, with zero
// code changes to the language engine.
//
// The shapes below MIRROR nlcl-pure's OpFrame / FrameSlot / LexiconEntry. They are
// re-declared here (not imported) because contracts must stay self-contained and
// nlcl-pure must stay zero-import (B2 discipline, both directions).

import type { Contribution } from "./manifest.ts";

/** The 17 core-primitive command symbol families (D-217). Same union as nlcl-pure. */
export type LangFamilyChar =
  | "/" | "@" | "#" | "!" | "?" | "+" | "-" | "&" | "$" | "*" | "%"
  | "∆" | "✓" | "=" | "^" | "~" | "→";

/** Slot kinds — mirror nlcl-pure's SlotKind. */
export type LangSlotKind = "entity" | "text" | "content" | "enum" | "rest";

/** One slot of a contributed op frame (mirrors nlcl-pure FrameSlot). */
export interface LangFrameSlot {
  role: string;
  kind: LangSlotKind;
  preps?: string[];          // "to" | "about" | "from" ...
  entityTypes?: string[];    // grounding filter for entity slots
  enumValues?: string[];
  required?: boolean;
  patient?: boolean;         // filled from the bare position after the verb
  payloadKey?: string;       // op payload key this slot maps to
  family?: LangFamilyChar;   // symbolic hint for the canonical form
}

/** One contributed op frame (mirrors nlcl-pure OpFrame). */
export interface LangOpFrame {
  op: string;
  verbs: string[];
  title: string;
  slots: LangFrameSlot[];
  reading: string;           // "Send {message} to {to}" — {slot} interpolation
  examples: string[];
  family: LangFamilyChar;
  surfaceOnly?: boolean;     // pseudo-intents served by surfaces, never routed
}

/** One contributed lexicon entry (mirrors nlcl-pure LexiconEntry). */
export interface LangLexiconEntry {
  word: string;
  op: string;
  note?: string;
  source?: string;           // "pack:domain-x" | "taught" | ...
}

/**
 * A `lang` contribution entry: a Contribution carrying frames and/or lexicon data.
 * Subtype of Contribution (adds fields only), so it is assignable to Contribution[]
 * in a manifest's contributions record.
 */
export interface LangContribution extends Contribution {
  kind: "lang";
  frames?: LangOpFrame[];
  lexicon?: LangLexiconEntry[];
}
