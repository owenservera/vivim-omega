// provider-llm — simulator.ts: the deterministic in-sandbox LLM backend.
//
// HONEST OUTPUT: every completion is synthesized locally from a seed derived
// from the canonical request (messages + temperature) — same request →
// byte-identical completion, forever. No Math.random, no Date.now, no network.
// The result carries `sim: true` so no consumer can mistake it for a live model.
//
// The synthesis does real work, honestly labeled:
//   * role-mirroring — the completion reflects the conversation's shape
//     (system instruction, last user message, prior assistant replies);
//   * seeded continuation — sentences drawn from a fixed word bank by the
//     seeded PRNG (mulberry32), so the "generation" is reproducible;
//   * token accounting — words are the token unit; maxTokens truncates the
//     completion and flips finishReason to "length".

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage { role: ChatRole; content: string }

export interface ChatRequest {
  messages: ChatMessage[];
  temperature: number;   // 0..2 — part of the seed (deterministic given the request)
  maxTokens: number;     // completion token budget (words); truncates, never pads
}

export interface ChatCompletion {
  completion: { role: "assistant"; content: string };
  model: string;
  sim: true;
  seed: string;          // 8 hex chars — the request's fingerprint
  usage: { promptTokens: number; completionTokens: number };
  finishReason: "stop" | "length";
}

export const SIM_MODEL = "vivim-sim-llm-1";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 128;

const ROLES: ReadonlySet<string> = new Set(["system", "user", "assistant"]);

// ---- validation (throws with readable messages → DEGRADED register via the shim) ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateChatRequest(payload: unknown): ChatRequest {
  if (!isObj(payload)) {
    throw new Error("chat.complete: payload must be an object {messages: [{role, content}], temperature?, maxTokens?}");
  }
  const rawMessages = payload["messages"];
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new Error("chat.complete: messages must be a non-empty array of {role, content}");
  }
  const messages: ChatMessage[] = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const m = rawMessages[i];
    if (!isObj(m)) throw new Error(`chat.complete: messages[${i}] must be an object {role, content}`);
    const role = m["role"];
    if (typeof role !== "string" || !ROLES.has(role)) {
      throw new Error(`chat.complete: messages[${i}].role must be one of system|user|assistant (got ${JSON.stringify(role)})`);
    }
    const content = m["content"];
    if (typeof content !== "string") {
      throw new Error(`chat.complete: messages[${i}].content must be a string (got ${typeof content})`);
    }
    messages.push({ role: role as ChatRole, content });
  }

  let temperature = DEFAULT_TEMPERATURE;
  if (payload["temperature"] !== undefined) {
    const t = payload["temperature"];
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 2) {
      throw new Error(`chat.complete: temperature must be a number in [0, 2] (got ${JSON.stringify(t)})`);
    }
    temperature = t;
  }

  let maxTokens = DEFAULT_MAX_TOKENS;
  if (payload["maxTokens"] !== undefined) {
    const mt = payload["maxTokens"];
    if (typeof mt !== "number" || !Number.isInteger(mt) || mt < 1) {
      throw new Error(`chat.complete: maxTokens must be a positive integer (got ${JSON.stringify(mt)})`);
    }
    maxTokens = mt;
  }

  return { messages, temperature, maxTokens };
}

// ---- deterministic primitives ------------------------------------------------------

/** FNV-1a 32-bit (pure, no node:crypto — same family as the law's consent ids). */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG (the repo-standard deterministic generator). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const words = (s: string): number => (s.trim() ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const clip = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max - 1) + "…");

const WORD_BANK = [
  "continuing", "carefully", "toward", "the", "answer", "structured", "context", "mirrors",
  "prior", "turns", "of", "this", "conversation", "each", "token", "chosen", "deterministically",
  "from", "a", "seeded", "generator", "so", "identical", "requests", "produce", "identical",
  "completions", "in", "the", "simulator", "backend", "there", "is", "no", "network", "call",
  "and", "no", "secret", "only", "local", "synthesis", "for", "testing", "and", "offline", "demos",
];

// ---- the simulator ------------------------------------------------------------------

export function simulateChat(req: ChatRequest): ChatCompletion {
  const { messages, temperature, maxTokens } = req;

  // request fingerprint: canonical messages + temperature (maxTokens only truncates)
  const promptKey = messages.map((m) => `${m.role}\u0001${m.content}`).join("\u0002") + `\u0003t=${temperature}`;
  const seedNum = fnv1a32(promptKey);
  const rng = mulberry32(seedNum);
  const seed = seedNum.toString(16).padStart(8, "0");

  // conversation shape (role-mirroring)
  const counts: Record<ChatRole, number> = { system: 0, user: 0, assistant: 0 };
  let lastUser: ChatMessage | undefined;
  let firstSystem: ChatMessage | undefined;
  for (const m of messages) {
    counts[m.role]++;
    if (m.role === "user") lastUser = m;
    if (m.role === "system" && firstSystem === undefined) firstSystem = m;
  }

  const lines: string[] = [];
  lines.push(`[sim] This is a deterministic simulator completion (model ${SIM_MODEL}, seed ${seed}) — not a live model.`);
  let shape = `[sim] Conversation shape: ${counts.system} system, ${counts.user} user, ${counts.assistant} assistant message(s)`;
  if (lastUser) shape += `; mirroring your last user message: "${clip(lastUser.content, 72)}"`;
  if (firstSystem) shape += `; operating under your system instruction: "${clip(firstSystem.content, 72)}"`;
  if (counts.assistant > 0) shape += `; continuing a thread after ${counts.assistant} prior assistant reply(s)`;
  lines.push(shape + ".");

  // seeded continuation: 2–3 sentences of 6–10 bank words each
  const sentenceCount = 2 + Math.floor(rng() * 2);
  for (let s = 0; s < sentenceCount; s++) {
    const len = 6 + Math.floor(rng() * 5);
    const picked: string[] = [];
    for (let w = 0; w < len; w++) picked.push(WORD_BANK[Math.floor(rng() * WORD_BANK.length)] as string);
    const sentence = picked.join(" ");
    lines.push(`[sim] ${sentence.charAt(0).toUpperCase() + sentence.slice(1)}.`);
  }
  lines.push(`[sim] Request: temperature ${temperature}, maxTokens ${maxTokens} — this completion is reproducible byte-for-byte for an identical request.`);

  let content = lines.join("\n");
  let finishReason: "stop" | "length" = "stop";
  const tokenCount = words(content);
  if (tokenCount > maxTokens) {
    content = content.trim().split(/\s+/).slice(0, maxTokens).join(" ");
    finishReason = "length";
  }

  return {
    completion: { role: "assistant", content },
    model: SIM_MODEL,
    sim: true,
    seed,
    usage: {
      promptTokens: messages.reduce((n, m) => n + words(m.content), 0),
      completionTokens: words(content),
    },
    finishReason,
  };
}
