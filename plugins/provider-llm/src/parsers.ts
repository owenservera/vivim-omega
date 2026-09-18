// plugins/provider-llm — parsers.ts (W1/T-04 harvest, D-355 governance)
//
// The version-pinned SSE framing parser: the legacy `createSSEParser`
// algorithm (vivim-final-program@4a5eb84, src/engines/parsers/sse-parser.ts,
// 73 lines, pure) re-expressed as parser CONTRIBUTION DATA per
// 30-TRIAGE/HARVEST-PATTERN.md:
//   * the algorithm is preserved (buffer across feeds, `event:`/`data:`
//     fields, blank-line frame boundary, multi-line data joined with "\n",
//     comments and unknown lines silently ignored);
//   * the I/O is re-expressed: legacy SSEFrame[] → M1 ParsedChunk[]
//     (contracts/src/parser.ts), exactly-one-final by construction — the
//     `[DONE]` sentinel (OpenAI style) or the `message_stop` frame closes
//     the parse; a stream that ends without a terminator REFUSES
//     (fail-closed — an unterminated stream cannot lawfully terminate);
//   * the transport stays OFF: no fetch, no ports, no clock, no side
//     effects — the transform touches ONLY its argument, so its entire
//     output channel is the ordered ParsedChunk[] the caller assembles
//     through buildChunkEnvelope (the envelope test is the falsifier).
//
// NOT routable: this is governance data (D-355) — the `parser` contribution
// declared in plugin.json registers no op and never enters a route table.
//
// Recorded sessions ONLY (W1 fixture pipeline): this parser consumes the
// recorded stream text carried by fixtures/sse/ — never a live network body.
import type { ParsedChunk } from "@vivim/omega-contracts";

/** The shipped parser version — MUST match the manifest's parser contribution
 *  version (the realization bar compares the pin against THIS value via the
 *  manifest, so registry/manifest drift is a refusal, never a fallback). */
export const LLM_PARSER_VERSION = "1";

/** The parser's provider identity (the `llm` in `parser:chat.complete:llm`). */
export const LLM_PARSER_PROVIDER = "llm";

/** The archetype this parser realizes: `parser:chat.complete:llm`. */
export const LLM_PARSER_ARCHETYPE = "chat.complete";

/** One decoded SSE frame — the legacy SSEFrame shape, kept as the algorithm's
 *  intermediate (the harvest keeps the algorithm, re-expresses only the I/O). */
export interface SSEFrame {
  type: "event" | "data";
  value: string;
  eventType?: string;
}

/** Frame-decoding stage — the legacy algorithm, verbatim behavior: stateful
 *  buffer across feeds, blank line ends a frame, comments ignored. Exported
 *  for the envelope tests (the algorithm is the harvested artifact). */
export function createSSEParser(): { feed(chunk: string): SSEFrame[] } {
  let buffer = "";
  return {
    feed(chunk: string): SSEFrame[] {
      buffer += chunk;
      const frames: SSEFrame[] = [];
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // last element may be incomplete — keep buffered

      let currentData = "";
      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData += (currentData ? "\n" : "") + line.slice(5).trim();
        } else if (line.trim() === "") {
          if (currentData || currentEvent) {
            frames.push({
              type: currentEvent ? "event" : "data",
              value: currentData,
              eventType: currentEvent || undefined,
            });
            currentData = "";
            currentEvent = "";
          }
        }
        // comments (`:` prefix) and unknown lines silently ignored (legacy law)
      }
      return frames;
    },
  };
}

const TERMINATOR_DATA = "[DONE]"; // OpenAI-style sentinel (legacy wire law)
const TERMINATOR_EVENT = "message_stop"; // Anthropic-style closing event

/** The parsed-stream summary row shapes (the only rows this parser emits). */
export type SseChunkData =
  | { kind: "sse.frame"; source: "event" | "data"; eventType?: string; bytes: number }
  | { kind: "sse.delta"; text: string }
  | { kind: "sse.done"; frames: number; terminator: "sentinel" | "event" };

/** Is this frame the stream terminator? (OpenAI `[DONE]` sentinel, or an
 *  Anthropic-style `message_stop` event.) */
