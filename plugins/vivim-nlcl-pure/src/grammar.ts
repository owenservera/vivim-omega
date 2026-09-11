// nlcl-pure/src/grammar.ts — deterministic frame grammar: verb → frame → slot filling → IR.
// Mixed symbolic/natural input is FIRST-CLASS: "/send @this → @peter" and "send this to
// Peter" hit the SAME frame through the SAME slot machinery. Every candidate carries its
// trace notes — the console renders how the machine understood.

import type { IR, IRSlot, OpFrame, FrameSlot, Token, WorldModel, GapNote } from "./types.ts";
import { framesForWorld, verbHits } from "./frames.ts";
import { ground, groundPhrase, resolveContext, entitySymbol, entityPayloadValue } from "./ground.ts";
import { fold, unquote } from "./text.ts";
import { STOPWORDS, MODIFIER_WORDS } from "./symbols.ts";
import type { EntityView } from "./types.ts";

export interface Candidate {
  ir: IR;
  frame: OpFrame;
  verbToken: number;
  verbCls: "exact" | "taught" | "fuzzy";
  usedTokens: Set<number>;
  slotsFilled: number;
  slotsRequired: number;
  requiredMissing: string[];
  entityAmbiguous: boolean;
  contextUnresolved: boolean;
  notes: string[];
  gaps: GapNote[];
  unknownWords: string[];
}

const isSemantic = (t: Token): boolean =>
  (t.kind === "word" || t.kind === "quote" || t.kind === "ref" || t.kind === "cmd" || t.kind === "tag" || t.kind === "var" || t.kind === "number" || t.kind === "arrow") &&
  !STOPWORDS.includes(t.norm) &&
  !(t.kind === "word" && MODIFIER_WORDS[t.norm] !== undefined);

const CONTEXT_REF_WORDS = ["this", "that", "it", "them", "they"];

function isPrepToken(t: Token, fs: FrameSlot): boolean {
  if (t.kind === "arrow") return fs.family === "→"; // → routes ONLY direction slots
  return t.kind === "word" && (fs.preps ?? []).includes(t.norm);
}

/** Boundary for patient material: arrows and any slot's prep words. */
function isBoundary(t: Token, frame: OpFrame): boolean {
  if (t.kind === "arrow") return frame.slots.some((s) => s.family === "→");
  return t.kind === "word" && allPreps(frame).includes(t.norm);
}

/** Tokens between two indices that are semantic material, in order. */
function bodyTokens(tokens: Token[], from: number, to: number): Token[] {
  const out: Token[] = [];
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (t.kind === "punct" || t.kind === "symbol") continue;
    if (!isSemantic(t)) continue;
    out.push(t);
  }
  return out;
}

/** Collect a mention phrase: tokens until a prep/arrow/punct boundary. Returns text + consumed indices. */
function mentionAfter(tokens: Token[], start: number): { text: string; quote?: string; consumed: number[] } {
  const consumed: number[] = [];
  let parts: string[] = [];
  let quote: string | undefined;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "punct" || t.kind === "symbol") break;
    if (t.kind === "arrow") break;
    if (t.kind === "word" && isPrepToken(t, ["to", "from", "about", "re", "subject", "regarding", "saying", "in", "into", "on", "with", "and", "then"])) break;
    if (t.kind === "word" && MODIFIER_WORDS[t.norm] !== undefined) break;
    if (t.kind === "word" && STOPWORDS.includes(t.norm)) { consumed.push(t.i); continue; }
    if (t.kind === "quote") { if (quote === undefined && parts.length === 0) { quote = t.quote; parts.push(t.quote); } else break; consumed.push(t.i); continue; }
    if (t.kind === "ref") { parts.push(t.norm); consumed.push(t.i); continue; }
    if (t.kind === "word" || t.kind === "cmd" || t.kind === "tag" || t.kind === "var" || t.kind === "number") { parts.push(t.norm); consumed.push(t.i); continue; }
    break;
  }
  return { text: parts.join(" "), quote, consumed };
}

function opShortName(op: string): string {
  const local = op.split("@")[0] ?? op;
  return local.split(/[.:]/).filter(Boolean).pop() ?? local;
}

