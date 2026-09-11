// nlcl-pure/src/recognize.ts — dedicated deterministic phrase recognizers. These run BEFORE
// generic frame matching (priority order, first match wins): rules, teaching, receive
// simulation, help/capability, entity queries, rules listing. Each is a small grammar over
// the folded input — upgradable with the plugin, never guessed.

import type { IR, IRSlot, Interpretation, Token, WorldModel, Suggestion, GapNote, OpFrame } from "./types.ts";
import { framesForWorld, verbHits, NCLL_VERSION } from "./frames.ts";
import { ground, groundPhrase, entitySymbol, CONTEXT_WORDS } from "./ground.ts";
import { fold, unquote } from "./text.ts";
import { fillFrame, type Candidate, matchFrames } from "./grammar.ts";
import { lex } from "./lexer.ts";

export interface Recognized {
  ir: IR;
  notes: string[];
  gaps: GapNote[];
  followUp?: Suggestion[];
  usedTokens?: Set<number>;
}

function irBase(intent: string, family: IR["family"]): IR {
  return { intent, family, slots: {}, payload: {}, modifiers: {}, canonical: "", reading: "", confidence: 0.5, provenance: { verbs: [] } };
}

function groundContact(phrase: string, world: WorldModel, notes: string[], gaps: GapNote[]): { entityId: string | null; label: string; canonical: string; address: string | null; matches?: IRSlot["matches"] } {
  const t = fold(phrase).replace(/^(a|an|the)\s+/, "");
  if (t === "" || ["anyone", "anybody", "someone", "any", "everyone"].includes(t)) {
    return { entityId: null, label: "anyone", canonical: "*", address: null };
  }
  const g = groundPhrase(t, world.entities, ["contact"]);
  if (g.primary) {
    const p = g.primary;
    notes.push(`"${phrase}" → ${p.entity.label} (${p.reason})`);
    return {
      entityId: p.entity.id, label: p.entity.label, canonical: entitySymbol(p.entity),
      address: typeof (p.entity.data ?? {})["address"] === "string" ? (p.entity.data!)["address"] as string : null,
      matches: g.matches.length > 1 ? g.matches.slice(0, 5) : undefined,
    };
  }
  gaps.push({ kind: "unresolved-slot", text: `"${phrase}" is not a known contact`, hint: "contacts are learned from message history — simulate a message from them first" });
  return { entityId: null, label: phrase, canonical: `@${fold(phrase).replace(/\s+/g, "-")}`, address: null };
}

// ---- 1. help / capability ----

export function recognizeHelp(folded: string, tokens: Token[], world: WorldModel): Recognized | null {
  const t = folded.replace(/[?!.]+$/g, "").trim();
  if (t === "" ) return null;
  if (t === "help" || t === "what can i say" || t === "what can you do" || t === "commands" || t === "?" || t === "what can i type" || t === "cheat sheet" || t === "symbols") {
    const ir = irBase("surface.help", "?");
    ir.reading = "Here is what I can do:";
    ir.canonical = "?";
    return { ir, notes: ["help intent"], gaps: [] };
  }
  // "what can <verb> …" — capability search
  const cap = t.match(/^what\s+can\s+(?:i\s+)?([\w-]+)\b(.*)$/);
  if (cap) {
    const verb = cap[1];
    const hits: OpFrame[] = [];
    for (const f of framesForWorld(world)) {
      if (verbHits(verb, [f], world).length > 0) hits.push(f);
    }
    if (hits.length > 0) {
      const ir = irBase("surface.help", "?");
      ir.reading = `Capabilities matching "${verb}":`;
      ir.payload = { focus: verb, ops: hits.map((f) => f.op) };
      ir.canonical = `? what can ${verb}`;
      return { ir, notes: [`capability search: ${hits.map((f) => f.op).join(", ")}`], gaps: [] };
    }
  }
  // leading ? symbol → query mode
  if (tokens.length > 0 && tokens[0].kind === "symbol" && tokens[0].norm === "?") {
    const ir = irBase("surface.help", "?");
    ir.reading = "Query mode — what are you asking about?";
    ir.canonical = "?";
    const rest = tokens.slice(1).map((x) => (x.kind === "quote" ? x.quote ?? "" : x.text)).join(" ").trim();
    if (rest.length > 0) {
      // delegate: entity query on the rest
      const eq = recognizeEntityQuery(rest, world);
      if (eq) return eq;
    }
    return { ir, notes: ["query family prefix"], gaps: [] };
  }
  return null;
}

