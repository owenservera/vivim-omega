// vivim-law — principal.ts (D-412, Core Phase S2)
// The principal-identity seam: identity ROWS with the non-reuse invariant.
//
// Principals are strings everywhere (consent grants, forbidden overlays,
// journal rows, graph nodes — D-336's prefix law). Late key-binding (devices,
// quorum, rotation — the identity constitution's atoms) is safe ONLY if a
// principal string was never ambiguous and never recycled. This module is the
// insurance: a principal record namespace whose rows are permanent, so future
// key material attaches to records instead of re-typing keyed history.
//
// Pure record mapping only — the port calls live in index.ts so this module
// stays import-safe for unit tests (same split as forbidden.ts).
//
// Non-commitments (per the structural analysis §4.2): no crypto, no pairing,
// no rotation — the indirection only. The record IS the seam.

import { principalKind } from "@vivim/omega-contracts";

/** Vault namespace owning principal identity records. Writer: vivim.law only. */
export const PRINCIPAL_NS = "principal";

/** The principal record's lifecycle — "retired" is FOREVER (non-reuse). */
export type PrincipalState = "active" | "retired";

/** The vault record shape for one principal's identity row. */
export interface PrincipalRecord {
  principal: string;
  kind: string; // principalKind() of the string at registration — display metadata, never authority
  registeredAt: number;
  state: PrincipalState;
  retiredAt?: number;
  generation: number; // bumped on every record append (register=1, retire=2)
}

/** Validate a principal string: non-empty, no control chars, ≤ 200 chars. */
export function requirePrincipal(p: unknown): string {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("principal: must be a non-empty string");
  }
  if (p.length > 200) {
    throw new Error(`principal: '${p.slice(0, 24)}…' exceeds 200 chars`);
  }
  if (/[\u0000-\u001f\u007f]/.test(p)) {
    throw new Error("principal: control characters refused");
  }
  return p;
}

/** Vault object id for a principal's identity row: the principal string itself. */
export function principalVaultId(p: unknown): string {
  return requirePrincipal(p);
}

/** Pure mapping: a fresh active record (generation 1). */
export function newRecord(principal: string): PrincipalRecord {
  const p = requirePrincipal(principal);
  return { principal: p, kind: principalKind(p), registeredAt: Date.now(), state: "active", generation: 1 };
}

/** Pure mapping: the retired successor of an active record (generation +1). */
export function retireRecord(rec: PrincipalRecord): PrincipalRecord {
  if (rec.state !== "active") {
    throw new Error(`principal.record: cannot retire a ${rec.state} record`);
  }
  return { ...rec, state: "retired", retiredAt: Date.now(), generation: rec.generation + 1 };
}

/** Pure mapping: vault data → record. Null when malformed (skipped, never throws). */
export function fromRecord(data: unknown): PrincipalRecord | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r["principal"] !== "string" || r["principal"].length === 0) return null;
  if (r["state"] !== "active" && r["state"] !== "retired") return null;
  if (typeof r["registeredAt"] !== "number") return null;
  if (typeof r["generation"] !== "number") return null;
  return {
    principal: r["principal"],
    kind: typeof r["kind"] === "string" ? r["kind"] : "unknown",
    registeredAt: r["registeredAt"],
    state: r["state"],
    ...(typeof r["retiredAt"] === "number" ? { retiredAt: r["retiredAt"] } : {}),
    generation: r["generation"],
  };
}
