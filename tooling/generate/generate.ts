// tooling/generate/generate.ts — the W0-1 authoring path (D-377).
// `omega:generate` — three commands, all out-of-tree tooling (zero host LOC):
//
//   composition [--check] [--only <name>]   emit compositions/*.json from the
//                 _matrix.json source of truth. --check compares only (gate +
//                 pre-commit mode): a hand-edited spec drifts from the matrix
//                 and FAILS with a named diff. Default mode writes the emitted
//                 files and reports what changed.
//   plugin <name> [--id <id>] [--dir <dir>] scaffold plugins/<name>/: manifest,
//                 package.json, pure core (src/core.ts), shim entry (src/index.ts),
//                 test — plus the authoring checklist (ns row, LAW_POLICY rows,
//                 matrix grant, bun install).
//   pack <domain> [--dir <dir>]             scaffold packs/domain-<domain>/: the
//                 SCHEMA + CONTRACT + POLICY + TEST declaration skeleton (a pack
//                 declares, a provider implements).
//
// The byte-identity falsifier: `generate composition` reproduces every shipped
// spec byte-identical from the matrix; the compositions gate stage (D-376) runs
// the same comparison, so drifted hand-edits fail the gate mechanically.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitSpec, render, type Json } from "./format.ts";

export interface MatrixFile {
  _note?: string;
  compositions: Record<string, { note?: string; entries: Array<Record<string, Json>> }>;
}

export interface EmitReport {
  name: string;
  file: string;
  status: "identical" | "written" | "missing" | "drift";
  firstDiffLine?: number;
}

function readMatrix(compositionsDir: string): MatrixFile {
  const p = join(compositionsDir, "_matrix.json");
  if (!existsSync(p)) throw new Error(`no _matrix.json at ${p} — the matrix is the source of truth (W0-1)`);
  const m = JSON.parse(readFileSync(p, "utf-8")) as MatrixFile;
  if (!m.compositions || typeof m.compositions !== "object" || Object.keys(m.compositions).length === 0) {
    throw new Error("_matrix.json carries no compositions object — nothing to emit");
  }
  return m;
}

function firstDiffLine(a: string, b: string): number {
  const x = a.split("\n"), y = b.split("\n");
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return i + 1;
  return 0;
}

/** Emit every matrix composition; with write=false, compare only. */
export function emitCompositions(
  compositionsDir: string,
  opts: { write: boolean; only?: string },
): { ok: boolean; reports: EmitReport[] } {
  const m = readMatrix(compositionsDir);
  const names = Object.keys(m.compositions).sort();
  const wanted = opts.only ? names.filter((n) => n === opts.only) : names;
  if (wanted.length === 0) throw new Error(`--only ${opts.only}: no such composition in the matrix (have: ${names.join(", ")})`);
  const reports: EmitReport[] = [];
  for (const name of wanted) {
    const c = m.compositions[name]!;
    const text = emitSpec(name, c.note ?? null, c.entries as never);
    const file = join(compositionsDir, `${name}.json`);
    const current = existsSync(file) ? readFileSync(file, "utf-8") : null;
    if (current === text) { reports.push({ name, file, status: "identical" }); continue; }
    if (!opts.write) {
      reports.push({
        name, file,
        status: current === null ? "missing" : "drift",
        firstDiffLine: current === null ? undefined : firstDiffLine(text, current),
      });
      continue;
    }
    writeFileSync(file, text);
    reports.push({ name, file, status: current === null ? "missing" : "drift" });
  }
  return { ok: reports.every((r) => r.status === "identical"), reports };
}

// ---- scaffolding ----

export interface ScaffoldResult { dir: string; files: string[]; checklist: string[] }

