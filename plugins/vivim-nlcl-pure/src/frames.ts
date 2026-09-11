// nlcl-pure/src/frames.ts — LANGUAGE DATA (D-218): every op the console speaks, as data.
// Frames version WITH the nlcl plugin (one atomic upgrade unit); taught words live in the
// vault (world.lexicon) and merge over these verbs. Pseudo-intents (surfaceOnly) are served
// by surfaces — the language layer may describe them, the router never routes them.

import type { OpFrame, WorldModel } from "./types.ts";
import { classifyVerb, fold, lev, type VerbMatchClass } from "./text.ts";

export const NCLL_VERSION = "0.1.0";

export const DEFAULT_FRAMES: OpFrame[] = [
  {
    op: "message.send@1",
    verbs: ["send", "mail", "forward", "reply", "write"],
    title: "send a message",
    family: "/",
    slots: [
      { role: "message", kind: "content", patient: true, required: true, payloadKey: "body" },
      { role: "to", kind: "entity", entityTypes: ["contact"], preps: ["to"], required: true, payloadKey: "to", family: "→" },
      { role: "subject", kind: "text", preps: ["about", "re", "subject", "regarding"], payloadKey: "subject" },
    ],
    reading: "Send {message} to {to}",
    examples: ["send this to Peter", "send 'quarterly numbers attached' to Maria", "forward it to Sarah"],
  },
  {
    op: "message.receive@1",
    verbs: ["simulate", "receive", "pretend", "imagine"],
    title: "simulate an incoming message (the ingestion op)",
    family: "/",
    slots: [
      { role: "from", kind: "entity", entityTypes: ["contact"], preps: ["from"], patient: true, required: true, payloadKey: "from" },
      { role: "body", kind: "content", preps: ["saying"], payloadKey: "body" },
    ],
    reading: "Simulate a message from {from}",
    examples: ["simulate a message from Peter saying 'hello'", "Peter messages me: the report is ready"],
  },
  {
    op: "message.list@1",
    verbs: ["list", "inbox", "mailbox", "show"],
    title: "list messages",
    family: "?",
    slots: [
      { role: "folder", kind: "enum", enumValues: ["inbox", "sent", "archive", "trash", "drafts"], preps: ["in", "from"], payloadKey: "folder" },
    ],
    reading: "List {folder} messages",
    examples: ["list my inbox", "show sent messages", "what is in my inbox?"],
  },
  {
    op: "message.search@1",
    verbs: ["search", "find", "grep", "look"],
    title: "search messages",
    family: "?",
    slots: [
      { role: "q", kind: "rest", required: true, payloadKey: "q" },
    ],
    reading: "Search messages for {q}",
    examples: ["search merkle", "find messages about the report"],
  },
  {
    op: "message.read@1",
    verbs: ["read", "open"],
    title: "read a message",
    family: "/",
    slots: [
      { role: "id", kind: "entity", entityTypes: ["message"], patient: true, required: true, payloadKey: "id" },
    ],
    reading: "Read {id}",
    examples: ["read the quarterly report", "open Peter's last message"],
  },
  {
    op: "message.move@1",
    verbs: ["move", "archive", "trash", "file", "put"],
    title: "move a message",
    family: "∆",
    slots: [
      { role: "id", kind: "entity", entityTypes: ["message"], patient: true, required: true, payloadKey: "id" },
      { role: "folder", kind: "enum", enumValues: ["inbox", "sent", "archive", "trash", "drafts"], preps: ["to", "into", "in"], required: true, payloadKey: "folder" },
    ],
    reading: "Move {id} to {folder}",
    examples: ["move the quarterly report to archive", "archive Peter's message"],
  },
  {
    op: "director.rule@1",
    verbs: ["automate", "rule"],
    title: "define an automation rule (when …, do …)",
    family: "+",
    slots: [], // recognized by the dedicated rule recognizer (deterministic phrase grammar)
    reading: "Rule: {summary}",
    examples: ["when Peter messages me, forward it to Sarah", "when anyone messages me, send it to Maria"],
  },
  {
    op: "director.registry@1",
    verbs: ["rules", "automations"],
    title: "list automation rules",
    family: "?",
    slots: [],
    reading: "Rules:",
    examples: ["list rules", "show my rules", "my automations"],
  },
  {
    op: "director.teach@1",
    verbs: ["teach"],
    title: "teach a word (word means op)",
    family: "=",
    slots: [], // recognized by the dedicated teach recognizer
    reading: "Teach {word} = {op}",
    examples: ["teach blitz means send", "blitz = /send", "forget blitz"],
  },
  {
    op: "mind.query@1",
    verbs: ["know"],
    title: "ask about an entity",
    family: "?",
    slots: [], // recognized by the dedicated entity-query recognizer
    reading: "{entity}",
    examples: ["who is Peter?", "what is @peter"],
  },
  {
    op: "surface.help",
    verbs: [],
    title: "help — what can I say?",
    family: "?",
    surfaceOnly: true,
    slots: [],
    reading: "Here is what I can do:",
    examples: ["help", "what can I say?", "?"],
  },
  {
    op: "surface.entity",
    verbs: [],
    title: "entity card",
    family: "@",
    surfaceOnly: true,
    slots: [],
    reading: "{entity}",
    examples: ["who is Peter"],
  },
  {
    op: "surface.assist",
    verbs: ["ask"],
    title: "ask the assistant (the LLM edge — opt-in, probabilistic, never auto-executed)",
    family: "?",
    surfaceOnly: true,
    slots: [
      { role: "q", kind: "rest", required: true, payloadKey: "q" },
    ],
    reading: "Ask the assistant: {q}",
    examples: ["ask the assistant to rephrase my message"],
  },
];

