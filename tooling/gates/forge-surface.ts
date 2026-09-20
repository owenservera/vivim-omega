// tooling/gates/forge-surface.ts — D-405/D-406 (Omega Forge Wave 0, D5)
// The Forge boundary, mechanically enforced. Five checks + the generality bar,
// all PURE FUNCTIONS over an input object (the same discipline as the parity
// net: the gate layer re-derives truth, it never trusts the artifacts to
// self-report). The real tree is loaded by loadForgeSurfaceInput(); the tests
// load HAND-BUILT red/green inputs — every rule has at least one green and
// one red fixture (packet D5 acceptance).
//
//   FORGE_IN_PRODUCT      — no forge.* op routes in any product composition
//                           (compositions matching forge-*.json are builders).
//   FORGE_CLASS_SPAN      — a forge.* plugin declares contract contributions in
//                           exactly ONE risk class (partition rule: one class
//                           per plugin; the wire spans classes, plugins do not).
//   FORGE_EMIT_SCOPE      — Class-2 emission stays inside ns proposal / the
//                           scratch proposal path: contribution risk matches
//                           the catalog, the manifest justification declares
//                           proposal-only behavior, and the plugin source's
//                           vault ns literals are all "proposal".
//   FORGE_NO_REFUSAL_TEST — every declared forge.* op has a refusal test
//                           (test/refusal/*.test.ts whose text names the op).
//   FORGE_CONTRACT_DRIFT  — declared forge.* contracts match pack.builder's
//                           FORGE_OP_CATALOG exactly (id@version → risk), and
//                           the pack's own fixtures validate against its
//                           declared schemas (valid ones pass, invalid ones
//                           refuse — the drift detector has fixtures of its own).
//   GEN_LEVEL_MISSING     — every forge.* plugin AND pack.builder declares a
//                           generality level (sdk validateGenerality, hard).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginManifest, RiskClass } from "@vivim/omega-contracts";
import { validateGenerality } from "@vivim/omega-sdk";

// ---- the input model (pure — hand-built in tests, tree-loaded in the gate) ----

export interface ForgePluginRecord {
  dir: string;                                  // e.g. "plugins/forge-author"
  manifest: PluginManifest;
  sourceText: Record<string, string>;           // src files (emit-scope ns scan)
  refusalTestTexts: string[];                   // test/refusal/*.test.ts full texts
}

export interface ForgeCompositionRecord {
  name: string;                                 // "agent", "forge-author", ...
  entries: Array<{ id: string; grant: { contracts: string[] } }>;
}

export interface FixtureValidation { fixture: string; valid: boolean; errors: string[] }

export interface ForgeSurfaceInput {
  forgePlugins: ForgePluginRecord[];
  packBuilder: { dir: string; manifest: PluginManifest };
  compositions: ForgeCompositionRecord[];
  catalog: Record<string, RiskClass>;           // pack.builder FORGE_OP_CATALOG
  packFixtureValidation: FixtureValidation[];
}

export interface ForgeSurfaceIssue {
  check: string;
  subject: string;
  reason: string;
  fix: string;
}

export interface ForgeSurfaceResult { ok: boolean; issues: ForgeSurfaceIssue[] }

function isForgePluginId(id: string): boolean {
  return /^forge\.[a-z0-9.-]+$/.test(id);
}

