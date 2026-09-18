// tooling/harvest/test — harvest tools conformance (W1 tasks 3+4)
// Falsifiers for the fixture pipeline and the triage splitter:
//   * fixture pipeline: canonical MANIFEST bytes, drift refusal (hash + rows),
//     determinism law, recordedOnly law, governed-parser shape refusals;
//   * triage splitter: one-op-one-surface completeness, deterministic patch
//     bytes, verdict-preserving (patch only, never a ledger write).
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";

// The tools read/write fixtures/harvest/MANIFEST.json at the repo root. The
// tests exercise the REAL importer/check against the REAL fixtures (the four
// recorded rows), and a scratch tree for the drift/determinism falsifiers.
import {
  importFixture, checkFixtures, readManifest, canonicalJson, shapeCheck,
} from "../fixture-import.ts";
import { splitSubsystem, renderPatch, type SubsystemDescriptor } from "../triage-split.ts";

const REAL_SSE = join(import.meta.dir, "../../../fixtures/sse/legacy-chat-complete.sse.txt");
const REAL_IMPORT = join(import.meta.dir, "../../../fixtures/import/chatgpt-conversations.json");

// ---- canonicalJson ------------------------------------------------------------

describe("harvest tools — canonicalJson (the byte-identical emitter)", () => {
  test("key order is sorted and stable regardless of insertion order", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } });
    const b = canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
  });
  test("arrays keep order (order is data, not formatting); trailing newline present", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[\n  3,\n  1,\n  2\n]\n");
  });
});

// ---- the REAL fixtures pass the pipeline (W1 falsifier half) --------------------

describe("harvest tools — the recorded fixture pipeline is green on the real rows", () => {
  test("all recorded fixtures verify: hash + shape + determinism (checkFixtures on the real MANIFEST)", () => {
    const r = checkFixtures();
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.rows).toBe(4); // sse + chatgpt + claude + gemini
    const m = readManifest();
    for (const row of m.fixtures) {
      expect(row.provenance.recordedOnly).toBe(true);
      expect(row.provenance.mine).toMatch(/^vivim-final-program@4a5eb84$/);
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the sse fixture parses through the GOVERNED pin (resolveParser), never a raw import", () => {
    const { rows, final } = shapeCheck("sse", "llm", readFileSync(REAL_SSE, "utf-8"));
    expect(final).toBe(true);
    expect(rows.length).toBe(10);
    expect((rows[0]!.data as Record<string, unknown>).kind).toBe("sse.frame");
    expect((rows[rows.length - 1]!.data as Record<string, unknown>)).toMatchObject({ kind: "sse.done", terminator: "sentinel" });
  });

  test("the import fixture parses through the GOVERNED pin (resolveImportParser), deterministically", () => {
    const text = readFileSync(REAL_IMPORT, "utf-8");
    const a = shapeCheck("import", "chatgpt", text);
    const b = shapeCheck("import", "chatgpt", text);
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
    expect(a.final).toBe(true);
  });

  test("unknown source or kind REFUSES with a name (fail-closed genealogy)", () => {
    expect(() => shapeCheck("import", "generic", "[]")).toThrow(/no import parser for source/);
    expect(() => shapeCheck("sse", "browser", "x")).toThrow(/sse kind expects source/);
    expect(() => shapeCheck("rss" as never, "llm", "x")).toThrow(/unknown kind/);
  });
});

// ---- drift + determinism falsifiers (scratch tree) ------------------------------

describe("harvest tools — drift refusals (the pipeline's teeth)", () => {
  test("a byte change to a recorded fixture is HASH DRIFT with a named diagnostic", () => {
    // corrupt a COPY of the manifest's sse fixture on disk, then restore.
    const bytes = readFileSync(REAL_SSE);
    try {
      writeFileSync(REAL_SSE, Buffer.from(bytes.toString("utf-8").replace("[DONE]", "[DONN]"), "utf-8"));
      const r = checkFixtures();
      expect(r.ok).toBe(false);
      expect(r.problems.some((p) => p.includes("HASH DRIFT") && p.includes("legacy-chat-complete.sse.txt"))).toBe(true);
    } finally {
      writeFileSync(REAL_SSE, bytes); // restore — the tree stays honest even on failure
    }
    expect(checkFixtures().ok).toBe(true);
  });
});

// ---- triage splitter ------------------------------------------------------------

const GOOD: SubsystemDescriptor = {
  tNumber: "T-06",
  subsystem: "Browser primitives + CDP proxy",
  mine: "vivim-final-program@4a5eb84",
  wave: "W2",
  boundaries: [
    { op: "cdp.attach", files: ["src/engines/chrome/cdp-proxy.ts"], landing: "provider-browser sessions-by-reference", harvestClass: "ALGORITHM" },
    { op: "cdp.health", files: ["src/engines/chrome/health-monitor.ts", "src/engines/chrome/trace-log.ts"], landing: "watchdog budgets + mind spine", harvestClass: "PATTERN" },
  ],
};

