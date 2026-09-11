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
  | { ok: false; error: PortErrorCode; detail?: string };

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
