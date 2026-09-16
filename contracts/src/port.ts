// @vivim/omega-contracts — port.ts
// The only wire between compartments (B2). Pinned in D3 03-WAVE-SPECS §1.
// Changing any shape here after Ω4 is an amendment-class event.

export type Freshness = "CURRENT" | "LAGGING" | "STALE";

export type PortErrorCode = "REFUSED" | "REVOKED" | "SCOPE" | "BUDGET" | "DEGRADED";

export interface PortMessage {
  causationId: string;      // host-minted root id, chained per call graph
  capabilityToken: string;  // opaque; verified host-side only (B3)
  op: string;               // "vault.append@1" | "law.check@1" | "message.send@1"
  payload: unknown;         // structured-clone-safe JSON (v1)
  deadlineMs: number;       // budget contract carrier
}

export type PortResult =
  | { ok: true; value: unknown; freshness?: Freshness; evidence?: { rev: string } }
  | { ok: false; error: PortErrorCode; detail?: string; refusal?: RefusalReport };

/** Attributable refusal (E-7 / SC-V07): refusals name the gate that refused,
 *  not just the register. Additive and optional — old consumers read
 *  error/detail exactly as before; new surfaces render rule/bar/consentId
 *  into confirm cards and audit rows. */
export interface RefusalReport {
  rule: string; // the gate: "law.check@1" | "default-gate (no law.check@1 routed)" | ordered-bar name
  principal?: string;
  op?: string;
  reason?: string;
  consentId?: string;
  bar?: string; // ordered-bar citation where applicable (e.g. "D-338/D-357 bar 1")
}

/** Decision shape returned by the `law.check@1` contract (the Gate step of the unified loop). */
export interface LawDecision {
  decision: "allow" | "deny" | "require-consent";
  reason?: string;
  principal?: string;
  consentId?: string;
}

/** Consent grant shape for the `law.consent.grant@1` contract. */
export interface ConsentGrant {
  consentId: string;
  principal?: string;
  scope?: string;
  grantedAt: number;
}

// ---- D-339 / D-352 — the additive second call shape (port.stream) ----------
// An ordered partial-delivery channel beside port.call. Additive law: a caller
// that never consumes chunks observes nothing — the terminating PortResult
// stays the single authoritative outcome, chunks are advisory prefixes of it.

/** Chunks are sequenced like the vault sequences revs: 1-based, contiguous. */
export const STREAM_SEQ_START = 1;

export interface StreamChunk {
  streamId: string; // the delivering call's causation id (one stream per call)
  seq: number;      // STREAM_SEQ_START + n, no gaps, no duplicates
  data: unknown;    // structured-clone-safe JSON (v1)
  final: boolean;   // exactly the last chunk; emit-after-final is a violation
}

/** Producer-side per-delivery emit. Strict seq + close-once: emitting after
 *  `final` throws (the shim converts the throw into a DEGRADED return — the
 *  fail-closed producer side of the "terminating result is authoritative" law). */
export type StreamEmit = (data: unknown, final?: boolean) => void;

/** Pure, TOTAL sequence check. Returns null when `chunk` legally follows a
 *  stream whose last delivered seq was `prevSeq` (0 = nothing delivered yet),
 *  else the violation reason. Mirrors the vault's rev discipline: no gaps, no
 *  duplicates, nothing before the stream start. */
export function checkStreamSeq(prevSeq: number, chunk: StreamChunk): string | null {
  if (!Number.isInteger(chunk.seq)) return `seq ${String(chunk.seq)} is not an integer`;
  if (chunk.seq < STREAM_SEQ_START) return `seq ${chunk.seq} precedes the stream start ${STREAM_SEQ_START}`;
  if (chunk.seq !== prevSeq + 1) return `seq ${chunk.seq} breaks contiguous order (expected ${prevSeq + 1})`;
  return null;
}

// ---- D-336 / D-353 — principal kinds (the human principal) ------------------
// `user:<id>` joins `agent:<id>` as a first-class identity prefix. The
// classifier is a pure TOTAL function: it never throws, and every string it
// does not recognize stays a LEGAL composition principal (plugin ids like
// "vivim.director" live here) — classification must never become rejection.

export type PrincipalKind = "agent" | "user" | "host" | "composition";

export function principalKind(principal: string): PrincipalKind {
  if (principal.startsWith("agent:")) return "agent";
  if (principal.startsWith("user:")) return "user";
  if (principal === "root" || principal.startsWith("µhost")) return "host";
  return "composition";
}
