// vivim.vault — validate.ts (Ω2)
// Payload validation + config resolution. Fail-closed: every bad payload throws
// (the shim converts handler throws into DEGRADED returns at the port boundary).
// Kept in its own module (imported by index.ts AND by unit tests) so index.ts can
// stay import-safe outside a worker (it calls startPlugin at top level).
import { resolveDataDir as expandDataDir } from "@vivim/omega-platform"; // D-372: consumption-side expansion — recipes stay portable across machines

export const DEFAULT_DATA_DIR = "./dev-vault/vault-data";

/** dataDir resolution: composition config passthrough (never authority), default per the vault-format contract. Portable and grandfathered spellings resolve on the consuming machine via the platform seam, so one signed recipe boots on every OS. */
export function resolveDataDir(config: Record<string, unknown> | undefined | null): string {
  const raw = config?.dataDir;
  if (raw === undefined || raw === null) return DEFAULT_DATA_DIR;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`vivim.vault: config.dataDir must be a non-empty string (got ${String(raw)})`);
  }
  return expandDataDir(raw);
}

const NAME_FORBIDDEN = /[\u0000|]/; // "|" separates Merkle fields; NUL breaks SQLite text

export function requireName(op: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${op}: ${field} must be a non-empty string`);
  if (value.length > 256) throw new Error(`${op}: ${field} exceeds 256 chars`);
  if (NAME_FORBIDDEN.test(value)) throw new Error(`${op}: ${field} must not contain '|' or NUL`);
  return value;
}

export function requireObject(op: string, payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${op}: payload must be an object`);
  }
  return payload as Record<string, unknown>;
}

/** Required integer field with a minimum. */
export function requireInt(op: string, field: string, value: unknown, min: number): number {
  if (value === undefined || value === null) throw new Error(`${op}: ${field} is required`);
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new Error(`${op}: ${field} must be an integer >= ${min}`);
  }
  return value;
}

/** Optional integer field with a minimum; null when absent. */
export function optionalInt(op: string, field: string, value: unknown, min: number): number | null {
  if (value === undefined || value === null) return null;
  return requireInt(op, field, value, min);
}

export interface RefShape { ns: string; id: string; rev: number }

export function requireRefs(op: string, refs: unknown): RefShape[] {
  if (refs === undefined || refs === null) return [];
  if (!Array.isArray(refs)) throw new Error(`${op}: refs must be an array of {ns, id, rev}`);
  return refs.map((r, i) => {
    const ref = requireObject(`${op} refs[${i}]`, r);
    return {
      ns: requireName(op, `refs[${i}].ns`, ref.ns),
      id: requireName(op, `refs[${i}].id`, ref.id),
      rev: requireInt(`${op} refs[${i}]`, "rev", ref.rev, 1),
    };
  });
}