function writeIfAbsent(dir: string, rel: string, text: string, files: string[]): void {
  const p = join(dir, rel);
  if (existsSync(p)) throw new Error(`refusing to overwrite existing file ${p} (scaffolds are first-try only)`);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
  files.push(rel);
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** `plugin <name>` — the plugin/pack authoring path's smallest slice. */
export function scaffoldPlugin(name: string, opts: { baseDir: string; id?: string; dirName?: string }): ScaffoldResult {
  if (!NAME_RE.test(name)) throw new Error(`plugin name '${name}' must match ${NAME_RE} (lowercase, digits, dashes)`);
  const dirName = opts.dirName ?? name;
  const id = opts.id ?? `omega.${name}`;
  const dir = join(opts.baseDir, dirName);
  if (existsSync(dir)) throw new Error(`${dir} already exists — plugin scaffolds never overwrite`);
  const opPrefix = name;
  const op = `${opPrefix}.ping`;
  const files: string[] = [];

  const manifest = {
    manifestVersion: "1",
    id,
    version: "0.1.0",
    description: `${name} — scaffolded by omega:generate (W0-1/D-377); replace with the plugin's one-line job.`,
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      contract: [{
        kind: "contract", id: op, version: "1", risk: "READ",
        doc: `ping {who?} → {pong, who, at} — the scaffold's first routed op; replace with the real surface. MUTATION/EXTERNAL_MUTATION ops need a LAW_POLICY_V1 row BEFORE first boot (the parity net refuses undeclared risk).`,
      }],
    },
    dependencies: [] as string[],
    capabilities: { requested: [] as string[] },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 64 } },
    contentHash: "",
  };
  writeIfAbsent(dir, "plugin.json", render(manifest as Json) + "\n", files);
  writeIfAbsent(dir, "package.json", render({
    name: `@vivim/plugin-${dirName}`,
    version: "0.1.0",
    private: true,
    type: "module",
    dependencies: { "@vivim/omega-shim": "workspace:*", "@vivim/omega-contracts": "workspace:*" },
  } as Json) + "\n", files);
  writeIfAbsent(dir, "src/core.ts", `// ${name} — core.ts (the PURE core: payload validation + record
// construction. No ports, no I/O — import-safe outside a worker; index.ts
// layers the shim on top. Same split as vivim-chat's chat.ts.)
export interface PingInput { who: string }

/** Parse + validate the ${op}@1 payload (throws → DEGRADED at the boundary). */
export function parsePingInput(payload: unknown): PingInput {
  const p = (payload ?? {}) as { who?: unknown };
  const who = typeof p.who === "string" && p.who.trim().length > 0 ? p.who : "world";
  return { who };
}
`, files);
  writeIfAbsent(dir, "src/index.ts", `// plugins/${dirName} — index.ts (scaffolded by omega:generate, W0-1/D-377)
// Ops exposed (CONTRACT contributions, see plugin.json):
//   ${op}@1  READ  {who?} → {pong, who, at}
// Handlers throw on bad payloads / failed port calls → DEGRADED at the boundary.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import { parsePingInput } from "./core.ts";

export const def = definePlugin({
  ops: {
    "${op}@1": async (payload: unknown) => {
      const { who } = parsePingInput(payload);
      return { pong: true, who, at: Date.now() };
    },
  },
});

startPlugin(def);
`, files);
  writeIfAbsent(dir, "test/core.test.ts", `import { describe, test, expect } from "bun:test";
import { parsePingInput } from "../src/core.ts";

describe("${name} scaffold", () => {
  test("ping input defaults and passes a named who through", () => {
    expect(parsePingInput(null).who).toBe("world");
    expect(parsePingInput({ who: "omega" }).who).toBe("omega");
    expect(parsePingInput({ who: "  " }).who).toBe("world");
  });
});
`, files);

  const checklist = [
    `1. bun install (registers the workspace package)`,
    `2. if this plugin writes a vault ns: add the ns row to docs/VAULT-NAMESPACES.md (writer = ${id}) in the same commit as the first writer code`,
    `3. MUTATION/EXTERNAL_MUTATION ops: add exact LAW_POLICY_V1 rows (plugins/vivim-law/src/policy.ts) — the D-351 parity net refuses undeclared risk at the gate`,
    `4. grant it a composition: add an entry under compositions/_matrix.json, then run: bun run omega:generate composition`,
    `5. prove it: one real-boot test (one op + one assertion) — a scaffold that never boots is not a plugin (DAILY-LOOP falsifier rule)`,
  ];
  return { dir, files, checklist };
}

