// @vivim/omega-testkit — conformance.ts
// The staged → verified → active path for ONE plugin dir, as a structured report:
//   staged   : plugin.json loads and parses against the sdk zod mirror
//   verified : semantic law (sdk.validateManifest) + dependency satisfaction against
//              the composition context + capability fit (requested ⊆ grantable)
//              + B1 content-hash match when the manifest is hash-stamped
//   active   : boot on FakeHost (in-process) + the plugin's TEST contribution
//              (test/conformance.fixture.ts exporting run(def, fake)) executes green
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import type { PluginDef } from "@vivim/omega-shim";
import type { PluginManifest, CompositionSpec } from "@vivim/omega-contracts";
import { routableOps } from "@vivim/omega-contracts";
import { contentHashDir } from "@vivim/omega-host";
import { parseManifest, validateManifest, validateComposition, grantableFromOps, type ValidationIssue } from "@vivim/omega-sdk";
import { FakeHost } from "./fake-host.ts";

export type ConformanceStage = "staged" | "verified" | "active";

export interface ConformanceIssue {
  stage: ConformanceStage;
  code: string;
  message: string;
}

export interface ConformanceOptions {
  /** Composition context the plugin targets: validated (op conflicts fail verification); its grants feed dependency satisfaction. */
  composition?: CompositionSpec;
  /** Ops routable in the target world. Defaults: the composition's granted ops, else the plugin's own routable ops (self-contained). */
  availableOps?: string[];
  /** Capabilities the target world may grant. Defaults: host caps + port: forms of availableOps. */
  grantableCapabilities?: string[];
  /** The plugin's TEST contribution file, relative to the plugin dir. */
  fixture?: string;
  /** Config passthrough for the FakeHost install (data, never authority). */
  config?: Record<string, unknown>;
}

export interface ConformanceReport {
  pluginDir: string;
  pluginId: string;
  staged: boolean;
  verified: boolean;
  active: boolean;
  issues: ConformanceIssue[];
  timings: { stagedMs: number; verifiedMs: number; activeMs: number; totalMs: number };
  ops: string[];                        // the plugin's manifest-declared routable ops
  contentHash: { declared?: string; computed?: string; match?: boolean };
  fixture: string | null;               // the fixture file that ran (or was expected)
}

/**
 * Run the conformance ceremony for a plugin dir. Never throws for a NON-conformant
 * plugin — non-conformance is DATA (the report), not an exception. Only environment
 * failures (unreadable dirs etc.) surface as staged issues.
 */
