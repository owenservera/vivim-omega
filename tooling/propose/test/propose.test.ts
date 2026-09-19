// D-400 tests: draft writes provisional path; boot ignores proposed recipes.
import { describe, test, expect } from "bun:test";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { draftProposal } from "../propose.ts";
import { ensureVault, compileComposition, bootComposition } from "@vivim/omega-host";

const TMP = join(import.meta.dir, ".tmp-propose");

describe("D-400 proposal-only", () => {
  test("draft writes provisional file with justification", () => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    const out = join(TMP, "recipe.proposed.json");
    const p = draftProposal("missing.op@1", out);
    expect(existsSync(out)).toBe(true);
    expect(p.justification.length).toBeGreaterThan(20);
    expect(JSON.parse(readFileSync(out, "utf-8")).provisional).toBe(true);
  });

  test("a proposed-but-unsigned recipe cannot influence boot", async () => {
    const vault = join(TMP, "vault");
    const { rootKey } = ensureVault(vault);
    const spec = { name: "propose-proof", entries: [{ id: "vivim.law", source: "../../../../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1"] } }] };
    const { recipe, buildDir } = compileComposition(spec as never, TMP, vault, rootKey);
    draftProposal("missing.op@1", join(vault, "recipe.proposed.json"));
    const host = await bootComposition(recipe, buildDir, vault);
    const r = await host.router.callAsRoot("missing.op@1", {});
    expect(r.ok).toBe(false);
    await host.shutdown();
    rmSync(TMP, { recursive: true, force: true });
  });
});