interface SlotFill {
  slot: IRSlot;
  consumed: number[];
  ambiguityFlagged: boolean;
}

function makeEntitySlot(token0: Token, mention: string, quote: string | undefined, frameSlot: { role: string; entityTypes?: string[] }, world: WorldModel, notes: string[], gaps: GapNote[], contextOverride?: string): SlotFill {
  // 1. context word (word OR @ref — "this" and "@this" are the same thing) → referent
  const isContext = (token0.kind === "word" || token0.kind === "ref") && CONTEXT_REF_WORDS.includes(token0.norm);
  if (isContext) {
    if (contextOverride) {
      return { slot: { value: null, display: `the ${contextOverride.includes("trigger") ? "triggering" : "latest"} message`, canonical: `@${contextOverride === "trigger.message" ? "trigger" : "this"}`, contextRef: contextOverride, confidence: 0.9 }, consumed: [token0.i], ambiguityFlagged: false };
    }
    const referent = resolveContext(token0.norm, world, frameSlot.entityTypes);
    if (referent) {
      const value = entityPayloadValue(referent, frameSlot.role);
      return { slot: { value, display: referent.label, canonical: entitySymbol(referent), entityId: referent.id, confidence: 0.9 }, consumed: [token0.i], ambiguityFlagged: false };
    }
    gaps.push({ kind: "empty-context", text: `"${token0.text}" has nothing to point at yet`, hint: "receive a message first (e.g. simulate a message from Peter)" });
    return { slot: { value: null, display: `nothing yet`, canonical: `@this`, contextRef: "world.latestMessage", confidence: 0.2 }, consumed: [token0.i], ambiguityFlagged: false };
  }
  // 2. explicit @ref token → direct entity by id-suffix/name grounding
  if (token0.kind === "ref") {
    const direct = world.entities.find((e) => e.id === `contact:${token0.norm}` || e.id === `message:${token0.norm}` || e.id.endsWith(`:${token0.norm}`));
    if (direct) {
      return { slot: { value: entityPayloadValue(direct, frameSlot.role), display: direct.label, canonical: entitySymbol(direct), entityId: direct.id, confidence: 0.98, matches: undefined }, consumed: [], ambiguityFlagged: false };
    }
    const g = ground(token0.norm, world.entities, frameSlot.entityTypes);
    if (g.primary) {
      return entityFromMatch(g, frameSlot, world, notes, gaps);
    }
    notes.push(`@${token0.norm}: no entity by that name`);
    gaps.push({ kind: "unresolved-slot", text: `@${token0.norm} did not resolve to a known entity`, hint: "check the world panel for known entities" });
    return { slot: { value: token0.norm, display: `@${token0.norm}`, canonical: `@${token0.norm}`, confidence: 0.3 }, consumed: [], ambiguityFlagged: false };
  }
  // 3. plain mention → grounding
  const phrase = quote ?? mention;
  if (phrase.length === 0) return { slot: { value: null, display: "—", canonical: "", confidence: 0 }, consumed: [], ambiguityFlagged: false };
  const g = groundPhrase(phrase, world.entities, frameSlot.entityTypes);
  if (g.primary) return entityFromMatch(g, frameSlot, world, notes, gaps);
  gaps.push({ kind: "unresolved-slot", text: `"${phrase}" did not match any ${frameSlot.entityTypes?.join("/") ?? "entity"}`, hint: "try an @name from the world panel" });
  return { slot: { value: phrase, display: phrase, canonical: `@${fold(phrase).replace(/\s+/g, "-")}`, confidence: 0.25 }, consumed: [], ambiguityFlagged: false };
}

function entityFromMatch(g: { matches: { entity: EntityView; score: number; reason: string }[]; primary: { entity: EntityView; score: number; reason: string } | null; ambiguous: boolean }, frameSlot: { role: string }, _world: WorldModel, notes: string[], _gaps: GapNote[]): SlotFill {
  const p = g.primary!;
  const matches = g.matches.length > 1 ? g.matches.slice(0, 5) : undefined;
  if (g.ambiguous) notes.push(`ambiguous entity: ${g.matches.slice(0, 3).map((m) => m.entity.label).join(" / ")}`);
  return {
    slot: {
      value: entityPayloadValue(p.entity, frameSlot.role),
      display: p.entity.label,
      canonical: entitySymbol(p.entity),
      entityId: p.entity.id,
      confidence: g.ambiguous ? 0.55 : p.score,
      matches,
      note: g.ambiguous ? `${g.matches.length} entities match — pick one` : undefined,
    },
    consumed: [],
    ambiguityFlagged: g.ambiguous,
  };
}

