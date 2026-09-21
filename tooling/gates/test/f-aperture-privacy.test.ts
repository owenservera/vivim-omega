// tooling/gates/test/f-aperture-privacy.test.ts — the F-APERTURE-PRIVACY falsifier.
// Generated from D-441 by `omega:loop --stub D-441` (D-426, Ω-DEV.2).
// Implemented (D-441): every clause runs a real verdict against
// tooling/gates/priv.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  filterManifest,
  purgeProfiles,
  readProfileSlice,
  specificDenial,
  uniformRefusal,
  writeProfile,
  type ProfileState,
} from "../priv.ts";

function profile(over: Partial<ProfileState> = {}): ProfileState {
  return {
    realizationRef: "llm-x",
    namespaceScope: "ns.finance",
    weights: { "ns.finance": 0.9 },
    retentionRule: "14d-rolling",
    mode: "predictive",
    ...over,
  };
}

describe("F-APERTURE-PRIVACY (D-441)", () => {
  test("F-APERTURE-PRIVACY.1 (oracle-test) — 200 mixed probes, identical uniform code/sentence/size", () => {
    const outs = Array.from({ length: 200 }, (_, i) => uniformRefusal(i % 50));
    expect(new Set(outs.map((o) => o.code)).size).toBe(1);
    expect(new Set(outs.map((o) => o.sentence)).size).toBe(1);
    expect(new Set(outs.map((o) => o.size)).size).toBe(1);
    expect(new Set(outs.map((o) => o.paddedMs)).size).toBe(1); // timing quantized
    const leak = specificDenial("ns.medical");
    expect(leak.code).toBe("APERTURE_EXISTENCE_LEAK");
  });

  test("F-APERTURE-PRIVACY.2 (manifest-blindness) — out-of-scope strings mathematically absent", () => {
    const manifest = filterManifest(
      [
        { ref: "ns.docs:row1", scope: "ns.docs" },
        { ref: "ns.medical:row9", scope: "ns.medical" },
      ],
      ["ns.docs"],
    );
    const payload = JSON.stringify(manifest);
    expect(payload).not.toContain("medical");
    expect(payload).not.toContain("REDACTED");
    expect(payload).not.toContain("SEALED");
  });

  test("F-APERTURE-PRIVACY.3 (portrait-purge) — purge tombstones, prefetch falls back with zero ML", () => {
    const purged = purgeProfiles([profile()]);
    expect(purged[0].tombstoned).toBe(true);
    expect(purged[0].weights).toEqual({});
    expect(purged[0].mode).toBe("dumb");
    const immortal = writeProfile(profile({ retentionRule: "" }));
    expect(immortal.ok).toBe(false);
    if (immortal.ok) throw new Error("unreachable");
    expect(immortal.code).toBe("PROFILE_UNNAMED_RETENTION");
  });

  test("F-APERTURE-PRIVACY.4 (profile-isolation) — slices only, cross-namespace habits undeducible", () => {
    const profiles = [profile(), profile({ namespaceScope: "ns.journal", weights: { "ns.journal": 0.95 } })];
    const global = readProfileSlice(profiles, { isAperture: false, grantedNamespaces: ["*"] }, "llm-x");
    expect(global.ok).toBe(false);
    if (global.ok) throw new Error("unreachable");
    expect(global.code).toBe("PROFILE_GLOBAL_READ");
    const slice = readProfileSlice(profiles, { isAperture: false, grantedNamespaces: ["ns.finance"] }, "llm-x");
    expect(slice.ok).toBe(true);
    if (!slice.ok) throw new Error("unreachable");
    expect(slice.value).toHaveLength(1);
    expect(JSON.stringify(slice.value)).not.toContain("ns.journal");
  });
});
