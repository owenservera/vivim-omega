// tooling/gates/test/invariants-freshness.test.ts — D-415 (A3): the freshness
// stage, tested pure-first plus one live lock test pinning the REAL digest's
// marker to the REAL stage registry (the D-403 doc-drift class — the digest
// and explain.ts can no longer drift apart silently).
//  F-1 the marker parses (pass/as-of/stages) or reports absent; malformed throws
//  F-2 staleness computes: fresh · 30-ratifications · stage drift both directions · no-marker
//  F-3 the stage is REPORT-ONLY: staleness passes green with triggers in the detail;
//     mechanics (unreadable digest, malformed marker) FAIL
//  F-4 the live lock: the real CURRENT-INVARIANTS.md is fresh against the real registry
//  F-5 the `-->` leak regression (a phantom "--" stage — bitten while writing the parser)
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import {
  RATIFICATIONS_TRIGGER, checkInvariantsFreshness, computeFreshness, parseInvariantsMarker,
} from "../invariants-freshness.ts";
import { STAGE_DOCS } from "../explain.ts";

const REAL_ROOT = join(import.meta.dir, "../../..");
const MARKER = "<!-- invariants: pass 2 · as-of D-415 · regenerated 2026-09-20 (D-415) · stages: anvil-loc decisions host-loc tests -->";

describe("F-1 — the marker parses, or reports absent, or throws malformed", () => {
  test("a well-formed marker parses to pass/as-of/stages", () => {
    const m = parseInvariantsMarker(MARKER)!;
    expect(m.pass).toBe(2);
    expect(m.asOf).toBe(415);
    expect(m.stages).toEqual(["anvil-loc", "decisions", "host-loc", "tests"]);
  });
  test("no marker at all → null (the pre-D-415 era reports stale, never fails shape)", () => {
    expect(parseInvariantsMarker("# digest without a marker\n\nbody")).toBeNull();
  });
  test("malformed markers throw with the format named", () => {
    expect(() => parseInvariantsMarker("<!-- invariants: pass two · as-of D-415 · stages: host-loc -->")).toThrow(/malformed/);
    expect(() => parseInvariantsMarker("<!-- invariants: pass 2 · stages: host-loc -->")).toThrow(/malformed/);
    expect(() => parseInvariantsMarker("<!-- invariants: pass 2 · as-of D-415 -->")).toThrow(/malformed/);
  });
});

describe("F-2 — staleness computes on the triggers", () => {
  const marker = { pass: 2, asOf: 415, stages: ["host-loc", "decisions", "tests"] };
  test("fresh: nothing ratified since, no drift", () => {
    const f = computeFreshness({ marker, ratifiedSince: 0, gateStages: ["host-loc", "decisions", "tests"] });
    expect(f).toEqual({ stale: false, triggers: [] });
  });
  test(`T1: ${RATIFICATIONS_TRIGGER} ratified rows past as-of → stale, trigger named`, () => {
    const f = computeFreshness({ marker, ratifiedSince: RATIFICATIONS_TRIGGER, gateStages: ["host-loc", "decisions", "tests"] });
    expect(f.stale).toBe(true);
    expect(f.triggers.join(";")).toMatch(new RegExp(`${RATIFICATIONS_TRIGGER}-ratifications: ${RATIFICATIONS_TRIGGER} ratified rows past as-of D-415`));
    const f29 = computeFreshness({ marker, ratifiedSince: RATIFICATIONS_TRIGGER - 1, gateStages: ["host-loc", "decisions", "tests"] });
    expect(f29.stale).toBe(false);
  });
  test("T2: stage drift, both directions", () => {
    const missing = computeFreshness({ marker, ratifiedSince: 0, gateStages: [...marker.stages, "new-stage"] });
    expect(missing.stale).toBe(true);
    expect(missing.triggers.join(";")).toMatch(/stage-drift: the gate runs stages the digest does not document \(new-stage\)/);
    const gone = computeFreshness({ marker, ratifiedSince: 0, gateStages: marker.stages.slice(0, 2) });
    expect(gone.stale).toBe(true);
    expect(gone.triggers.join(";")).toMatch(/stage-drift: the digest documents stages the gate no longer runs \(tests\)/);
  });
  test("no marker → stale with the regeneration named (a report, not a failure)", () => {
    const f = computeFreshness({ marker: null, ratifiedSince: 0, gateStages: ["host-loc"] });
    expect(f.stale).toBe(true);
    expect(f.triggers[0]).toMatch(/no-marker/);
  });
});

