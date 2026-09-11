// Ω4 testkit — the conformance runner: staged → verified → active, with the
// failure stages landing exactly where the defect lives. Plus the fixture
// builders and the seeded-fuzz reproducibility law.
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { runConformance } from "@vivim/omega-testkit";
import { validManifest, tamperedManifest, unsignedManifest, conflictingComposition, badDependency, fuzzManifest, fuzzManifestCase, fuzzPayload } from "@vivim/omega-testkit";
import { parseManifest, validateManifest, verifyManifest, signManifest } from "@vivim/omega-sdk";
import { generateRootKey } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";

const REPO = join(import.meta.dir, "../..");
const NOTES = join(REPO, "examples/plugin-notes");
const FIXTURES = join(import.meta.dir, "fixtures");

const notesComposition: CompositionSpec = {
  name: "notes",
  entries: [
    { id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
    { id: "omega.notes", source: "../examples/plugin-notes", bootPhase: 1, grant: { capabilities: ["host.journal.append"], contracts: ["note.write@1", "note.list@1"] } },
  ],
};

describe("Ω4 conformance — plugin-notes passes all three stages", () => {
  test("staged → verified → active with a structured report (self-contained world)", async () => {
    const report = await runConformance(NOTES);
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.active).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.pluginId).toBe("omega.notes");
    expect(report.ops).toEqual(["note.write@1", "note.list@1"]);
    expect(report.fixture).toBe("test/conformance.fixture.ts");
    // report structure: timings for every stage + total, computed content hash recorded
    expect(report.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.timings.stagedMs).toBeGreaterThanOrEqual(0);
    expect(report.timings.verifiedMs).toBeGreaterThanOrEqual(0);
    expect(report.timings.activeMs).toBeGreaterThanOrEqual(0);
    expect(report.contentHash.computed).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.contentHash.match).toBe(true); // "" declared = pre-compile source: nothing to mismatch
  });

  test("verified against a real composition context (dependency + capability fit)", async () => {
    const report = await runConformance(NOTES, { composition: notesComposition });
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.active).toBe(true);
    expect(report.issues).toEqual([]);
  });

  test("runConformance never throws for non-conformance — it reports", async () => {
    const report = await runConformance(join(FIXTURES, "tampered"));
    expect(typeof report).toBe("object");
    expect(report.staged).toBe(false);
  });
});

describe("Ω4 conformance — broken fixtures fail at the RIGHT stage", () => {
  test("tampered manifest → STAGED fails (schema)", async () => {
    const report = await runConformance(join(FIXTURES, "tampered"));
    expect(report.staged).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.active).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0].stage).toBe("staged");
    expect(report.issues[0].code).toBe("MANIFEST_SHAPE");
    // sdk fixture equivalence: the same tamper class fails parseManifest
    expect(parseManifest(tamperedManifest()).ok).toBe(false);
  });

  test("unsatisfied dependency → VERIFIED fails (DEP_UNSATISFIED)", async () => {
    const report = await runConformance(join(FIXTURES, "bad-dep"));
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.active).toBe(false);
    const dep = report.issues.find((i) => i.code === "DEP_UNSATISFIED");
    expect(dep).toBeTruthy();
    expect(dep!.stage).toBe("verified");
    expect(dep!.message).toContain("contract:echo.ping@1");
    // sdk fixture equivalence
    expect(validateManifest(badDependency()).map((i) => i.code)).toContain("DEP_REF_SYNTAX");
  });

  test("conflicting composition context → VERIFIED fails (op ownership)", async () => {
    const report = await runConformance(NOTES, { composition: conflictingComposition() });
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.active).toBe(false);
    const conflict = report.issues.find((i) => i.code === "OP_CONFLICT");
    expect(conflict).toBeTruthy();
    expect(conflict!.stage).toBe("verified");
    expect(conflict!.message).toContain("note.write@1");
  });

  test("stale content hash (B1 tamper on a stamped manifest) → VERIFIED fails, not staged", async () => {
    const report = await runConformance(join(FIXTURES, "stale-hash"));
    expect(report.staged).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.issues.find((i) => i.code === "CONTENT_HASH_MISMATCH")).toBeTruthy();
    expect(report.contentHash.match).toBe(false);
    expect(report.contentHash.declared).toBe("sha256:" + "0".repeat(64));
  });

  test("missing plugin dir → staged reports MANIFEST_MISSING (no throw)", async () => {
    const report = await runConformance(join(FIXTURES, "does-not-exist"));
    expect(report.staged).toBe(false);
    expect(report.issues[0].code).toBe("MANIFEST_MISSING");
  });
});

describe("Ω4 conformance — fixture builders + signing interplay", () => {
  test("validManifest parses + validates green; tamperedManifest fails parse; unsignedManifest fails verification", () => {
    const vm = parseManifest(validManifest());
    expect(vm.ok).toBe(true);
    if (vm.ok) expect(validateManifest(vm.value)).toEqual([]);

    expect(parseManifest(tamperedManifest()).ok).toBe(false);

    const root = generateRootKey();
    expect(verifyManifest(unsignedManifest(), root.publicKey)).toBe(false); // no signature at all
    const signed = signManifest(unsignedManifest(), root.privateKeyPem);
    expect(verifyManifest(signed, root.publicKey)).toBe(true); // same manifest, now signed
  });
});

describe("Ω4 fuzz — the reproducibility law (seeded determinism)", () => {
  test("same seed → identical manifest (deep equal) and identical payload", () => {
    for (const seed of [0, 1, 7, 42, 20260911]) {
      expect(fuzzManifest(seed)).toEqual(fuzzManifest(seed));
      expect(JSON.stringify(fuzzManifest(seed))).toBe(JSON.stringify(fuzzManifest(seed)));
      expect(fuzzPayload(seed)).toEqual(fuzzPayload(seed));
    }
  });

  test("different seeds → (overwhelmingly) different outputs", () => {
    let differ = 0;
    for (let s = 1; s <= 10; s++) {
      if (JSON.stringify(fuzzManifest(s)) !== JSON.stringify(fuzzManifest(s + 100))) differ++;
      if (JSON.stringify(fuzzPayload(s)) !== JSON.stringify(fuzzPayload(s + 100))) differ++;
    }
    expect(differ).toBeGreaterThanOrEqual(15); // 20 comparisons, collision odds are negligible
  });

  test("every fuzzed payload is structured-clone safe (JSON round-trips)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = fuzzPayload(seed);
      expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    }
  });

  test("invalid fuzz mutations are ALWAYS caught by schema or semantic validator; valid ones never throw", () => {
    let invalidSeen = 0;
    let validSeen = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { manifest, mutation } = fuzzManifestCase(seed);
      const r = parseManifest(JSON.parse(JSON.stringify(manifest)));
      const issues = r.ok ? validateManifest(r.value) : [];
      if (mutation.kind === "invalid") {
        invalidSeen++;
        expect({ seed, mutation: mutation.index, caught: !r.ok || issues.length > 0 }).toEqual(
          expect.objectContaining({ caught: true }),
        );
      } else {
        validSeen++;
      }
    }
    expect(invalidSeen).toBeGreaterThanOrEqual(60); // both classes well-covered in 150 seeds
    expect(validSeen).toBeGreaterThanOrEqual(15);
  });
});
