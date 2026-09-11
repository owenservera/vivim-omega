// @vivim/omega-tooling — builder/src/builder.ts (Ω9)
// `omega new-plugin` — the ecosystem builder.
//
// README NOTE (the Ω9 proof this tool exists for): third parties can build plugins.
// A new plugin authored from this scaffold — manifest, package, src, test, TEST
// contribution — passes the SAME staged → verified → active conformance ceremony
// the spine plugins pass, with ZERO host changes: no new host code, no new
// contracts, no registry edits. The µhost never learns a plugin's name; it only
// verifies manifests, routes ops, and checks tokens. Existence = conformance
// (law 9), and conformance is open to anyone.
//
// The three steps, mirroring the house ceremony:
//   1. SCAFFOLD  plugin.json (manifestVersion 1, one contribution `<contract>@1`,
//                risk READ default for the contract kind), package.json (name
//                derived; deps shim+contracts, devDeps sdk+testkit),
//                src/index.ts (a working def whose op handler echoes),
//                test/scaffold.test.ts (a real bun test on FakeHost),
//                test/conformance.fixture.ts (run(def, fake) — the TEST contribution)
//   2. VALIDATE  the SDK parse + semantic validators on the GENERATED manifest —
//                the same law a hand-written manifest faces, reported honestly
//   3. CONFORM   the testkit conformance runner on the scaffolded dir (FakeHost
//                + fixture path) — staged/verified/active as a structured report
//
// Contribution kinds (--kind): contract (default; risk READ), provider, engine,
// surface. Risk declarations are CONTRACT-kind data under the pinned manifest
// law — provider/engine/surface scaffolds omit the attribute (READ-class until
// a domain pack's CONTRACT pins risk) and their docs say so. Surface
// contributions declare no ROUTABLE op: the generated test + fixture assert that
// dormancy honestly (a surface plugin's ops wake up when a contract is declared
// or it composes via a surfaces/* package).
//
// Dev wiring: the scaffold gets node_modules/@vivim/* symlinks to THIS repo's
// workspace packages — exactly what `bun install` provides for workspace members
// (and what a third party gets from the registry). node_modules is
// content-hash-excluded and gitignored; the symlinks are dev-environment glue,
// never plugin content.
//
// Usage:
//   bun run tooling/builder/src/builder.ts new <pluginId>
//     [--dir plugins/<name>]        (default plugins/<id with dots → dashes>)
//     [--contract <opId>]           (default <id>.echo → op <opId>@1)
//     [--kind contract|provider|engine|surface]
//
// Exit codes: 0 green · 1 conformance/validation issues · 2 usage (nothing written).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseManifest, validateManifest, ID_PATTERN, type ValidationIssue } from "@vivim/omega-sdk";
import { runConformance, type ConformanceReport } from "@vivim/omega-testkit";

const ROOT = resolve(join(import.meta.dir, "../../..")); // vivim-omega/

// ---- options ---------------------------------------------------------------------

export const SCAFFOLD_KINDS = ["contract", "provider", "engine", "surface"] as const;
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

export interface ScaffoldOptions {
  pluginId: string;
  dir?: string;          // default: plugins/<id with '.' → '-'>
  contract?: string;     // op id (bare); default: <id>.echo
  kind?: ScaffoldKind;   // default: contract
}

export interface ScaffoldResult {
  dir: string;
  pluginId: string;
  op: string;            // routable op id, e.g. "acme.widget.echo@1"
  kind: ScaffoldKind;
  files: string[];       // written files (relative to dir)
  devLinks: string[];    // node_modules/@vivim/* symlinks created
}

/** Reject bad ids BEFORE writing anything — the sdk's own grammar, quoted. */
export function checkId(pluginId: string, contract: string, kind: string): string[] {
  const problems: string[] = [];
  if (!ID_PATTERN.test(pluginId)) {
    problems.push(`plugin id "${pluginId}" is invalid: manifest id must match ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ (lowercase alnum with dots/dashes — see sdk ID_PATTERN)`);
  }
  if (!ID_PATTERN.test(contract)) {
    problems.push(`contract id "${contract}" is invalid: contribution id must match ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ (lowercase alnum with dots/dashes)`);
  }
  if (!(SCAFFOLD_KINDS as readonly string[]).includes(kind)) {
    problems.push(`kind "${kind}" is invalid: expected one of ${SCAFFOLD_KINDS.join(" | ")}`);
  }
  return problems;
}

