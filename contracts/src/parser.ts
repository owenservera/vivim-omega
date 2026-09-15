// @vivim/omega-contracts — parser.ts
// D-355 (M7 re-land) — the parser governance vocabulary. Parsers are
// CONTRIBUTIONS, not blobs: a `parser` contribution declared in a provider's
// PluginManifest, signed and verified like every other contribution (never a
// `logic_code` string interpreted at runtime). A parser's entire job is
// "produce M1's chunk rows" — nothing else — so it cannot smuggle side
// effects. The isolation tier for parser EXECUTION is D-354 (plugin
// compartment, zero capabilities); this module is only the data grammar.
//
// NOT routable: the `parser` kind registers no op, appears in no route
// table, and is invisible to riskyOps() — governance data, not a surface.

import { STREAM_SEQ_START, type StreamChunk } from "./port.ts";
import { archetypeSlugForOp } from "./provider.ts";
/** One parsed output row — everything a parser may produce. `data` is
 *  structured-clone-safe JSON; `final` marks the closing row of the parse.
 *  The registry wraps ordered rows into StreamChunk envelopes mechanically:
 *  streamId = the delivering call's causation id, seq = 1-based contiguous
 *  (STREAM_SEQ_START + n) — the vault's rev discipline, checked producer-
 *  side by the shim's emit law (D-352). */
export interface ParsedChunk {
  data: unknown;
  final: boolean;
}

/** The version pin recorded on a realization: WHICH parser contribution,
 *  for WHICH provider, realizing WHICH archetype, the run was verified
 *  against (P-D3 genealogy — a provider DOM change that breaks parsing
 *  shows up as a pin mismatch, not a silent runtime failure). */
export interface ParserPin {
  providerId: string;      // "browser" — must not contain ':' (realization id grammar)
  archetypeSlug: string;   // "message.send" — the bare op name
  version: string;         // the parser contribution version, semver-ish "1"
}

/** Canonical contribution id for a parser pin: `parser:<archetype>:<provider>`
 *  (mirrors the realization id grammar; segments must not contain ':'). */
export function parserContributionId(providerId: string, archetypeSlug: string): string {
  requireSegment(providerId, "providerId");
  requireSegment(archetypeSlug, "archetypeSlug");
  return `parser:${archetypeSlug}:${providerId}`;
}

/** Total validation: parse an unknown value into a ParserPin or throw.
 *  Used by discovery.verify@1's provider input (fail-closed on junk) and by
 *  the provider-side pin registry (fail-closed on manifest drift). */
export function asParserPin(v: unknown): ParserPin {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("parserPin: must be an object {providerId, archetypeSlug, version}");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.providerId !== "string" || o.providerId.length === 0) {
    throw new Error("parserPin: providerId must be a non-empty string");
  }
  if (typeof o.archetypeSlug !== "string" || o.archetypeSlug.length === 0) {
    throw new Error("parserPin: archetypeSlug must be a non-empty string");
  }
  if (typeof o.version !== "string" || o.version.length === 0) {
    throw new Error("parserPin: version must be a non-empty string");
  }
  requireSegment(o.providerId, "providerId");
  requireSegment(o.archetypeSlug, "archetypeSlug");
  // The pin's archetype must be the BARE op name — a full op name here would
  // double the '@1' at every comparison site (defensive, fail-closed).
  if (o.archetypeSlug.includes("@")) {
    throw new Error("parserPin: archetypeSlug must be the bare op name (no '@version' suffix)");
  }
  archetypeSlugForOp(`${o.archetypeSlug}@1`); // canonical-grammar round-trip
  return { providerId: o.providerId, archetypeSlug: o.archetypeSlug, version: o.version };
}

/** Does `pin` cover exactly this (providerId, archetypeSlug, version)? The
 *  realization bar (D-357 bar 4) requires a covering pin for the manifest's
 *  parser version — mismatch = REFUSED, never a silent fallback. */
export function pinMatches(pin: ParserPin, providerId: string, archetypeSlug: string, version: string): boolean {
  return pin.providerId === providerId && pin.archetypeSlug === archetypeSlug && pin.version === version;
}

/** Registry-side mechanical assembly: ordered ParsedChunk rows → StreamChunk
 *  envelopes with the streamId pinned and seq 1-based contiguous, exactly one
 *  final row (the last). Throws on an empty parse (a stream of zero chunks
 *  has no final row and cannot terminate lawfully) or on a non-final tail —
 *  fail-closed before the shim ever sees a violating sequence. */
export function buildChunkEnvelope(streamId: string, parsed: ParsedChunk[]): StreamChunk[] {
  if (typeof streamId !== "string" || streamId.length === 0) {
    throw new Error("buildChunkEnvelope: streamId must be a non-empty string");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("buildChunkEnvelope: a parse must produce at least one chunk");
  }
  return parsed.map((c, i) => {
    if (c === null || typeof c !== "object" || Array.isArray(c)) {
      throw new Error(`buildChunkEnvelope: chunk ${i} is not a ParsedChunk`);
    }
    const last = i === parsed.length - 1;
    if (!last && c.final === true) {
      throw new Error(`buildChunkEnvelope: chunk ${i} is final but not last (exactly-one-final law)`);
    }
    if (last && c.final !== true) {
      throw new Error("buildChunkEnvelope: the last chunk must be final (terminating-chunk law)");
    }
    return { streamId, seq: STREAM_SEQ_START + i, data: c.data, final: c.final } satisfies StreamChunk;
  });
}

function requireSegment(v: string, name: string): void {
  if (v.includes(":")) throw new Error(`parserPin: ${name} must not contain ':' (id grammar)`);
}