describe("F-3 — the stage is report-only; mechanics fail", () => {
  let root: string;
  const indexWith = (rows: string) => `# Ω Build Decisions (fixture)\n\n| ID | Decision | Status | Rationale |\n|---|---|---|---|\n${rows}`;
  beforeAll(() => {
    root = omegaTmp("omega-inv-freshness-test", `${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "docs/decisions"), { recursive: true });
  });
  test("a stale digest REPORTS: ok true, stale true, triggers in the detail", () => {
    writeFileSync(join(root, "docs/BUILD-DECISIONS.md"), indexWith("| **D-415** | x Detail: y | **RATIFIED** · evidence | r |\n"));
    writeFileSync(join(root, "docs/decisions/CURRENT-INVARIANTS.md"), `# digest\n\n${MARKER}\n`);
    const r = checkInvariantsFreshness(root);
    expect(r.ok).toBe(true); // REPORT-ONLY — 0 ratified past D-415 here, but stage drift bites
    expect((r.detail as { stale: boolean; triggers: string[] }).stale).toBe(true);
    expect((r.detail as { triggers: string[] }).triggers.join(";")).toMatch(/stage-drift/);
  });
  test("a fresh digest reports fresh (as-of covers the ratified rows, stages match)", () => {
    const stages = Object.keys(STAGE_DOCS).join(" ");
    writeFileSync(join(root, "docs/decisions/CURRENT-INVARIANTS.md"), `# digest\n\n<!-- invariants: pass 9 · as-of D-415 · regenerated 2026-09-20 (D-415) · stages: ${stages} -->\n`);
    const r = checkInvariantsFreshness(root);
    expect(r.ok).toBe(true);
    expect((r.detail as { stale: boolean }).stale).toBe(false);
    expect((r.detail as { triggers: string[] }).triggers).toEqual([]);
    expect((r.detail as { policy: string }).policy).toMatch(/report-only/);
  });
  test("a marker-less digest reports stale (the pre-era page), still green", () => {
    writeFileSync(join(root, "docs/decisions/CURRENT-INVARIANTS.md"), "# the old digest\n\nno marker\n");
    const r = checkInvariantsFreshness(root);
    expect(r.ok).toBe(true);
    expect((r.detail as { stale: boolean }).stale).toBe(true);
    expect((r.detail as { triggers: string[] }).triggers[0]).toMatch(/no-marker/);
  });
  test("mechanics FAIL: malformed marker, unreadable digest", () => {
    writeFileSync(join(root, "docs/decisions/CURRENT-INVARIANTS.md"), "# digest\n\n<!-- invariants: pass 2 · stages: host-loc -->\n");
    const r = checkInvariantsFreshness(root);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatch(/malformed/);
    const missing = checkInvariantsFreshness(join(root, "nowhere"));
    expect(missing.ok).toBe(false);
    expect(missing.issues[0]).toMatch(/unreadable/);
  });
});

describe("F-4 — the live lock: the real digest is fresh against the real registry", () => {
  test("CURRENT-INVARIANTS.md's marker matches STAGE_DOCS exactly and covers the ratified rows", () => {
    const r = checkInvariantsFreshness(REAL_ROOT);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect((r.detail as { stale: boolean }).stale).toBe(false);
    expect((r.detail as { triggers: string[] }).triggers).toEqual([]);
    // The pin tracks the page's current pass: pass 2 was as-of D-415 (D-415's
    // own landing); pass 3 the 2026-09-20 course-correction refresh (D-418..D-421,
    // as-of D-421); pass 4 the process-stage refresh (a gate stage added, D-423;
    // as-of D-424); pass 5 the agent-multiplier wave (a gate stage added, D-425;
    // D-425..D-429, the Ω-DEV family; as-of D-429); pass 6 the session-ledger
    // wave (no stage added — the session law rides round-close + process;
    // D-430, Ω-DEV.6; as-of D-430). Lawful per the D-415 refresh
    // policy. A future refresh bumps this pin in the same commit as the page.
    expect((r.detail as { pass: number }).pass).toBe(6);
    expect((r.detail as { asOf: string }).asOf).toBe("D-430");
  });
});

describe("F-5 — the `-->` leak regression (bitten while writing the parser)", () => {
  test("a marker ending in 'stages: … tests -->' parses without a phantom stage", () => {
    const m = parseInvariantsMarker(MARKER)!;
    expect(m.stages).not.toContain("--");
    expect(m.stages).not.toContain(">");
    const full = readFileSync(join(REAL_ROOT, "docs/decisions/CURRENT-INVARIANTS.md"), "utf-8");
    const real = parseInvariantsMarker(full)!;
    expect(real.stages.every((s) => /^[a-z][a-z-]*$/.test(s))).toBe(true);
    expect(real.stages.length).toBe(Object.keys(STAGE_DOCS).length);
  });
});
