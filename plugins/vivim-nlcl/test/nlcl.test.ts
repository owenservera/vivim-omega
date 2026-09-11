// vivim.nlcl — test/nlcl.test.ts (Ω11 gate evidence)
// The pure engine is the heart: these tests pin N1 (determinism), the symbol families,
// the statuses, grounding, canonical forms, gap narrowing, and the plugin manifest.
import { describe, expect, test } from "bun:test";
import {
  interpret, emptyWorld, contactFromAddress, SYMBOL_FAMILIES, NCLL_VERSION,
  DEFAULT_FRAMES, lex, fold,
} from "@vivim/omega-nlcl-pure";
import type { WorldModel } from "@vivim/omega-nlcl-pure";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function demoWorld(): WorldModel {
  const w = emptyWorld();
  w.kernel.composition = "console";
  w.kernel.plugins = [
    { id: "vivim.law", version: "0.1.0", state: "active" },
    { id: "vivim.vault", version: "0.1.0", state: "active" },
    { id: "provider.email.file", version: "0.2.0", state: "active" },
    { id: "vivim.director", version: "0.1.0", state: "active" },
  ];
  w.ops = [
    { op: "message.send@1", risk: "EXTERNAL_MUTATION", provider: "provider.email.file", title: "send a message" },
    { op: "message.receive@1", risk: "READ", provider: "provider.email.file", title: "simulate an incoming message" },
    { op: "message.list@1", risk: "READ", provider: "provider.email.file", title: "list messages" },
    { op: "message.search@1", risk: "READ", provider: "provider.email.file", title: "search messages" },
    { op: "message.read@1", risk: "READ", provider: "provider.email.file", title: "read a message" },
    { op: "message.move@1", risk: "MUTATION", provider: "provider.email.file", title: "move a message" },
    { op: "director.rule@1", risk: "ENGINE", provider: "vivim.director", title: "define a rule" },
    { op: "director.registry@1", risk: "ENGINE", provider: "vivim.director", title: "list rules" },
    { op: "director.teach@1", risk: "ENGINE", provider: "vivim.director", title: "teach a word" },
  ];
  w.entities = [
    contactFromAddress("peter.miller@omega.local", 100),
    contactFromAddress("peter.zhang@omega.local", 90),
    contactFromAddress("sarah.chen@omega.local", 80),
    { id: "message:msg_a1", type: "message", label: "Quarterly report", names: ["quarterly report", "report", "quarterly"], at: 120, data: { id: "msg_a1", subject: "Quarterly report", body: "The numbers are attached.", from: "peter.miller@omega.local", to: "me@omega.local", folder: "inbox", flags: { seen: false } } },
  ];
  w.context.latestMessageId = "message:msg_a1";
  return w;
}

describe("Ω11 · symbol families (D-217)", () => {
  test("all 17 families defined with meaning + nl triggers + examples", () => {
    expect(SYMBOL_FAMILIES.length).toBe(17);
    for (const f of SYMBOL_FAMILIES) {
      expect(f.meaning.length).toBeGreaterThan(3);
      expect(f.nl.length).toBeGreaterThan(0);
      expect(f.examples.length).toBeGreaterThan(0);
    }
  });
  test("the owner's list is present: # @ / ! ? + - & $ * % ∆ ✓ = ^ ~ →", () => {
    const chars = new Set(SYMBOL_FAMILIES.map((f) => f.char));
    for (const c of ["#", "@", "/", "!", "?", "+", "-", "&", "$", "*", "%", "∆", "✓", "=", "^", "~", "→"]) {
      expect(chars.has(c as never)).toBe(true);
    }
  });
});

describe("Ω11 · N1 determinism", () => {
  const w = demoWorld();
  test("same (text, world) → byte-identical interpretation, 20 runs", () => {
    const first = JSON.stringify(interpret("send this to Peter", w));
    for (let i = 0; i < 19; i++) {
      expect(JSON.stringify(interpret("send this to Peter", w))).toBe(first);
    }
  });
  test("different world → different grounding", () => {
    const w2 = demoWorld();
    w2.entities = w2.entities.filter((e) => e.id !== "contact:peter-zhang");
    const r1 = interpret("send 'hi' to Peter", w);
    const r2 = interpret("send 'hi' to Peter", w2);
    expect(r1.status).toBe("ambiguous");
    expect(r2.status).toBe("ok");
  });
  test("interpret is fast enough for keystroke latency (< 2ms on this class of input)", () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) interpret("send this to Peter about the quarterly report", w);
    const per = (performance.now() - t0) / 100;
    expect(per).toBeLessThan(2);
  });
});

