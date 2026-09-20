// tooling/gates/test/f-loop.test.ts — the F-LOOP falsifier (D-426, Ω-DEV.2).
// Generated as a RED stub by `omega:loop --stub D-426`, then implemented —
// the loop testing itself, its own first leg proven red by execution.
//  F-LOOP.1 determinism — the stub template is a pure function of the record text
//  F-LOOP.2 red-by-construction — a generated stub FAILS when run (spawned, observed)
//  F-LOOP.3 coverage-audit — declared ids resolve to test files or are RED, named
//  F-LOOP.4 no-clobber — implemented files refuse regeneration (LOOP_STUB_OVERWRITE)
import { describe, test, expect } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { omegaTmp } from "@vivim/omega-platform";
import { auditLoop, falsifiersOfRecord, generateStubs, stubPath, stubTemplate, type StubSpec } from "../loopstub.ts";

const RECORD = (evidence: string) => `# D-9 — fixture

## Status

PROPOSED

## Context

- fixture

Blocks: none

## Options

| Criterion | (a) x | (b) y |
|---|---|---|
| c | | |

## Decision

**Decision:** (a) — fixture.

## Consequences

- fixture

## Evidence

${evidence}

## Index

summary: s
rationale: r
class: evidence
`;

const EVIDENCE = `  - F-FOO.1 (first) — the first clause.
  - F-FOO.2 (second) — the second clause.
  - F-BAR.1 (only) — prose may mention F-FOO and even F-BAZ without declaring them.`;

describe("F-LOOP.1 determinism", () => {
  test("same record ⇒ byte-identical stub", () => {
    const spec: StubSpec = { recordN: 9, id: "F-FOO", clauses: [{ clause: 1, title: "first" }, { clause: 2, title: "second" }] };
    expect(stubTemplate(spec)).toBe(stubTemplate({ ...spec }));
  });
  test("extraction: clause lines declare, prose mentions do NOT", () => {
    const specs = falsifiersOfRecord(RECORD(EVIDENCE));
    const ids = specs.map((s) => s.id);
    expect(ids).toEqual(["F-FOO", "F-BAR"]);       // declared via clause lines, first-seen order
    expect(ids).not.toContain("F-BAZ");            // prose mention only — a mention, not a declaration
    expect(specs[0].clauses).toHaveLength(2);
    expect(specs[0].clauses[0]).toEqual({ clause: 1, title: "first" });
  });
  test("the stub path is stable and single-prefixed", () => {
    expect(stubPath("F-GENOME")).toBe("tooling/gates/test/f-genome.test.ts");
    expect(stubPath("F-APERTURE-PRIVACY")).toBe("tooling/gates/test/f-aperture-privacy.test.ts");
  });
});

describe("F-LOOP.2 red-by-construction", () => {
  test("a generated stub FAILS when run — every clause throws 'not implemented'", () => {
    const spec: StubSpec = { recordN: 9, id: "F-REDA", clauses: [{ clause: 1, title: "first" }] };
    const dir = omegaTmp("omega-loop-redproof", `${Date.now()}-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "f-reda.test.ts");
    writeFileSync(file, stubTemplate(spec));
    const p = spawnSync(process.execPath, ["test", file], { encoding: "buffer", timeout: 60_000 });
    const out = `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}`;
    expect(p.status === 0 ? 0 : 1).toBe(1);                       // nonzero exit: RED, proven by execution
    expect(out).toContain("not implemented");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("F-LOOP.3 coverage-audit", () => {
  test("a declared id with a carrier is GREEN; without, RED and named", () => {
    const records = [{ n: 9, text: RECORD(EVIDENCE) }];
    const withCarrier = auditLoop(records, [{ path: "tooling/gates/test/f-foo.test.ts", text: "// F-FOO and F-BAR live here" }]);
    expect(withCarrier.ok).toBe(true);
    expect(withCarrier.rows.map((r) => r.id).sort()).toEqual(["F-BAR", "F-FOO"]);
    const without = auditLoop(records, []);
    expect(without.ok).toBe(false);
    expect(without.missing.map((m) => m.id).sort()).toEqual(["F-BAR", "F-FOO"]);
  });
});

describe("F-LOOP.4 no-clobber", () => {
  test("regenerating over an implemented file refuses LOOP_STUB_OVERWRITE; --force regenerates; idempotent over the stub itself", () => {
    const root = omegaTmp("omega-loop-clobber", `${Date.now()}-${process.pid}`);
    mkdirSync(join(root, "docs/decisions"), { recursive: true });
    writeFileSync(join(root, "docs/decisions/D-9-fixture.md"), RECORD(EVIDENCE));
    // first generation writes the stub
    const first = generateStubs(root, 9);
    expect(first.written).toContain("tooling/gates/test/f-foo.test.ts");
    // idempotent: regenerating over the identical stub is a no-op, not a refusal
    const again = generateStubs(root, 9);
    expect(again.written).toEqual([]);
    expect(again.refused).toEqual([]);
    // implement the file (content leaves the stub template)
    const abs = join(root, "tooling/gates/test/f-foo.test.ts");
    writeFileSync(abs, `${readFileSync(abs, "utf-8")}\n// implemented — evidence now\n`);
    // regenerating over an IMPLEMENTED file is refused
    const refused = generateStubs(root, 9);
    expect(refused.written).toEqual([]);
    expect(refused.refused.some((r) => r.reason.startsWith("LOOP_STUB_OVERWRITE") && r.path === "tooling/gates/test/f-foo.test.ts")).toBe(true);
    // --force regenerates anyway, saying so loudly
    const forced = generateStubs(root, 9, true);
    expect(forced.written).toContain("tooling/gates/test/f-foo.test.ts");
    // after --force the file IS the stub again — the idempotent no-op proves it
    const idem = generateStubs(root, 9);
    expect(idem.written).toEqual([]);
    expect(idem.refused).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
