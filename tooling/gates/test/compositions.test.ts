// W1 seed unit evidence: the checker catches the D-325 invariant, undeclared
// grants, and unroutable caps — against temp dirs, never the real tree.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkCompositions } from "../compositions.ts";

function scaffold(root: string, specs: Record<string, object>, manifests: Record<string, object>): void {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "compositions"), { recursive: true });
  for (const [name, spec] of Object.entries(specs)) {
    writeFileSync(join(root, "compositions", name), JSON.stringify(spec, null, 2));
  }
  for (const [dir, manifest] of Object.entries(manifests)) {
    mkdirSync(join(root, "compositions", dir), { recursive: true });
    writeFileSync(join(root, "compositions", dir, "plugin.json"), JSON.stringify(manifest, null, 2));
  }
}

const LAW_MANIFEST = {
  manifestVersion: "1", id: "vivim.law", entry: "src/index.ts",
  contributions: {
    contract: [
      { kind: "contract", id: "law.check", version: "1", risk: "READ" },
      { kind: "contract", id: "law.forbidden.set", version: "1", risk: "READ" },
      { kind: "contract", id: "law.forbidden.reload", version: "1", risk: "READ" },
    ],
  },
};
const VAULT_MANIFEST = {
  manifestVersion: "1", id: "vivim.vault", entry: "src/index.ts",
  contributions: {
    contract: [
      { kind: "contract", id: "vault.append", version: "1", risk: "MUTATION" },
      { kind: "contract", id: "vault.query", version: "1", risk: "READ" },
      { kind: "contract", id: "vault.get", version: "1", risk: "READ" },
    ],
  },
};

function lawEntry(extra: object = {}): object {
  return {
    id: "vivim.law", source: "../t-law", bootPhase: 0,
    grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1"] },
    ...extra,
  };
}

describe("W1 compositions net — D-325 invariant + grant hygiene", () => {
  test("law with vault caps but no vault entry fails naming the invariant", async () => {
    const root = join("/tmp/omega-w1-test", `novault-${Date.now()}`);
    scaffold(root, {
      "a.json": {
        name: "a",
        entries: [lawEntry({
          grant: {
            capabilities: ["host.journal.append", "port:vault.append@1", "port:vault.query@1"],
            contracts: ["law.check@1", "law.forbidden.reload@1"],
          },
        })],
      },
    }, { "../t-law": LAW_MANIFEST });
    const r = await checkCompositions(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("D-325");
    rmSync(root, { recursive: true, force: true });
  });

  test("granted contract the manifest never declares fails", async () => {
    const root = join("/tmp/omega-w1-test", `undeclared-${Date.now()}`);
    scaffold(root, {
      "a.json": {
        name: "a",
        entries: [lawEntry({ grant: { capabilities: [], contracts: ["law.nonexistent@1"] } })],
      },
    }, { "../t-law": LAW_MANIFEST });
    const r = await checkCompositions(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("does not declare it");
    rmSync(root, { recursive: true, force: true });
  });

  test("port cap with no routed implementation in the spec fails", async () => {
    const root = join("/tmp/omega-w1-test", `noroute-${Date.now()}`);
    scaffold(root, {
      "a.json": {
        name: "a",
        entries: [lawEntry({
          grant: { capabilities: ["port:vault.append@1"], contracts: ["law.check@1"] },
        })],
      },
    }, { "../t-law": LAW_MANIFEST });
    const r = await checkCompositions(root);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("no routed implementation");
    rmSync(root, { recursive: true, force: true });
  });

  test("durable pair (law vault caps + vault present) passes; memory-only law passes", async () => {
    const root = join("/tmp/omega-w1-test", `clean-${Date.now()}`);
    const vaultEntry = {
      id: "vivim.vault", source: "../t-vault", bootPhase: 1,
      grant: { capabilities: [], contracts: ["vault.append@1", "vault.query@1", "vault.get@1"] },
    };
    scaffold(root, {
      "durable.json": {
        name: "durable",
        entries: [lawEntry({
          grant: {
            capabilities: ["host.journal.append", "port:vault.append@1", "port:vault.query@1", "port:vault.get@1"],
            contracts: ["law.check@1", "law.forbidden.set@1", "law.forbidden.reload@1"],
          },
        }), vaultEntry],
      },
      "memory.json": { name: "memory", entries: [lawEntry()] },
    }, { "../t-law": LAW_MANIFEST, "../t-vault": VAULT_MANIFEST });
    const r = await checkCompositions(root);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.detail["specs"]).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});
