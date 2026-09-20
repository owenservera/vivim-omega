// FORGE:GENERATED-BEGIN schema=plugin-file@1 spec-hash=sha256:22a459a1070064920854843953df82182b62b9549ebb7efd82845af29470b41b
// FORGE:GENERATED-END
// forge.author — index.ts (Omega Forge Wave 0, D-406)
// The Author Forge: emits plugin scaffolds from RECORDED specs into the
// gate-designated scratch proposal path. Class 2 — proposal-only: confers no
// authority, signs nothing, commits nothing (the proposal-artifact schema
// pins authority: "none" so the claim is machine-checked, not promised).
//
// Op exposed (CONTRACT contribution, see plugin.json):
//   forge.author.init@1  MUTATION  {spec: RecordedSpec} → emission report
//   The spec travels as PAYLOAD (pure function of its input — no filesystem
//   reads inside the handler, no live state), which is what makes the
//   self-hosting falsifier honest: the checked-in spec/self.json is the same
//   object any caller would pass, and the output is byte-comparable.
//
// Refusals are DATA (the house's D-379 refusal-as-data pattern): an ok:true
// PortResult carrying {refused: true, error: "REFUSED", rule, detail}. Every
// refusal is NAMED (the `rule` field), never a generic error. The order of
// the validation chain is itself policy: structural checks before identity,
// identity before pin verification, pins before existence, existence before
// the law self-check, and only then does a single byte hit disk — so every
// refusal path leaves the target directory untouched.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { resolveDataDir, omegaTmp } from "@vivim/omega-platform";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";

// ---- the frozen spec grammar (pure data) --------------------------------------

export const FORGE_AUTHOR_OP = "forge.author.init@1";
export const FORGE_AUTHOR_PLUGIN_ID = "forge.author";
/** The one substitution token a template may carry: the spec's own input hash.
 *  Built by CONCATENATION so this source line never itself contains the
 *  token — a generated file must survive its own rendering rule. */
export const SPEC_HASH_TOKEN = ["{{", "SPEC", "_HASH}}"].join("");

/** The fields a recorded spec may carry. Anything else is SPEC_UNKNOWN_FIELD. */
export const SPEC_KNOWN_FIELDS = [
  "schemaVersion", "pluginId", "version", "manifest", "files",
  "authoredFiles", "authoredRegions", "commandList",
  // the four REQUEST parameters below are recognized (so they refuse with
  // their OWN rule, not SPEC_UNKNOWN_FIELD) but are pinned to their inert
  // values — a spec may REQUEST nothing the Forge is forbidden to do.
  "output", "sign", "grants", "productComposition",
] as const;

/** The hash-pinned core of the spec: everything the input hash covers. The
 *  request parameters (output/sign/grants/productComposition), the per-file
 *  contentHash pins, and the commandList's own hashes sit OUTSIDE the hash
 *  domain. Two reasons: output is a runtime request (two runs may target
 *  different scratch dirs under one spec), and covering contentHash (or the
 *  commandList hashes) would be circular — the rendered bytes carry the
 *  inputHash in their GENERATED header, so contentHash is a function OF the
 *  inputHash and can never cover it. Tampering with a contentHash pin is
 *  caught one step later, by the render-verify (SPEC_CONTENT_PIN_MISMATCH):
 *  the pinned hash no longer matches the rendered bytes. */
export const SPEC_BODY_FIELDS = [
  "schemaVersion", "pluginId", "version", "manifest",
  "files", "authoredFiles", "authoredRegions",
] as const;

const SHA256_FORMAT = /^sha256:[0-9a-f]{64}$/;

export interface RecordedFile { path: string; template: string; contentHash: string }
export interface AuthoredRegion { file: string; markers: { begin: string; end: string } }
export interface CommandPin { op: string; inputHash: string; outputHash: string }
export interface RecordedSpec {
  schemaVersion: string;
  pluginId: string;
  version: string;
  manifest: Record<string, unknown>;
  files: RecordedFile[];
  authoredFiles: string[];
  authoredRegions: AuthoredRegion[];
  commandList: CommandPin[];
  output?: unknown;
  sign?: unknown;
  grants?: unknown;
  productComposition?: unknown;
  [k: string]: unknown;
}

// ---- pure helpers (shared by the handler, the bootstrap, and the tests) --------