function isTerminator(f: SSEFrame): boolean {
  if (f.type === "data" && f.value.trim() === TERMINATOR_DATA) return true;
  return f.type === "event" && f.eventType === TERMINATOR_EVENT;
}

/** The v1 transform: recorded SSE stream text → ordered ParsedChunk rows.
 *  Deterministic — the same text always yields the same rows in the same
 *  order, with exactly one final row at the tail (buildChunkEnvelope
 *  re-checks the law at assembly). Delta text rows carry the OpenAI
 *  `choices[].delta.content` extraction; every frame also lands a summary
 *  row so the provenance chain stays attributable frame-by-frame. */
export function parseSseStream(text: string): ParsedChunk[] {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("provider-llm parser: stream text must be a non-empty string");
  }
  const parser = createSSEParser();
  const frames = parser.feed(text);
  if (parser.feed("").length > 0) {
    throw new Error("provider-llm parser: flush produced frames (buffering invariant broken)");
  }
  if (frames.length === 0) {
    throw new Error("provider-llm parser: stream carried zero complete frames (recorded streams must be complete)");
  }
  const last = frames[frames.length - 1]!;
  if (!isTerminator(last)) {
    throw new Error(
      `provider-llm parser: stream is unterminated (last frame is ${last.type}${last.eventType ? `:${last.eventType}` : ""}; want data:[DONE] or event:message_stop) — refusing (fail-closed, an unterminated stream cannot terminate lawfully)`,
    );
  }

  const rows: ParsedChunk[] = [];
  for (const f of frames) {
    if (isTerminator(f)) {
      rows.push({
        data: { kind: "sse.done", frames: frames.length, terminator: f.type === "data" ? "sentinel" : "event" } satisfies SseChunkData,
        final: true,
      });
      break; // exactly-one-final: the terminator is the last row by construction
    }
    rows.push({
      data: { kind: "sse.frame", source: f.type, eventType: f.eventType, bytes: f.value.length } satisfies SseChunkData,
      final: false,
    });
    const delta = extractDelta(f.value);
    if (delta !== null) {
      rows.push({ data: { kind: "sse.delta", text: delta } satisfies SseChunkData, final: false });
    }
  }
  return rows;
}

/** Extract the OpenAI-style content delta from a frame payload, or null when
 *  the frame carries none (keep-alives, role-only deltas, non-JSON data).
 *  Deterministic and total: junk returns null, never throws. */
export function extractDelta(dataValue: string): string | null {
  const trimmed = dataValue.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null; // non-JSON data frame — attributable as a bare frame row
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const choices = (parsed as Record<string, unknown>)["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
  const delta = (first as Record<string, unknown>)["delta"];
  if (delta === null || typeof delta !== "object" || Array.isArray(delta)) return null;
  const content = (delta as Record<string, unknown>)["content"];
  return typeof content === "string" ? content : null;
}

export interface ParserDef {
  providerId: string;
  archetypeSlug: string;
  version: string;
  transform: (streamText: string) => ParsedChunk[];
}

/** The registry — parser version → def. Shipped parsers ONLY: entries here
 *  are manifest-declared, signed contribution data (D-355); nothing registers
 *  at runtime (a runtime register API would be an unsigned side door). */
export const PARSERS: Record<string, ParserDef> = {
  [LLM_PARSER_VERSION]: {
    providerId: LLM_PARSER_PROVIDER,
    archetypeSlug: LLM_PARSER_ARCHETYPE,
    version: LLM_PARSER_VERSION,
    transform: parseSseStream,
  },
};

/** Resolve the parser for a realization's pinned version. Fail-closed: an
 *  unknown pin version is a refusal (a version mismatch is D-355's whole
 *  point — a provider wire change shows up as a named refusal, never a
 *  silent fallback). */
export function resolveParser(version: string): ParserDef {
  const def = PARSERS[version];
  if (!def) {
    throw new Error(`provider-llm: no parser pinned at version ${JSON.stringify(version)} — refusing (fail-closed genealogy)`);
  }
  return def;
}
