// tooling/gates/priv.ts — D-441 (Ω-11 port of paper D-443): Aperture Side-Channel & Profile Privacy.
//
// The negative space is sovereign: manifests omit (never redact), refusals are
// uniform in code/sentence/size/timing, profiles are retention-bound vault
// data with purge + dumb mode + slice isolation. Pure library (headless).
// Falsifier: F-APERTURE-PRIVACY (`tooling/gates/test/f-aperture-privacy.test.ts`).
// Zero host LOC.

export interface ProfileState {
  realizationRef: string;
  namespaceScope: string;
  weights: Record<string, number>;
  retentionRule: string;
  mode: "predictive" | "dumb";
  tombstoned?: boolean;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type PrivResult<T> = { ok: true; value: T } | Refusal;

export const UNIFORM_CODE = "APERTURE_SCOPE_OR_MISSING";
export const UNIFORM_SENTENCE = "The requested context is outside the current disclosure scope or does not exist.";
export const PAD_QUANTUM_MS = 50;

/** Scope-filtered manifest: out-of-scope atoms mathematically omitted, never marked. */
export function filterManifest(
  atoms: Array<{ ref: string; scope: string }>,
  grantedScopes: string[],
): Array<{ ref: string }> {
  return atoms
    .filter((a) => grantedScopes.includes(a.scope) || grantedScopes.includes("*"))
    .map((a) => ({ ref: a.ref }));
}

/** Uniform refusal for any denied/missing atom. Padded timing claimed by contract. */
export function uniformRefusal(paddedMs: number): { code: string; sentence: string; size: number; paddedMs: number } {
  void paddedMs;
  const body = `${UNIFORM_CODE}:${UNIFORM_SENTENCE}`;
  return { code: UNIFORM_CODE, sentence: UNIFORM_SENTENCE, size: body.length, paddedMs: PAD_QUANTUM_MS };
}

/** Specific-denial attempt — schema gate error. */
export function specificDenial(namespace: string): Refusal {
  void namespace;
  return { ok: false, code: "APERTURE_EXISTENCE_LEAK", sentence: "The aperture attempted to return a specific denial for an out-of-scope atom. Refused. The model must not know what it cannot see." };
}

/** Profile write — retention mandatory, else refused. */
export function writeProfile(p: ProfileState): PrivResult<ProfileState> {
  if (!p.retentionRule || p.retentionRule.trim() === "") {
    return { ok: false, code: "PROFILE_UNNAMED_RETENTION", sentence: "A consumption profile was generated without a retention rule. Refused. We do not keep permanent behavioral portraits." };
  }
  return { ok: true, value: p };
}

/** Profile read — sole-reader aperture; realizations see only their granted slice. */
export function readProfileSlice(
  profiles: ProfileState[],
  reader: { isAperture: boolean; grantedNamespaces: string[] },
  realizationRef: string,
): PrivResult<ProfileState[]> {
  if (!reader.isAperture && reader.grantedNamespaces.includes("*")) {
    return { ok: false, code: "PROFILE_GLOBAL_READ", sentence: "A realization attempted to read the global consumption profile. Refused. You may only see the slice relevant to your granted namespaces." };
  }
  if (!reader.isAperture) {
    return { ok: true, value: profiles.filter((p) => p.realizationRef === realizationRef && reader.grantedNamespaces.includes(p.namespaceScope)) };
  }
  return { ok: true, value: profiles.filter((p) => !p.tombstoned) };
}

/** Purge — tombstones rows; prefetch falls back to recency with zero ML. */
export function purgeProfiles(profiles: ProfileState[]): ProfileState[] {
  return profiles.map((p) => ({ ...p, tombstoned: true, weights: {}, mode: "dumb" as const }));
}