/** sha256 of a string, in the house's "sha256:<hex>" idiom. */
export function sha256Of(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/** Canonical JSON: keys sorted (recursively), no insignificant whitespace.
 *  The input hash must be independent of how the spec file was formatted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/** The hash-pinned core of a spec (see SPEC_BODY_FIELDS for why the request
 *  parameters, content pins, and commandList are excluded — the short version:
 *  a hash can never cover anything that is a function of itself). The files
 *  projection carries ONLY {path, template}: the bytes-to-be, not their pin. */
export function specBodyOf(spec: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of SPEC_BODY_FIELDS) {
    body[f] = f === "files"
      ? (Array.isArray(spec.files) ? spec.files : []).map((x) =>
          x !== null && typeof x === "object" ? { path: (x as RecordedFile).path, template: (x as RecordedFile).template } : x)
      : spec[f];
  }
  return body;
}

/** inputHash = sha256(canonical(specBody)) — what the GENERATED header pins. */
export function specInputHash(spec: Record<string, unknown>): string {
  return sha256Of(canonicalJson(specBodyOf(spec)));
}

/** Render one template: the spec-hash token substitutes the spec's input hash. */
export function renderTemplate(template: string, inputHash: string): string {
  return template.split(SPEC_HASH_TOKEN).join(inputHash);
}

/** Pack.builder proposal-artifact kinds, by emitted-file role. */
export function artifactKindFor(path: string): "manifest" | "package" | "source" | "fixture" | "composition" | "record" | "doc" {
  if (path === "plugin.json") return "manifest";
  if (path === "package.json") return "package";
  if (path.startsWith("src/")) return "source";
  if (path.endsWith(".md")) return "doc";
  return "record";
}

/** One pack.builder proposal-artifact row for one emitted file. Shape mirrors
 *  packs/builder ProposalArtifactSchema (authority is pinned "none" HERE —
 *  the forge cannot construct an authoritative row even by accident). */
export function proposalArtifactFor(file: RecordedFile, spec: RecordedSpec): Record<string, unknown> {
  return {
    schemaVersion: "1",
    targetPath: file.path,
    artifactKind: artifactKindFor(file.path),
    contentHash: file.contentHash,
    generatedBy: FORGE_AUTHOR_OP,
    ledgerRef: "decision:D-406",
    authority: "none",
    justification: `self-hosting emission of ${spec.pluginId} ${spec.version}: file ${file.path} from recorded spec (inputHash-pinned)`,
  };
}

/** outputHash = sha256 over the sorted (path, contentHash) pairs of the
 *  rendered tree — two runs byte-identical iff their outputHashes match. */
export function emissionOutputHash(files: Array<{ path: string; contentHash: string }>): string {
  const pairs = files.map((f) => ({ path: f.path, contentHash: f.contentHash })).sort((a, b) => (a.path < b.path ? -1 : 1));
  return sha256Of(canonicalJson(pairs));
}

/** A relative, escape-free path (no absolute paths, no "..", no empty segments). */
export function pathIsSafe(p: string): boolean {
  if (typeof p !== "string" || p.length === 0 || isAbsolute(p)) return false;
  return p.split(/[\\/]/).every((seg) => seg.length > 0 && seg !== "..");
}

// FORGE:AUTHORED-BEGIN
// The authored conscience of an otherwise generated file — the trade-offs a
// template cannot honestly emit about itself:
//
// 1. The sha256:9ff03ba164341d819d46661fcc48bfb5332546cb5782f48a193bf3591704f39d token exists because a file cannot contain its own
//    hash: the GENERATED header pins the hash of the SPEC (the input), not of
//    the file (the output). Templates carry the token; rendering substitutes
//    the spec's inputHash; the per-file contentHash pins the rendered bytes.
//    Three pins, no circularity.
//
// 2. authoredFiles is {spec/self.json + the three test files}, each with a
//    justification recorded in the spec: a recorder cannot emit its own
//    recording (the contentHash would have to contain itself), and a falsifier
//    emitted by the system under test cannot falsify it. Nothing else is
//    excluded — no other exclusion is allowed, that is backlog not gate.
//
// 3. The four request parameters (output/sign/grants/productComposition) are
//    RECOGNIZED fields pinned to inert values, so a spec asking for signing
//    refuses with SPEC_SIGNING_FORBIDDEN rather than SPEC_UNKNOWN_FIELD — the
//    refusal names the SIN, not just the field.
// FORGE:AUTHORED-END

// ---- the refusal envelope (D-379 refusal-as-data) ------------------------------

export interface ForgeRefusal {
  refused: true;
  error: "REFUSED";
  op: string;
  rule: string;
  detail: string;
}

function refuse(rule: string, detail: string): ForgeRefusal {
  return { refused: true, error: "REFUSED", op: FORGE_AUTHOR_OP, rule, detail };
}

// ---- the validation + emission chain -------------------------------------------

interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

