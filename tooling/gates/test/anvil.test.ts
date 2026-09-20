// tooling/gates/test/anvil.test.ts — the D-404 falsifiers: the anvil freeze is
// a wall with two faces (LOC + export surface), each proven green AND red.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform"; // D-372: scratch through the seam
import { ANVIL_BUDGET, ANVIL_EXPORT_SURFACE, anvilLoc, checkAnvilLoc, checkAnvilSurface } from "../anvil.ts";

const ROOT = join(import.meta.dir, "../../..");
let scratch: string;

beforeAll(() => {
  scratch = omegaTmp("omega-anvil-test", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
});
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

/** Materialize a synthetic anvil-shaped dir whose house-method count is exactly `lines`
 *  (each file's last line has no trailing newline, so split("\n").length is exact). */
function syntheticAnvil(lines: number): string {
  const dir = join(scratch, `anvil-${lines}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(dir, { recursive: true });
  const per = Math.max(1, Math.floor(lines / 3));
  let remaining = lines;
  for (let i = 0; i < 3 && remaining > 0; i++) {
    const take = i === 2 ? remaining : Math.min(per, remaining);
    writeFileSync(join(dir, `f${i}.ts`), "x\n".repeat(Math.max(0, take - 1)) + "x");
    remaining -= take;
  }
  return dir;
}

describe("D-404 — anvil-loc: the LOC wall (green + red)", () => {
  test("green: the real tree is at or under budget", () => {
    const r = checkAnvilLoc(join(ROOT, "sdk/src"));
    expect(r.ok).toBe(true);
    expect(r.loc).toBeLessThanOrEqual(ANVIL_BUDGET);
  });

  test("the budget constant is derivable from this gate module (not prose)", () => {
    expect(ANVIL_BUDGET).toBe(860);
    expect(anvilLoc(join(ROOT, "sdk/src"))).toBeGreaterThan(0);
  });

  test("red: one added line over budget fails with the overage named", () => {
    const at = syntheticAnvil(ANVIL_BUDGET);
    expect(checkAnvilLoc(at).ok).toBe(true);
    const over = syntheticAnvil(ANVIL_BUDGET + 1); // one non-blank line, nothing removed
    const r = checkAnvilLoc(over);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain(`is ${ANVIL_BUDGET + 1} LOC (budget ${ANVIL_BUDGET}`);
    expect(r.issues[0]).toContain("remove-to-add");
  });

  test("red: the house method counts every line (comment-golf is not a diet)", () => {
    const dir = join(scratch, `comments-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.ts"), "// comment only\n\n"); // 3 counted lines: comment + 2 blank (no trailing newline)
    expect(anvilLoc(dir)).toBe(3);
  });

  test("the five frozen functions are all present in the live surface snapshot", () => {
    for (const fn of ["parseManifest", "validateManifest", "signPluginDir", "contentHashDir", "createPortClient"]) {
      expect(ANVIL_EXPORT_SURFACE).toContain(fn);
    }
  });
});

describe("D-404 — anvil-surface: the export wall (green + red)", () => {
  test("green: the frozen snapshot equals itself (the live import path is exercised by the gate runner)", () => {
    const r = checkAnvilSurface(ANVIL_EXPORT_SURFACE);
    expect(r.ok).toBe(true);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });

  test("red: a NEW exported function fails with its name named (no D-record, no growth)", () => {
    const r = checkAnvilSurface([...ANVIL_EXPORT_SURFACE, "forgeScaffoldEverything"]);
    expect(r.ok).toBe(false);
    expect(r.added).toEqual(["forgeScaffoldEverything"]);
    expect(r.issues[0]).toContain("anvil surface grew without a decision record");
    expect(r.issues[0]).toContain("forgeScaffoldEverything");
  });

  test("red: a REMOVED export fails too (a freeze erodes in both directions)", () => {
    const r = checkAnvilSurface(ANVIL_EXPORT_SURFACE.filter((k) => k !== "parseManifest"));
    expect(r.ok).toBe(false);
    expect(r.removed).toEqual(["parseManifest"]);
    expect(r.issues[0]).toContain("anvil surface shrank without a decision record");
  });
});

describe("D-404 — anvil hygiene: no Forge logic hides in the pre-boot edge", () => {
  test("sdk/src contains no forge.* op handler wiring (the anvil is not a Forge)", () => {
    const files = readdirSync(join(ROOT, "sdk/src")).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const text = readFileSync(join(ROOT, "sdk/src", f), "utf-8");
      expect(text.includes('"forge.')).toBe(false);
      expect(text.includes("startPlugin")).toBe(false);
    }
  });
});
