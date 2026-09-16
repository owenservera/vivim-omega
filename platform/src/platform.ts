// @vivim/omega-platform — platform.ts (D-372)
// The ONLY module in the production tree allowed to know what OS it runs on.
// Everything else (host, shim, contracts, sdk, testkit, plugins/*,
// surfaces/*) calls into these four functions and never touches `node:os`
// paths, the platform identifier, or raw permission calls directly — D-372
// seam boundary, enforced by the gate's `os-surface` stage.
//
// Why consumption-side, not compile-time: composition specs spell portable
// `${TMP}/...` paths and recipes carry them verbatim (signed); each machine
// resolves locally when it consumes the value. A recipe pinned on Linux boots
// unchanged on Windows. Baking machine-local temp dirs into signed recipes
// would do the opposite — fork portability at the signature boundary.
import { chmodSync } from "node:fs"; // D-372: sole raw permission import — only ownerOnly below may call it
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Portable spelling for machine-local scratch in specs and configs. */
export const TMP_TOKEN = "${TMP}";

/** Scratch root for this machine (os.tmpdir() — TEMP on Windows, /tmp on POSIX). */
export function tmpRoot(): string {
  return tmpdir();
}

/** Join segments under the scratch root: omegaTmp("omega-chat-test", runId). */
export function omegaTmp(...segs: string[]): string {
  return join(tmpdir(), ...segs);
}

/** True for the grandfathered absolute spelling (pre-D-372 specs and tests). Matches the scratch root and anything under it. */ // D-372: the detector itself (allowlisted line)
export function isGrandfatheredTmp(input: string): boolean {
  return input === "/tmp" || input.startsWith("/tmp/"); // D-372: grandfathered spellings detected here and nowhere else
}

/**
 * Resolve a data path value to this machine (pure, TOTAL on strings):
 * - "${TMP}/..." → under tmpRoot() (the portable spelling — specs use this)
 * - "/tmp/..."   → mapped to tmpRoot() (grandfathered; identical result) // D-372: documented mapping, not a literal path in use
 * - relative     → VERBATIM (plugin-relative paths like blueprintPath must survive)
 * - absolute     → VERBATIM (operator override, e.g. --vault)
 * Throws on non-string/empty input (fail-closed at the boundary).
 */
export function resolveDataDir(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error(`platform: resolveDataDir input must be a non-empty string (got ${JSON.stringify(input)?.slice(0, 80)})`);
  }
  if (input.startsWith(TMP_TOKEN)) {
    return join(tmpdir(), input.slice(TMP_TOKEN.length).replace(/^[/\\]+/, ""));
  }
  if (isGrandfatheredTmp(input)) {
    return join(tmpdir(), input.slice("/tmp".length).replace(/^[/\\]+/, "")); // D-372: grandfathered mapping — same result as the token spelling
  }
  return input;
}

/**
 * Owner-only intent for a file holding key material.
 * POSIX: chmod 600. Windows: best-effort (ACLs, not mode bits) — never throws,
 * so first boot cannot fail on a locked-down ACL (D-371 hardened, D-372 owned).
 */
export function ownerOnly(path: string): void {
  try {
    chmodSync(path, 0o600); // D-372: the sole raw permission call in the production tree (wrapped here, enforced by os-surface)
  } catch {
    /* best-effort — the writeFileSync mode (where supported) already applied */
  }
}
