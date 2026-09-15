// plugins/vivim-credentials — record.ts (D-356, XC-2 write side)
// Pure record mapping + fail-closed validators. Import-safe for unit tests
// (the port calls live in index.ts — the law/vault split house discipline).
//
// The in-sandbox law (SURFACES.md credential law 3): live legs are
// owner-machine only. A credential row created in the sandbox is a
// sim-synthetic REFERENCE — metadata that names a credential, never the
// material itself. `sim` is a literal boolean on the record so downstream
// readers can trust the marker without re-deriving it.

/** Vault namespace owning credential reference rows. */
export const CREDENTIALS_NS = "credentials";

/** Vault id prefix: `credential:<credentialId>`. */
export const CREDENTIAL_ID_PREFIX = "credential:";

/** The one credential record shape (v0.1.0 — reference rows only). */
export interface CredentialRecord {
  credentialId: string;   // the BY-REFERENCE handle callers present to use@1
  kind: "sim-synthetic";  // the only kind creatable in-sandbox
  sim: true;              // literal true — the marker IS the type guard
  createdAt: number;
  meta?: Record<string, unknown>; // provenance-ish data (provider, purpose) — never material
}

/** Field names that mark a payload as carrying secret MATERIAL — a put
 *  carrying any of these is refused (fail-closed), even sim-marked. */
const MATERIAL_FIELDS = ["value", "secret", "key", "password", "token", "apikey", "api_key", "credential"] as const;

export function credentialVaultId(credentialId: string): string {
  return `${CREDENTIAL_ID_PREFIX}${requireCredentialId(credentialId)}`;
}

export function requireCredentialId(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error("credential: credentialId must be a non-empty string");
  }
  if (v.includes(":")) {
    throw new Error("credential: credentialId must not contain ':' (vault id grammar)");
  }
  if (v.length > 128) {
    throw new Error("credential: credentialId exceeds 128 chars");
  }
  return v;
}

/** Total put validation → the record to append. Throws (fail-closed) on:
 *  - a non-object payload;
 *  - a missing/blank/colon-carrying credentialId;
 *  - sim !== true (live secrets never enter the sandbox — law 3);
 *  - ANY material-named field present, at any depth of `meta` — even
 *    sim-marked puts carry references only in v0.1.0. */
export function asCredentialRecord(payload: unknown, now: number): CredentialRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("credential.put@1: payload must be an object {credentialId, sim: true, meta?}");
  }
  const p = payload as Record<string, unknown>;
  const credentialId = requireCredentialId(p.credentialId);
  if (p.sim !== true) {
    throw new Error(
      "credential.put@1: sim must be true — live secrets never enter the sandbox " +
      "(docs/SURFACES.md credential law 3; the live tier is owner-machine only)",
    );
  }
  for (const f of MATERIAL_FIELDS) {
    if (f in p) {
      throw new Error(
        `credential.put@1: payload field "${f}" is secret-material-shaped — the spine stores ` +
        `REFERENCES only (fail-closed; SURFACES.md credential law 1)`,
      );
    }
  }
  let meta: Record<string, unknown> | undefined;
  if (p.meta !== undefined) {
    if (p.meta === null || typeof p.meta !== "object" || Array.isArray(p.meta)) {
      throw new Error("credential.put@1: meta must be an object when provided");
    }
    const m = p.meta as Record<string, unknown>;
    for (const f of MATERIAL_FIELDS) {
      if (f in m) {
        throw new Error(
          `credential.put@1: meta.${f} is secret-material-shaped — the spine stores REFERENCES only`,
        );
      }
    }
    meta = structuredClone(m);
  }
  return { credentialId, kind: "sim-synthetic", sim: true, createdAt: now, ...(meta ? { meta } : {}) };
}

/** Vault record → CredentialRecord, or null when malformed (readers skip,
 *  never throw — the registry/append split keeps reads non-fatal). */
export function fromRecord(data: unknown): CredentialRecord | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.credentialId !== "string" || r.credentialId.length === 0) return null;
  if (r.kind !== "sim-synthetic" || r.sim !== true) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  return {
    credentialId: r.credentialId,
    kind: "sim-synthetic",
    sim: true,
    createdAt: r.createdAt,
    ...(r.meta !== undefined && typeof r.meta === "object" && r.meta !== null && !Array.isArray(r.meta)
      ? { meta: r.meta as Record<string, unknown> }
      : {}),
  };
}
