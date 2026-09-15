// vivim.law — consent.ts
// The consent table. EXTERNAL_MUTATION-class ops run only with a matching, ACTIVE,
// revocable consent grant. Consent ids are stable hashes of (principal, op) so a
// refusal can name the exact consent the user must grant. Each grant carries a
// generation counter: revocation bumps it, so grants are scoped AND revocable.
import type { ConsentGrant } from "@vivim/omega-contracts";

/** FNV-derived 64-bit-ish stable hash (pure, import-free — no node:crypto in the compartment). */
function stableHash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (i + c + 1), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const CONSENT_ID_RE = /^consent_[0-9a-f]{16}$/;

/** Stable consent id for a (principal, op) pair — deterministic across boots. */
export function consentIdFor(principal: string, op: string): string {
  return `consent_${stableHash(`${principal}\u0000${op}`)}`;
}

/** A grant record: the wire ConsentGrant plus law-internal revocation state. */
export interface ConsentRecord extends ConsentGrant {
  generation: number; // bumped on every grant/revoke of this id (revocable, scoped)
  active: boolean;
  revokedAt?: number;
}

export interface GrantOptions {
  principal?: string; // narrows matching when set (must equal the requesting principal)
  scope?: string;     // narrows matching when set (must equal the gated op)
}

export class ConsentTable {
  private grants = new Map<string, ConsentRecord>();
  private gen = 0;

  /** The consent id a refusal should name for this principal+op. */
  requireConsent(principal: string, op: string): string {
    return consentIdFor(principal, op);
  }

  /** Grant (or re-grant) a consent. Returns the ConsentGrant wire shape. */
  grant(consentId: string, opts: GrantOptions = {}): ConsentRecord {
    if (!CONSENT_ID_RE.test(consentId)) {
      throw new Error(`consent.grant: malformed consentId '${consentId}' (expected consent_<16 hex>)`);
    }
    this.gen++;
    const rec: ConsentRecord = {
      consentId,
      ...(opts.principal !== undefined ? { principal: opts.principal } : {}),
      ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
      grantedAt: Date.now(),
      generation: this.gen,
      active: true,
    };
    this.grants.set(consentId, rec);
    return rec;
  }

  /** Explicit deny-revoke. Returns true when an active grant was revoked. */
  revoke(consentId: string): boolean {
    const rec = this.grants.get(consentId);
    if (!rec || !rec.active) return false;
    rec.active = false;
    rec.revokedAt = Date.now();
    this.gen++;
    return true;
  }

  /** A grant matches when its id matches (stable hash) AND every narrowing field matches. */
  hasMatchingGrant(principal: string, op: string): ConsentRecord | null {
    const rec = this.grants.get(consentIdFor(principal, op));
    if (!rec || !rec.active) return null;
    if (rec.principal !== undefined && rec.principal !== principal) return null;
    if (rec.scope !== undefined && rec.scope !== op) return null;
    return rec;
  }

  activeCount(): number {
    let n = 0;
    for (const rec of this.grants.values()) if (rec.active) n++;
    return n;
  }

  list(): ConsentRecord[] {
    return [...this.grants.values()].map((r) => ({ ...r }));
  }

  /** Active grants narrowed to one principal (D-353 — the describe read's
   *  consent slice). Hash-keyed grants WITHOUT a principal are honestly
   *  excluded: they cannot be attributed to anyone, so listing them here
   *  would overstate what this principal holds. Revoked grants excluded. */
  listFor(principal: string): ConsentRecord[] {
    return [...this.grants.values()].filter((r) => r.active && r.principal === principal).map((r) => ({ ...r }));
  }

  /** Table generation — the per-grant generation counter (monotone). */
  generation(): number {
    return this.gen;
  }
}