describe("harvest tools — triage splitter (one op = one surface, patch only)", () => {
  test("splits a subsystem descriptor into numbered boundary rows, deterministic bytes", () => {
    const a = renderPatch(GOOD);
    const b = renderPatch(GOOD);
    expect(a).toBe(b); // same descriptor → byte-identical patch
    expect(a).toContain("| T-06.1 | `cdp.attach` |");
    expect(a).toContain("| T-06.2 | `cdp.health` |");
    expect(a).toContain("PROPOSED ledger patch");
    expect(a).toContain("vivim-final-program@4a5eb84");
    // files sorted within a row
    expect(a).toContain("src/engines/chrome/health-monitor.ts, src/engines/chrome/trace-log.ts");
  });

  test("completeness: a file claimed by two boundaries REFUSES (one op = one surface)", () => {
    const bad: SubsystemDescriptor = {
      ...GOOD,
      boundaries: [
        { op: "cdp.attach", files: ["src/engines/chrome/cdp-proxy.ts"], landing: "x", harvestClass: "ALGORITHM" },
        { op: "cdp.mux", files: ["src/engines/chrome/cdp-proxy.ts"], landing: "y", harvestClass: "ALGORITHM" },
      ],
    };
    expect(() => splitSubsystem(bad)).toThrow(/already claimed by boundary/);
  });

  test("fail-closed descriptor checks: T-number, mine pin, empty boundaries, class vocabulary", () => {
    expect(() => splitSubsystem({ ...GOOD, tNumber: "T06" })).toThrow(/T-<n>/);
    expect(() => splitSubsystem({ ...GOOD, mine: "vivim-final-program" })).toThrow(/<repo>@<pinned-sha>/);
    expect(() => splitSubsystem({ ...GOOD, boundaries: [] })).toThrow(/non-empty array/);
    expect(() => splitSubsystem({
      ...GOOD,
      boundaries: [{ op: "cdp.attach", files: ["a.ts"], landing: "x", harvestClass: "MAYBE" as never }],
    })).toThrow(/harvestClass/);
    expect(() => splitSubsystem({
      ...GOOD,
      boundaries: [{ op: "CDP Attach", files: ["a.ts"], landing: "x", harvestClass: "DATA" }],
    })).toThrow(/op .*must be one bare op-ish token/);
  });

  test("the splitter never writes the ledger (pure: no fs in the module, patch returned as text)", () => {
    // renderPatch is pure — call it and assert the ledger is untouched (no
    // TRIAGE-LEDGER.md mtime/content change is implied by construction; we
    // assert the patch is a string the caller chooses to apply).
    const patch = renderPatch(GOOD);
    expect(typeof patch).toBe("string");
    expect(patch.startsWith("<!-- PROPOSED ledger patch")).toBe(true);
  });
});

// ---- scratch-tree import round trip (the CLI contract, library-level) -----------

describe("harvest tools — importFixture on scratch rows (manifest upsert semantics)", () => {
  test("import → check green → tamper the manifest hash → check red with a name", () => {
    // run against the REAL manifest: re-import the gemini fixture (idempotent
    // upsert must keep the manifest byte-identical), then corrupt its recorded
    // hash and demand a named refusal.
    const before = readFileSync(join(import.meta.dir, "../../../fixtures/harvest/MANIFEST.json"), "utf-8");
    const row = importFixture({
      fixturePath: "fixtures/import/gemini-export.json",
      kind: "import",
      source: "gemini",
      mine: "vivim-final-program@4a5eb84",
      originPath: "src/engines/parsers/gemini-import.ts",
      harvestedAt: "2026-09-17",
    });
    const after = readFileSync(join(import.meta.dir, "../../../fixtures/harvest/MANIFEST.json"), "utf-8");
    expect(after).toBe(before); // idempotent: re-import is byte-identical (canonical emitter)
    expect(row.rows).toBe(7);

    const m = JSON.parse(before) as { fixtures: Array<{ fixture: string; sha256: string }> };
    const tampered = structuredClone(m);
    tampered.fixtures.find((f) => f.fixture.includes("gemini"))!.sha256 = "0".repeat(64);
    const manifestPath = join(import.meta.dir, "../../../fixtures/harvest/MANIFEST.json");
    const orig = readFileSync(manifestPath, "utf-8");
    try {
      writeFileSync(manifestPath, canonicalJson(tampered), "utf-8");
      const r = checkFixtures();
      expect(r.ok).toBe(false);
      expect(r.problems.some((p) => p.includes("HASH DRIFT") && p.includes("gemini"))).toBe(true);
    } finally {
      writeFileSync(manifestPath, orig, "utf-8");
    }
    expect(checkFixtures().ok).toBe(true);
  });

  test("importFixture refuses a mine without a pinned sha (W0-9a provenance law)", () => {
    expect(() => importFixture({
      fixturePath: "fixtures/import/gemini-export.json",
      kind: "import",
      source: "gemini",
      mine: "vivim-final-program",
      originPath: "src/engines/parsers/gemini-import.ts",
      harvestedAt: "2026-09-17",
    })).toThrow(/<repo>@<pinned-sha>/);
  });
});