/** Fill ONE frame from a verb position. Deterministic: slots in frame order, preps first. */
export function fillFrame(frame: OpFrame, tokens: Token[], verbTok: number, world: WorldModel, contextOverride?: string): Candidate {
  const notes: string[] = [`verb "${tokens[verbTok].text}" → frame ${frame.op}`];
  const gaps: GapNote[] = [];
  const usedTokens = new Set<number>([verbTok]);
  const slots: Record<string, IRSlot> = {};
  const consumedAll = new Set<number>();
  let slotsFilled = 0;
  let slotsRequired = 0;
  let requiredMissing: string[] = [];
  let entityAmbiguous = false;
  let contextUnresolved = false;

  const body = bodyTokens(tokens, verbTok + 1, tokens.length);

  // pass 1: prep-routed slots (each claims its prep token + mention tokens)
  for (const fs of frame.slots) {
    if (!fs.preps || fs.preps.length === 0) continue;
    let prepIdx = -1;
    for (const t of body) {
      if (consumedAll.has(t.i)) continue;
      if (isPrepToken(t, fs)) { prepIdx = t.i; break; }
    }
    if (prepIdx < 0) continue;
    const prepTok = tokens[prepIdx];
    usedTokens.add(prepTok.i);
    // mention starts at the first unconsumed semantic token after the prep
    let start = -1;
    for (const t of body) {
      if (t.i > prepIdx && !consumedAll.has(t.i)) { start = t.i; break; }
    }
    if (start < 0) { gaps.push({ kind: "unresolved-slot", text: `slot "${fs.role}" needs a value after "${prepTok.text}"` }); continue; }
    const mention = mentionAfter(tokens, start);
    if (mention.text.length === 0 && mention.quote === undefined) {
      gaps.push({ kind: "unresolved-slot", text: `slot "${fs.role}" needs a value after "${prepTok.text}"` });
      continue;
    }
    for (const c of mention.consumed) { usedTokens.add(c); consumedAll.add(c); }
    const fill = fillSlotValue(fs, tokens[start], mention, world, notes, gaps, contextOverride);
    for (const c of fill.consumed) { usedTokens.add(c); consumedAll.add(c); }
    slots[fs.role] = { ...fill.slot, tokens: [prepTok.i, ...mention.consumed] };
    entityAmbiguous = entityAmbiguous || fill.ambiguityFlagged;
    contextUnresolved = contextUnresolved || (fill.slot.contextRef === "world.latestMessage" && fill.slot.value == null);
    if (fs.required) slotsRequired++;
    slotsFilled++;
  }

  // pass 2: everything not yet filled — enum words, rest text, patient chunks, bare prep slots
  for (const fs of frame.slots) {
    if (slots[fs.role]) continue; // already filled by prep
    if (fs.kind === "enum") {
      const hit = body.find((t) => !consumedAll.has(t.i) && t.kind === "word" && fs.enumValues?.includes(t.norm));
      if (hit) {
        usedTokens.add(hit.i); consumedAll.add(hit.i);
        slots[fs.role] = { value: hit.norm, display: hit.text, canonical: hit.norm, confidence: 0.95 };
        if (fs.required) slotsRequired++;
        slotsFilled++;
      } else if (fs.required) { slotsRequired++; requiredMissing.push(fs.role); }
      continue;
    }
    if (fs.kind === "rest") {
      const rest = body.filter((t) => !consumedAll.has(t.i));
      if (rest.length > 0) {
        for (const t of rest) { usedTokens.add(t.i); consumedAll.add(t.i); }
        const text = rest.map((t) => (t.kind === "quote" ? t.quote ?? t.norm : t.text)).join(" ");
        slots[fs.role] = { value: text, display: text, canonical: text.length > 32 ? `'${text.slice(0, 32)}…'` : `'${text}'`, confidence: 0.9 };
        if (fs.required) slotsRequired++;
        slotsFilled++;
      } else if (fs.required) { slotsRequired++; requiredMissing.push(fs.role); }
      continue;
    }
    if (fs.preps && fs.preps.length > 0 && !fs.patient) {
      // a routed slot whose prep never appeared: optional stays empty, required is missing
      if (fs.required) { slotsRequired++; requiredMissing.push(fs.role); }
      continue;
    }
    // patient (entity/content/text): first unconsumed semantic chunk
    const startTok = body.find((t) => !consumedAll.has(t.i) && !isBoundary(t, frame));
    if (!startTok) {
      if (fs.required) { slotsRequired++; requiredMissing.push(fs.role); }
      continue;
    }
    if (fs.kind === "entity" || fs.kind === "content") {
      const isCtxOrRef = startTok.kind === "ref" || (startTok.kind === "word" && ["this", "that", "it", "them", "they", "latest", "last"].includes(startTok.norm));
      if (isCtxOrRef) {
        const fill = fillSlotValue(fs, startTok, { text: startTok.norm, consumed: [startTok.i] }, world, notes, gaps, contextOverride);
        usedTokens.add(startTok.i); consumedAll.add(startTok.i);
        for (const c of fill.consumed) { usedTokens.add(c); consumedAll.add(c); }
        slots[fs.role] = { ...fill.slot, tokens: [...new Set([startTok.i, ...fill.consumed])] };
        entityAmbiguous = entityAmbiguous || fill.ambiguityFlagged;
        contextUnresolved = contextUnresolved || (fill.slot.contextRef === "world.latestMessage" && fill.slot.value == null);
        if (fs.required) slotsRequired++;
        slotsFilled++;
        continue;
      }
    }
    const mention = mentionAfter(tokens, startTok.i);
    // content/text: take the first quote or a bounded run — the rest may be prep-routed
    const fill = fillSlotValue(fs, startTok, mention, world, notes, gaps, contextOverride);
    for (const c of fill.consumed) { usedTokens.add(c); consumedAll.add(c); }
    slots[fs.role] = { ...fill.slot, tokens: [...new Set(fill.consumed)] };
    entityAmbiguous = entityAmbiguous || fill.ambiguityFlagged;
    contextUnresolved = contextUnresolved || (fill.slot.contextRef === "world.latestMessage" && fill.slot.value == null);
    if (fs.required) slotsRequired++;
    slotsFilled++;
  }

  const payload = buildPayload(frame, slots, world);
  const ir: IR = {
    intent: frame.op,
    family: frame.family,
    slots,
    payload,
    modifiers: {},
    canonical: buildCanonical(frame, slots),
    reading: buildReading(frame, slots),
    confidence: 0, // scored by interpret.ts
    provenance: { verbs: [tokens[verbTok].norm] },
  };
  const unknownWords = bodyTokens(tokens, verbTok + 1, tokens.length)
    .filter((t) => !usedTokens.has(t.i) && t.kind === "word" && !isBoundary(t, frame))
    .map((t) => t.norm);

  return { ir, frame, verbToken: verbTok, verbCls: "exact", usedTokens, slotsFilled, slotsRequired, requiredMissing, entityAmbiguous, contextUnresolved, notes, gaps, unknownWords };
}

