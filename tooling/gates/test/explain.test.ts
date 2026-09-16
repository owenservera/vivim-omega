// gate --explain unit evidence: every gate stage documents itself; unknown names list the valid ones.
import { describe, test, expect } from "bun:test";
import { explainStage, STAGE_DOCS } from "../explain.ts";

describe("gate --explain (E-8)", () => {
  test("every wired stage has scans + allowlist + rule", () => {
    for (const name of ["host-loc", "fresh-tree", "decisions", "compositions", "bun-surface", "os-surface", "import-surface", "tests", "attest"]) {
      expect(Object.keys(STAGE_DOCS)).toContain(name);
      expect(STAGE_DOCS[name].scans.length).toBeGreaterThan(0);
      expect(STAGE_DOCS[name].allowlist.length).toBeGreaterThan(0);
      expect(STAGE_DOCS[name].rule.length).toBeGreaterThan(0);
    }
  });

  test("named stage renders; unknown names list the valid ones", () => {
    expect(explainStage("os-surface")).toContain("platform/src/platform.ts");
    expect(explainStage("nope")).toContain("host-loc");
    expect(explainStage()).toContain("import-surface");
  });
});