async function lawSelfCheck(ctx: PluginContext): Promise<void> {
  const r: PortResult = await ctx.port.call("law.check@1", { principal: FORGE_AUTHOR_PLUGIN_ID, op: FORGE_AUTHOR_OP });
  if (!r.ok) throw { rule: "SPEC_LAW_REFUSED", detail: `law.check@1 port refused: ${r.error}: ${String((r as { detail?: string }).detail ?? "")}` };
  const decision = (r.value ?? {}) as { decision?: string; reason?: string };
  if (decision.decision !== "allow") {
    throw { rule: "SPEC_LAW_REFUSED", detail: `law.check@1 denied ${FORGE_AUTHOR_OP} for ${FORGE_AUTHOR_PLUGIN_ID}: ${decision.decision ?? "?"} — ${decision.reason ?? "no reason"}` };
  }
}

/** Resolve the emission target: spec.output (scratch-scoped) or the
 *  composition's scratchDir passthrough, defaulting into omegaTmp scratch. */
function resolveOutputDir(spec: RecordedSpec, config: Record<string, unknown>): { dir: string } | ForgeRefusal {
  const raw = spec.output ?? null;
  let dir: string;
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== "string" || raw.length === 0) {
      return refuse("SPEC_OUTPUT_SCOPE", `spec.output must be a non-empty path string (got ${typeof raw})`);
    }
    let resolved: string;
    try { resolved = resolveDataDir(raw); } catch (e) {
      return refuse("SPEC_OUTPUT_SCOPE", `spec.output is not resolvable on this machine: ${String(e)}`);
    }
    if (!isScratchPath(resolved)) {
      return refuse("SPEC_OUTPUT_SCOPE", `spec.output ${resolved} is outside the gate-designated scratch proposal path — emission writes scratch only`);
    }
    dir = resolved;
  } else {
    const cfg = config?.scratchDir;
    if (typeof cfg === "string" && cfg.length > 0) {
      dir = resolveDataDir(cfg);
      if (!isScratchPath(dir)) {
        return refuse("SPEC_OUTPUT_SCOPE", `config.scratchDir ${dir} is outside the scratch proposal path — refuse rather than honor a miscalibrated composition`);
      }
    } else {
      dir = omegaTmp("omega-forge-author", "emission"); // safe default: scratch, never the repo
    }
  }
  return { dir };
}

function isScratchPath(p: string): boolean {
  const root = omegaTmp();
  return p === root || p.startsWith(root + sep);
}

/** The full validation + emission chain. Every refusal returns BEFORE a single
 *  byte is written; the ledger phase is the only place partial work can remain
 *  (on-disk scratch output), and it reports its own named refusal if the
 *  ledger did not take every row. */