function fillSlotValue(fs: { role: string; kind: string; entityTypes?: string[]; enumValues?: string[] }, token0: Token, mention: { text: string; quote?: string; consumed: number[] }, world: WorldModel, notes: string[], gaps: GapNote[], contextOverride?: string): SlotFill {
  if (fs.kind === "entity") return makeEntitySlot(token0, mention.text, mention.quote, fs, world, notes, gaps, contextOverride);
  if (fs.kind === "enum") {
    const v = fold(mention.quote ?? mention.text);
    if (fs.enumValues?.includes(v)) {
      return { slot: { value: v, display: v, canonical: v, confidence: 0.9 }, consumed: [...mention.consumed], ambiguityFlagged: false };
    }
    gaps.push({ kind: "unresolved-slot", text: `"${v}" is not a valid ${fs.role}`, hint: `one of: ${(fs.enumValues ?? []).join(", ")}` });
    return { slot: { value: null, display: v, canonical: v, confidence: 0.3 }, consumed: [...mention.consumed], ambiguityFlagged: false };
  }
  if (fs.kind === "content") {
    if (mention.quote !== undefined) {
      return { slot: { value: mention.quote, display: `'${mention.quote}'`, canonical: `'${mention.quote.slice(0, 32)}'`, confidence: 0.95 }, consumed: [...mention.consumed], ambiguityFlagged: false };
    }
    const isCtx = (token0.kind === "word" || token0.kind === "ref") && ["this", "that", "it", "them", "they", "latest", "last"].includes(token0.norm);
    if (isCtx) {
      if (contextOverride) {
        return { slot: { value: null, display: `the ${contextOverride.includes("trigger") ? "triggering" : "latest"} message`, canonical: `@${contextOverride === "trigger.message" ? "trigger" : "this"}`, contextRef: contextOverride, confidence: 0.9 }, consumed: [...mention.consumed], ambiguityFlagged: false };
      }
      const referent = resolveContext(token0.norm, world, undefined);
      if (referent) {
        const bodyText = typeof (referent.data ?? {})["body"] === "string" ? (referent.data!)["body"] as string : "";
        const subj = typeof (referent.data ?? {})["subject"] === "string" ? (referent.data!)["subject"] as string : "";
        return { slot: { value: bodyText, display: referent.label, canonical: entitySymbol(referent), entityId: referent.id, contextRef: "world.latestMessage", confidence: 0.85, note: subj ? `subject: ${subj}` : undefined }, consumed: [...mention.consumed], ambiguityFlagged: false };
      }
      gaps.push({ kind: "empty-context", text: `"${token0.text}" has nothing to point at yet`, hint: "receive a message first" });
      return { slot: { value: null, display: "nothing yet", canonical: "@this", contextRef: "world.latestMessage", confidence: 0.2 }, consumed: [...mention.consumed], ambiguityFlagged: false };
    }
    // an explicit @ref to a MESSAGE entity in a content slot: forward semantics — the body
    // carries over, the subject gets "Fwd: " (the symbolic form of "send this")
    if (token0.kind === "ref") {
      const referent = world.entities.find((e) => e.id.endsWith(`:${token0.norm}`) && typeof (e.data ?? {})["body"] === "string");
      if (referent) {
        const bodyText = (referent.data!)["body"] as string;
        const subj = typeof (referent.data ?? {})["subject"] === "string" ? (referent.data!)["subject"] as string : "";
        return { slot: { value: bodyText, display: referent.label, canonical: entitySymbol(referent), entityId: referent.id, confidence: 0.9, note: subj ? `subject: Fwd: ${subj}` : undefined }, consumed: [...mention.consumed], ambiguityFlagged: false };
      }
    }
    const text = mention.text || token0.text;
    return { slot: { value: text, display: `'${text.slice(0, 40)}'`, canonical: `'${text.slice(0, 24)}'`, confidence: 0.8 }, consumed: [...mention.consumed], ambiguityFlagged: false };
  }
  if (fs.kind === "text") {
    const text = mention.quote ?? mention.text;
    return { slot: { value: text, display: text, canonical: text.length > 32 ? `'${text.slice(0, 32)}…'` : `'${text}'`, confidence: 0.85 }, consumed: [...mention.consumed], ambiguityFlagged: false };
  }
  const text = mention.text;
  return { slot: { value: text, display: text, canonical: text, confidence: 0.7 }, consumed: [...mention.consumed], ambiguityFlagged: false };
}

