// forge.author — test/refusal/init-refusals.test.ts (authored)
// The named-refusal net for forge.author.init@1. Every case is a REAL boot
// (same composition as the happy path — law + vault + the plugin routed
// normally), and every refusal must be a NAMED rule in an ok:true envelope
// (the house's D-379 refusal-as-data), never a generic error. After each
// refusal the target directory is inspected: a refusal must leave zero bytes
// behind (fail-closed means nothing ships when anything is wrong).
//
// The eight packet-mandated refusals carry their packet numbers in comments;
// the rest are the structural fence the same discipline demands.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "../../../../host/src/index.ts";
import type { BootedHost } from "../../../../host/src/index.ts";
import { omegaTmp } from "@vivim/omega-platform";
import { specInputHash, FORGE_AUTHOR_OP, type RecordedSpec } from "../../src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "../../");
const COMP_SPEC_PATH = join(import.meta.dir, "../../../../compositions/forge-author.json");
const compSpec = JSON.parse(readFileSync(COMP_SPEC_PATH, "utf-8"));
const selfSpec = JSON.parse(readFileSync(join(PLUGIN_DIR, "spec/self.json"), "utf-8")) as RecordedSpec;

let vault: string;
let host: BootedHost;

async function call(payload: unknown): Promise<{ refused: boolean; rule?: string; detail?: string; [k: string]: unknown }> {
  const r = await host.router.callAsRoot(FORGE_AUTHOR_OP, payload);
  if (!r.ok) throw new Error(`${FORGE_AUTHOR_OP} did not even return: ${r.error}: ${String((r as { detail?: string }).detail ?? "")}`);
  return r.value as { refused: boolean; rule?: string; detail?: string };
}

/** A deep copy of the recorded spec with its own fresh scratch target
 *  (output sits outside the spec's hash domain, so pinning survives). */
function variant(name: string, mutate?: (s: RecordedSpec) => void): RecordedSpec {
  const s = JSON.parse(JSON.stringify(selfSpec)) as RecordedSpec;
  const out = omegaTmp("omega-forge-author-refusal", name);
  rmSync(out, { recursive: true, force: true });
  s.output = out;
  if (mutate) mutate(s);
  return s;
}

/** Assert a named refusal AND that the target directory stayed empty. */
async function expectRefusal(name: string, rule: string, mutate?: (s: RecordedSpec) => void): Promise<{ detail: string }> {
  const s = variant(name, mutate);
  const r = await call({ spec: s });
  expect(r.refused, `expected refusal ${rule}, got ${JSON.stringify(r).slice(0, 300)}`).toBe(true);
  expect(r.rule).toBe(rule);
  expect(typeof r.detail).toBe("string");
  const outDir = s.output as string;
  const entries = existsSync(outDir) ? readdirSync(outDir) : [];
  expect(entries, `${rule} must leave zero bytes in the target directory (found ${entries.join(", ")})`).toEqual([]);
  return { detail: r.detail ?? "" };
}

