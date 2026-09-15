// plugins/vivim-credentials — redact.ts (D-356 / M12)
// The redaction pass as POLICY — versioned, inspectable data owned by the
// credentials spine (credential-derived patterns are this plugin's domain;
// consumers call credential.redact@1 instead of growing regex spaghetti).
// Pure + deterministic: same bytes + same policy ⇒ same redacted bytes and
// the same count. No clocks, no randomness.
//
// M12's ordering law: the capture path runs bytes through THIS pass BEFORE
// the vault sees them, so the vault's Merkle chain only ever contains
// redacted bytes — and any byte-span citation computes against the
// already-redacted byte string, which is the only byte string that exists.

/** What counts as a secret: header/param names (matched case-insensitively
 *  against `name:` and `name=` shapes — headers AND query params), plus
 *  credential-derived value shapes (token formats the spine's world has
 *  actually issued: bearer schemes, sk-/ghp_-style key material). */
export interface RedactionPolicy {
  policyId: "credentials.redaction";
  version: string;
  description: string;
  names: string[];
  valuePatterns: string[]; // regex SOURCES — JSON-able policy, compiled at apply time
  replacement: string;
}

export const REDACTION_POLICY_V1: RedactionPolicy = {
  policyId: "credentials.redaction",
  version: "1.0.0",
  description:
    "M12/D-356 — what counts as a secret in captured bytes: credential/auth header and param names " +
    "(case-insensitive, ':' and '=' separated) plus credential-derived value shapes (bearer schemes, " +
    "sk-/ghp_-style keys). Applied BEFORE vault.append so the vault only ever holds redacted bytes; " +
    "spans are computed against the redacted byte string (the only one that exists).",
  names: [
    "authorization", "proxy-authorization", "cookie", "set-cookie",
    "x-api-key", "x-auth-token", "x-csrf-token", "private-token",
    "token", "access_token", "api-key", "api_key", "apikey",
    "session", "sessionid", "session-id", "password", "secret",
  ],
  valuePatterns: [
    "Bearer\\s+[^\\s&\"';,]+",           // bearer schemes
    "sk-[A-Za-z0-9_-]{16,}",             // openai-style key material
    "gh[pousr]_[A-Za-z0-9]{30,}",        // github-style token material
    "xox[baprs]-[A-Za-z0-9-]{10,}",      // slack-style token material
  ],
  replacement: "[REDACTED]",
};

export interface RedactionResult {
  redacted: string;
  redactions: number;
  policyVersion: string;
}

/** Upper bound on accepted input — a capture larger than this is refused
 *  (attributable, fail-closed) rather than silently eaten by the budget. */
export const REDACT_MAX_BYTES = 2_000_000;

function compilePattern(source: string): RegExp {
  // Policy patterns are trusted DATA shipped with the spine — but compile
  // defensively anyway: a bad pattern throws here, at the boundary, with the
  // policy version named (fail-closed, attributable) instead of poisoning
  // every later call.
  try {
    return new RegExp(source, "gi");
  } catch (e) {
    throw new Error(`redaction: policy ${REDACTION_POLICY_V1.version} has an invalid pattern: ${String(e)}`);
  }
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apply the policy to captured text. Deterministic; counts every span it
 *  replaced. `bytes` is UTF-8 text (v1 captures are text documents). */
export function applyRedaction(bytes: string, policy: RedactionPolicy = REDACTION_POLICY_V1): RedactionResult {
  if (typeof bytes !== "string") {
    throw new Error("credential.redact@1: bytes must be a string (UTF-8 text in v1)");
  }
  if (bytes.length > REDACT_MAX_BYTES) {
    throw new Error(
      `credential.redact@1: capture exceeds ${REDACT_MAX_BYTES} chars — refused fail-closed ` +
      `(split the capture; the budget is not a silent truncation)`,
    );
  }
  let out = bytes;
  let redactions = 0;

  // Pass 1 — credential-derived value shapes (bearer schemes, key material).
  for (const source of policy.valuePatterns) {
    const re = compilePattern(source);
    out = out.replace(re, (m) => {
      if (m.length === 0) return m;
      redactions += 1;
      return policy.replacement;
    });
  }

  // Pass 2 — name-shaped secrets: `name: value` (headers), `name=value` (URL
  // query params), and the JSON-encoded forms ("name": "value") — captures are
  // commonly JSON documents, so the match KEEPS the separator/quote prefix as
  // group 1 and replaces only the value: the redacted bytes stay valid JSON
  // (the parser must still replay them). A value pass 1 already replaced is
  // left as-is (no double count): the marker IS the redaction.
  const namesAlt = policy.names.map(escapeName).join("|");
  const re = new RegExp(`((?:${namesAlt})\\s*"?\\s*[:=]\\s*"?)\\s*([^\\s&"';,]+)`, "gi");
  out = out.replace(re, (m, prefix: string, v: string) => {
    if (v === policy.replacement) return m;
    redactions += 1;
    return `${prefix}${policy.replacement}`;
  });

  return { redacted: out, redactions, policyVersion: policy.version };
}