export async function authorInit(payload: unknown, ctx: PluginContext): Promise<unknown> {
  // a · payload shape
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return refuse("SPEC_MALFORMED_INPUT", `payload must be {spec: RecordedSpec} (got ${Array.isArray(payload) ? "array" : typeof payload})`);
  }
  const p = payload as { spec?: unknown };
  if (p.spec === null || typeof p.spec !== "object" || Array.isArray(p.spec)) {
    return refuse("SPEC_MALFORMED_INPUT", "payload.spec must be the recorded spec object");
  }
  const spec = p.spec as RecordedSpec;

  // b · unknown fields (the grammar is closed)
  for (const key of Object.keys(spec)) {
    if (!(SPEC_KNOWN_FIELDS as readonly string[]).includes(key)) {
      return refuse("SPEC_UNKNOWN_FIELD", `spec carries unknown field "${key}" — the recorded-spec grammar is closed (known: ${SPEC_KNOWN_FIELDS.join(", ")})`);
    }
  }

  // c · the four forbidden requests (recognized, named, always refused when non-inert)
  if (spec.sign !== null && spec.sign !== undefined && spec.sign !== false) {
    return refuse("SPEC_SIGNING_FORBIDDEN", `spec requests signing (${JSON.stringify(spec.sign)}) — the Forge signs nothing; signing is a human/host ceremony outside any spec`);
  }
  if (spec.grants !== null && spec.grants !== undefined && !(Array.isArray(spec.grants) && spec.grants.length === 0)) {
    return refuse("SPEC_CAPABILITY_GRANT_FORBIDDEN", `spec requests capability grants (${JSON.stringify(spec.grants)}) — emission confers no authority; grants live in signed compositions only`);
  }
  if (spec.productComposition !== null && spec.productComposition !== undefined && spec.productComposition !== "") {
    return refuse("SPEC_COMPOSITION_MEMBERSHIP_FORBIDDEN", `spec requests product composition membership (${JSON.stringify(spec.productComposition)}) — a spec may emit proposals; product membership is a human promote decision`);
  }
  const out = resolveOutputDir(spec, ctx.config ?? {});
  if ("rule" in out) return out;

  // d · identity
  if (spec.pluginId !== FORGE_AUTHOR_PLUGIN_ID) {
    return refuse("SPEC_PLUGIN_ID_MISMATCH", `spec.pluginId is ${JSON.stringify(spec.pluginId)} — Wave 0 self-hosting serves ${FORGE_AUTHOR_PLUGIN_ID} only (one keystone, no generalization until the wire proves itself)`);
  }
  if (spec.schemaVersion !== "1") {
    return refuse("SPEC_MALFORMED_INPUT", `spec.schemaVersion must be "1" (got ${JSON.stringify(spec.schemaVersion)})`);
  }
  if (typeof spec.version !== "string" || spec.version.length === 0) {
    return refuse("SPEC_MALFORMED_INPUT", "spec.version must be a non-empty string");
  }
  if (spec.manifest === null || typeof spec.manifest !== "object" || Array.isArray(spec.manifest)) {
    return refuse("SPEC_MALFORMED_INPUT", "spec.manifest must be the manifest object the emission reproduces as plugin.json");
  }

  // e · commandList: the hash-pinned command record
  const cmd = spec.commandList;
  if (!Array.isArray(cmd) || cmd.length !== 1 || cmd[0] === null || typeof cmd[0] !== "object") {
    return refuse("SPEC_COMMAND_LIST_UNPINNED", `spec.commandList must be exactly one pinned command {op: "${FORGE_AUTHOR_OP}", inputHash, outputHash} (got ${Array.isArray(cmd) ? `${cmd.length} entries` : typeof cmd})`);
  }
  const pin = cmd[0] as CommandPin;
  if (pin.op !== FORGE_AUTHOR_OP || !SHA256_FORMAT.test(pin.inputHash ?? "") || !SHA256_FORMAT.test(pin.outputHash ?? "")) {
    return refuse("SPEC_COMMAND_LIST_UNPINNED", `commandList[0] must pin "${FORGE_AUTHOR_OP}" with sha256-shaped inputHash and outputHash (got op=${JSON.stringify(pin.op)}, inputHash=${JSON.stringify(pin.inputHash)}, outputHash=${JSON.stringify(pin.outputHash)})`);
  }

  // f · files / authoredFiles / authoredRegions structure
  if (!Array.isArray(spec.files) || spec.files.length === 0) {
    return refuse("SPEC_MALFORMED_INPUT", "spec.files must be a non-empty array of {path, template, contentHash}");
  }
  const seen = new Set<string>();
  for (const f of spec.files) {
    if (f === null || typeof f !== "object") return refuse("SPEC_MALFORMED_INPUT", "spec.files entries must be objects {path, template, contentHash}");
    if (typeof f.path !== "string" || typeof f.template !== "string" || typeof f.contentHash !== "string") {
      return refuse("SPEC_MALFORMED_INPUT", `spec.files entry ${JSON.stringify(f?.path)} must carry string path, template, contentHash`);
    }
    if (!SHA256_FORMAT.test(f.contentHash)) {
      return refuse("SPEC_MALFORMED_INPUT", `spec.files[${f.path}].contentHash must be "sha256:<64hex>" (got ${JSON.stringify(f.contentHash)})`);
    }
    if (!pathIsSafe(f.path)) {
      return refuse("SPEC_PATH_ESCAPE", `spec.files[${f.path}] escapes the emission tree — paths are relative, ".."-free, segment-clean`);
    }
    if (seen.has(f.path)) return refuse("SPEC_MALFORMED_INPUT", `spec.files declares ${f.path} twice`);
    seen.add(f.path);
  }
  const authoredFiles = Array.isArray(spec.authoredFiles) ? spec.authoredFiles : undefined;
  if (authoredFiles === undefined) return refuse("SPEC_MALFORMED_INPUT", "spec.authoredFiles must be an array (empty unless unavoidable — every entry needs a justification)");
  for (const a of authoredFiles) {
    if (typeof a !== "string" || !pathIsSafe(a)) {
      return refuse("SPEC_MALFORMED_INPUT", `spec.authoredFiles entries must be safe relative paths (got ${JSON.stringify(a)})`);
    }
    if (seen.has(a)) return refuse("SPEC_MALFORMED_INPUT", `${a} is both generated (files) and authored (authoredFiles) — pick one`);
    seen.add(a);
  }
  const regions = Array.isArray(spec.authoredRegions) ? spec.authoredRegions : undefined;
  if (regions === undefined) return refuse("SPEC_MALFORMED_INPUT", "spec.authoredRegions must be an array (possibly empty)");
  for (const r of regions) {
    if (r === null || typeof r !== "object" || typeof r.file !== "string" ||
        r.markers === null || typeof r.markers !== "object" ||
        typeof r.markers.begin !== "string" || typeof r.markers.end !== "string" ||
        r.markers.begin.length === 0 || r.markers.end.length === 0) {
      return refuse("SPEC_MALFORMED_INPUT", "spec.authoredRegions entries must be {file, markers: {begin, end}}");
    }
    if (!spec.files.some((f) => f.path === r.file)) {
      return refuse("SPEC_MALFORMED_INPUT", `authored region names ${r.file}, which is not a generated file — regions cut into generated files only`);
    }
  }

  // g · the spec's own integrity: inputHash pin
  const inputHash = specInputHash(spec as unknown as Record<string, unknown>);
  if (pin.inputHash !== inputHash) {
    return refuse("SPEC_SPEC_HASH_MISMATCH", `spec fails its own pin: commandList inputHash ${pin.inputHash} ≠ computed ${inputHash} — the recorded spec was modified after pinning (or the pin was forged)`);
  }

  // h · render and re-verify every content pin (fail-closed: no byte ships unpinned)
  const rendered: Array<{ file: RecordedFile; bytes: string }> = [];
  for (const f of spec.files) {
    const bytes = renderTemplate(f.template, inputHash);
    const hash = sha256Of(bytes);
    if (hash !== f.contentHash) {
      return refuse("SPEC_CONTENT_PIN_MISMATCH", `file ${f.path}: rendered bytes hash to ${hash} but the spec pins ${f.contentHash} — template and pin disagree, nothing is written`);
    }
    rendered.push({ file: f, bytes });
  }

  // i · the target must be fresh (an existing non-empty target is a refusal)
  if (existsSync(out.dir) && readdirSync(out.dir).length > 0) {
    return refuse("SPEC_TARGET_EXISTS", `emission target ${out.dir} already exists and is not empty — the Forge proposes into fresh scratch, it never overwrites`);
  }

  // j · the law self-check (the manifest's "every write is law-gated", as data)
  try {
    await lawSelfCheck(ctx);
  } catch (e) {
    const r = e as { rule?: string; detail?: string };
    if (typeof r?.rule === "string") return refuse(r.rule, r.detail ?? "");
    throw e;
  }

  // k · emit + ledger (the only writes in the op)
  const proposalRows: Array<{ id: string; rev: number }> = [];
  for (const { file, bytes } of rendered) {
    const target = join(out.dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  for (const { file } of rendered) {
    const artifact = proposalArtifactFor(file, spec);
    const id = `file:${spec.pluginId}/${file.path}`;
    const ap: PortResult = await ctx.port.call("vault.append@1", {
      ns: "proposal", id, data: artifact,
      meta: { type: "proposal-artifact", pluginId: spec.pluginId, targetPath: file.path },
      refs: [],
    });
    if (!ap.ok) {
      return refuse("SPEC_LEDGER_REFUSED", `vault.append@1 refused the proposal row for ${file.path}: ${ap.error}: ${String((ap as { detail?: string }).detail ?? "")} — the emission is not ledgered, treat it as unproposed`);
    }
    const got: PortResult = await ctx.port.call("vault.get@1", { ns: "proposal", id });
    const row = got.ok ? (got.value as VaultGetResult | null) : null;
    if (!row || canonicalJson(row.data) !== canonicalJson(artifact)) {
      return refuse("SPEC_LEDGER_REFUSED", `proposal row ${id} did not read back byte-identical from ns proposal — the ledger is the proposal's ground, refuse rather than trust an unsynced write`);
    }
    proposalRows.push({ id, rev: (row as VaultGetResult).rev });
  }

  const outputHash = emissionOutputHash(rendered.map(({ file }) => file));
  ctx.log(`forge.author: emitted ${rendered.length} files to ${out.dir} (inputHash ${inputHash}, outputHash ${outputHash}, ${proposalRows.length} proposal rows)`);
  return {
    refused: false as const,
    op: FORGE_AUTHOR_OP,
    inputHash,
    outputHash,
    outputDir: out.dir,
    emitted: rendered.map(({ file }) => file.path),
    proposalRows,
  };
}

startPlugin(definePlugin({
  ops: {
    [FORGE_AUTHOR_OP]: (payload: unknown, ctx: PluginContext) => authorInit(payload, ctx),
  },
}));