beforeAll(async () => {
  vault = omegaTmp("omega-forge-author-refusal", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(compSpec, join(COMP_SPEC_PATH, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("the eight packet refusals — each NAMED, each leaving zero bytes", () => {
  test("1 · a spec with unknown fields → SPEC_UNKNOWN_FIELD", async () => {
    const { detail } = await expectRefusal("unknown-field", "SPEC_UNKNOWN_FIELD", (s) => {
      (s as Record<string, unknown>)["toys"] = 1;
    });
    expect(detail).toContain("toys");
  });

  test("2 · a spec requesting output outside the scratch/proposal path → SPEC_OUTPUT_SCOPE", async () => {
    const { detail } = await expectRefusal("output-scope", "SPEC_OUTPUT_SCOPE", (s) => {
      s.output = "evil-emit/inside-the-repo"; // relative → resolves under the repo cwd, never scratch
    });
    expect(detail).toContain("outside");
  });

  test("3 · a spec requesting signing → SPEC_SIGNING_FORBIDDEN", async () => {
    await expectRefusal("signing", "SPEC_SIGNING_FORBIDDEN", (s) => {
      (s as Record<string, unknown>)["sign"] = true;
    });
  });

  test("4 · a spec requesting capability grants → SPEC_CAPABILITY_GRANT_FORBIDDEN", async () => {
    await expectRefusal("grants", "SPEC_CAPABILITY_GRANT_FORBIDDEN", (s) => {
      (s as Record<string, unknown>)["grants"] = ["host.journal.append"];
    });
  });

  test("5 · a spec requesting product composition membership → SPEC_COMPOSITION_MEMBERSHIP_FORBIDDEN", async () => {
    await expectRefusal("membership", "SPEC_COMPOSITION_MEMBERSHIP_FORBIDDEN", (s) => {
      (s as Record<string, unknown>)["productComposition"] = "agent";
    });
  });

  test("6 · a spec with a mismatched plugin id (self-hosting) → SPEC_PLUGIN_ID_MISMATCH", async () => {
    const { detail } = await expectRefusal("id-mismatch", "SPEC_PLUGIN_ID_MISMATCH", (s) => {
      s.pluginId = "forge.emit";
    });
    expect(detail).toContain("forge.emit");
  });

  test("7 · a spec with no hash-pinned command list → SPEC_COMMAND_LIST_UNPINNED", async () => {
    await expectRefusal("unpinned", "SPEC_COMMAND_LIST_UNPINNED", (s) => {
      s.commandList = [];
    });
  });

  test("8 · a spec attempting to overwrite an existing non-empty target → SPEC_TARGET_EXISTS", async () => {
    const s = variant("target-exists");
    mkdirSync(s.output as string, { recursive: true });
    writeFileSync(join(s.output as string, "sentinel.txt"), "a previous (non-scratch-shaped) emission lives here\n");
    const r = await call({ spec: s });
    expect(r.refused).toBe(true);
    expect(r.rule).toBe("SPEC_TARGET_EXISTS");
    // the sentinel survives untouched — an overwrite attempt changes nothing
    expect(readdirSync(s.output as string)).toEqual(["sentinel.txt"]);
    expect(readFileSync(join(s.output as string, "sentinel.txt"), "utf-8")).toContain("previous");
  });
});

describe("the structural fence (the same discipline, named)", () => {
  test("a payload that is not {spec} → SPEC_MALFORMED_INPUT", async () => {
    const r = await call({});
    expect(r.refused).toBe(true);
    expect(r.rule).toBe("SPEC_MALFORMED_INPUT");
  });

  test("a spec whose file path escapes the tree → SPEC_PATH_ESCAPE", async () => {
    await expectRefusal("path-escape", "SPEC_PATH_ESCAPE", (s) => {
      s.files[0].path = "../escape.ts";
    });
  });

  test("a spec body tampered without re-pinning → SPEC_SPEC_HASH_MISMATCH", async () => {
    await expectRefusal("spec-hash", "SPEC_SPEC_HASH_MISMATCH", (s) => {
      s.version = "0.2.0";
    });
  });

  test("a re-pinned spec whose template drifted from its content pins → SPEC_CONTENT_PIN_MISMATCH", async () => {
    await expectRefusal("content-pin", "SPEC_CONTENT_PIN_MISMATCH", (s) => {
      s.files[0].template = `${s.files[0].template}\n`;
      s.commandList[0].inputHash = specInputHash(s as unknown as Record<string, unknown>);
    });
  });

  test("a law-forbidden principal cannot self-check green → SPEC_LAW_REFUSED (the manifest's law-gated claim, as data)", async () => {
    // The manifest justification says "Every write is law-gated". Prove it:
    // forbid forge.author.init@1 for the forge.author principal, then watch
    // the op refuse BEFORE emitting a single byte.
    const r0 = await host.router.callAsRoot("law.forbidden.set@1", { principal: "forge.author", ops: [FORGE_AUTHOR_OP] });
    if (!r0.ok) throw new Error(`law.forbidden.set@1 failed: ${r0.error}`);
    try {
      const s = variant("law-refused");
      const r = await call({ spec: s });
      expect(r.refused).toBe(true);
      expect(r.rule).toBe("SPEC_LAW_REFUSED");
      expect(existsSync(s.output as string) ? readdirSync(s.output as string) : []).toEqual([]);
    } finally {
      const clear = await host.router.callAsRoot("law.forbidden.set@1", { principal: "forge.author", ops: [] });
      if (!clear.ok) throw new Error(`law.forbidden.set@1 (clear) failed: ${clear.error}`);
    }
  });
});
