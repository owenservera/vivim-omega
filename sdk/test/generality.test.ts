// sdk/test/generality.test.ts — the D-405 falsifiers: the four generality
// validators accept the three valid fixtures, reject the five invalid ones with
// the EXACT named codes, fixtures are hash-pinned (manifest.json), and
// validation is deterministic (same manifest twice → byte-identical issues).
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseManifest, validateGenerality } from "../src/index.ts";

const FIXDIR = join(import.meta.dir, "fixtures/generality");

function load(name: string): ReturnType<typeof parseManifest> & { value?: any } {
  const text = readFileSync(join(FIXDIR, name), "utf-8");
  return { ...parseManifest(text), text };
}

function codes(issues: Array<{ code: string }>): string[] {
  return issues.map((i) => i.code);
}

describe("D-405 — generality fixtures are hash-pinned and complete", () => {
  test("every fixture listed in manifest.json matches its sha256 (tamper = red)", () => {
    const pinned = JSON.parse(readFileSync(join(FIXDIR, "manifest.json"), "utf-8")) as { fixtures: Record<string, string> };
    const onDisk = readdirSync(FIXDIR).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();
    expect(onDisk).toEqual(Object.keys(pinned.fixtures).sort());
    for (const [name, want] of Object.entries(pinned.fixtures)) {
      const got = `sha256:${createHash("sha256").update(readFileSync(join(FIXDIR, name))).digest("hex")}`;
      expect(got).toBe(want);
    }
  });

  test("all eight fixtures parse as manifests (the generality block is additive)", () => {
    for (const f of readdirSync(FIXDIR).filter((x) => x.endsWith(".json") && x !== "manifest.json")) {
      const r = load(f);
      expect(r.ok).toBe(true);
    }
  });
});

describe("D-405 — the four validators accept what should pass", () => {
  test("valid speculative: zero issues", () => {
    const m = load("valid-speculative.json").value;
    expect(validateGenerality(m)).toEqual([]);
  });

  test("valid harvested (pinned mine + originPaths + harvestClass): zero issues", () => {
    const m = load("valid-harvested.json").value;
    expect(validateGenerality(m)).toEqual([]);
  });

  test("valid generic (>=2 refs, one independent of the declared mine): zero issues", () => {
    const m = load("valid-generic.json").value;
    expect(validateGenerality(m)).toEqual([]);
  });

  test("GEN_LEVEL_MISSING is report-only when ctx.hard === false (the legacy retrofit stance)", () => {
    const m = load("invalid-missing-level.json").value;
    expect(validateGenerality(m, { hard: false })).toEqual([]);
    expect(codes(validateGenerality(m))).toEqual(["GEN_LEVEL_MISSING"]);
  });
});

describe("D-405 — the four validators reject what should fail, with named codes", () => {
  test("missing level → GEN_LEVEL_MISSING (hard by default — the forge.* stance)", () => {
    const m = load("invalid-missing-level.json").value;
    expect(codes(validateGenerality(m))).toEqual(["GEN_LEVEL_MISSING"]);
  });

  test("harvested with unpinned mine → GEN_MINE_UNPINNED", () => {
    const m = load("invalid-unpinned-mine.json").value;
    expect(codes(validateGenerality(m))).toEqual(["GEN_MINE_UNPINNED"]);
  });

  test("harvested with empty originPaths → GEN_MINE_UNPINNED", () => {
    const m = load("invalid-empty-originpaths.json").value;
    expect(codes(validateGenerality(m))).toEqual(["GEN_MINE_UNPINNED"]);
  });

  test("generic with one evidence ref → GEN_UNPROVEN (count leg)", () => {
    const m = load("invalid-generic-one-ref.json").value;
    expect(codes(validateGenerality(m))).toEqual(["GEN_UNPROVEN"]);
  });

  test("generic whose every ref depends on the declared mine → GEN_UNPROVEN (independence leg)", () => {
    const m = load("invalid-generic-same-mine.json").value;
    expect(codes(validateGenerality(m))).toEqual(["GEN_UNPROVEN"]);
  });
});

describe("D-405 — GEN_SPECULATIVE_STALE is report-only context (Wave 0)", () => {
  test("speculative + live caller + no promotion evidence → stale report", () => {
    const m = load("valid-speculative.json").value;
    const issues = validateGenerality(m, { liveCaller: true });
    expect(codes(issues)).toEqual(["GEN_SPECULATIVE_STALE"]);
  });

  test("speculative with no caller for 3+ waves → stale report; 2 waves stays quiet", () => {
    const m = load("valid-speculative.json").value;
    expect(codes(validateGenerality(m, { wavesWithoutCaller: 3 }))).toEqual(["GEN_SPECULATIVE_STALE"]);
    expect(validateGenerality(m, { wavesWithoutCaller: 2 })).toEqual([]);
  });

  test("without caller context (the default gate stance), speculative is silent", () => {
    const m = load("valid-speculative.json").value;
    expect(validateGenerality(m)).toEqual([]);
  });
});

describe("D-405 — determinism (byte-identical issues across two runs)", () => {
  test("same manifest twice → identical JSON serialization", () => {
    for (const f of readdirSync(FIXDIR).filter((x) => x.endsWith(".json") && x !== "manifest.json")) {
      const m = load(f).value;
      const a = JSON.stringify(validateGenerality(m));
      const b = JSON.stringify(validateGenerality(m));
      expect(a).toBe(b);
    }
  });
});
