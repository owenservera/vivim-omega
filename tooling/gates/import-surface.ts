// import-surface gate stage (B-2 / SC-K04 / GAP-11 probe #1): the layering
// contract, enforced mechanically (D-361/D-372 pattern, copied).
//
// Compartments see only the shim + contracts; the host sees only contracts +
// the platform seam; contracts sees nothing workspace-internal; surfaces talk
// to plugins through workspace deps, never relative source imports. Tests
// (`*/test/*`) are excluded from this stage — same scoping as bun-surface and
// os-surface — because integration tests legitimately boot the host in-process.
//
// Rules (prod `*/src` only):
//   1. plugins|examples|packs `*/src`: no `@vivim/omega-host` imports.
//   2. surfaces `*/src`: no relative imports reaching into a `plugins/` tree.
//   3. contracts/src: no `@vivim/` workspace imports at all.
//   4. shim/src: `@vivim/omega-contracts` is the only workspace import.
//   5. host/src: `@vivim/omega-contracts` + `@vivim/omega-platform` only.
// Pure file reads + regex; never boots anything. Wired as the
// `import-surface` stage of omega:gate.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ImportSurfaceResult {
  ok: boolean;
  detail: Record<string, unknown>;
  issues: string[];
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dev-vault", "build"]);
const IMPORT_RE = /(?:from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']|require\(\s*["']([^"']+)["'])/g;

function isTestPath(rel: string): boolean {
  return rel.split("/").includes("test");
}

function ruleFor(rel: string): { allowVivim: RegExp | null; forbidPluginsRelative: boolean; what: string } | null {
  if (!rel.endsWith(".ts") || isTestPath(rel)) return null;
  if (/^(plugins|examples|packs)\/.+\/src\//.test(rel)) {
    return { allowVivim: null, forbidPluginsRelative: false, what: "plugin/leaf src" };
  }
  if (/^surfaces\/.+\/src\//.test(rel)) {
    return { allowVivim: null, forbidPluginsRelative: true, what: "surface src" };
  }
  if (rel.startsWith("contracts/src/")) {
    return { allowVivim: /^$/, forbidPluginsRelative: false, what: "contracts src" };
  }
  if (rel.startsWith("shim/src/")) {
    return { allowVivim: /^@vivim\/omega-contracts$/, forbidPluginsRelative: false, what: "shim src" };
  }
  if (rel.startsWith("host/src/")) {
    return { allowVivim: /^@vivim\/omega-(contracts|platform)$/, forbidPluginsRelative: false, what: "host src" };
  }
  return null;
}

export async function checkImportSurface(ROOT: string): Promise<ImportSurfaceResult> {
  const issues: string[] = [];
  let scanned = 0;
  const visit = (dir: string): void => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        if (SKIP_DIRS.has(f.name)) continue;
        visit(join(dir, f.name));
      } else if (f.isFile() && f.name.endsWith(".ts")) {
        const rel = join(dir, f.name).slice(ROOT.length + 1).replace(/\\/g, "/");
        const rule = ruleFor(rel);
        if (!rule) continue;
        scanned++;
        const text = readFileSync(join(dir, f.name), "utf-8");
        for (const line of text.split("\n")) {
          IMPORT_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = IMPORT_RE.exec(line)) !== null) {
            const src = m[1] ?? m[2] ?? m[3] ?? "";
            if (rule.forbidPluginsRelative && src.includes("plugins/")) {
              issues.push(`${rel}: surface imports plugin source directly (${src}) — use a workspace dependency`);
            }
            if (src.startsWith("@vivim/")) {
              if (rule.allowVivim === null && src === "@vivim/omega-host" && /^(plugins|examples|packs)\//.test(rel)) {
                issues.push(`${rel}: compartment code imports the host (${src}) — authority flows through ports, never imports`);
              } else if (rule.allowVivim !== null && !rule.allowVivim.test(src)) {
                issues.push(`${rel}: forbidden workspace import (${src}) — ${rule.what} may not know that layer`);
              }
            }
          }
        }
      }
    }
  };
  visit(ROOT);
  return { ok: issues.length === 0, detail: { scanned, rules: 5 }, issues };
}

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  checkImportSurface(ROOT).then((r) => {
    console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
