// tooling/gates/test/f-devault.test.ts — the F-DEVAULT falsifier (D-428, Ω-DEV.4).
// Generated as a RED stub by `omega:loop --stub D-428`, then implemented.
//  F-DEVAULT.1 append-only-witness — the chain detects edits and deletions; broken chains refuse extension
//  F-DEVAULT.2 evidence-required — uncited entries are refused and flagged
//  F-DEVAULT.3 fold-derived — knowledge.md is a pure fold of the chained entries
//  F-DEVAULT.4 query-precision — exactly the matching entries, case-insensitive
import { describe, test, expect } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import { foldDevVault, parseEntry, queryDevVault, recordDevEntry, verifyDevVault, type DevEntry } from "../devvault.ts";

const entry = (id: string, over: Partial<DevEntry> = {}): DevEntry => ({
  id, type: "lesson", at: "2026-09-21T00:00:00.000Z", agent: "test",
  context: "the fixture context", statement: `the ${id} statement`,
  evidence: ["D-425"], appliesTo: ["Ω-DEV.4"], retention: "dev-vault-permanent",
  ...over,
});

function freshRoot(): string {
  const root = omegaTmp("omega-devault-test", `${Date.now()}-${process.pid}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe("F-DEVAULT.1 append-only-witness", () => {
  test("chained entries verify GREEN; an EDIT is detected and named; a DELETION is detected; broken chains refuse extension", () => {
    const root = freshRoot();
    recordDevEntry(root, entry("20260921-alpha"));
    recordDevEntry(root, entry("20260921-beta"));
    expect(verifyDevVault(root).ok).toBe(true);
    // EDIT the first entry — the chain must witness it
    const alphaPath = join(root, "dev-vault/entries/20260921-alpha.json");
    writeFileSync(alphaPath, readFileSync(alphaPath, "utf-8").replace("the 20260921-alpha statement", "rewritten history"));
    const edited = verifyDevVault(root);
    expect(edited.ok).toBe(false);
    expect(edited.issues.some((i) => i.startsWith("DEV_CHAIN_BROKEN") && i.includes("20260921-alpha"))).toBe(true);
    // extending a broken chain is REFUSED — repair first, the chain is the witness
    expect(() => recordDevEntry(root, entry("20260921-gamma"))).toThrow(/DEV_CHAIN_BROKEN/);
    // DELETE a chained entry (restore alpha first, then remove beta)
    writeFileSync(alphaPath, readFileSync(alphaPath, "utf-8").replace("rewritten history", "the 20260921-alpha statement"));
    expect(verifyDevVault(root).ok).toBe(true);
    rmSync(join(root, "dev-vault/entries/20260921-beta.json"), { force: true });
    const deleted = verifyDevVault(root);
    expect(deleted.ok).toBe(false);
    expect(deleted.issues.some((i) => i.startsWith("DEV_CHAIN_BROKEN") && i.includes("20260921-beta") && i.includes("missing"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
  test("writing the same id twice is refused (append-only means never rewritten)", () => {
    const root = freshRoot();
    recordDevEntry(root, entry("20260921-dup"));
    expect(() => recordDevEntry(root, entry("20260921-dup"))).toThrow(/DEV_ENTRY_EXISTS/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("F-DEVAULT.2 evidence-required", () => {
  test("an entry with no citations is refused at record time", () => {
    const root = freshRoot();
    expect(() => recordDevEntry(root, entry("20260921-nocite", { evidence: [] }))).toThrow(/DEV_EVIDENCE_REQUIRED/);
    // an unchained orphan file is also flagged by verify
    mkdirSync(join(root, "dev-vault/entries"), { recursive: true });
    writeFileSync(join(root, "dev-vault/entries/20260921-orphan.json"), JSON.stringify(entry("20260921-orphan"), null, 2));
    const v = verifyDevVault(root);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.startsWith("DEV_ORPHAN"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
  test("parseEntry enforces the shape: type, statement, retention", () => {
    expect(parseEntry(JSON.stringify(entry("20260921-x", { type: "vibe" as never }))).issues.join(" ")).toContain("type");
    expect(parseEntry(JSON.stringify(entry("20260921-x", { statement: "" }))).issues.join(" ")).toContain("statement");
    expect(parseEntry(JSON.stringify(entry("20260921-x", { retention: "until-I-say-otherwise" as never }))).issues.join(" ")).toContain("retention");
    expect(parseEntry(JSON.stringify(entry("20260921-x"))).entry).not.toBeNull();
  });
});

describe("F-DEVAULT.3 fold-derived", () => {
  test("the fold is a pure function of the entries — same entries ⇒ byte-identical", () => {
    const es = [entry("20260921-a"), entry("20260921-b", { type: "mistake" }), entry("20260921-c", { type: "pattern" })];
    expect(foldDevVault(es)).toBe(foldDevVault([...es]));
    const md = foldDevVault(es);
    expect(md).toContain("## lesson (1)");
    expect(md).toContain("## mistake (1)");
    expect(md).toContain("## pattern (1)");
    expect(md).toContain("the 20260921-a statement");
  });
});

describe("F-DEVAULT.4 query-precision", () => {
  test("query returns exactly the matches, case-insensitive, across statement/context/appliesTo", () => {
    const es = [
      entry("20260921-a", { statement: "Backtick paper ids in prose" }),
      entry("20260921-b", { statement: "unrelated", context: "the REGISTRY collision lesson" }),
      entry("20260921-c", { statement: "also unrelated", appliesTo: ["Ω-DEV.1"] }),
    ];
    expect(queryDevVault(es, "backtick")).toEqual([es[0]]);
    expect(queryDevVault(es, "registry collision")).toEqual([es[1]]);
    expect(queryDevVault(es, "Ω-DEV.1")).toEqual([es[2]]);
    expect(queryDevVault(es, "nothing matches this")).toEqual([]);
  });
});
