// plugins/provider-browser — session.ts (D-357, M0)
// Pure record mapping + fail-closed validators for the two vault rows this
// plugin owns (ns "providers", written by THIS plugin only — verification
// owns the realization rows):
//   capture:<uuid> — the REDACTED capture text (M12/D-356: redact-before-
//     vault; the integrity hash is computed over the already-redacted bytes,
//     which are the only bytes that exist).
//   session:<uuid> — the session bookkeeping row: BY REFERENCE ONLY. The
//     session never embeds capture bytes — it cites the capture row.
// Import-safe for unit tests (port calls live in index.ts).

/** Vault namespace for sessions + captures (shared with realizations). */
export const PROVIDERS_NS = "providers";

export const SESSION_ID_PREFIX = "session:";
export const CAPTURE_ID_PREFIX = "capture:";

/** The vault record for one capture (the redacted bytes are the data). */
export interface CaptureRecord {
  archetypeSlug: string;
  parserVersion: string;
  redactedText: string;
  redactions: number;
  integrity: string;   // sha256 hex over redactedText — the only byte string
  capturedAt: number;
}

/** The vault record for one attached session (references, never bytes). */
export interface SessionRecord {
  sessionId: string;
  providerId: "browser";
  archetypeSlug: string;
  parserVersion: string;
  captureRef: { ns: string; id: string; rev: number };
  status: "ATTACHED" | "RELEASED";
  sim: true;            // in-sandbox sessions are sim fixtures by construction
  createdAt: number;
}

export function sessionId(parts: string): string {
  return `${SESSION_ID_PREFIX}${parts}`;
}

export function captureId(parts: string): string {
  return `${CAPTURE_ID_PREFIX}${parts}`;
}

function requireNonEmpty(op: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${op}: ${field} must be a non-empty string`);
  return v;
}

/** Build the capture record (already-redacted bytes in, record out). */
export function buildCaptureRecord(input: {
  archetypeSlug: string; parserVersion: string; redactedText: string; redactions: number; integrity: string;
}): CaptureRecord {
  const archetypeSlug = requireNonEmpty("browser.attach@1", "archetypeSlug", input.archetypeSlug);
  const parserVersion = requireNonEmpty("browser.attach@1", "parserVersion", input.parserVersion);
  if (typeof input.redactedText !== "string" || input.redactedText.length === 0) {
    throw new Error("browser.attach@1: redactedText must be a non-empty string");
  }
  if (!Number.isInteger(input.redactions) || input.redactions < 0) {
    throw new Error("browser.attach@1: redactions must be an integer >= 0");
  }
  if (typeof input.integrity !== "string" || !/^[0-9a-f]{64}$/.test(input.integrity)) {
    throw new Error("browser.attach@1: integrity must be a sha256 hex digest over the redacted bytes");
  }
  return {
    archetypeSlug,
    parserVersion,
    redactedText: input.redactedText,
    redactions: input.redactions,
    integrity: input.integrity,
    capturedAt: Date.now(),
  };
}

/** Build the session record (capture row already appended — the ref is real). */
export function buildSessionRecord(input: {
  sessionId: string; archetypeSlug: string; parserVersion: string;
  captureRef: { ns: string; id: string; rev: number };
}): SessionRecord {
  const sid = requireNonEmpty("browser.attach@1", "sessionId", input.sessionId);
  if (!sid.startsWith(SESSION_ID_PREFIX)) {
    throw new Error("browser.attach@1: sessionId must use the session: prefix");
  }
  const cr = input.captureRef;
  if (!cr || typeof cr !== "object" || typeof cr.ns !== "string" || typeof cr.id !== "string"
    || !Number.isInteger(cr.rev) || cr.rev < 1) {
    throw new Error("browser.attach@1: captureRef must be a {ns, id, rev >= 1} vault ref");
  }
  return {
    sessionId: sid,
    providerId: "browser",
    archetypeSlug: requireNonEmpty("browser.attach@1", "archetypeSlug", input.archetypeSlug),
    parserVersion: requireNonEmpty("browser.attach@1", "parserVersion", input.parserVersion),
    captureRef: cr,
    status: "ATTACHED",
    sim: true,
    createdAt: Date.now(),
  };
}

/** Vault row → SessionRecord, or null when malformed (readers skip, never throw). */
export function asSessionRecord(data: unknown): SessionRecord | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.sessionId !== "string" || !r.sessionId.startsWith(SESSION_ID_PREFIX)) return null;
  if (r.providerId !== "browser") return null;
  if (typeof r.archetypeSlug !== "string" || r.archetypeSlug.length === 0) return null;
  if (typeof r.parserVersion !== "string" || r.parserVersion.length === 0) return null;
  const cr = r.captureRef as Record<string, unknown> | undefined;
  if (!cr || typeof cr.ns !== "string" || typeof cr.id !== "string" || !Number.isInteger(cr.rev) || (cr.rev as number) < 1) return null;
  if (r.status !== "ATTACHED" && r.status !== "RELEASED") return null;
  if (r.sim !== true) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  return {
    sessionId: r.sessionId,
    providerId: "browser",
    archetypeSlug: r.archetypeSlug,
    parserVersion: r.parserVersion,
    captureRef: { ns: cr.ns, id: cr.id, rev: cr.rev as number },
    status: r.status,
    sim: true,
    createdAt: r.createdAt,
  };
}

/** Vault row → CaptureRecord, or null when malformed. */
export function asCaptureRecord(data: unknown): CaptureRecord | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.archetypeSlug !== "string" || r.archetypeSlug.length === 0) return null;
  if (typeof r.parserVersion !== "string" || r.parserVersion.length === 0) return null;
  if (typeof r.redactedText !== "string" || r.redactedText.length === 0) return null;
  if (!Number.isInteger(r.redactions) || (r.redactions as number) < 0) return null;
  if (typeof r.integrity !== "string" || !/^[0-9a-f]{64}$/.test(r.integrity)) return null;
  if (typeof r.capturedAt !== "number" || !Number.isFinite(r.capturedAt)) return null;
  return {
    archetypeSlug: r.archetypeSlug,
    parserVersion: r.parserVersion,
    redactedText: r.redactedText,
    redactions: r.redactions as number,
    integrity: r.integrity,
    capturedAt: r.capturedAt,
  };
}
