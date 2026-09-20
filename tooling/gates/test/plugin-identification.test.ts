// D-417 falsifiers — the plugin-identification pass, mechanically checked.
// F-1 (completeness): the record's op enumeration is SET-EQUAL to the frozen
//     24-op catalog (packs/builder's manifest forge contracts, D-406) — every
//     catalog op appears in the record, nothing beyond the catalog appears.
//     A forgotten lane or an invented 25th op fails BY NAME.
// F-2 (identify, never design): the record carries no fenced code blocks and
//     no interface declarations — the shape-level proxy for "names lanes,
//     draws no maps" (a design draft cannot hide in an identification record).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const RECORD = join(ROOT, "docs/decisions/D-417-plugin-identification.md");
const PACK_MANIFEST = join(ROOT, "packs/builder/plugin.json");

interface ManifestShape { contributions?: { contract?: Array<{ id: string }> } }

/** The frozen catalog (D-406): pack.builder's forge contract ids, @1-suffixed. */
function frozenCatalog(): Set<string> {
  const m = JSON.parse(readFileSync(PACK_MANIFEST, "utf-8")) as ManifestShape;
  return new Set(
    (m.contributions?.contract ?? [])
      .map((c) => c.id)
      .filter((id) => id.startsWith("forge."))
      .map((id) => (id.includes("@") ? id : `${id}@1`)),
  );
}

/** The ops this record names (its enumeration table + the implemented note). */
function recordOps(record: string): Set<string> {
  return new Set(record.match(/forge\.[a-z]+\.[a-z]+@1/g) ?? []);
}

describe("D-417 · the plugin-identification pass (mechanical falsifiers)", () => {
  const record = readFileSync(RECORD, "utf-8");
  const catalog = frozenCatalog();
  const named = recordOps(record);

  test("F-1a: the catalog is the frozen 24 (the D-406 shape this record enumerates against)", () => {
    expect(catalog.size).toBe(24);
    expect(catalog.has("forge.author.init@1")).toBe(true); // the Wave-0 implemented one
  });

  test("F-1b: every frozen catalog op appears in the record's enumeration — a forgotten lane fails BY NAME", () => {
    const missing = [...catalog].filter((op) => !named.has(op));
    expect(missing, `D-417 enumeration incomplete — these catalog ops have no lane:\n${missing.join("\n")}`).toEqual([]);
  });

  test("F-1c: nothing beyond the catalog appears — an invented 25th op fails BY NAME", () => {
    const invented = [...named].filter((op) => !catalog.has(op));
    expect(invented, `D-417 enumeration overruns the frozen catalog (D-406 — a 25th op needs an amendment record first):\n${invented.join("\n")}`).toEqual([]);
  });

  test("F-1d: the implemented op is named as implemented; the eight lanes carry exactly the 23 remaining ops", () => {
    expect(record).toContain("implemented: `forge.author.init@1`");
    expect(record).toContain("`plugins/forge-author/`, Wave 0");
    // 1 (capture) + 3 (mine siblings) + 2 + 2 + 3 + 5 + 4 + 3 = 23, plus the
    // implemented one named in Context = all 24 accounted for in the record.
    expect(named.size).toBe(24);
  });

  test("F-2: identification, never design — no fenced code blocks, no interface declarations in the record", () => {
    expect(record.includes("```")).toBe(false); // a design draft cannot hide in an identification record
    expect(record.includes("interface ")).toBe(false); // no TS shapes — ids, op coverage, decided facts only
  });
});
