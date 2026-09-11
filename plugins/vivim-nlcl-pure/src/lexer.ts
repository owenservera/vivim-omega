// nlcl-pure/src/lexer.ts — the deterministic scanner. Hand-rolled on purpose: no regex
// backtracking pathologies, full control over spans, keystroke-cheap. Zero allocations
// beyond the token array.

import type { Token } from "./types.ts";
import { fold } from "./text.ts";
import { FAMILY_GLYPHS, normalizeFamilyGlyph } from "./symbols.ts";

const GLYPH_SET = new Set(FAMILY_GLYPHS);
const ATTACH_GLYPHS = new Set(["@", "/", "#", "$"]); // @peter /send #tag $var — prefix+word = one token
const PUNCT = new Set([",", ";", ":", "(", ")", "[", "]", "{", "}", "…", "|"]);
const QUOTE_OPENS = new Set(["'", '"', "“", "‘", "«"]);
const QUOTE_CLOSES: Record<string, string> = { "'": "'", '"': '"', "“": "”", "‘": "’", "«": "»" };
const WORD_CHARS = /[A-Za-z0-9À-ÿāăąćčďēĕėęěğġĥĩīĭįłńōŏőŕŗśŝşţũūŭůűźżž古希腊日本한국А-Яа-я0-9_.\-']/;

/** Word chars except trailing separators (strip trailing . _ - ' into punct tokens). */
function scanWord(text: string, i: number): { end: number } {
  let j = i;
  while (j < text.length && WORD_CHARS.test(text[j])) j++;
  return { end: j };
}

function isWordStart(text: string, i: number): boolean {
  return WORD_CHARS.test(text[i]) && !/[0-9]/.test(text[i]);
}

function scanNumber(text: string, i: number): { end: number } {
  let j = i;
  while (j < text.length && /[0-9]/.test(text[j])) j++;
  return { end: j };
}

function isQuoteOpenerHere(text: string, i: number): boolean {
  const c = text[i];
  if (!QUOTE_OPENS.has(c)) return false;
  if (c === "'" || c === '"') {
    // straight quotes only count when delimiting: opener at boundary, closer at boundary
    const prev = i === 0 ? " " : text[i - 1];
    if (/\w/.test(prev)) return false; // apostrophe inside a word (don't)
    const close = QUOTE_CLOSES[c];
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === close) {
        const next = j + 1 >= text.length ? " " : text[j + 1];
        if (/\w/.test(next)) return false;
        return true;
      }
      if (text[j] === " " && j === i + 1) continue; // allow leading space inside quotes
    }
    return false;
  }
  return true; // smart pairs are unambiguous openers
}

export function lex(input: string): { tokens: Token[]; syntaxNotes: string[] } {
  const tokens: Token[] = [];
  const syntaxNotes: string[] = [];
  const text = input;
  let i = 0;
  let idx = 0;

  const push = (t: Omit<Token, "i">): number => {
    tokens.push({ ...t, i: idx++ });
    return idx - 1;
  };

  while (i < text.length) {
    const c = text[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }

    // arrows first (multi-char): -> => → >
    if (text.startsWith("->", i) || text.startsWith("=>", i)) {
      push({ text: text.slice(i, i + 2), norm: "→", kind: "arrow", family: "→", start: i, end: i + 2 });
      i += 2; continue;
    }
    if (c === "→" || c === ">") {
      push({ text: c, norm: "→", kind: "arrow", family: "→", start: i, end: i + 1 });
      i += 1; continue;
    }

    // quotes
    if (isQuoteOpenerHere(text, i)) {
      const close = QUOTE_CLOSES[c];
      let j = i + 1;
      while (j < text.length && text[j] !== close) j++;
      const inner = text.slice(i + 1, j);
      push({ text: text.slice(i, Math.min(j + 1, text.length)), norm: fold(inner), kind: "quote", quote: inner, start: i, end: Math.min(j + 1, text.length) });
      i = j + 1; continue;
    }

    // family symbols
    if (GLYPH_SET.has(c)) {
      const family = normalizeFamilyGlyph(c);
      if (family && ATTACH_GLYPHS.has(c) && i + 1 < text.length && isWordStart(text, i + 1)) {
        const { end } = scanWord(text, i + 1);
        const raw = text.slice(i, end);
        const word = text.slice(i + 1, end);
        const kind = c === "@" ? "ref" : c === "/" ? "cmd" : c === "#" ? "tag" : "var";
        push({ text: raw, norm: fold(word), kind, family, start: i, end });
        i = end; continue;
      }
      if (family) {
        push({ text: c, norm: c, kind: "symbol", family, start: i, end: i + 1 });
        i += 1; continue;
      }
    }

    // numbers
    if (/[0-9]/.test(c)) {
      const { end } = scanNumber(text, i);
      push({ text: text.slice(i, end), norm: text.slice(i, end), kind: "number", start: i, end });
      i = end; continue;
    }

    // words (trailing separators . _ ' - are backed off and emitted as punct)
    if (WORD_CHARS.test(c)) {
      const { end } = scanWord(text, i); // full run, including trailing separators
      let e = end;
      while (e > i + 1 && /[._'\-]/.test(text[e - 1])) e--;
      const raw = text.slice(i, e);
      push({ text: raw, norm: fold(raw), kind: "word", start: i, end: e });
      for (let k = e; k < end; k++) {
        push({ text: text[k], norm: text[k], kind: "punct", start: k, end: k + 1 });
      }
      i = end;
      continue;
    }

    if (PUNCT.has(c)) {
      push({ text: c, norm: c, kind: "punct", start: i, end: i + 1 });
      i += 1; continue;
    }

    // unknown glyph — keep it as punct (never crash, never loop)
    push({ text: c, norm: c, kind: "punct", start: i, end: i + 1 });
    i += 1;
  }

  if (input.includes("'") || input.includes('"')) {
    // note possible unterminated quotes only when they were NOT consumed as quotes
    const rawQuoteCount = (input.match(/['"]/g) ?? []).length;
    const lexedQuoteCount = tokens.filter((t) => t.kind === "quote").length * 2;
    if (lexedQuoteCount < rawQuoteCount && tokens.length > 0) syntaxNotes.push("stray quote marks treated as word characters");
  }
  return { tokens, syntaxNotes };
}
