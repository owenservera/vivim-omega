// D-420 falsifiers — the shippable-v1 fence, mechanically checked.
// F-1 (red/green, the forge-surface discipline): the check is pure over
//     hand-built inputs — green on the real tree, RED on a hand-built
//     violation for each named refusal (SHIPPABLE_V1_MISSING,
//     SHIPPABLE_V1_UNTAGGED, AI_API_IN_SHIPPABLE), each failing BY NAME.
// F-2 (wired, not decorative): the real-tree compositions stage runs the
//     check and reports zero issues with it active — the gate enforces the
//     fence on every run, not just in this file.
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkShippableFence,
  checkCompositions,
  SHIPPABLE_MARKER,
  SHIPPABLE_V1_NAME,
  AI_API_REALIZATIONS,
  type ShippableSpecInput,
} from "../compositions.ts";

const ROOT = join(import.meta.dir, "../../..");
const COMPOSITIONS = join(ROOT, "compositions");

/** The real tree, loaded exactly the way the gate's check 8 loads it. */
function realSpecs(): ShippableSpecInput[] {
  const files = readdirSync(COMPOSITIONS).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(COMPOSITIONS, f), "utf-8")) as {
      _note?: string;
      entries?: Array<{ id?: string }>;
    };
    return {
      name: f.replace(/\.json$/, ""),
      note: raw._note ?? "",
      entryIds: (raw.entries ?? []).map((e) => e.id ?? "").filter(Boolean),
    };
  });
}

/** A deep copy of the real specs — mutations land on the copy, never the tree. */
function mutated(fn: (specs: ShippableSpecInput[]) => void): ShippableSpecInput[] {
  const copy = JSON.parse(JSON.stringify(realSpecs())) as ShippableSpecInput[];
  fn(copy);
  return copy;
}

function codesOf(issues: Array<{ check: string }>): string[] {
  return issues.map((i) => i.check);
}

describe("D-420 · shippable fence on the REAL tree (all green)", () => {
  const specs = realSpecs();

  test("the loader actually sees the domain (guards against silent no-op)", () => {
    expect(specs.length).toBe(18);
    const browser = specs.find((s) => s.name === SHIPPABLE_V1_NAME)!;
    expect(browser.note).toContain(SHIPPABLE_MARKER);
    expect(browser.entryIds).toContain("provider.browser"); // the realization v1 ships
    expect(AI_API_REALIZATIONS).toEqual(["provider.llm"]);
  });

  test("the real tree passes the fence (the shippable boundary holds)", () => {
    expect(checkShippableFence(specs)).toEqual([]);
  });

  test("the proving compositions stay untagged and keep their AI-API realization (untouched by design)", () => {
    for (const name of ["console", "llm", "chat", "discovery-mind"]) {
      const s = specs.find((x) => x.name === name)!;
      expect(s.note).not.toContain(SHIPPABLE_MARKER);
      expect(s.entryIds).toContain("provider.llm"); // internal proving compositions, D-385 lineage
    }
  });

  test("F-2 · wired: the real-tree compositions stage reports zero issues with the fence active", async () => {
    const r = await checkCompositions(ROOT, { shippableFence: true });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    const fence = r.detail.shippableFence as { tagged: string[]; marker: string };
    expect(fence.tagged).toEqual([SHIPPABLE_V1_NAME]);
    expect(fence.marker).toBe(SHIPPABLE_MARKER);
  });
});

describe("D-420 · SHIPPABLE_V1_MISSING (red)", () => {
  test("no tagged composition anywhere — the unnamed boundary fails by name", () => {
    const issues = checkShippableFence(mutated((specs) => {
      for (const s of specs) s.note = s.note.replace(SHIPPABLE_MARKER, "SHIPPABLE-V1 (redacted)");
    }));
    expect(issues).not.toEqual([]);
    expect(codesOf(issues)).toContain("SHIPPABLE_V1_MISSING");
    const hit = issues.find((i) => i.check === "SHIPPABLE_V1_MISSING")!;
    expect(hit.reason).toContain("shippable-v1 boundary is unnamed");
    expect(hit.fix).toContain("D-377");
  });
});

describe("D-420 · SHIPPABLE_V1_UNTAGGED (red)", () => {
  test("the named shippable-v1 composition lost its marker — fails by name", () => {
    const issues = checkShippableFence(mutated((specs) => {
      const browser = specs.find((s) => s.name === SHIPPABLE_V1_NAME)!;
      browser.note = browser.note.replace(SHIPPABLE_MARKER, "SHIPPABLE-V1 (redacted)");
      // another spec still tagged: only the UNTAGGED refusal fires
      specs.find((s) => s.name === "agent")!.note += ` ${SHIPPABLE_MARKER} (test fixture: successor candidate)`;
    }));
    expect(codesOf(issues)).toContain("SHIPPABLE_V1_UNTAGGED");
    const hit = issues.find((i) => i.check === "SHIPPABLE_V1_UNTAGGED")!;
    expect(hit.subject).toBe(`${SHIPPABLE_V1_NAME}.json`);
    expect(hit.reason).toContain(SHIPPABLE_V1_NAME);
  });
});

describe("D-420 · AI_API_IN_SHIPPABLE (red)", () => {
  test("an AI-API realization added to the tagged composition fails BY NAME", () => {
    const issues = checkShippableFence(mutated((specs) => {
      const browser = specs.find((s) => s.name === SHIPPABLE_V1_NAME)!;
      browser.entryIds.push("provider.llm");
    }));
    expect(issues).not.toEqual([]);
    expect(codesOf(issues)).toContain("AI_API_IN_SHIPPABLE");
    const hit = issues.find((i) => i.check === "AI_API_IN_SHIPPABLE")!;
    expect(hit.subject).toBe(`${SHIPPABLE_V1_NAME}.json/provider.llm`);
    expect(hit.reason).toContain("no AI-API realization ships in v1");
  });

  test("the same entry in an UNTAGGED composition stays legal (the proving-compositions carve-out)", () => {
    const issues = checkShippableFence(mutated((specs) => {
      const llm = specs.find((s) => s.name === "llm")!;
      llm.entryIds.push("provider.llm"); // already there; duplicated on purpose
    }));
    expect(codesOf(issues).filter((c) => c === "AI_API_IN_SHIPPABLE")).toEqual([]);
  });
});