// ---- 2. entity query ----

export function recognizeEntityQuery(foldedOrText: string, world: WorldModel): Recognized | null {
  const t = fold(foldedOrText).replace(/[?!.]+$/g, "").trim();
  let m = t.match(/^(?:who|what)\s+is\s+(?:an?\s+)?(.+)$/);
  if (!m) m = t.match(/^tell me about\s+(.+)$/);
  if (!m) return null;
  const phrase = m[1].replace(/^@/, "");
  const g = groundPhrase(phrase, world.entities);
  const ir = irBase("surface.entity", "@");
  if (g.primary) {
    const e = g.primary.entity;
    ir.slots["entity"] = {
      value: e.id, display: e.label, canonical: entitySymbol(e), entityId: e.id,
      confidence: g.ambiguous ? 0.55 : g.primary.score,
      matches: g.matches.length > 1 ? g.matches.slice(0, 5) : undefined,
      note: g.ambiguous ? `${g.matches.length} entities match — pick one` : e.type,
    };
    ir.payload = { entityId: e.id };
    ir.reading = `${e.label} — ${e.type}`;
    ir.canonical = `@${e.id.split(":")[1] ?? e.id}`;
    return {
      ir,
      notes: [`entity query → ${e.label}`],
      gaps: g.ambiguous ? [{ kind: "ambiguity", text: `${g.matches.length} entities match "${phrase}"` }] : [],
    };
  }
  ir.reading = `Nothing in the world matches "${phrase}"`;
  ir.canonical = `@${fold(phrase).replace(/\s+/g, "-")}`;
  return { ir, notes: ["entity query: no match"], gaps: [{ kind: "unresolved-slot", text: `no entity matches "${phrase}"`, hint: "contacts appear after you exchange messages" }] };
}

// ---- 3. teaching ----

