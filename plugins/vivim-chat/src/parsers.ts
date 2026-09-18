// plugins/vivim-chat — parsers.ts (W1/T-05 harvest, D-355 governance)
//
// The version-pinned import parsers: the legacy chatgpt/claude/gemini export
// parsers (vivim-final-program@4a5eb84, src/engines/parsers/{chatgpt,claude,
// gemini}-import.ts, 210 lines, pure JSON→rows) re-expressed as parser
// CONTRIBUTION DATA per 30-TRIAGE/HARVEST-PATTERN.md:
//   * the algorithms are preserved (ChatGPT mapping-walk sorted by createdAt,
//     Claude sender/text extraction, Gemini author mapping);
//   * the I/O is re-expressed: legacy ParsedConversation[] → M1 ParsedChunk[]
//     rows (import.conversation / import.message), exactly-one-final by
//     construction — the last conversation's last message closes the parse;
//   * DETERMINISM LAW (the one deliberate divergence, reviewed): the legacy
//     parsers called Date.now() for missing timestamps — a parser may never
//     touch the clock (D-354 isolation: no clock in the parse path). Missing
//     timestamps land as `ts: 0` with `tsEstimated: true`, attributable and
//     byte-stable across runs;
//   * the transport stays OFF: no ports, no vault writes, no side effects —
//    the transforms touch ONLY their argument. What to DO with parsed
//    conversations (chat.* probe rows, W3 harvest) is a WRITER's decision,
//    never the parser's (W1 non-goal: no chat writes beyond probe rows).
//
// NOT routable: governance data (D-355) — the `parser` contribution declared
// in plugin.json registers no op and never enters a route table.
//
// Recorded exports ONLY (W1 fixture pipeline): these parsers consume the
// recorded export fixtures carried by fixtures/import/ — never a live fetch.
import type { ParsedChunk } from "@vivim/omega-contracts";

/** The shipped import-parser version (one family, three provider identities:
 *  `parser:history.import:chatgpt` / `:claude` / `:gemini`). */
export const IMPORT_PARSER_VERSION = "1";

/** The archetype this parser family realizes: `parser:history.import:<source>`. */
export const IMPORT_PARSER_ARCHETYPE = "history.import";

/** The three harvested source identities (legacy ParserSource, minus
 *  `generic` — an unknown source has no harvested algorithm and REFUSES). */