/** All vault-namespace literals in a plugin's source (ns: "..." / ns: '...'). */
function nsLiterals(sourceText: Record<string, string>): string[] {
  const found: string[] = [];
  for (const text of Object.values(sourceText)) {
    for (const m of text.matchAll(/\bns:\s*["']([a-z][a-z0-9-]*)["']/g)) found.push(m[1]!);
  }
  return found;
}

// ---- the five checks + the generality bar --------------------------------------

export function checkForgeSurface(input: ForgeSurfaceInput): ForgeSurfaceResult {
  const issues: ForgeSurfaceIssue[] = [];
  const issue = (check: string, subject: string, reason: string, fix: string) => issues.push({ check, subject, reason, fix });

  // FORGE_IN_PRODUCT — builder compositions are the forge-*.json family; every
  // other composition is a product composition and must not route forge.* ops.
  for (const comp of input.compositions) {
    if (comp.name.startsWith("forge-")) continue; // builder composition
    for (const e of comp.entries) {
      const forgeOps = e.grant.contracts.filter((c) => c.startsWith("forge."));
      for (const op of forgeOps) {
        issue("FORGE_IN_PRODUCT", `${comp.name}.json/${e.id}`,
          `product composition grants ${op} — forge.* ops route in builder compositions only`,
          `move the grant to a forge-*.json builder composition, or drop it (emission output enters products through human promotion, never routing)`);
      }
    }
  }

  for (const p of input.forgePlugins) {
    const contracts = p.manifest.contributions?.contract ?? [];
    const opNames = contracts.map((c) => `${c.id}@${c.version}`);

    // FORGE_CLASS_SPAN — the partition rule: ALL contributions of one forge
    // plugin sit in ONE risk class (READ included — a forge plugin that mixes
    // gated and ungated ops is two plugins that have not been cut apart yet;
    // the house's legacy plugins predate the rule, the forge does not).
    const classes = new Set(contracts.map((c) => c.risk).filter((r): r is RiskClass => typeof r === "string"));
    if (classes.size > 1) {
      issue("FORGE_CLASS_SPAN", p.dir,
        `declares contract contributions across ${classes.size} risk classes (${[...classes].join(", ")}) — the wire spans classes, a plugin partition does not`,
        `split the plugin along the class boundary (one plugin per class; e.g. the capture seam separates from its READ siblings)`);
    }

    // FORGE_NO_REFUSAL_TEST — every declared op is named in some refusal test.
    const allRefusalText = input.forgePlugins.find((x) => x.dir === p.dir)!.refusalTestTexts.join("\n");
    for (const op of opNames) {
      if (!allRefusalText.includes(op)) {
        issue("FORGE_NO_REFUSAL_TEST", p.dir,
          `${op} has no refusal test — every forge.* op must refuse by NAME (test/refusal/<area>.<verb>.test.ts naming the op)`,
          `add plugins/${p.dir.split("/").pop()}/test/refusal/ tests whose text names ${op}`);
      }
    }

    // FORGE_EMIT_SCOPE — Class-2 discipline over the declared surface.
    const justification = (p.manifest.capabilities?.justification ?? "").toLowerCase();
    const proposalOnly = justification.includes("proposal") || justification.includes("scratch");
    if (!proposalOnly) {
      issue("FORGE_EMIT_SCOPE", p.dir,
        `manifest justification does not declare proposal-only behavior ("${p.manifest.capabilities?.justification ?? ""}")`,
        `state the proposal-only claim in the capabilities justification — it is the manifest's contract with the gate`);
    }
    const foreignNs = nsLiterals(p.sourceText).filter((ns) => ns !== "proposal");
    if (foreignNs.length > 0) {
      issue("FORGE_EMIT_SCOPE", p.dir,
        `source writes vault namespace(s) outside ns proposal: ${[...new Set(foreignNs)].join(", ")}`,
        `Class-2 emission may touch ns proposal only (and the gate-designated scratch path); split the writer`);
    }

    // FORGE_CONTRACT_DRIFT — declared contracts vs the pack.builder catalog.
    for (const c of contracts) {
      const op = `${c.id}@${c.version}`;
      const cat = input.catalog[op];
      if (cat === undefined) {
        issue("FORGE_CONTRACT_DRIFT", p.dir,
          `${op} is not in pack.builder's FORGE_OP_CATALOG — the wire is frozen; an op outside it is drift`,
          `amend pack.builder (amendment-class change) or drop the contribution`);
      } else if (cat !== c.risk) {
        issue("FORGE_CONTRACT_DRIFT", p.dir,
          `${op} declares risk ${c.risk} but the catalog pins ${cat} — two sources, one truth`,
          `align the manifest declaration with FORGE_OP_CATALOG (or amend the catalog by decision record)`);
      }
    }

    // GEN_LEVEL_MISSING — the evidence axis is mandatory for forge.* plugins.
    for (const gi of validateGenerality(p.manifest, { hard: true })) {
      issue(gi.code, p.dir, `${p.manifest.id}: ${gi.message}`, `declare generality (speculative | harvested | generic) with the discipline that level demands`);
    }
  }

  // pack.builder joins the generality bar (it declares the frozen wire).
  for (const gi of validateGenerality(input.packBuilder.manifest, { hard: true })) {
    issue(gi.code, input.packBuilder.dir, `${input.packBuilder.manifest.id}: ${gi.message}`, `declare generality (speculative | harvested | generic) with the discipline that level demands`);
  }
  // ...and its catalog must match its own plugin.json contract contributions.
  const packContracts = (input.packBuilder.manifest.contributions?.contract ?? []).filter((c) => c.id.startsWith("forge."));
  for (const c of packContracts) {
    const op = `${c.id}@${c.version}`;
    const cat = input.catalog[op];
    if (cat !== c.risk) {
      issue("FORGE_CONTRACT_DRIFT", input.packBuilder.dir,
        `pack declares ${op} as ${c.risk} but FORGE_OP_CATALOG pins ${cat ?? "<absent>"} — the two halves of pack.builder disagree`,
        `re-align FORGE_OP_CATALOG and the plugin.json contract contributions (they are one amendment)`);
    }
  }

  // The pack's own fixtures are the drift detector's fixtures: valid ones must
  // validate, invalid ones must refuse — a schema that cannot reject is not a
  // schema, and a fixture set that cannot fail is not a falsifier.
  for (const f of input.packFixtureValidation) {
    const expectedValid = !f.fixture.includes(`${join("fixtures", "invalid")}`) && !f.fixture.replace(/\\/g, "/").includes("/invalid/");
    if (expectedValid && !f.valid) {
      issue("FORGE_CONTRACT_DRIFT", f.fixture, `valid fixture fails validation: ${f.errors.join("; ")}`, `fix the fixture or the schema — they drifted apart`);
    }
    if (!expectedValid && f.valid) {
      issue("FORGE_CONTRACT_DRIFT", f.fixture, `invalid fixture VALIDATES — the schema no longer rejects what it was built to reject`, `tighten the schema (the fixture is the pinned sin)`);
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---- the real-tree loader (used by the gate; tests build inputs by hand) --------

function readJson(p: string): unknown {
  return JSON.parse(readFileSync(p, "utf-8"));
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
      if (e === "node_modules") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".ts")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export async function loadForgeSurfaceInput(root: string): Promise<ForgeSurfaceInput> {
  const pluginsDir = join(root, "plugins");
  const forgePlugins: ForgePluginRecord[] = [];
  for (const e of readdirSync(pluginsDir)) {
    const dir = join(pluginsDir, e);
    if (!e.startsWith("forge-") || !statSync(dir).isDirectory()) continue;
    const manifest = readJson(join(dir, "plugin.json")) as PluginManifest;
    const sourceText: Record<string, string> = {};
    for (const p of listTs(join(dir, "src"))) sourceText[p] = readFileSync(p, "utf-8");
    const refusalDir = join(dir, "test", "refusal");
    const refusalTestTexts: string[] = [];
    if (existsSync(refusalDir)) {
      for (const f of readdirSync(refusalDir)) {
        if (f.endsWith(".test.ts")) refusalTestTexts.push(readFileSync(join(refusalDir, f), "utf-8"));
      }
    }
    forgePlugins.push({ dir: `plugins/${e}`, manifest, sourceText, refusalTestTexts });
  }

  const packBuilder = { dir: "packs/builder", manifest: readJson(join(root, "packs/builder/plugin.json")) as PluginManifest };

  const compositions: ForgeCompositionRecord[] = [];
  for (const f of readdirSync(join(root, "compositions"))) {
    if (!f.endsWith(".json") || f === "_matrix.json") continue;
    const spec = readJson(join(root, "compositions", f)) as { name: string; entries?: Array<{ id: string; grant?: { contracts?: string[] } }> };
    compositions.push({
      name: f.replace(/\.json$/, ""),
      entries: (spec.entries ?? []).map((e) => ({ id: e.id, grant: { contracts: e.grant?.contracts ?? [] } })),
    });
  }

  const { FORGE_OP_CATALOG, BUILDER_SCHEMAS, validateArtifact } = await import(join(root, "packs/builder/src/schemas.ts"));
  const packFixtureValidation: FixtureValidation[] = [];
  for (const band of ["valid", "invalid"]) {
    const bandDir = join(root, "packs/builder/test/fixtures", band);
    if (!existsSync(bandDir)) continue;
    for (const f of readdirSync(bandDir)) {
      if (!f.endsWith(".json")) continue;
      const kind = f.replace(/\.json$/, "");
      const value = readJson(join(bandDir, f));
      const r = kind in BUILDER_SCHEMAS ? validateArtifact(kind as keyof typeof BUILDER_SCHEMAS, value) : { ok: false, errors: [`unknown fixture kind ${kind}`] };
      packFixtureValidation.push({
        fixture: join("packs/builder/test/fixtures", band, f),
        valid: r.ok,
        errors: r.errors,
      });
    }
  }

  return { forgePlugins, packBuilder, compositions, catalog: FORGE_OP_CATALOG as Record<string, RiskClass>, packFixtureValidation };
}