function allPreps(frame: OpFrame): string[] {
  const out: string[] = [];
  for (const s of frame.slots) out.push(...(s.preps ?? []));
  return out;
}

/** Map slots → the executable op payload, including deterministic content synthesis. */
export function buildPayload(frame: OpFrame, slots: Record<string, IRSlot>, world: WorldModel): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const fs of frame.slots) {
    const s = slots[fs.role];
    if (!s || fs.payloadKey === undefined) continue;
    payload[fs.payloadKey] = s.value ?? null;
  }
  if (frame.op === "message.send@1") {
    const body = payload["body"];
    // entity-resolved message (context word OR explicit @msg ref): forward semantics —
    // carry the original body, synthesize subject "Fwd: …"
    const msgSlot = slots["message"];
    if (msgSlot?.entityId) {
      const src = world.entities.find((e) => e.id === msgSlot.entityId);
      const srcBody = typeof (src?.data ?? {})["body"] === "string" ? (src!.data!)["body"] as string : (body as string | null);
      const srcSubject = typeof (src?.data ?? {})["subject"] === "string" ? (src!.data!)["subject"] as string : "message";
      payload["body"] = srcBody;
      if (!payload["subject"]) payload["subject"] = `Fwd: ${srcSubject}`;
    } else if (typeof body === "string" && body.length > 0 && !payload["subject"]) {
      payload["subject"] = body.length > 48 ? `${body.slice(0, 45)}…` : body;
    }
  }
  return payload;
}

