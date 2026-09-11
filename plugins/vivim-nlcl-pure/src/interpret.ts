// nlcl-pure/src/interpret.ts — THE pipeline (N1: pure, deterministic, traced).
// scan → lex → symbol-parse(modifiers) → recognizers → frame-match → ground → resolve →
// project. The result is the full Interpretation the console renders per keystroke.

import type { Interpretation, IR, Token, WorldModel, StageTrace, Suggestion, GapNote, TokenNote } from "./types.ts";
import { NCLL_VERSION, framesForWorld, closestVerbs } from "./frames.ts";
import { lex } from "./lexer.ts";
import { matchFrames, type Candidate } from "./grammar.ts";
import { recognizeHelp, recognizeEntityQuery, recognizeTeach, recognizeRule, recognizeReceive, recognizeInbox, emptyInterp } from "./recognize.ts";
import { MODIFIER_WORDS, STOPWORDS } from "./symbols.ts";
import { fold } from "./text.ts";
import { projectTokens, projectEffects } from "./project.ts";

export function interpret(input: string, world: WorldModel): Interpretation {
  const stages: StageTrace[] = [];
  const raw = input ?? "";
  if (raw.trim().length === 0) {
    const e = emptyInterp(raw, world);
    e.stages.push({ stage: "scan", notes: ["empty input"] });
    e.suggestions = defaultSuggestions(world);
    return e;
  }
  stages.push({ stage: "scan", notes: [`${raw.length} chars`] });

  // ---- lex ----
  const { tokens, syntaxNotes } = lex(raw);
  stages.push({ stage: "lex", notes: [`${tokens.length} tokens${syntaxNotes.length ? `; ${syntaxNotes.join("; ")}` : ""}`] });

  // ---- symbol-parse: modifiers ----
  const modifiers: IR["modifiers"] = {};
  const modifierTokenIdx = new Set<number>();
  for (const t of tokens) {
    if (t.kind === "symbol") {
      if (t.norm === "!") { modifiers.force = true; modifierTokenIdx.add(t.i); }
      else if (t.norm === "^") { modifiers.priority = true; modifierTokenIdx.add(t.i); }
      else if (t.norm === "~") { modifiers.fuzzy = true; modifierTokenIdx.add(t.i); }
    }
    if (t.kind === "word" && MODIFIER_WORDS[t.norm] !== undefined) {
      const fam = MODIFIER_WORDS[t.norm];
      if (fam === "!") modifiers.force = true;
      if (fam === "^") modifiers.priority = true;
      modifierTokenIdx.add(t.i);
    }
  }
  if (tokens.length > 0 && tokens[0].kind === "symbol" && tokens[0].norm === "?") modifiers.query = true;
  stages.push({ stage: "symbol-parse", notes: [
    Object.entries(modifiers).filter(([, v]) => v).map(([k]) => `${k} modifier`).join(", ") || "no modifiers",
  ] });

  const folded = fold(raw);

  // ---- recognizers (priority order) ----
  const recSteps: Array<[string, ReturnType<typeof recognizeHelp>]> = [
    ["recognize:help", recognizeHelp(folded, tokens, world)],
    ["recognize:inbox", recognizeInbox(folded)],
    ["recognize:teach", recognizeTeach(folded, world)],
    ["recognize:rule", recognizeRule(folded, tokens, world)],
    ["recognize:receive", recognizeReceive(folded, world)],
  ];
  for (const [name, rec] of recSteps) {
    if (rec) {
      rec.ir.modifiers = modifiers;
      const interp = assemble(raw, world, tokens, rec.ir, rec.notes, rec.gaps, stages, null, rec.followUp, modifierTokenIdx);
      stages.push({ stage: `resolve:${name}`, notes: ["matched"] });
      return interp;
    }
  }
  // entity query only when NOT also a frame verb phrase ("who is peter" — no verb)
  if (/^(?:who|what)\s+is\s+/.test(folded) || /^tell me about\s+/.test(folded)) {
    const eq = recognizeEntityQuery(raw, world);
    if (eq) {
      eq.ir.modifiers = modifiers;
      stages.push({ stage: "resolve:entity-query", notes: ["matched"] });
      return assemble(raw, world, tokens, eq.ir, eq.notes, eq.gaps, stages, null, undefined, modifierTokenIdx);
    }
  }

  // ---- frame matching ----
  const candidates = matchFrames(tokens, world);
  stages.push({ stage: "frame-match", notes: [
    candidates.length === 0 ? "no verb matched any frame" : `${candidates.length} candidate frame${candidates.length > 1 ? "s" : ""}: ${candidates.map((c) => `${c.ir.intent}(${c.ir.provenance.verbs[0]})`).slice(0, 4).join(", ")}`,
  ] });

  if (candidates.length === 0) {
    // unknown: no verb. Offer closest verbs + teach + examples.
    const wordTokens = tokens.filter((t) => t.kind === "word" && !STOPWORDS.includes(t.norm));
    const first = wordTokens[0]?.norm ?? "";
    const unknownWord = first.length > 0 ? first : null;
    const suggestions: Suggestion[] = [];
    if (unknownWord) {
      for (const v of closestVerbs(unknownWord, framesForWorld(world), world)) {
        suggestions.push({ kind: "correction", text: raw.replace(new RegExp(escapeRe(wordTokens[0].text), "i"), v), display: `${v} …`, detail: `did you mean "${v}"?` });
      }
      suggestions.push({ kind: "teach", text: `teach ${unknownWord} means <verb>`, display: `teach "${unknownWord}"`, detail: "make this word mean a command" });
    }
    suggestions.push(...defaultSuggestions(world));
    const gaps: GapNote[] = unknownWord
      ? [{ kind: "unknown-word", text: `"${unknownWord}" is not a command`, hint: "pick a suggestion, or teach it a meaning" }]
      : [{ kind: "unknown-word", text: "no command verb found", hint: "try: send this to Peter" }];
    const e = emptyInterp(raw, world);
    e.stages = stages;
    e.status = "unknown";
    e.tokens = projectTokens(tokens, null, new Set(modifierTokenIdx), []);
    e.suggestions = suggestions;
    e.gaps = gaps;
    e.effects = [];
    return e;
  }

  // ---- ground + resolve: score candidates deterministically ----
  for (const c of candidates) scoreCandidate(c);
  candidates.sort((a, b) => b.ir.confidence - a.ir.confidence || a.ir.intent.localeCompare(b.ir.intent));
  const primary = candidates[0];
  const ties = candidates.filter((c) => c !== primary && Math.abs(c.ir.confidence - primary.ir.confidence) < 0.05 && c.ir.intent !== primary.ir.intent);
  stages.push({ stage: "resolve", notes: [
    `primary ${primary.ir.intent} conf=${primary.ir.confidence.toFixed(2)}`,
    ...(ties.length > 0 ? [`${ties.length} alternative${ties.length > 1 ? "s" : ""}: ${ties.map((t) => t.ir.intent).join(", ")}`] : []),
  ] });

  const ambiguous = primary.entityAmbiguous || ties.length > 0;
  // modifiers belong to the primary IR (and its alternatives)
  primary.ir.modifiers = modifiers;
  for (const alt of ties) alt.ir.modifiers = modifiers;
  const interp = assemble(raw, world, tokens, primary.ir, primary.notes, primary.gaps, stages, ties.length > 0 ? ties : [], undefined, modifierTokenIdx, primary);

  // status
  let status: Interpretation["status"];
  if (ambiguous) status = "ambiguous";
  else if (primary.ir.confidence >= 0.7 && primary.requiredMissing.length === 0 && !primary.contextUnresolved) status = "ok";
  else if (primary.ir.confidence >= 0.4) status = "partial";
  else status = "partial";
  if (primary.requiredMissing.length > 0 || primary.contextUnresolved) {
    // explicitly surface what's missing
    for (const miss of primary.requiredMissing) {
      interp.gaps.push({ kind: "unresolved-slot", text: `slot "${miss}" is still empty`, hint: slotHint(primary.frame.slots.find((s) => s.role === miss)) });
    }
    if (status === "ok") status = "partial";
  }
  interp.status = status;
  return interp;
}