describe("Ω11 · the owner's example: 'send this to Peter'", () => {
  const w = demoWorld();
  test("parses to message.send with grounded recipient + context patient + forward semantics", () => {
    const r = interpret("send this to Peter", w);
    expect(r.ir?.intent).toBe("message.send@1");
    expect(r.ir?.payload["to"]).toBe("peter.miller@omega.local");
    expect(r.ir?.payload["body"]).toBe("The numbers are attached.");
    expect(r.ir?.payload["subject"]).toBe("Fwd: Quarterly report");
    expect(r.canonical).toBe("/send @msg_a1 → @peter-miller");
    expect(r.reading).toContain("Peter Miller");
    // the gap-narrowing surface: symbol suggestion + disambiguation
    expect(r.suggestions.some((s) => s.kind === "symbol" && s.text.startsWith("/send"))).toBe(true);
    expect(r.suggestions.filter((s) => s.kind === "disambiguation").length).toBe(2);
    expect(r.status).toBe("ambiguous"); // two Peters — honest ambiguity
  });
  test("token annotations label verb, patient, prep, recipient", () => {
    const r = interpret("send this to Peter", w);
    const roles = r.tokens.map((t) => t.role);
    expect(roles).toContain("verb");
    expect(roles).toContain("message");
    expect(roles).toContain("→ to");
  });
  test("effect preview announces the consent gate before execution", () => {
    const r = interpret("send this to Peter", w);
    expect(r.effects[0]?.op).toBe("message.send@1");
    expect(r.effects[0]?.risk).toBe("EXTERNAL_MUTATION");
    expect(r.effects[0]?.gate).toBe("consent");
  });
});

describe("Ω11 · symbolic / mixed forms hit the same frames", () => {
  const w = demoWorld();
  test("/send @this → @sarah-chen equals the NL reading", () => {
    const r = interpret("/send @this → @sarah-chen", w);
    expect(r.status).toBe("ok");
    expect(r.ir?.intent).toBe("message.send@1");
    expect(r.ir?.payload["to"]).toBe("sarah.chen@omega.local");
    expect(r.ir?.payload["body"]).toBe("The numbers are attached.");
  });
  test("quoted literal + arrow: send 'hello world' to Sarah", () => {
    const r = interpret("send 'hello world' to Sarah", w);
    expect(r.ir?.payload["body"]).toBe("hello world");
    expect(r.ir?.payload["subject"]).toBe("hello world");
    expect(r.canonical).toBe("/send 'hello world' → @sarah-chen");
  });
  test("force modifier: 'send this to Peter!'", () => {
    const r = interpret("send this to Peter!", w);
    expect(r.ir?.modifiers.force).toBe(true);
  });
});

describe("Ω11 · statuses and gap narrowing", () => {
  const w = demoWorld();
  test("empty input → empty status + example suggestions", () => {
    const r = interpret("", w);
    expect(r.status).toBe("empty");
    expect(r.suggestions.length).toBeGreaterThan(2);
  });
  test("unknown word → unknown status + teach + correction suggestions", () => {
    const r = interpret("frobnicate the widget", w);
    expect(r.status).toBe("unknown");
    expect(r.gaps[0]?.kind).toBe("unknown-word");
    expect(r.suggestions.some((s) => s.kind === "teach")).toBe(true);
  });
  test("partial: unfilled required slot is named with a hint", () => {
    const r = interpret("send 'hello there'", w);
    expect(r.status).toBe("partial");
    expect(r.gaps.some((g) => g.kind === "unresolved-slot" && g.text.includes("to"))).toBe(true);
  });
  test("'this' with an empty world → empty-context gap, never a guess", () => {
    const w0 = emptyWorld();
    w0.ops = w.ops;
    const r = interpret("send this to Peter", w0);
    expect(r.gaps.some((g) => g.kind === "unresolved-slot")).toBe(true); // Peter unknown too
  });
  test("help: 'what can I say?' → surface.help with examples", () => {
    const r = interpret("what can I say?", w);
    expect(r.ir?.intent).toBe("surface.help");
  });
  test("entity query: 'who is Peter' → surface.entity + ranked matches", () => {
    const r = interpret("who is Peter", w);
    expect(r.ir?.intent).toBe("surface.entity");
    expect(r.ir?.payload["entityId"]).toBe("contact:peter-miller");
    expect(r.gaps[0]?.kind).toBe("ambiguity");
  });
});

describe("Ω11 · teaching merges over builtin verbs (D-218/D-219)", () => {
  test("taught word changes the parse immediately", () => {
    const w = demoWorld();
    expect(interpret("blitz this to Peter", w).status).toBe("unknown");
    w.lexicon = [{ word: "blitz", op: "message.send@1", source: "taught", createdAt: 1 }];
    const r = interpret("blitz this to Peter", w);
    expect(r.ir?.intent).toBe("message.send@1");
    expect(r.ir?.provenance).toBeDefined();
    expect(r.stages.some((s) => s.stage === "frame-match" && s.notes.join(" ").includes("blitz"))).toBe(true);
    expect(interpret("blitz 'hi' to Sarah", w).ir?.payload["to"]).toBe("sarah.chen@omega.local");
  });
  test("'teach blitz means send' produces the teaching IR", () => {
    const r = interpret("teach blitz means send", demoWorld());
    expect(r.ir?.intent).toBe("director.teach@1");
    expect(r.ir?.payload).toEqual({ word: "blitz", op: "message.send@1", action: "add" });
    expect(r.canonical).toBe("blitz = /send");
  });
});