// ---- step 1: scaffold --------------------------------------------------------------

const KIND_DOC: Record<ScaffoldKind, string> = {
  contract: "A CONTRACT contribution: the op is routable and risk-class READ by declaration (risk lives on contract-kind data).",
  provider: "A PROVIDER contribution: the op is routable; risk declarations are CONTRACT-kind data, so this declares none — a domain pack's CONTRACT pins risk when composing (see plugins/provider-email-file).",
  engine: "An ENGINE contribution: the op is routable; risk declarations are CONTRACT-kind data, so this declares none (see plugins/discovery-healing).",
  surface: "A SURFACE contribution: NOT routable — surface contributions declare no ops (see surfaces/cli · surfaces/mcp). The op handler stays dormant until a contract is declared or the plugin composes via a surface package.",
};

function dash(id: string): string {
  return id.replace(/\./g, "-");
}

export function scaffoldPlugin(opts: ScaffoldOptions): ScaffoldResult {
  const kind: ScaffoldKind = opts.kind ?? "contract";
  const contract = opts.contract ?? `${opts.pluginId}.echo`;
  const problems = checkId(opts.pluginId, contract, kind);
  if (problems.length > 0) throw new Error(problems.join("; "));
  const op = `${contract}@1`;

  const dir = resolve(opts.dir ?? join(ROOT, "plugins", dash(opts.pluginId)));
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`refusing to scaffold into non-empty dir ${dir} (delete it or pass --dir)`);
  }
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });

  const files: string[] = [];
  const write = (rel: string, text: string): void => {
    writeFileSync(join(dir, rel), text);
    files.push(rel);
  };

  // plugin.json — the REQUEST (never a grant; the user-signed Recipe grants)
  write("plugin.json", `${JSON.stringify({
    manifestVersion: "1",
    id: opts.pluginId,
    version: "0.1.0",
    description: `Scaffolded by omega new-plugin (Ω9 ecosystem builder). ${KIND_DOC[kind]} Replace the echo handler with real behavior — the manifest, tests, and conformance fixture travel with you.`,
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      [kind]: [
        kind === "contract"
          ? { kind, id: contract, version: "1", risk: "READ", doc: `${op}: echoes its payload (scaffold default). Risk READ is declared data on the CONTRACT kind.` }
          : { kind, id: contract, version: "1", doc: `${op}: echoes its payload (scaffold default). ${KIND_DOC[kind]}` },
      ],
    },
    dependencies: [],
    capabilities: {
      requested: [],
      justification: "The scaffold echoes its payload — self-contained, no capabilities. Declare port:<op>@<v> or host.* requests here when the real behavior needs them; the composition grants per user-signed Recipe, never this manifest.",
    },
    runtime: { tier: "worker-thread", budget: { cpuMs: 500, memMB: 128 } },
    contentHash: "",
  }, null, 2)}\n`);

  // package.json — name derived, runtime deps shim+contracts, dev deps sdk+testkit
  write("package.json", `${JSON.stringify({
    name: `@vivim/plugin-${dash(opts.pluginId)}`,
    version: "0.1.0",
    private: true,
    type: "module",
    dependencies: {
      "@vivim/omega-shim": "workspace:*",
      "@vivim/omega-contracts": "workspace:*",
    },
    devDependencies: {
      "@vivim/omega-sdk": "workspace:*",
      "@vivim/omega-testkit": "workspace:*",
    },
  }, null, 2)}\n`);

  // src/index.ts — a working def whose op handler echoes
  write("src/index.ts", `// ${opts.pluginId} — scaffolded by omega new-plugin (Ω9 ecosystem builder).
// One op: ${op} echoes its payload — the smallest conformant plugin. The def is
// exported so FakeHost / the conformance runner import it in-process;
// startPlugin() no-ops safely outside a worker (shim law).
import { definePlugin, startPlugin } from "@vivim/omega-shim";

export const def = definePlugin({
  ops: {
    "${op}": (payload: unknown) => ({ echo: true, payload: payload ?? null, op: "${op}", plugin: "${opts.pluginId}" }),
  },
});

startPlugin(def);
`);

  // test/scaffold.test.ts — a real bun test on the FakeHost
  const routable = kind !== "surface";
  write("test/scaffold.test.ts", `// ${opts.pluginId} — scaffold test: the op ${routable ? "round-trips" : "dormancy check"} on the FakeHost
// (in-process B1–B4 semantics — the same law the real µhost enforces).
// Run from this plugin dir: bun test
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeHost } from "@vivim/omega-testkit";
import { parseManifest } from "@vivim/omega-sdk";
import { def } from "../src/index.ts";

const manifest = parseManifest(readFileSync(join(import.meta.dir, "..", "plugin.json"), "utf-8"));

describe("${opts.pluginId} — scaffolded plugin on FakeHost", () => {
  test("manifest stages (sdk parse) and the def installs active", async () => {
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const fake = new FakeHost();
    await fake.install(def, manifest.value, { capabilities: [] });
    expect(fake.states["${opts.pluginId}"]).toBe("active");
    await fake.shutdown();
  });
${
  routable
    ? `
  test("${op} echoes its payload through the router", async () => {
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const fake = new FakeHost();
    await fake.install(def, manifest.value, { capabilities: [] });
    const r = await fake.callAsRoot("${op}", { hello: "scaffold" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ echo: true, payload: { hello: "scaffold" }, op: "${op}", plugin: "${opts.pluginId}" });
    }
    await fake.shutdown();
  });
