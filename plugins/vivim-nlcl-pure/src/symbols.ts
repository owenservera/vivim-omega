// nlcl-pure/src/symbols.ts — the 17 core-primitive command symbol families (D-217).
// The GLYPHS are lexer primitives (grammar, stable); their NL expansions are data
// (upgradable via lexicon/plugin swap). Owner directive, verbatim: "#, @, /, !, ?, +, -, &,
// $, *, %, ∆, ✓, =, ^, ~ ETC".

import type { FamilyDef, FamilyChar } from "./types.ts";

export const SYMBOL_FAMILIES: FamilyDef[] = [
  { char: "/", name: "command", meaning: "invoke an op — the primary verb family", nl: ["do", "run", "invoke"],
    examples: ["/send 'hello' to Peter", "/rules"], colorHint: "emerald" },
  { char: "@", name: "reference", meaning: "a grounded entity mention (person, message, rule)", nl: ["this", "that", "it", "them"],
    examples: ["@peter", "@this", "send @this → @sarah"], colorHint: "amber" },
  { char: "#", name: "tag", meaning: "label / categorize", nl: ["tag", "as", "label"],
    examples: ["#urgent", "tag it #quarterly"], colorHint: "teal" },
  { char: "!", name: "force", meaning: "execute now — skip the confirmation card", nl: ["now", "immediately", "just do it"],
    examples: ["! /send 'go' to Peter", "send it now!"], colorHint: "rose" },
  { char: "?", name: "query", meaning: "interrogate the world / ask the assistant", nl: ["what", "who", "help", "list"],
    examples: ["? who is Peter", "what can I say?"], colorHint: "emerald" },
  { char: "+", name: "add", meaning: "include / create", nl: ["add", "with", "also", "new"],
    examples: ["+rule …", "add contact Maria"], colorHint: "teal" },
  { char: "-", name: "remove", meaning: "exclude / delete / disable", nl: ["without", "remove", "disable", "except"],
    examples: ["-rule forwarding", "disable rule 2"], colorHint: "rose" },
  { char: "&", name: "combine", meaning: "and / then — chain two commands", nl: ["and", "then", "also"],
    examples: ["/list & /rules"], colorHint: "orange" },
  { char: "$", name: "value", meaning: "variable binding — name a thing for reuse", nl: ["set", "save as", "call it"],
    examples: ["$draft = /send …", "send $draft"], colorHint: "amber" },
  { char: "*", name: "wildcard", meaning: "all / every", nl: ["all", "every", "everything"],
    examples: ["read *", "* from Peter"], colorHint: "orange" },
  { char: "%", name: "config", meaning: "parameter tuning on an existing capability", nl: ["set", "configure", "tune"],
    examples: ["% inbox limit 20"], colorHint: "teal" },
  { char: "∆", name: "delta", meaning: "change an existing thing (vs + which creates)", nl: ["change", "update", "make it"],
    examples: ["∆ rule 1 → @sarah"], colorHint: "orange" },
  { char: "✓", name: "confirm", meaning: "approve the pending consent / action card", nl: ["yes", "confirm", "do it", "allow"],
    examples: ["✓", "confirm consent_x1"], colorHint: "emerald" },
  { char: "=", name: "assert", meaning: "definition / teaching — a word means an op", nl: ["means", "is", "equals"],
    examples: ["blitz = /send", "teach blitz means send"], colorHint: "amber" },
  { char: "^", name: "priority", meaning: "escalate — run before queued work", nl: ["urgent", "important", "first", "asap"],
    examples: ["^ /send 'fire' to Peter"], colorHint: "rose" },
  { char: "~", name: "approximate", meaning: "fuzzy mode for this parse", nl: ["about", "roughly", "like"],
    examples: ["~ send to petr"], colorHint: "orange" },
  { char: "→", name: "direction", meaning: "slot routing — to / into / for", nl: ["to", "into", "for"],
    examples: ["/send @this → @peter"], colorHint: "teal" },
];

export const FAMILY_BY_CHAR = new Map<FamilyChar, FamilyDef>(SYMBOL_FAMILIES.map((f) => [f.char, f]));

/** All glyphs the lexer treats as family symbols (both delta codepoints, both checkmarks). */
export const FAMILY_GLYPHS: string[] = [
  "#", "!", "?", "+", "-", "&", "$", "*", "%", "^", "~", "=", "@", "/",
  "∆", "Δ", "✓", "✔",
];

export function normalizeFamilyGlyph(ch: string): FamilyChar | null {
  switch (ch) {
    case "∆": case "Δ": return "∆";
    case "✓": case "✔": return "✓";
    default: return FAMILY_BY_CHAR.has(ch as FamilyChar) ? (ch as FamilyChar) : null;
  }
}

/** Words that carry family semantics in NL (family → trigger words). Deterministic order. */
export const FAMILY_NL: Array<{ family: FamilyChar; words: string[] }> = SYMBOL_FAMILIES.map((f) => ({
  family: f.char, words: [...f.nl],
}));

/** Modifier words recognized anywhere (annotated, never block a parse). */
export const MODIFIER_WORDS: Record<string, string> = {
  now: "!", immediately: "!", "just do it": "!",
  urgent: "^", asap: "^", important: "^", first: "^",
};

/** Politeness/filler words — annotated as noise, never matched as verbs or entities. */
export const STOPWORDS = ["please", "the", "a", "an", "my"];
