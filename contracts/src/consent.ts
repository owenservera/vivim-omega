// @vivim/omega-contracts — consent.ts
// The stable consent-id derivation: ONE definition for the law plugin, the
// testkit FakeHost, and the surfaces that name consent ids in UX text.
//
// A consent id names the exact (principal, op) pair a refusal refers to, so a
// refusal can point at the grant that would satisfy it. Deterministic across
// boots (FNV-derived hash, no clock, no randomness) — the id a test predicts
// is the id the law derives on a real boot. This module is pure and
// zero-import: compartment-safe, browser-safe, runtime-neutral.
export const CONSENT_ID_RE = /^consent_[0-9a-f]{16}$/;

/** FNV-derived 64-bit-ish stable hash (pure, import-free — no node:crypto anywhere near the derivation). */
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

/** Stable consent id for a (principal, op) pair — deterministic across boots. */
export function consentIdFor(principal: string, op: string): string {
  return `consent_${stableHash(`${principal}\u0000${op}`)}`;
}