`
    : `
  test("${op} is NOT routed: surface contributions declare no routable ops (dormant until a contract is declared)", async () => {
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const fake = new FakeHost();
    await fake.install(def, manifest.value, { capabilities: [] });
    const r = await fake.callAsRoot("${op}", {});
    expect(r.ok).toBe(false); // REFUSED — the honest expectation for surface-kind contributions
    if (!r.ok) expect(r.error).toBe("REFUSED");
    await fake.shutdown();
  });
`
}
});
`);

  // test/conformance.fixture.ts — the TEST contribution the conformance runner executes
  write("test/conformance.fixture.ts", `// ${opts.pluginId} — the TEST contribution the conformance runner executes.
// Exports run(def, fake): ${routable ? "boot-side round-trip proof on the FakeHost." : "installation + the honest dormancy of surface-kind contributions (no routable ops)."}
import type { PluginDef } from "@vivim/omega-shim";
import type { FakeHost } from "@vivim/omega-testkit";

export async function run(def: PluginDef, fake: FakeHost): Promise<{ pass: boolean; echoed?: boolean }> {
  if (!def.ops?.["${op}"]) return { pass: false };
  const r = await fake.callAsRoot("${op}", { hello: "scaffold" });
${
  routable
    ? `  if (!r.ok) return { pass: false };
  const v = r.value as { echo?: boolean };
  return v.echo === true ? { pass: true, echoed: true } : { pass: false };`
    : `  // surface kind: the op must be REFUSED — surface contributions declare no routable ops
  if (r.ok) return { pass: false };
  return r.error === "REFUSED" ? { pass: true } : { pass: false };`
}
}
`);

  // dev wiring: node_modules/@vivim/* symlinks — what `bun install` gives workspace
  // members (and the registry gives third parties). Hash-excluded, gitignored.
  const devLinks: string[] = [];
  const link = (name: string, target: string): void => {
    const nmDir = join(dir, "node_modules", "@vivim");
    mkdirSync(nmDir, { recursive: true });
    const linkPath = join(nmDir, name);
    if (!existsSync(linkPath)) {
      // Junctions on Windows: directory symlinks need elevated privileges there,
      // junctions don't — and both resolve identically for module loading.
      symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
      devLinks.push(`node_modules/@vivim/${name} -> ${target}`);
    }
  };
  link("omega-shim", join(ROOT, "shim"));
  link("omega-contracts", join(ROOT, "contracts"));
  link("omega-sdk", join(ROOT, "sdk"));
  link("omega-testkit", join(ROOT, "testkit"));

  return { dir, pluginId: opts.pluginId, op, kind, files, devLinks };
}

// ---- step 2: validate (the sdk law, on the generated manifest) ---------------------

export interface ValidationReport {
  dir: string;
  ok: boolean;
  parseOk: boolean;
  parseErrors: string[];
  issues: ValidationIssue[];
}

export function validateScaffold(dir: string): ValidationReport {
  const manifestFile = join(dir, "plugin.json");
  const r = parseManifest(readFileSync(manifestFile, "utf-8"));
  if (!r.ok) return { dir, ok: false, parseOk: false, parseErrors: r.errors, issues: [] };
  const issues = validateManifest(r.value);
  return { dir, ok: issues.length === 0, parseOk: true, parseErrors: [], issues };
}

