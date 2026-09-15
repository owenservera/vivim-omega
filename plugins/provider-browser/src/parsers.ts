// plugins/provider-browser — parsers.ts (D-355/D-357)
// The version-pinned parser registry: parser transforms as PURE, deterministic
// functions over the captured page text. D-354's isolation law lives here as
// data: a transform touches ONLY its argument — no ports, no tokens, no host
// calls, no clock — so its entire output channel is the ordered ParsedChunk[]
// the handler assembles into M1 envelopes and emits under the shim's sequence
// discipline. Nothing in this file imports anything but contracts.
//
// The transforms are DISCOVERY-DERIVED governance data (D-355): each one
// exists because a recorded session for the archetype exists (the fixture
// capture), and the pin's evidence trail is the promotion event that verified
// the realization carrying the pin.
import type { ParsedChunk } from "@vivim/omega-contracts";

/** The shipped parser version — MUST match the manifest's parser contribution
 *  version (the D-357 realization bar compares the pin against THIS value via
 *  the manifest, so a registry/manifest drift is a refusal, never a fallback). */
export const PARSER_VERSION = "1";

export interface CaptureFixture {
  url: string;
  recordedAt: number;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  response: { status: number; headers: Record<string, string>; body: string };
  events: Array<{ type: string; target: string; latencyMs: number }>;
}

export interface SendWindow {
  url: string;
  method: string;
  to: string;
  subject: string;
}

/** Parse an unknown capture text into the fixture shape. Fail-closed: junk
 *  throws with the parse reason (attributable DEGRADED at the boundary). */
export function parseCapture(text: string): CaptureFixture {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`provider-browser: capture text is not valid JSON: ${String(e)}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("provider-browser: capture must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const req = o.request as Record<string, unknown> | undefined;
  const res = o.response as Record<string, unknown> | undefined;
  if (typeof o.url !== "string" || o.url.length === 0) throw new Error("provider-browser: capture.url must be a non-empty string");
  if (!req || typeof req.url !== "string" || typeof req.method !== "string" || typeof req.body !== "string") {
    throw new Error("provider-browser: capture.request must be {method, url, headers?, body}");
  }
  if (!res || typeof res.status !== "number") throw new Error("provider-browser: capture.response.status must be a number");
  if (!Array.isArray(o.events)) throw new Error("provider-browser: capture.events must be an array");
  const headersOf = (h: unknown): Record<string, string> =>
    h !== undefined && h !== null && typeof h === "object" && !Array.isArray(h) ? h as Record<string, string> : {};
  return {
    url: o.url,
    recordedAt: typeof o.recordedAt === "number" ? o.recordedAt : 0,
    request: { method: req.method, url: req.url, headers: headersOf(req.headers), body: req.body },
    response: { status: res.status, headers: headersOf(res.headers), body: typeof res.body === "string" ? res.body : "" },
    events: (o.events as unknown[]).map((e, i) => {
      if (e === null || typeof e !== "object" || Array.isArray(e)) {
        throw new Error(`provider-browser: capture.events[${i}] must be an object`);
      }
      const ev = e as Record<string, unknown>;
      if (typeof ev.type !== "string" || typeof ev.target !== "string") {
        throw new Error(`provider-browser: capture.events[${i}] must be {type, target, latencyMs?}`);
      }
      return { type: ev.type, target: ev.target, latencyMs: typeof ev.latencyMs === "number" ? ev.latencyMs : 0 };
    }),
  };
}

/** The recorded send window a replay must match: the capture's request line
 *  plus the compose fields parsed from the recorded body. Throws when the
 *  recorded body carries no parsable {to, subject} — a capture that never
 *  sent a message cannot ground a message.send replay (fail-closed). */
export function deriveSendWindow(capture: CaptureFixture): SendWindow {
  let body: unknown;
  try {
    body = JSON.parse(capture.request.body);
  } catch {
    throw new Error("provider-browser: capture.request.body is not JSON — no send window derivable");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.to !== "string" || !b.to.includes("@") || typeof b.subject !== "string" || b.subject.length === 0) {
    throw new Error("provider-browser: capture.request.body must carry {to, subject} to ground a message.send replay");
  }
  return { url: capture.request.url, method: capture.request.method, to: b.to, subject: b.subject };
}

/** Parse an unknown capture text into a SendWindow in one step (attach path). */
export function deriveSendWindowFromText(text: string): SendWindow {
  return deriveSendWindow(parseCapture(text));
}

/** Registry shape: version → transform. A transform maps the capture text to
 *  its ordered chunk rows — the ONLY thing a parser may do (D-354). */
export type ParserTransform = (captureText: string) => ParsedChunk[];

export interface ParserDef {
  providerId: "browser";
  archetypeSlug: string;
  version: string;
  transform: ParserTransform;
}

/** v1 message.send parser: the fixture replay. Deterministic — the same
 *  capture text always yields the same rows, in the same order, with exactly
 *  one final row at the tail (buildChunkEnvelope re-checks this at assembly). */
const messageSendV1: ParserTransform = (captureText: string): ParsedChunk[] => {
  const capture = parseCapture(captureText);
  const window = deriveSendWindow(capture);
  return [
    { data: { kind: "replay.start", url: window.url, method: window.method, recordedAt: capture.recordedAt }, final: false },
    { data: { kind: "replay.message", to: window.to, subject: window.subject }, final: false },
    ...capture.events.map((e, i): ParsedChunk => ({
      data: { kind: "replay.event", index: i, type: e.type, target: e.target, latencyMs: e.latencyMs },
      final: false,
    })),
    { data: { kind: "replay.done", events: capture.events.length, status: capture.response.status }, final: true },
  ];
};

/** The registry — parser version → def. Shipped parsers ONLY: entries here
 *  are manifest-declared, signed contribution data (D-355); nothing registers
 *  at runtime (a runtime register API would be an unsigned side door). */
export const PARSERS: Record<string, ParserDef> = {
  [PARSER_VERSION]: {
    providerId: "browser",
    archetypeSlug: "message.send",
    version: PARSER_VERSION,
    transform: messageSendV1,
  },
};

/** Resolve the parser for a session's pinned version. Fail-closed: an unknown
 *  pin version is a refusal (a version mismatch is D-355's whole point). */
export function resolveParser(version: string): ParserDef {
  const def = PARSERS[version];
  if (!def) {
    throw new Error(`provider-browser: no parser pinned at version ${JSON.stringify(version)} — refusing (fail-closed genealogy)`);
  }
  return def;
}