function slotHint(fs?: { kind: string; entityTypes?: string[]; enumValues?: string[]; preps?: string[] }): string | undefined {
  if (!fs) return undefined;
  if (fs.kind === "entity") return `try @name (${(fs.entityTypes ?? ["entity"]).join("/")})`;
  if (fs.kind === "enum") return `one of: ${(fs.enumValues ?? []).join(", ")}`;
  if (fs.preps?.length) return `after "${fs.preps[0]}"`;
  return "add the missing value";
}

function scoreCandidate(c: Candidate): void {
  // verb class: exact = 0.45, taught = 0.40, fuzzy = 0.30 (deterministic; a complete
  // exact parse reaches 0.45 + 0.28 = 0.73 ≥ ok threshold 0.7)
  let s = c.verbCls === "fuzzy" ? 0.3 : c.verbCls === "taught" ? 0.4 : 0.45;
  // required slots (vacuously complete when the frame has none)
  if (c.slotsRequired > 0) s += 0.28 * (c.slotsFilled / c.slotsRequired) * (c.slotsFilled >= c.slotsRequired ? 1 : 0.7);
  else if (c.requiredMissing.length === 0) s += 0.28;
  // optional slot fills: small credit
  s += Math.min(Math.max(c.slotsFilled - c.slotsRequired, 0) * 0.02, 0.06);
  // entity quality
  for (const slot of Object.values(c.ir.slots)) {
    if (slot.entityId) s += Math.min(slot.confidence, 1) * 0.15;
    else if (slot.contextRef === "trigger.message") s += 0.12;
    else if (slot.contextRef === "world.latestMessage" && slot.value) s += 0.1;
    else if (slot.contextRef === "world.latestMessage") s -= 0.15;
    if (slot.matches && slot.matches.length > 1 && slot.note?.includes("match")) s -= 0.05;
  }
  // unknown words
  s -= Math.min(c.unknownWords.length * 0.04, 0.12);
  // missing required
  s -= c.requiredMissing.length * 0.18;
  c.ir.confidence = Math.max(0, Math.min(0.99, Math.round(s * 100) / 100));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assemble(
  raw: string, world: WorldModel, tokens: Token[], ir: IR, notes: string[], gaps: GapNote[], stages: StageTrace[],
  alternatives: Candidate[] | null, followUp?: Suggestion[], modifierTokenIdx: Set<number>, primary?: Candidate,
): Interpretation {
  const tokenNotes = projectTokens(tokens, primary ?? null, modifierTokenIdx, notes);
  const effects = projectEffects(ir, world);
  const suggestions: Suggestion[] = [];
  // disambiguation picks
  for (const slot of Object.values(ir.slots)) {
    if (slot.matches && slot.matches.length > 1 && slot.note?.includes("pick one")) {
      for (const m of slot.matches.slice(0, 5)) {
        suggestions.push({
          kind: "disambiguation", text: raw, display: m.entity.label,
          detail: `${m.entity.type} · ${m.reason}`, entityId: m.entity.id, op: ir.intent,
        });
      }
    }
  }
  if (followUp) suggestions.push(...followUp);
  const interp: Interpretation = {
    input: raw,
    status: "ok",
    nlclVersion: NCLL_VERSION,
    worldV: world.v,
    ir,
    alternatives: (alternatives ?? []).map((a) => a.ir),
    tokens: tokenNotes,
    canonical: ir.canonical,
    reading: ir.reading,
    confidence: ir.confidence,
    effects,
    suggestions,
    gaps,
    stages,
  };
  // symbol hint: pure-NL input that parsed — show the symbolic equivalent (gap narrowing)
  const hasSymbols = tokens.some((t) => t.kind === "symbol" || t.kind === "ref" || t.kind === "cmd" || t.kind === "arrow" || t.kind === "tag");
  if (!hasSymbols && ir.intent !== "surface.help" && ir.canonical && ir.canonical !== "?" && !ir.canonical.startsWith("/rule")) {
    interp.suggestions.push({ kind: "symbol", text: ir.canonical, display: ir.canonical, detail: "the symbolic form — same command, learnable shorthand" });
  }
  return interp;
}

function defaultSuggestions(world: WorldModel): Suggestion[] {
  const out: Suggestion[] = [];
  const frames = framesForWorld(world);
  for (const f of frames.slice(0, 6)) {
    if (f.examples.length === 0) continue;
    out.push({ kind: "example", text: f.examples[0], display: f.examples[0], detail: f.title, op: f.op });
  }
  return out;
}
