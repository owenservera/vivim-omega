// Pin the pack.builder fixtures: hash every fixture under valid/ + invalid/
// into manifest.json (re-runnable; the pack test verifies every hash).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const rows: Record<string, string> = {};
for (const sub of ["valid", "invalid"]) {
  for (const f of readdirSync(join(DIR, sub)).filter((x) => x.endsWith(".json")).sort()) {
    rows[`${sub}/${f}`] = `sha256:${createHash("sha256").update(readFileSync(join(DIR, sub, f))).digest("hex")}`;
  }
}
writeFileSync(join(DIR, "manifest.json"), JSON.stringify({
  _note: "Hash-pinned pack.builder fixtures (Wave 0 / D-406). Regenerate with: bun run packs/builder/test/fixtures/pin.ts — any fixture edit must re-pin; schema.test.ts verifies every hash.",
  fixtures: rows,
}, null, 2) + "\n");
console.log(`pinned ${Object.keys(rows).length} fixtures`);