describe("Ω11 · rules and receive simulation (the reprogramming grammar)", () => {
  const w = demoWorld();
  test("'when Peter messages me, forward it to Sarah' → director.rule with trigger-bound action", () => {
    const r = interpret("when Peter messages me, forward it to Sarah", w);
    expect(r.ir?.intent).toBe("director.rule@1");
    const payload = r.ir?.payload as { when: { event: string; from: string }; then: { op: string; payload: Record<string, unknown> } };
    expect(payload.when).toEqual({ event: "message.received", from: "contact:peter-miller" });
    expect(payload.then.op).toBe("message.send@1");
    expect(payload.then.payload["to"]).toBe("sarah.chen@omega.local");
    expect(payload.then.payload["messageFromTrigger"]).toBe(true);
    expect(r.canonical).toBe("/rule on message.received from @peter-miller → /send @trigger → @sarah-chen");
  });
  test("rule effects preview the ACTION's consent under principal vivim.director", () => {
    const r = interpret("when Peter messages me, forward it to Sarah", w);
    expect(r.effects.some((e) => e.op === "message.send@1" && e.gate === "consent" && e.title.includes("vivim.director"))).toBe(true);
  });
  test("'simulate a message from Peter saying …' → message.receive payload", () => {
    const r = interpret("simulate a message from Peter saying 'the report is ready'", w);
    expect(r.ir?.intent).toBe("message.receive@1");
    expect(r.ir?.payload).toEqual({ from: "peter.miller@omega.local", body: "the report is ready", subject: "the report is ready", folder: "inbox" });
  });
  test("'Peter messages me: hello there' — the colloquial receive form", () => {
    const r = interpret("Peter messages me: hello there", w);
    expect(r.ir?.intent).toBe("message.receive@1");
    expect(r.ir?.payload["body"]).toBe("hello there");
  });
  test("'rules' / 'list rules' → director.registry", () => {
    for (const t of ["rules", "list rules", "show my rules"]) {
      expect(interpret(t, w).ir?.intent).toBe("director.registry@1");
    }
  });
  test("'when anyone messages me' → from any", () => {
    const r = interpret("when anyone messages me, forward it to Sarah", w);
    const payload = r.ir?.payload as { when: { from: string | null } };
    expect(payload.when.from).toBeNull();
  });
});

describe("Ω11 · lexer", () => {
  test("spans are exact and quote decoding works", () => {
    const { tokens } = lex("send 'hello world' to Peter");
    const quote = tokens.find((t) => t.kind === "quote");
    expect(quote?.quote).toBe("hello world");
    expect(quote?.start).toBe(5);
    expect(quote?.end).toBe(18);
  });
  test("ref/cmd tokens attach their prefix: @peter /send #tag", () => {
    const { tokens } = lex("@peter /send #urgent");
    expect(tokens.find((t) => t.kind === "ref")?.norm).toBe("peter");
    expect(tokens.find((t) => t.kind === "cmd")?.norm).toBe("send");
    expect(tokens.find((t) => t.kind === "tag")?.norm).toBe("urgent");
  });
  test("diacritics fold: Péter ≡ peter", () => {
    expect(fold("Péter")).toBe("peter");
    expect(contactFromAddress("maria.garcia@x.local").label).toBe("Maria Garcia");
  });
});

describe("Ω11 · frames + manifest", () => {
  test("frames cover the console ops incl. the owner's example", () => {
    const ops = DEFAULT_FRAMES.map((f) => f.op);
    for (const op of ["message.send@1", "message.receive@1", "director.rule@1", "director.teach@1", "surface.help"]) {
      expect(ops).toContain(op);
    }
    expect(DEFAULT_FRAMES.find((f) => f.op === "message.send@1")?.examples).toContain("send this to Peter");
  });
  test("plugin manifest parses + validates through the sdk", () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.id).toBe("vivim.nlcl");
    expect(parsed.value.contributions.engine?.[0]?.id).toBe("nlcl.interpret");
    const issues = validateManifest(parsed.value);
    expect(issues.length).toBe(0);
  });
  test("NCLL_VERSION is pinned in the world snapshot contract", () => {
    expect(typeof NCLL_VERSION).toBe("string");
    expect(emptyWorld().kernel.nlclVersion).toBe(NCLL_VERSION);
  });
});