export function buildCanonical(frame: OpFrame, slots: Record<string, IRSlot>): string {
  const name = opShortName(frame.op);
  const parts: string[] = [];
  for (const fs of frame.slots) {
    const s = slots[fs.role];
    if (!s) continue;
    const sym = s.canonical || "—";
    if (fs.family === "→") parts.push(`→ ${sym}`);
    else parts.push(sym);
  }
  if (parts.length === 0) return `/${name}`; // slotless frames / surface intents
  return `/${name} ${parts.join(" ")}`;
}

export function buildReading(frame: OpFrame, slots: Record<string, IRSlot>): string {
  let reading = frame.reading;
  for (const fs of frame.slots) {
    const s = slots[fs.role];
    reading = reading.replace(`{${fs.role}}`, s ? s.display : `(${fs.role})`);
  }
  reading = reading.replace(/\{[a-z]+\}/g, "");
  return reading.replace(/\s{2,}/g, " ").trim();
}

/** Find verb positions and produce one Candidate per (verb, frame) pair, ranked deterministically. */
export function matchFrames(tokens: Token[], world: WorldModel, contextOverride?: string): Candidate[] {
  const frames = framesForWorld(world);
  const candidates: Candidate[] = [];
  const verbOrder = ["exact", "taught", "fuzzy"];
  const hits: Array<{ tok: Token; hits: ReturnType<typeof verbHits> }> = [];
  for (const t of tokens) {
    if (t.kind === "cmd") {
      // "/send" — the command family: direct verb
      const direct = frames.filter((f) => f.verbs.includes(t.norm) || f.op.endsWith(`.${t.norm}@1`) || f.op === t.norm);
      for (const frame of direct) {
        const c = fillFrame(frame, tokens, t.i, world, contextOverride);
        c.verbCls = "exact";
        candidates.push(c);
      }
      continue;
    }
    if (t.kind !== "word" || STOPWORDS.includes(t.norm) || MODIFIER_WORDS[t.norm] !== undefined) continue;
    const vh = verbHits(t.norm, frames, world);
    if (vh.length > 0) hits.push({ tok: t, hits: vh });
  }
  hits.sort((a, b) => {
    const ra = Math.min(...a.hits.map((h) => verbOrder.indexOf(h.cls)));
    const rb = Math.min(...b.hits.map((h) => verbOrder.indexOf(h.cls)));
    if (ra !== rb) return ra - rb;
    return a.tok.i - b.tok.i;
  });
  for (const h of hits) {
    h.hits.sort((a, b) => verbOrder.indexOf(a.cls) - verbOrder.indexOf(b.cls) || a.frame.op.localeCompare(b.frame.op));
    for (const hit of h.hits) {
      const c = fillFrame(hit.frame, tokens, h.tok.i, world, contextOverride);
      c.verbCls = hit.cls;
      if (hit.cls === "fuzzy") c.notes.push(`verb fuzzy: "${h.tok.text}" ≈ "${hit.verb}"`);
      if (hit.cls === "taught") c.notes.push(`verb taught: "${hit.verb}" (user lexicon)`);
      candidates.push(c);
    }
  }
  return candidates.slice(0, 8);
}

export function unquoteText(s: string): string {
  return unquote(s);
}