/** The frames actually usable against a given world: DEFAULT_FRAMES kept when the op is
 *  routable (or surfaceOnly); plus generic frames derived from routable ops without one. */
export function framesForWorld(world: WorldModel): OpFrame[] {
  const out: OpFrame[] = [];
  const routed = new Set(world.ops.map((o) => o.op));
  for (const f of DEFAULT_FRAMES) {
    if (f.surfaceOnly || routed.has(f.op)) out.push(f);
  }
  for (const opView of world.ops) {
    if (DEFAULT_FRAMES.some((f) => f.op === opView.op)) continue;
    out.push(genericFrame(opView.op));
  }
  return out;
}

/** Derive a boring frame from an op id: "vault.verify" → verbs ["verify"], rest slot. */
function genericFrame(op: string): OpFrame {
  const local = op.split("@")[0] ?? op;
  const tail = local.split(/[.:]/).filter(Boolean).pop() ?? local;
  const verb = fold(tail);
  return {
    op,
    verbs: [verb, local.replace(/[.:]/g, " ")],
    title: op,
    family: "/",
    slots: [{ role: "arg", kind: "rest", payloadKey: "arg" }],
    reading: `${verb} {arg}`,
    examples: [verb],
  };
}

export interface VerbHit { frame: OpFrame; verb: string; cls: VerbMatchClass }

/** All verb hits for a word across frames (taught lexicon merges over builtin verbs). */
export function verbHits(word: string, frames: OpFrame[], world: WorldModel): VerbHit[] {
  const taught = new Map<string, string>(); // word → op
  for (const entry of world.lexicon) taught.set(fold(entry.word), entry.op);
  const hits: VerbHit[] = [];
  for (const frame of frames) {
    const taughtForFrame = [...taught.entries()].filter(([, op]) => op === frame.op).map(([w]) => w);
    const cls = classifyVerb(word, frame.verbs, taughtForFrame);
    if (cls) hits.push({ frame, verb: cls.verb, cls: cls.cls });
  }
  // taught hits for ops with no frame in this world (still routable): generic verb match
  if (!hits.some((h) => h.cls === "taught")) {
    for (const [w, op] of taught) {
      if (w === word && world.ops.some((o) => o.op === op) && !frames.some((f) => f.op === op)) {
        const g = genericFrame(op);
        hits.push({ frame: g, verb: w, cls: "taught" });
      }
    }
  }
  return hits;
}

/** Closest verbs for suggestions (deterministic order, capped). */
export function closestVerbs(word: string, frames: OpFrame[], world: WorldModel, cap = 5): string[] {
  const taught = world.lexicon.map((e) => fold(e.word));
  const pool: string[] = [];
  for (const f of frames) pool.push(...f.verbs);
  pool.push(...taught);
  const scored = pool
    .filter((v) => v.length > 2)
    .map((v) => ({ v, d: lev(word, v, 3) }))
    .filter((s) => s.d <= 2);
  scored.sort((a, b) => a.d - b.d || (a.v < b.v ? -1 : 1));
  return [...new Set(scored.map((s) => s.v))].slice(0, cap);
}
