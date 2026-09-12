// vivim.law — forbidden.ts
// Per-principal forbidden-action overlay: contract ids a principal may never
// invoke, regardless of what its capability token would otherwise permit.
//
// This is the enforcement side of BehaviorContract.forbiddenActions
// (contracts/src/agent.ts): agent.spawn registers the list here via
// law.forbidden.set@1, and law.check@1 denies matches before policy
// evaluation. Capability scope (token attenuation) and forbidden policy are
// separate checks through the one gate every mutation passes through —
// no second host-invisible choke point.
//
// Memory-only like ConsentTable: the durable policy path is recipe amendment.
// A compartment restart drops the overlay (fail-closed direction: entries
// vanish, so previously-forbidden calls fall back to normal policy — the
// agent plugin re-registers on spawn; boot-time re-registration is a
// documented v0 limitation, not silent policy).

export interface ForbiddenEntry {
  principal: string;
  ops: string[]; // exact contract ids, e.g. "message.send@1"
}

function requirePrincipal(principal: unknown): string {
  if (typeof principal !== "string" || principal.length === 0) {
    throw new Error(`forbidden: principal must be a non-empty string (got ${JSON.stringify(principal)})`);
  }
  return principal;
}

function requireOps(ops: unknown): string[] {
  if (!Array.isArray(ops)) {
    throw new Error("forbidden: ops must be an array of contract-id strings");
  }
  const out: string[] = [];
  for (const o of ops) {
    if (typeof o !== "string" || o.length === 0) {
      throw new Error(`forbidden: every op must be a non-empty string (got ${JSON.stringify(o)})`);
    }
    out.push(o);
  }
  // Matching is exact-equality at check time, so unknown shapes are inert —
  // shape-strict here, content-permissive (same discipline as consent scopes).
  return [...new Set(out)].sort();
}

export class ForbiddenTable {
  private entries = new Map<string, string[]>();

  /** Replace the principal's forbidden list (empty array clears it). */
  set(principal: string, ops: string[]): ForbiddenEntry {
    const p = requirePrincipal(principal);
    const list = requireOps(ops);
    if (list.length === 0) this.entries.delete(p);
    else this.entries.set(p, list);
    return { principal: p, ops: list };
  }

  /** True iff this exact (principal, op) pair is forbidden. */
  isForbidden(principal: string, op: string): boolean {
    if (typeof principal !== "string" || typeof op !== "string") return false;
    return this.entries.get(principal)?.includes(op) ?? false;
  }

  /** Explicit clear. Returns true when an entry was removed. */
  clear(principal: string): boolean {
    return this.entries.delete(requirePrincipal(principal));
  }

  /** Audit view (defensive copies). */
  list(): ForbiddenEntry[] {
    return [...this.entries.entries()].map(([principal, ops]) => ({ principal, ops: [...ops] }));
  }
}
