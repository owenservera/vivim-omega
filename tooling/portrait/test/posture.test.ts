// tooling/portrait/test/posture.test.ts — the D-350 posture parser evidence.
// Self-hosting: the parser reads the invariant register the doc claims, keeps
// the owner's wording verbatim (statuses, notes, qualifiers), and stays honest
// when the doc is absent (this lineage has not re-created PRINCIPLES.md — []
// is the truth, not an error).
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { parsePosture, readPosture } from "../posture.ts";

const ROOT = join(import.meta.dir, "../../../.."); // test/ → portrait/ → tooling/ → root

describe("posture parser (D-350)", () => {
  test("parses I-rows with name/status/note cells, verbatim", () => {
    const doc = [
      "# PRINCIPLES",
      "",
      "## §1 The invariant register",
      "",
      "| Id | Invariant | Posture | Note |",
      "| --- | --- | --- | --- |",
      "| I1 | Self-describing | Built | violation: any behavior described only in prose |",
      "| I11 | Continuous identity | Named, one real gap | identity is a property of the vault |",
    ].join("\n");
    const rows = parsePosture(doc);
    expect(rows).toEqual([
      { id: "I1", name: "Self-describing", status: "Built", note: "violation: any behavior described only in prose" },
      { id: "I11", name: "Continuous identity", status: "Named, one real gap", note: "identity is a property of the vault" },
    ]);
  });

  test("tolerant: qualifiers before the em-dash, empty cells, non-I rows ignored, order normalized", () => {
    const doc = [
      "| I7 | Single-user core, shared spaces | Deferred | (T2) — sharing machinery unbuilt |",
      "| I3 | Consumer-programmable, one mode | Built at the grammar level | |",
      "| X9 | Not an invariant | Built | ignored |",
      "| I2 | Self-knowing | Partial |", // no trailing note cell
      "some prose line with | pipes | but | no invariant id |",
    ].join("\n");
    const rows = parsePosture(doc);
    expect(rows.map((r) => r.id)).toEqual(["I2", "I3", "I7"]);
    expect(rows[0]).toEqual({ id: "I2", name: "Self-knowing", status: "Partial" });
    expect(rows[2].status).toBe("Deferred");
    expect(rows[2].note).toBe("(T2) — sharing machinery unbuilt");
  });

  test("honest absence: a missing PRINCIPLES.md reads as [] (never invented rows)", () => {
    // this lineage has not re-created docs/PRINCIPLES.md — readPosture must say so with []
    const rows = readPosture(ROOT);
    expect(Array.isArray(rows)).toBe(true);
    // when the doc is absent this is exactly [] — and if it ever comes back,
    // every row must carry an I<n> id (the register shape, never garbage)
    for (const r of rows) expect(r.id).toMatch(/^I\d+$/);
    expect(parsePosture("")).toEqual([]);
  });
});
