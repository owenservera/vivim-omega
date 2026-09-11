// vivim.law — tokens.ts
// The capability-handle algebra: PURE functions, no I/O, structured-clone-safe output.
// A scope is a dot-string like `vault.append:ns=email`:
//   - the part before the first ":" is the dotted capability path,
//   - the rest are `k=v` constraint clauses (order-free, deduplicated — a SET).
// Permission ordering (the attenuation invariant):
//   a ⊑ b  (a is narrower than b, perms(a) ⊆ perms(b))  ⟺
//     path(b) is a segment-prefix of path(a)  (a names a more specific capability)
//     AND constraints(a) ⊇ constraints(b)      (a is intersected by MORE clauses)
// attenuate(parent, subset) mints a child handle for `subset` and THROWS unless
// subset ⊑ parent.scope — broadening is structurally impossible.

export interface Cap {
  scope: string;
  generation: number;
  parent?: string; // parent scope lineage (audit trail; attenuate fills it in)
}

export interface ParsedScope {
  path: string[];        // dotted path segments, e.g. ["vault","append"]
  constraints: string[]; // sorted unique "k=v" clauses, e.g. ["ns=email"]
}

const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const CONSTRAINT_RE = /^[a-zA-Z0-9_-]+=[^\s:=]+$/;

export function parseScope(scope: string): ParsedScope {
  if (typeof scope !== "string" || scope.length === 0 || scope.length > 512) {
    throw new Error(`tokens: malformed scope '${String(scope)}'`);
  }
  const parts = scope.split(":");
  const path = parts[0].split(".");
  if (path.some((s) => !SEGMENT_RE.test(s))) {
    throw new Error(`tokens: malformed scope path in '${scope}'`);
  }
  const constraints = [...new Set(parts.slice(1))].sort();
  for (const c of constraints) {
    if (!CONSTRAINT_RE.test(c)) throw new Error(`tokens: malformed constraint '${c}' in '${scope}'`);
  }
  return { path, constraints };
}

function pathPrefixOf(a: string[], b: string[]): boolean {
  // path(b) is a segment-prefix of path(a) (or equal): a is at-or-below b.
  if (b.length > a.length) return false;
  return b.every((seg, i) => seg === a[i]);
}

/** True iff scope a is at most as broad as scope b (perms(a) ⊆ perms(b)). */
export function isSubset(a: string, b: string): boolean {
  const pa = parseScope(a);
  const pb = parseScope(b);
  if (!pathPrefixOf(pa.path, pb.path)) return false;
  return pb.constraints.every((c) => pa.constraints.includes(c));
}

/** Mint a fresh capability handle (the root of an attenuation chain). */
export function mintCap(scope: string, generation = 1): Cap {
  parseScope(scope); // validate eagerly — mint is the trust boundary
  return { scope, generation };
}

/** Attenuate a parent handle down to `subset`; THROWS when subset ⊄ parent.scope. */
export function attenuate(parent: Cap, subset: string): Cap {
  if (!isSubset(subset, parent.scope)) {
    throw new Error(`tokens: attenuation violation — '${subset}' is not a subset of '${parent.scope}'`);
  }
  return { scope: subset, generation: parent.generation, ...(parent.scope !== subset ? { parent: parent.scope } : {}) };
}

/** Render a scope canonicalized (sorted constraints) — stable identity for hashing/journaling. */
export function canonicalScope(scope: string): string {
  const { path, constraints } = parseScope(scope);
  return [path.join("."), ...constraints].join(":");
}

/** Structural check for handles arriving over a port (no secrets — handles are data). */
export function isCap(v: unknown): v is Cap {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.scope === "string" && typeof c.generation === "number" && Number.isInteger(c.generation);
}