export function recognizeTeach(folded: string, world: WorldModel): Recognized | null {
  const t = folded.trim();
  let m = t.match(/^teach\s+([\w-]+)\s+(?:means|is|as|=)\s+(?:a?\s+)?(.+)$/);
  if (!m) m = t.match(/^([\w-]+)\s+means\s+(?:a?\s+)?(.+)$/);
  if (!m) {
    // symbolic: blitz = /send  |  blitz = send
    const s = t.match(/^([\w-]+)\s*=\s*\/?\s*([\w.]+)(?:@\d+)?$/);
    if (s) m = [t, s[1], s[2]];
  }
  if (m) {
    const word = fold(m[1]);
    const target = fold(m[2]).replace(/^\//, "");
    const frames = framesForWorld(world);
    let op: string | null = null;
    // direct op id?
    if (world.ops.some((o) => o.op === target || o.op === `${target}@1` || o.op.endsWith(`.${target}@1`))) {
      op = world.ops.find((o) => o.op === target || o.op === `${target}@1` || o.op.endsWith(`.${target}@1`))!.op;
    } else {
      const hits = verbHits(target, frames, world);
      if (hits.length > 0) {
        hits.sort((a, b) => (a.cls === "exact" ? -1 : 0) - (b.cls === "exact" ? -1 : 0) || a.frame.op.localeCompare(b.frame.op));
        op = hits[0].frame.op;
      }
    }
    const ir = irBase("director.teach@1", "=");
    ir.slots["word"] = { value: word, display: word, canonical: word, confidence: 0.95 };
    if (op) {
      ir.slots["op"] = { value: op, display: op, canonical: `/${op.split("@")[0].split(/[.:]/).pop()}`, confidence: 0.95 };
      ir.payload = { word, op, action: "add" };
      ir.reading = `Teach: "${word}" means ${op}`;
      ir.canonical = `${word} = /${op.split("@")[0].split(/[.:]/).pop()}`;
      ir.confidence = 0.85;
      return { ir, notes: [`teach: ${word} → ${op} (applies to future parses immediately)`], gaps: [] };
    }
    ir.payload = { word, op: null, action: "add" };
    ir.reading = `Teach "${word}" — but "${target}" is not a known verb or op`;
    ir.canonical = `${word} = ?`;
    return {
      ir, notes: ["teach: target unresolved"],
      gaps: [{ kind: "unknown-word", text: `"${target}" is not a verb I know`, hint: "teach needs a target op — try: teach blitz means send" }],
    };
  }
  const f = t.match(/^(?:forget|unteach|remove word)\s+([\w-]+)$/);
  if (f) {
    const word = fold(f[1]);
    const ir = irBase("director.teach@1", "-");
    ir.slots["word"] = { value: word, display: word, canonical: word, confidence: 0.95 };
    ir.payload = { word, action: "remove" };
    ir.reading = `Forget the word "${word}"`;
    ir.canonical = `-${word}`;
    return { ir, notes: [`unteach ${word}`], gaps: [] };
  }
  return null;
}

// ---- 4. rules ----

export function recognizeRule(folded: string, tokens: Token[], world: WorldModel): Recognized | null {
  const t = folded.trim().replace(/[.!?]+$/, "");
  // listing first (cheaper)
  if (/^(?:list|show)?\s*(?:my\s+)?(?:rules|automations)$/.test(t) || t === "rules" || t === "automations") {
    const ir = irBase("director.registry@1", "?");
    ir.payload = { filter: "rules" };
    ir.reading = "Automation rules:";
    ir.canonical = "?rules";
    ir.confidence = 0.9;
    return { ir, notes: ["registry: rules"], gaps: [] };
  }
  const disable = t.match(/^(?:disable|pause|stop)\s+rule\s+(.+)$/) ?? t.match(/^(?:disable|pause|stop)\s+(?:the\s+)?(.+?)\s+rule$/);
  if (disable) {
    const g = groundPhrase(disable[1], world.entities, ["rule"]);
    const ir = irBase("director.registry@1", "-");
    ir.reading = `Disable rule ${g.primary ? g.primary.entity.label : disable[1]}`;
    ir.canonical = `-rule ${g.primary ? g.primary.entity.id.split(":")[1] ?? "" : disable[1]}`;
    ir.payload = { action: "disable", ruleId: g.primary?.entity.id ?? null, phrase: disable[1] };
    return { ir, notes: [`disable rule: ${disable[1]}`], gaps: g.primary ? [] : [{ kind: "unresolved-slot", text: `no rule matches "${disable[1]}"` }] };
  }
  const enable = t.match(/^(?:enable|resume|activate)\s+rule\s+(.+)$/);
  if (enable) {
    const g = groundPhrase(enable[1], world.entities, ["rule"]);
    const ir = irBase("director.registry@1", "+");
    ir.reading = `Enable rule ${g.primary ? g.primary.entity.label : enable[1]}`;
    ir.canonical = `+rule ${g.primary ? g.primary.entity.id.split(":")[1] ?? "" : enable[1]}`;
    ir.payload = { action: "enable", ruleId: g.primary?.entity.id ?? null, phrase: enable[1] };
    return { ir, notes: [`enable rule: ${enable[1]}`], gaps: g.primary ? [] : [{ kind: "unresolved-slot", text: `no rule matches "${enable[1]}"` }] };
  }

  // rule definition: when <trigger>, (then) <action>
  const def = t.match(/^(?:when|whenever|if)\s+(.+?),\s*(?:then\s+)?(.+)$/);
  if (!def) return null;
  const trigger = def[1].trim();
  const action = def[2].trim();
  const notes: string[] = [];
  const gaps: GapNote[] = [];

  // trigger grammar
  let fromPhrase: string | null = null;
  let event = "message.received";
  let trig = trigger;
  let tm: RegExpMatchArray | null;
  if ((tm = trig.match(/^any(?:one|body)?\s+(?:messages|emails|writes|sends)\s+me\b/))) {
    fromPhrase = "anyone";
  } else if ((tm = trig.match(/^(.+?)\s+(?:messages|emails|writes)\s+(?:to\s+)?me\b(?:\s+saying\s+(.*))?$/))) {
    fromPhrase = tm[1];
  } else if ((tm = trig.match(/^i\s+(?:receive|get)\s+(?:a\s+)?(?:message|email)\s+from\s+(.+)$/))) {
    fromPhrase = tm[2] ?? tm[1];
  } else if ((tm = trig.match(/^(?:a\s+)?(?:message|email)\s+(?:arrives|is\s+received|comes)\s+from\s+(.+)$/))) {
    fromPhrase = tm[1];
  } else if ((tm = trig.match(/^(.+?)\s+sends?\s+me\s+(?:a\s+)?(?:an?\s+)?(?:message|email)$/))) {
    fromPhrase = tm[1];
  } else if ((tm = trig.match(/^(.+)$/)) && !CONTEXT_WORDS.has(fold(tm[1]))) {
    // last resort: treat the whole trigger as a contact phrase IF it grounds
    const probe = groundPhrase(tm[1], world.entities, ["contact"]);
    if (probe.primary) fromPhrase = tm[1];
  }
  if (fromPhrase === null) {
    return null; // not a rule — let frame matching try
  }
  const from = groundContact(fromPhrase, world, notes, gaps);

  // action grammar: parse the action phrase with the frame machinery, context → trigger
  const { tokens: actionTokens } = lex(action);
  const actionCandidates = matchFrames(actionTokens, world, "trigger.message");
  const candidates: Candidate[] = actionCandidates.slice(0, 3);
  if (candidates.length === 0) {
    const ir = irBase("director.rule@1", "+");
    ir.reading = `Rule trigger understood (${from.label}) — but the action "${action}" is not a command I know`;
    ir.canonical = `/rule on ${event} from ${from.canonical} → ?`;
    return {
      ir, notes: [...notes, `trigger ok, action unresolved: "${action}"`],
      gaps: [{ kind: "unknown-word", text: `action "${action}" did not match any command`, hint: "try: forward it to Sarah / send it to Maria" }],
    };
  }
  // prefer message.send actions (forward semantics); deterministic rank: exact verb class then op order
  candidates.sort((a, b) => scoreCandidate(a) - scoreCandidate(b) || a.ir.intent.localeCompare(b.ir.intent));
  const best = candidates[0];

  // mark the action's context slot as trigger-bound
  const payload = { ...best.ir.payload };
  let usesTrigger = false;
  for (const [role, slot] of Object.entries(best.ir.slots)) {
    if (slot.contextRef === "trigger.message") { usesTrigger = true; payload["messageFromTrigger"] = true; void role; }
  }
  if (!usesTrigger && !("to" in payload)) {
    // an action that neither uses the trigger nor routes anywhere is suspicious but legal
  }

  const ir = irBase("director.rule@1", "+");
  ir.slots = {
    when: { value: { event, from: from.entityId }, display: `when ${from.label === "anyone" ? "anyone" : from.label} messages me`, canonical: `on ${event} from ${from.canonical}`, confidence: 0.9 },
    then: { value: best.ir.intent, display: best.ir.reading, canonical: best.ir.canonical, confidence: best.ir.confidence || 0.5 },
  };
  ir.payload = { when: { event, from: from.entityId }, then: { op: best.ir.intent, payload } };
  ir.reading = `When ${from.label === "anyone" ? "anyone" : from.label} messages me, ${lowerFirst(best.ir.reading || best.ir.intent)}`;
  ir.canonical = `/rule on ${event} from ${from.canonical} → ${best.ir.canonical}`;
  ir.confidence = 0.9;
  return {
    ir,
    notes: [...notes, `rule: ${event} from ${from.label === "anyone" ? "anyone" : from.label} → ${best.ir.intent}`, ...(best.notes ?? [])],
    gaps,
    followUp: [
      { kind: "example", text: `simulate a message from ${from.label === "anyone" ? "Peter" : from.label} saying 'test'`, display: `Try it: simulate a message from ${from.label === "anyone" ? "Peter" : from.label}`, detail: "fires the rule and shows the whole loop" },
    ],
  };
}

function scoreCandidate(c: Candidate): number {
  let s = 0;
  if (c.ir.intent === "message.send@1") s -= 2; // forward semantics preferred for rules
  if (c.requiredMissing.length === 0) s -= 1;
  s += c.unknownWords.length * 0.1;
  return s;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

// ---- 5. receive simulation ----

export function recognizeReceive(folded: string, world: WorldModel): Recognized | null {
  const t = folded.trim().replace(/[.!?]+$/, "");
  let m = t.match(/^(?:simulate|pretend|imagine)\s+(?:a\s+)?(?:new\s+)?(?:message|email)\s+from\s+(.+?)$/);
  let fromPhrase: string | null = null;
  let bodyText: string | null = null;
  if (m) {
    fromPhrase = m[1];
    const sm = fromPhrase.match(/^(.+?)\s+saying\s+(.+)$/);
    if (sm) { fromPhrase = sm[1]; bodyText = unquote(sm[2]); }
  } else if ((m = t.match(/^(?:receive|get)\s+(?:a\s+)?(?:message|email)\s+from\s+(.+)$/))) {
    fromPhrase = m[1];
    const sm = fromPhrase.match(/^(.+?)\s+saying\s+(.+)$/);
    if (sm) { fromPhrase = sm[1]; bodyText = unquote(sm[2]); }
  } else if ((m = t.match(/^(.+?)\s+(?:messages|emails|writes)\s+(?:to\s+)?me\b\s*(.*)$/))) {
    fromPhrase = m[1];
    const rest = m[2] ?? "";
    const sm = rest.match(/^(?::\s*|saying\s+)?(.*)$/);
    if (sm && sm[1].length > 0) bodyText = unquote(sm[1]);
    if (bodyText !== null && fold(bodyText) === "") bodyText = null;
  } else if ((m = t.match(/^(?:new\s+)?message\s+from\s+(.+)$/))) {
    fromPhrase = m[1];
    const sm = fromPhrase.match(/^(.+?)\s+saying\s+(.+)$/);
    if (sm) { fromPhrase = sm[1]; bodyText = unquote(sm[2]); }
  }
  if (fromPhrase === null) return null;

  const notes: string[] = [];
  const gaps: GapNote[] = [];
  const from = groundContact(fromPhrase, world, notes, gaps);
  const ir = irBase("message.receive@1", "/");
  ir.slots["from"] = {
    value: from.address, display: from.label, canonical: from.canonical, entityId: from.entityId,
    confidence: from.entityId ? 0.9 : 0.3, matches: from.matches ?? undefined,
    note: from.entityId ? undefined : "not a known contact — the message will still be simulated",
  };
  if (bodyText) ir.slots["body"] = { value: bodyText, display: `'${bodyText}'`, canonical: `'${bodyText.slice(0, 24)}'`, confidence: 0.9 };
  const subject = bodyText ? (bodyText.length > 48 ? `${bodyText.slice(0, 45)}…` : bodyText) : `message from ${from.label}`;
  ir.payload = { from: from.address ?? fromPhrase, body: bodyText ?? "", subject, folder: "inbox" };
  ir.reading = `Simulate a message from ${from.label}${bodyText ? ` saying "${bodyText.slice(0, 40)}"` : ""}`;
  ir.canonical = `/receive from ${from.canonical}${bodyText ? ` '${bodyText.slice(0, 24)}'` : ""}`;
  ir.confidence = from.entityId ? 0.85 : 0.5;
  return { ir, notes, gaps };
}

// ---- 6. inbox shortcut ----

export function recognizeInbox(folded: string): Recognized | null {
  const t = folded.trim().replace(/[?!.]+$/g, "");
  const m = t.match(/^what(?:'s| is)?\s+in\s+(?:my\s+)?(inbox|sent|archive|trash)$/);
  if (m) {
    const ir = irBase("message.list@1", "?");
    ir.slots["folder"] = { value: m[1], display: m[1], canonical: m[1], confidence: 0.95 };
    ir.payload = { folder: m[1] };
    ir.reading = `List ${m[1]} messages`;
    ir.canonical = `/list in ${m[1]}`;
    return { ir, notes: [`inbox shortcut → ${m[1]}`], gaps: [] };
  }
  return null;
}

export function emptyInterp(input: string, world: WorldModel): Interpretation {
  return {
    input, status: "empty", nlclVersion: NCLL_VERSION, worldV: world.v, ir: null, alternatives: [],
    tokens: [], canonical: null, reading: null, confidence: 0, effects: [], suggestions: [], gaps: [], stages: [],
  };
}