export const IMPORT_SOURCES = ["chatgpt", "claude", "gemini"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

// ---- output row shapes (the only rows these parsers emit) -------------------

export interface ImportConversationData {
  kind: "import.conversation";
  source: ImportSource;
  externalId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
export interface ImportMessageData {
  kind: "import.message";
  source: ImportSource;
  conversationExternalId: string;
  externalId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  ts: number;
  tsEstimated: boolean;
}
export interface ImportDoneData {
  kind: "import.done";
  source: ImportSource;
  conversations: number;
}
export type ImportChunkData = ImportConversationData | ImportMessageData | ImportDoneData;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deterministic timestamp resolution: number stays (ms), string parses,
 *  missing/NaN → {ts: 0, estimated: true} — NEVER the clock (D-354). */
function resolveTs(v: unknown): { ts: number; estimated: boolean } {
  if (typeof v === "number" && Number.isFinite(v)) return { ts: Math.floor(v), estimated: false };
  if (typeof v === "string" && v.length > 0) {
    const t = new Date(v).getTime();
    if (Number.isFinite(t)) return { ts: t, estimated: false };
  }
  return { ts: 0, estimated: true };
}

function roleOf(v: unknown): "user" | "assistant" | "system" {
  return v === "assistant" || v === "system" ? v : "user"; // legacy default: unknown → user
}

// ---- chatgpt (the mapping-walk algorithm, preserved) -------------------------

interface ChatGPTNode { id: unknown; message: unknown }

function parseChatgptExport(raw: unknown): ParsedChunk[] {
  if (!Array.isArray(raw)) {
    throw new Error("vivim-chat import parser (chatgpt): export must be a JSON array of conversations");
  }
  const rows: ParsedChunk[] = [];
  for (let ci = 0; ci < raw.length; ci++) {
    const conv = raw[ci];
    if (!isObj(conv) || !isObj(conv["mapping"])) {
      throw new Error(`vivim-chat import parser (chatgpt): conversations[${ci}] must be an object with a mapping record`);
    }
    const title = typeof conv["title"] === "string" ? conv["title"] : "";
    const create = resolveTs(conv["create_time"]);
    const update = resolveTs(conv["update_time"] ?? conv["create_time"]);
    const externalId = `${title}_${create.ts}`; // legacy externalId grammar, preserved
    const mapping = conv["mapping"] as Record<string, unknown>;
    const nodes: Array<{ id: string; message: Record<string, unknown> | null }> = [];
    for (const [id, node] of Object.entries(mapping)) {
      if (!isObj(node)) continue;
      const msg = isObj(node["message"]) ? node["message"] as Record<string, unknown> : null;
      nodes.push({ id, message: msg });
    }
    const parsed = nodes
      .map(({ id, message }) => {
        if (message === null) return null;
        const author = isObj(message["author"]) ? message["author"] as Record<string, unknown> : {};
        const content = isObj(message["content"]) ? message["content"] as Record<string, unknown> : {};
        const parts = Array.isArray(content["parts"]) ? content["parts"] : [];
        const text = parts.filter((p): p is string => typeof p === "string").join("\n");
        const ts = resolveTs(message["create_time"]);
        return {
          externalId: typeof message["id"] === "string" ? message["id"] : id,
          role: roleOf(author["role"]),
          content: text,
          model: typeof message["model"] === "string" ? message["model"] : undefined,
          ts: ts.ts,
          tsEstimated: ts.estimated,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.ts - b.ts || (a.externalId < b.externalId ? -1 : 1)); // legacy sort + stable tiebreak
    rows.push({
      data: {
        kind: "import.conversation", source: "chatgpt", externalId, title,
        createdAt: create.ts, updatedAt: update.ts, messageCount: parsed.length,
      } satisfies ImportChunkData,
      final: false,
    });
    for (const m of parsed) {
      rows.push({
        data: { kind: "import.message", source: "chatgpt", conversationExternalId: externalId, ...m } satisfies ImportChunkData,
        final: false,
      });
    }
  }
  return rows;
}

// ---- claude (sender/text extraction, preserved) ------------------------------

function parseClaudeExport(raw: unknown): ParsedChunk[] {
  if (!Array.isArray(raw)) {
    throw new Error("vivim-chat import parser (claude): export must be a JSON array of conversations");
  }
  const rows: ParsedChunk[] = [];
  for (let ci = 0; ci < raw.length; ci++) {
    const conv = raw[ci];
    if (!isObj(conv) || !Array.isArray(conv["chat_messages"])) {
      throw new Error(`vivim-chat import parser (claude): conversations[${ci}] must be an object with chat_messages`);
    }
    const uuid = typeof conv["uuid"] === "string" ? conv["uuid"] : `conv_${ci}`;
    const title = typeof conv["name"] === "string" ? conv["name"] : "";
    const create = resolveTs(conv["created_at"]);
    const update = conv["updated_at"] !== undefined ? resolveTs(conv["updated_at"]) : create;
    const messages = (conv["chat_messages"] as unknown[]).map((m, i) => {
      if (!isObj(m)) throw new Error(`vivim-chat import parser (claude): chat_messages[${i}] must be an object`);
      const sender = m["sender"];
      let text = "";
      if (typeof m["text"] === "string") text = m["text"];
      else if (Array.isArray(m["content"])) {
        text = (m["content"] as unknown[]).map((c) => (isObj(c) && typeof c["text"] === "string" ? c["text"] : "")).join("\n");
      } else if (typeof m["content"] === "string") text = m["content"];
      const ts = resolveTs(m["created_at"]);
      return {
        externalId: `${uuid}_${i}`, // legacy externalId grammar, preserved
        role: roleOf(sender === "human" ? "user" : sender),
        content: text,
        ts: ts.ts,
        tsEstimated: ts.estimated,
      };
    });
    rows.push({
      data: {
        kind: "import.conversation", source: "claude", externalId: uuid, title,
        createdAt: create.ts, updatedAt: update.ts, messageCount: messages.length,
      } satisfies ImportChunkData,
      final: false,
    });
    for (const m of messages) {
      rows.push({
        data: { kind: "import.message", source: "claude", conversationExternalId: uuid, ...m } satisfies ImportChunkData,
        final: false,
      });
    }
  }
  return rows;
}

// ---- gemini (author mapping, preserved) ---------------------------------------

function parseGeminiExport(raw: unknown): ParsedChunk[] {
  if (!Array.isArray(raw)) {
    throw new Error("vivim-chat import parser (gemini): export must be a JSON array of conversations");
  }
  const rows: ParsedChunk[] = [];
  for (let ci = 0; ci < raw.length; ci++) {
    const conv = raw[ci];
    if (!isObj(conv) || !Array.isArray(conv["messages"])) {
      throw new Error(`vivim-chat import parser (gemini): conversations[${ci}] must be an object with messages`);
    }
    const id = typeof conv["id"] === "string" ? conv["id"] : `conv_${ci}`;
    const title = typeof conv["title"] === "string" ? conv["title"] : "";
    const messages = (conv["messages"] as unknown[]).map((m, i) => {
      if (!isObj(m)) throw new Error(`vivim-chat import parser (gemini): messages[${i}] must be an object`);
      const ts = resolveTs(m["timestamp"]);
      return {
        externalId: `${id}_${i}`, // legacy externalId grammar, preserved
        role: m["author"] === "model" ? "assistant" as const : "user" as const,
        content: typeof m["content"] === "string" ? m["content"] : "",
        ts: ts.ts,
        tsEstimated: ts.estimated,
      };
    });
    const firstTs = messages.find((m) => !m.tsEstimated)?.ts ?? 0; // legacy first-message rule, clock-free
    rows.push({
      data: {
        kind: "import.conversation", source: "gemini", externalId: id, title,
        createdAt: firstTs, updatedAt: firstTs, messageCount: messages.length,
      } satisfies ImportChunkData,
      final: false,
    });
    for (const m of messages) {
      rows.push({
        data: { kind: "import.message", source: "gemini", conversationExternalId: id, ...m } satisfies ImportChunkData,
        final: false,
      });
    }
  }
  return rows;
}

export interface ParserDef {
  providerId: ImportSource;
  archetypeSlug: string;
  version: string;
  transform: (exportText: string) => ParsedChunk[];
}

const TRANSFORMS: Record<ImportSource, (raw: unknown) => ParsedChunk[]> = {
  chatgpt: parseChatgptExport,
  claude: parseClaudeExport,
  gemini: parseGeminiExport,
};

function makeDef(source: ImportSource): ParserDef {
  return {
    providerId: source,
    archetypeSlug: IMPORT_PARSER_ARCHETYPE,
    version: IMPORT_PARSER_VERSION,
    transform: (exportText: string): ParsedChunk[] => {
      if (typeof exportText !== "string" || exportText.length === 0) {
        throw new Error(`vivim-chat import parser (${source}): export text must be a non-empty string`);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(exportText);
      } catch (e) {
        throw new Error(`vivim-chat import parser (${source}): export text is not valid JSON: ${String(e)}`);
      }
      const rows = TRANSFORMS[source](raw);
      if (rows.length === 0) {
        throw new Error(`vivim-chat import parser (${source}): export parsed to zero rows (an import must carry at least one conversation)`);
      }
      const last = rows[rows.length - 1]!;
      if (last.final) throw new Error("vivim-chat import parser: internal law break (final row before terminator)");
      return [...rows, { data: { kind: "import.done", source, conversations: countConversations(rows) }, final: true }] as ParsedChunk[];
    },
  };
}

function countConversations(rows: ParsedChunk[]): number {
  return rows.filter((r) => (r.data as ImportChunkData).kind === "import.conversation").length;
}

/** The registry — provider source → def. Shipped parsers ONLY: entries here
 *  are manifest-declared, signed contribution data (D-355); nothing registers
 *  at runtime (a runtime register API would be an unsigned side door). */
export const PARSERS: Record<ImportSource, ParserDef> = {
  chatgpt: makeDef("chatgpt"),
  claude: makeDef("claude"),
  gemini: makeDef("gemini"),
};

/** Resolve the parser for a source's pinned identity. Fail-closed: an unknown
 *  source or version is a refusal (a version mismatch is D-355's whole point
 *  — an export-format change shows up as a named refusal, never a silent
 *  fallback and never a heuristic guess). */
export function resolveImportParser(providerId: string, version: string): ParserDef {
  if (!(IMPORT_SOURCES as readonly string[]).includes(providerId)) {
    throw new Error(`vivim-chat: no import parser for source ${JSON.stringify(providerId)} (want chatgpt|claude|gemini) — refusing (fail-closed genealogy)`);
  }
  const def = PARSERS[providerId as ImportSource];
  if (def.version !== version) {
    throw new Error(`vivim-chat: import parser for ${providerId} is pinned at ${def.version}, realization asked for ${JSON.stringify(version)} — refusing (fail-closed genealogy)`);
  }
  return def;
}