/** `pack <domain>` — the SCHEMA+CONTRACT+POLICY+TEST declaration skeleton. */
export function scaffoldPack(domain: string, opts: { baseDir: string; dirName?: string }): ScaffoldResult {
  if (!NAME_RE.test(domain)) throw new Error(`pack domain '${domain}' must match ${NAME_RE}`);
  const dirName = opts.dirName ?? `domain-${domain}`;
  const id = `pack.domain-${domain}`;
  const dir = join(opts.baseDir, dirName);
  if (existsSync(dir)) throw new Error(`${dir} already exists — pack scaffolds never overwrite`);
  const files: string[] = [];
  const schemaId = `${domain}.record`;

  const manifest = {
    manifestVersion: "1",
    id,
    version: "0.1.0",
    description: `${domain} domain pack (W0-1/D-377 scaffold) — SCHEMA + CONTRACT + POLICY + TEST as declarations; a PROVIDER plugin implements the contracts. Fill in the real ontology before landing.`,
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      schema: [{
        kind: "schema", id: schemaId, version: "1",
        fields: [{ name: "id", type: "string", required: true, doc: "record id within the domain ns" }],
        doc: `${domain}.Record@1 — replace with the real domain ontology (fields complete: every field required unless truly optional).`,
      }],
      contract: [{
        kind: "contract", id: `${domain}.list`, version: "1", risk: "READ",
        doc: `list {limit?} — replace with the real ops; each carries its risk class (READ / MUTATION / EXTERNAL_MUTATION).`,
      }],
      policy: [{
        kind: "policy", id: `${domain}.policy`, version: "1",
        policy: {
          policyId: `${domain}.policy`, version: "1.0.0",
          description: `${domain} domain policy as declarative data: consent defaults + retention + state machine (see pack.domain-email for the full shape).`,
          consent: { default: "allow", ops: {}, rationale: "replace with the domain's consent bar; EXTERNAL_MUTATION defaults to require-consent in LAW_POLICY_V1" },
        },
        doc: `${domain}.policy@1 — the domain's declared intent as data.`,
      }],
      test: [{
        kind: "test", id: `${domain}.pack-test`, version: "1", dir: "test", runner: "bun test",
        doc: "pack conformance: ontology validation (schema fields complete, contract risk classes, namespace-clean ids).",
      }],
    },
    dependencies: [] as string[],
    capabilities: {
      requested: [] as string[],
      justification: "A pack is passive declarations: no ops to route, no ports to call, no host capabilities. The implementing provider carries the capabilities.",
    },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 32 } },
    contentHash: "",
  };
  writeIfAbsent(dir, "plugin.json", render(manifest as Json) + "\n", files);
  writeIfAbsent(dir, "package.json", render({
    name: `@vivim/plugin-${dirName}`,
    version: "0.1.0",
    private: true,
    type: "module",
    dependencies: { "@vivim/omega-shim": "workspace:*", "@vivim/omega-contracts": "workspace:*" },
  } as Json) + "\n", files);
  writeIfAbsent(dir, "src/index.ts", `// ${id} — src/index.ts (W0-1/D-377 scaffold)
//
// A PACK is a plugin whose manifest bundles SCHEMA + CONTRACT + POLICY + TEST
// contributions — no special machinery. It declares the ontology; a PROVIDER
// plugin implements the contracts. v1 packs are passive: no ops, no capabilities.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

export const def = definePlugin({
  onInit: (ctx) => {
    ctx.log(\`${id} up — declarations only: \${ctx.manifest.contributions.schema?.length ?? 0} schema, \${ctx.manifest.contributions.contract?.length ?? 0} contract, \${ctx.manifest.contributions.policy?.length ?? 0} policy, \${ctx.manifest.contributions.test?.length ?? 0} test\`);
  },
});

startPlugin(def);
`, files);
  writeIfAbsent(dir, "test/pack.test.ts", `import { describe, test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("${id} conformance (scaffold)", () => {
  test("manifest parses and declares the four contribution kinds", async () => {
    const m = JSON.parse(await readFile(join(import.meta.dir, "../plugin.json"), "utf-8"));
    expect(m.id).toBe("${id}");
    for (const kind of ["schema", "contract", "policy", "test"]) {
      expect(Array.isArray(m.contributions[kind])).toBe(true);
      expect(m.contributions[kind].length).toBeGreaterThanOrEqual(1);
    }
  });
});
`, files);

  const checklist = [
    `1. fill the real ontology: every schema field, every contract op with its risk class, the consent/retention/state-machine policy data`,
    `2. a PROVIDER plugin implements the contracts (the pack declares; the provider carries capabilities + the vault ns writer role)`,
    `3. ns row for the domain's vault namespace (docs/VAULT-NAMESPACES.md) lands with the provider's first writer commit`,
    `4. MUTATION/EXTERNAL_MUTATION contract ops: exact LAW_POLICY_V1 rows before first boot (D-351 parity net)`,
    `5. grant both pack + provider a composition via compositions/_matrix.json, then: bun run omega:generate composition`,
  ];
  return { dir, files, checklist };
}

// ---- CLI ----

function usage(): string {
  return `usage:
  bun run tooling/generate/generate.ts composition [--check] [--only <name>]
  bun run tooling/generate/generate.ts plugin <name> [--id <id>] [--dir <dir>]
  bun run tooling/generate/generate.ts pack <domain> [--dir <dir>]`;
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const ROOT = join(import.meta.dir, "../..");
  const arg = (flag: string): string | undefined => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    if (cmd === "composition") {
      const { ok, reports } = emitCompositions(join(ROOT, "compositions"), {
        write: !process.argv.includes("--check"),
        only: arg("--only"),
      });
      for (const r of reports) {
        const mark = r.status === "identical" ? "✓" : r.status === "written" || r.status === "missing" ? "✎" : "✗";
        console.log(`${mark} ${r.name}.json: ${r.status}${r.firstDiffLine ? ` (first diff line ${r.firstDiffLine})` : ""}`);
      }
      if (!ok) { console.error("drift between _matrix.json and shipped specs — run without --check to regenerate, or fix the matrix"); process.exit(1); }
    } else if (cmd === "plugin" || cmd === "pack") {
      const name = rest.find((a) => !a.startsWith("--"));
      if (!name) throw new Error(usage());
      const baseDir = join(ROOT, arg("--dir") ?? (cmd === "plugin" ? "plugins" : "packs"));
      const r = cmd === "plugin"
        ? scaffoldPlugin(name, { baseDir, id: arg("--id") })
        : scaffoldPack(name, { baseDir });
      console.log(`scaffolded ${cmd} at ${r.dir}:`);
      for (const f of r.files) console.log(`  + ${f}`);
      console.log("\nauthoring checklist (W0-1/D-377):");
      for (const line of r.checklist) console.log(`  ${line}`);
    } else {
      console.log(usage());
      process.exit(cmd === undefined ? 0 : 1);
    }
  } catch (e) {
    console.error(`generate: ${String(e)}`);
    process.exit(1);
  }
}