// ---- step 3: conformance (the testkit ceremony) ------------------------------------

export async function conformScaffold(dir: string): Promise<ConformanceReport> {
  return runConformance(dir);
}

// ---- the CLI -----------------------------------------------------------------------

const USAGE = `omega new-plugin — scaffold a conformant plugin (Ω9 ecosystem builder)

  bun run tooling/builder/src/builder.ts new <pluginId> [options]

    <pluginId>                lowercase alnum with dots/dashes, e.g. acme.widget
    --dir <path>              target dir (default: plugins/<id with dots → dashes>)
    --contract <opId>         the op's contribution id (default: <id>.echo → <opId>@1)
    --kind <kind>             contract | provider | engine | surface (default: contract)

  The scaffold carries: plugin.json · package.json · src/index.ts (echo op)
  · test/scaffold.test.ts (FakeHost) · test/conformance.fixture.ts (run(def, fake)),
  then runs the sdk validators and the testkit conformance ceremony on itself.
  Exit codes: 0 green · 1 issues · 2 usage (nothing written).`;

export async function runBuilder(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== "new") {
    console.error(cmd === undefined || cmd === "help" || cmd === "--help" ? USAGE : `unknown command "${cmd}"\n\n${USAGE}`);
    return 2;
  }
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--dir" || a === "--contract" || a === "--kind") {
      const v = rest[++i];
      if (v === undefined) { console.error(`flag ${a} requires a value\n\n${USAGE}`); return 2; }
      flags[a.slice(2)] = v;
    } else if (a.startsWith("--")) {
      console.error(`unknown flag ${a}\n\n${USAGE}`);
      return 2;
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 1) {
    console.error(`expected exactly one plugin id, got ${positional.length}\n\n${USAGE}`);
    return 2;
  }
  const pluginId = positional[0];
  const kind = (flags.kind ?? "contract") as ScaffoldKind;
  const contract = flags.contract ?? `${pluginId}.echo`;
  const problems = checkId(pluginId, contract, kind);
  if (problems.length > 0) {
    console.error(`refusing to scaffold — invalid request:\n  - ${problems.join("\n  - ")}\n(nothing was written)`);
    return 2;
  }

  // 1 · scaffold
  let result: ScaffoldResult;
  try {
    result = scaffoldPlugin({ pluginId, ...(flags.dir ? { dir: flags.dir } : {}), contract, kind });
  } catch (e) {
    console.error(`scaffold failed: ${String(e)}`);
    return 2;
  }
  console.log(`scaffolded ${result.pluginId} (${result.kind} kind, op ${result.op}) → ${result.dir}`);
  for (const f of result.files) console.log(`  + ${f}`);
  for (const l of result.devLinks) console.log(`  ~ ${l}  (dev wiring — hash-excluded, gitignored)`);

  // 2 · validate (sdk law on the generated manifest)
  const v = validateScaffold(result.dir);
  if (!v.ok) {
    console.error(`VALIDATION FAILED (the sdk law, honestly):`);
    if (!v.parseOk) for (const e of v.parseErrors) console.error(`  - ${e}`);
    for (const i of v.issues) console.error(`  - ${i.code} ${i.path}: ${i.message}`);
    return 1;
  }
  console.log(`validated: sdk parse green + semantic validators green (${result.files.length} files, contribution ${result.op})`);

  // 3 · conformance (the testkit ceremony — the same law the spine plugins face)
  const report = await conformScaffold(result.dir);
  const line = `conformance: staged=${report.staged} verified=${report.verified} active=${report.active} (fixture ${report.fixture ?? "—"}, ${report.timings.totalMs}ms)`;
  if (!(report.staged && report.verified && report.active)) {
    console.error(`${line}\nCONFORMANCE ISSUES:`);
    for (const i of report.issues) console.error(`  - [${i.stage}] ${i.code}: ${i.message}`);
    return 1;
  }
  console.log(line);
  console.log(`Ω9 proof stands: a new plugin authored from scaffold passes conformance with ZERO host changes.`);
  console.log(`next: cd ${result.dir} && bun test   ·   compose it (grant ${result.op} in a composition spec)`);
  return 0;
}

if (import.meta.main) {
  process.exit(await runBuilder(process.argv.slice(2)));
}

// Test hook: clean a scaffolded dir away (tests scaffold into temp dirs, never committed).
export function removeScaffold(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