export async function runConformance(pluginDir: string, opts: ConformanceOptions = {}): Promise<ConformanceReport> {
  const issues: ConformanceIssue[] = [];
  const dir = isAbsolute(pluginDir) ? pluginDir : resolve(pluginDir);
  const fixtureRel = opts.fixture ?? "test/conformance.fixture.ts";

  const t0 = Date.now();
  // ---- staged: shape -------------------------------------------------------
  const manifestFile = join(dir, "plugin.json");
  let manifest: PluginManifest | null = null;
  if (!existsSync(manifestFile)) {
    issues.push({ stage: "staged", code: "MANIFEST_MISSING", message: `plugin.json not found in ${dir}` });
  } else {
    const text = readFileSync(manifestFile, "utf-8");
    const r = parseManifest(text);
    if (!r.ok) {
      issues.push({ stage: "staged", code: "MANIFEST_SHAPE", message: `plugin.json fails the pinned schema: ${r.errors.join("; ")}` });
    } else {
      manifest = r.value;
    }
  }
  const staged = issues.length === 0;
  const t1 = Date.now();

  // ---- verified: semantics + context fit -----------------------------------
  let availableOps: string[] = [];
  let grantable: string[] = [];
  let computedHash: string | undefined;
  if (manifest) {
    availableOps = opts.availableOps
      ?? (opts.composition ? opts.composition.entries.flatMap((e) => e.grant.contracts) : routableOps(manifest));
    grantable = opts.grantableCapabilities ?? grantableFromOps(availableOps);

    const semantic: ValidationIssue[] = validateManifest(manifest);
    for (const s of semantic) issues.push({ stage: "verified", code: s.code, message: `${s.path}: ${s.message}` });

    // B1 content hash: stamped manifests must match the dir (unsigned "" sources are
    // pre-compile — the hash is stamped by the ceremony; we still record the computed one)
    computedHash = contentHashDir(dir);
    if (manifest.contentHash !== "" && manifest.contentHash !== computedHash) {
      issues.push({ stage: "verified", code: "CONTENT_HASH_MISMATCH", message: `contentHash ${manifest.contentHash} does not match the dir (${computedHash})` });
    }

    // dependency satisfaction against the composition context
    for (const dep of manifest.dependencies) {
      if (dep.ref.startsWith("contract:")) {
        const want = dep.ref.slice("contract:".length);
        if (!availableOps.includes(want)) {
          issues.push({ stage: "verified", code: "DEP_UNSATISFIED", message: `dependency ${dep.ref} not routable in the target composition (available: ${availableOps.join(", ") || "none"})` });
        }
      } else if (dep.ref.startsWith("capability:")) {
        const cap = dep.ref.slice("capability:".length);
        if (!grantable.includes(cap)) {
          issues.push({ stage: "verified", code: "DEP_CAP_UNSATISFIED", message: `capability dependency ${dep.ref} not grantable in the target world (grantable: ${grantable.join(", ") || "none"})` });
        }
      }
    }

    // capability fit: requested ⊆ grantable
    for (const cap of manifest.capabilities.requested) {
      if (!grantable.includes(cap)) {
        issues.push({ stage: "verified", code: "CAP_NOT_GRANTABLE", message: `requested capability ${cap} is not grantable in the target world (grantable: ${grantable.join(", ") || "none"})` });
      }
    }

    // the composition context itself must be lawful (conflicts fail verification)
    if (opts.composition) {
      for (const s of validateComposition(opts.composition)) {
        issues.push({ stage: "verified", code: s.code, message: `composition context: ${s.path}: ${s.message}` });
      }
    }
  }
  const verified = staged && issues.length === 0;
  const t2 = Date.now();

  // ---- active: FakeHost boot + TEST contribution ---------------------------
  let fixtureRan: string | null = null;
  if (manifest && verified) {
    const entryPath = join(dir, manifest.entry);
    if (!existsSync(entryPath)) {
      issues.push({ stage: "active", code: "ENTRY_MISSING", message: `entry ${manifest.entry} not found in ${dir}` });
    } else {
      try {
        const mod = (await import(entryPath)) as { def?: PluginDef; default?: PluginDef };
        const def = mod.def ?? mod.default ?? null;
        if (!def || typeof def !== "object" || !def.ops) {
          issues.push({ stage: "active", code: "NO_DEF_EXPORT", message: `entry ${manifest.entry} does not export \`def\` (a PluginDef with ops) — required for in-process conformance` });
        } else {
          const fake = new FakeHost();
          await fake.install(def, manifest, {
            capabilities: manifest.capabilities.requested, // self-contained install: what it asked for
            config: opts.config ?? {},
          });
          // boot-like: the self-contained world GRANTS what the manifest requested
          // (mirrors mintTokensFor — the recipe is the grantor; here the runner is)
          if (manifest.capabilities.requested.length > 0) fake.grant(manifest.id, manifest.capabilities.requested);
          const fixturePath = join(dir, fixtureRel);
          if (!existsSync(fixturePath)) {
            issues.push({ stage: "active", code: "FIXTURE_MISSING", message: `TEST contribution ${fixtureRel} not found — conformance requires a run(def, fake) fixture` });
          } else {
            fixtureRan = fixtureRel;
            try {
              const fixtureMod = (await import(fixturePath)) as { run?: (def: PluginDef, fake: FakeHost) => Promise<{ pass?: boolean } | void> | { pass?: boolean } | void };
              if (typeof fixtureMod.run !== "function") {
                issues.push({ stage: "active", code: "FIXTURE_SHAPE", message: `${fixtureRel} must export run(def, fake)` });
              } else {
                const out = await fixtureMod.run(def, fake);
                if (out && typeof out === "object" && out.pass === false) {
                  issues.push({ stage: "active", code: "FIXTURE_FAIL", message: `${fixtureRel} reported pass: false` });
                }
              }
            } catch (e) {
              issues.push({ stage: "active", code: "FIXTURE_THREW", message: `${fixtureRel} threw: ${String(e)}` });
            }
          }
        }
      } catch (e) {
        issues.push({ stage: "active", code: "ENTRY_IMPORT_FAILED", message: `importing entry ${manifest.entry} failed: ${String(e)}` });
      }
    }
  }
  const active = verified && issues.length === 0;
  const t3 = Date.now();

  return {
    pluginDir: dir,
    pluginId: manifest?.id ?? "(unparsed)",
    staged, verified, active,
    issues,
    timings: { stagedMs: t1 - t0, verifiedMs: t2 - t1, activeMs: t3 - t2, totalMs: t3 - t0 },
    ops: manifest ? routableOps(manifest) : [],
    contentHash: {
      ...(manifest?.contentHash ? { declared: manifest.contentHash } : {}),
      ...(computedHash ? { computed: computedHash } : {}),
      ...(manifest && computedHash ? { match: manifest.contentHash === "" || manifest.contentHash === computedHash } : {}),
    },
    fixture: fixtureRan,
  };
}
