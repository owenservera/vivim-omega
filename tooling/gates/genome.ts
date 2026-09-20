// tooling/gates/genome.ts — D-425 (Ω-DEV.1): the system genome.
//
// The gap this closes: D-423 consolidated the process self-model, but it is
// SUMMARY-shaped (counts, colors, board rows) — an agent still cannot load
// "the whole system state" in one context window, and the layer map (the Ω
// upgrade lineage) lives entirely outside the tree in paper specs, so nothing
// mechanical knows about layers, dependencies, or falsifier coverage. This
// module is the fold that fixes that:
//
//   genome/layers.json   the ONLY hand-authored input (the layer registry)
//   build/genome.json    the canonical fold — machine-readable, committed,
//                        byte-verified (a hand edit is a gate failure)
//   build/genome.md      the ≤16 KiB brief — one context-window digest
//
// The fold reads, ALL through existing parsers (never a second parser to
// drift from the first): decisions.ts (parseIndexRows, parseRecord) for the
// ledger, explain.ts (STAGE_DOCS) for the gate's own stage inventory, and a
// plain walk for the test-tree inventory. The genome carries NO volatile
// fields — no timestamps, no head sha — so a fresh fold is byte-stable and
// the committed artifact is content-addressed (the D-362 discipline, one
// notch stricter: byte-exact, because this artifact is deterministic by
// construction, not runner-shaped).
//
// The `genome` gate stage is MECHANICAL (it fails, unlike report-only
// neighbors): artifact integrity is not a judgment. A drifted, stale, or
// hand-edited genome is breakage the same way an index/record mismatch is
// breakage for the `decisions` stage. What stays REPORTED (never failing):
// the record status of implemented layers (the ratify ceremony owns the
// PROPOSED→RATIFIED flip, per D-364) and the count of external-assumed
// layers (the owner's assume-implemented directive, recorded as data in the
// registry — a claim about paper, never about this tree).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseIndexRows, parseRecord } from "./decisions.ts";
import { STAGE_DOCS } from "./explain.ts";

// ---- the registry (genome/layers.json — the only hand-authored input) ----

export const LEGAL_LAYER_STATUSES = ["implemented", "external-assumed", "ratified-unimplemented", "queued"] as const;
export type LayerStatus = (typeof LEGAL_LAYER_STATUSES)[number];

export interface LayerEntry {
  id: string;
  name: string;
  status: LayerStatus;
  treeId: number | null;    // THIS ledger's record (docs/decisions/D-<treeId>-*.md)
  specId: string | null;    // the paper lineage id (cite backticked in prose)
  falsifier: string | null; // named falsifier id, e.g. "F-GENOME"
  dependsOn: string[];
  note: string;
  evidence?: "record" | "program"; // how the implemented claim is witnessed: one record (default) or the program at large (CORE — the gate is its falsifier; no treeId, no single falsifier file)
}

export interface LayerRegistry {
  registryVersion: number;
  kind: string;
  lineage: { note: string; specLineage: string; assumedDirective: string };
  statuses: string[];
  layers: LayerEntry[];
}

/** Parse + shape-validate the registry. Throws on malformed JSON; returns
 *  issues for shape violations (the caller decides fail vs. report — the
 *  gate stage treats them as mechanical). Pure. */
export function parseLayerRegistry(text: string): { registry: LayerRegistry | null; issues: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { registry: null, issues: [`genome/layers.json is not valid JSON: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`] };
  }
  const r = raw as Partial<LayerRegistry>;
  const issues: string[] = [];
  if (!Array.isArray(r.layers) || r.layers.length === 0) issues.push("registry has no layers array");
  if (!r.lineage || typeof r.lineage.note !== "string") issues.push("registry lineage.note missing");
  if (issues.length > 0) return { registry: null, issues };
  const seen = new Set<string>();
  for (const l of (r.layers as LayerEntry[])) {
    if (!l.id || seen.has(l.id)) issues.push(`layer id "${l.id}" missing or duplicate`);
    seen.add(l.id);
    if (!LEGAL_LAYER_STATUSES.includes(l.status)) issues.push(`layer ${l.id}: illegal status "${l.status}"`);
    if (l.treeId !== null && !Number.isInteger(l.treeId)) issues.push(`layer ${l.id}: treeId must be an integer or null`);
    if (l.falsifier !== null && !/^F-[A-Z][A-Z0-9-]*$/.test(l.falsifier)) issues.push(`layer ${l.id}: falsifier "${l.falsifier}" is not a named falsifier id (F-XXXX)`);
    if (!Array.isArray(l.dependsOn)) issues.push(`layer ${l.id}: dependsOn must be an array`);
    if (l.evidence !== undefined && !['"record"', '"program"'].includes(JSON.stringify(l.evidence))) issues.push(`layer ${l.id}: evidence kind "${String(l.evidence)}" illegal (record | program)`);
  }
  return { registry: issues.length === 0 ? (r as LayerRegistry) : null, issues };
}

/** DAG check over the registry: unknown deps and cycles. Pure. */
export function checkLayerDag(layers: LayerEntry[]): string[] {
  const issues: string[] = [];
  const byId = new Map(layers.map((l) => [l.id, l]));
  for (const l of layers) {
    for (const d of l.dependsOn) if (!byId.has(d)) issues.push(`layer ${l.id} depends on unknown layer "${d}"`);
  }
  // Kahn cycle detection — deterministic order by registry position
  const indeg = new Map<string, number>();
  for (const l of layers) indeg.set(l.id, l.dependsOn.filter((d) => byId.has(d)).length);
  const queue = layers.filter((l) => indeg.get(l.id) === 0).map((l) => l.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const l of layers) {
      if (l.dependsOn.includes(id)) {
        const n = (indeg.get(l.id) ?? 0) - 1;
        indeg.set(l.id, n);
        if (n === 0) queue.push(l.id);
      }
    }
  }
  if (order.length !== layers.length) {
    const cyclic = layers.filter((l) => !order.includes(l.id)).map((l) => l.id);
    issues.push(`layer dependency cycle involving: ${cyclic.join(", ")}`);
  }
  return issues;
}

// ---- named falsifiers (the record-side convention D-426 builds on) ----

/** A named falsifier: ALL-CAPS with at least one letter after "F-" — "F-GENOME",
 *  "F-BOOT". The record-local convention ("F-1..F-5", D-423/D-424) does NOT
 *  match (digits), by design: two conventions, one regex, no conflation. */
export const NAMED_F_RE = /\bF-([A-Z][A-Z0-9-]*)\b/g;

export interface FalsifierClause { clause: number | null; title: string | null }

/** Extract named-falsifier clause declarations from record text — lines like
 *  "- F-GENOME.1 (fold-completeness) — …" (leading list indentation tolerated).
 *  Grouped by id, first-seen order. Pure; tolerant of records that declare
 *  none (most of the ledger). */
export function extractNamedFalsifiers(text: string): Map<string, FalsifierClause[]> {
  const out = new Map<string, FalsifierClause[]>();
  const lineRe = /^[ \t]*[-*][ \t]+`?(F-[A-Z][A-Z0-9-]*)(?:\.(\d+))?\b`?[.:]?[ \t]*(?:\(([^)]*)\))?/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const id = m[1];
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push({ clause: m[2] !== undefined ? Number(m[2]) : null, title: m[3]?.trim() || null });
  }
  return out;
}

// ---- the fold (pure: inputs in, genome out, zero I/O) ----

export interface GenomeLayer {
  id: string;
  name: string;
  status: LayerStatus;               // the registry's claim
  dependsOn: string[];
  note: string;
  specId: string | null;
  evidence: {
    treeId: number | null;
    recordFile: string | null;
    recordStatus: string | null;     // from the INDEX (the status source of truth) — reported, never enforced here
    falsifier: string | null;
    falsifierFile: string | null;    // the test file carrying the id, when resolved
    falsifierClauses: string[];      // clause titles declared in the record, when a record exists
    evidenceKind: "record" | "program"; // how the implemented claim is witnessed (D-425: CORE is the program at large)
  };
}

export interface Genome {
  genomeVersion: 1;
  kind: string;
  lineage: LayerRegistry["lineage"];
  counts: {
    layers: number; implemented: number; externalAssumed: number; ratifiedUnimplemented: number; queued: number;
    decisions: number; ratified: number; proposed: number; records: number;
    testFiles: number; gateStages: number; plugins: number; compositions: number;
  };
  layers: GenomeLayer[];
  decisions: Array<{ n: number; status: string; file: string | null }>;
  falsifiers: Array<{ id: string; layer: string; file: string | null; clauses: string[] }>;
  tests: { files: string[] };
  gate: { stages: string[] };
}

export interface GenomeInputs {
  registryText: string;
  indexText: string;
  records: Array<{ n: number; file: string; text: string }>;
  tests: Array<{ path: string; text: string }>;
  committedGenome: string | null;
  committedBrief: string | null;
  gateStages: string[];
  pluginsCount: number;
  compositionsCount: number;
}

/** Resolve a named falsifier id to the test file carrying it as a word.
 *  The canonical stub path (f-<id>.test.ts, D-426's spelling) is preferred
 *  over incidental mentions elsewhere — resolution names the RIGHT file, not
 *  just the first sorted one. Pure. Exported: the loop audit (D-426) reuses
 *  THIS resolver — one resolver, never a second. */
export function resolveFalsifierFile(id: string, tests: Array<{ path: string; text: string }>): string | null {
  const re = new RegExp(`\\b${id}\\b`);
  const canonical = `tooling/gates/test/f-${id.replace(/^F-/, "").toLowerCase()}.test.ts`;
  if (tests.some((t) => t.path === canonical && re.test(t.text))) return canonical;
  for (const t of tests) if (re.test(t.text)) return t.path;
  return null;
}

/** The pure fold. Deterministic by construction: fixed key order, arrays
 *  sorted at their source (the impure edge sorts file walks), no volatile
 *  fields — same inputs, byte-identical genome, always. */
export function foldGenome(inputs: GenomeInputs, registry: LayerRegistry): Genome {
  const rows = parseIndexRows(inputs.indexText).sort((a, b) => a.n - b.n);
  const statusByN = new Map(rows.map((r) => [r.n, r.status]));
  const recordByN = new Map(inputs.records.map((r) => [r.n, r]));
  const layers: GenomeLayer[] = registry.layers.map((l) => {
    const rec = l.treeId !== null ? recordByN.get(l.treeId) ?? null : null;
    const doc = rec ? parseRecord(rec.n, rec.file, rec.text) : null;
    const clauses = doc ? extractNamedFalsifiers(doc.evidenceText).get(l.falsifier ?? "") : undefined;
    return {
      id: l.id, name: l.name, status: l.status, dependsOn: [...l.dependsOn], note: l.note, specId: l.specId,
      evidence: {
        treeId: l.treeId,
        recordFile: rec ? `docs/decisions/${rec.file}` : null,
        recordStatus: l.treeId !== null ? statusByN.get(l.treeId) ?? null : null,
        falsifier: l.falsifier,
        falsifierFile: l.falsifier ? resolveFalsifierFile(l.falsifier, inputs.tests) : null,
        falsifierClauses: clauses ? clauses.map((c) => (c.title ? `F-${l.falsifier!.slice(2)}.${c.clause ?? "?"} (${c.title})` : `F-${l.falsifier!.slice(2)}.${c.clause ?? "?"}`)) : [],
        evidenceKind: l.evidence ?? "record",
      },
    };
  });
  const falsifiers = registry.layers
    .filter((l) => l.falsifier)
    .map((l) => {
      const gl = layers.find((x) => x.id === l.id)!;
      return { id: l.falsifier!, layer: l.id, file: gl.evidence.falsifierFile, clauses: gl.evidence.falsifierClauses };
    });
  const decisions = rows.map((r) => ({ n: r.n, status: r.status, file: recordByN.has(r.n) ? `docs/decisions/${recordByN.get(r.n)!.file}` : null }));
  const st = (s: LayerStatus) => registry.layers.filter((l) => l.status === s).length;
  return {
    genomeVersion: 1,
    kind: "the vivim-omega system genome — the machine-readable constitution (D-425); derived, committed, byte-verified; hand edits are gate failures",
    lineage: registry.lineage,
    counts: {
      layers: registry.layers.length,
      implemented: st("implemented"), externalAssumed: st("external-assumed"),
      ratifiedUnimplemented: st("ratified-unimplemented"), queued: st("queued"),
      decisions: rows.length,
      ratified: rows.filter((r) => r.status === "RATIFIED").length,
      proposed: rows.filter((r) => r.status === "PROPOSED").length,
      records: inputs.records.length,
      testFiles: inputs.tests.length,
      gateStages: inputs.gateStages.length,
      plugins: inputs.pluginsCount,
      compositions: inputs.compositionsCount,
    },
    layers,
    decisions,
    falsifiers,
    tests: { files: inputs.tests.map((t) => t.path) },
    gate: { stages: [...inputs.gateStages] },
  };
}

/** Canonical serialization — the byte-stable form the gate compares. */
export function serializeGenome(genome: Genome): string {
  return `${JSON.stringify(genome, null, 2)}\n`;
}

// ---- the brief (pure: genome in, markdown out, budget-checked) ----

export const GENOME_BUDGET_BYTES = 256 * 1024;
export const BRIEF_BUDGET_BYTES = 16 * 1024;

export function renderGenomeBrief(genome: Genome): string {
  const lines: string[] = [];
  lines.push("# The vivim-omega system genome — the brief");
  lines.push("");
  lines.push("<!-- generated by omega:genome (D-425). Derived — do not hand-edit; the gate byte-verifies this file against the fold. The canonical machine artifact is build/genome.json. -->");
  lines.push("");
  lines.push(`One fold of the whole system state: ${genome.counts.layers} layers, ${genome.counts.decisions} decision rows (${genome.counts.ratified} ratified / ${genome.counts.proposed} proposed), ${genome.counts.records} record files, ${genome.counts.testFiles} test files, ${genome.counts.gateStages} gate stages, ${genome.counts.plugins} plugins, ${genome.counts.compositions} compositions.`);
  lines.push("");
  lines.push(`Status vocabulary: implemented (tree evidence + falsifiers green) ${genome.counts.implemented} · external-assumed (paper lineage, owner directive — NO tree evidence) ${genome.counts.externalAssumed} · ratified-unimplemented ${genome.counts.ratifiedUnimplemented} · queued ${genome.counts.queued}.`);
  lines.push("");
  lines.push("## Lineage — two numbering systems, never conflated");
  lines.push("");
  lines.push(genome.lineage.note);
  lines.push("");
  lines.push(`Spec lineage: ${genome.lineage.specLineage}`);
  lines.push("");
  lines.push(`Assumed-implemented directive (recorded, not trusted): ${genome.lineage.assumedDirective}`);
  lines.push("");
  lines.push("## Layers");
  lines.push("");
  lines.push("| Layer | Status | Tree | Paper | Falsifier | Depends on |");
  lines.push("|---|---|---|---|---|---|");
  for (const l of genome.layers) {
    const tree = l.evidence.treeId !== null ? `D-${l.evidence.treeId}${l.evidence.recordStatus ? ` (${l.evidence.recordStatus.toLowerCase()})` : " (no record)"}` : "—";
    const paper = l.specId ?? "—";
    const falsifier = l.evidence.falsifier
      ? `${l.evidence.falsifier}${l.evidence.falsifierFile ? ` → \`${l.evidence.falsifierFile.split("/").pop()}\`` : " (unresolved)"}`
      : "—";
    lines.push(`| ${l.id} | ${l.status} | ${tree} | ${paper} | ${falsifier} | ${l.dependsOn.length > 0 ? l.dependsOn.join(", ") : "—"} |`);
  }
  lines.push("");
  lines.push("## Falsifier coverage (named falsifiers)");
  lines.push("");
  for (const f of genome.falsifiers) {
    lines.push(`- ${f.id} (${f.layer}) → ${f.file ? `\`${f.file}\`` : "**unresolved** — no test file carries this id"}${f.clauses.length > 0 ? ` · clauses: ${f.clauses.join("; ")}` : ""}`);
  }
  lines.push("");
  lines.push("## Gate stages (the verifiers this genome trusts)");
  lines.push("");
  lines.push(genome.gate.stages.join(" · "));
  lines.push("");
  lines.push("## How to use this");
  lines.push("");
  lines.push("1. Load `build/genome.json` for the machine artifact; this brief is the ≤16 KiB digest.");
  lines.push("2. `bun run omega:orchestrate` — the DAG as a plan: done / in-flight / verify queue / build queue / spec queue / blocked.");
  lines.push("3. `bun run omega:entry` — the session brief; `bun run omega:process` — the process self-model.");
  lines.push("4. `bun run omega:loop --status` — falsifier coverage audit; `bun run omega:simulate <layer>` — design-sim a layer before building it.");
  lines.push("5. After touching decisions or the registry: `bun run omega:genome` re-emits, the gate byte-verifies, drift is a failure.");
  lines.push("");
  return lines.join("\n");
}

// ---- verification (pure: the F-GENOME clauses) ----

export interface GenomeCheckResult {
  ok: boolean;
  detail: Record<string, unknown>;
  issues: string[];
}

function parseCommittedDecisionNs(text: string | null): number[] {
  if (text === null) return [];
  try {
    const g = JSON.parse(text) as Genome;
    return Array.isArray(g.decisions) ? g.decisions.map((d) => d.n).sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

/** The verifier. MECHANICAL: registry shape, DAG, artifact presence, byte
 *  equality, decision-set equality both directions, falsifier resolution for
 *  implemented layers, status-shape honesty, budgets. REPORTED in detail
 *  (never failing): PROPOSED record status of implemented layers (the
 *  ratify ceremony owns the flip), the external-assumed count (the owner's
 *  directive, recorded as data). */
export function verifyGenome(inputs: GenomeInputs): GenomeCheckResult {
  const issues: string[] = [];
  const { registry, issues: registryIssues } = parseLayerRegistry(inputs.registryText);
  if (!registry) return { ok: false, detail: { policy: "mechanical (D-425) — artifact integrity, not judgment" }, issues: ["GENOME_REGISTRY_INVALID: " + registryIssues.join("; ")] };
  for (const dag of checkLayerDag(registry.layers)) issues.push(`GENOME_CYCLE/GENOME_DEP_UNKNOWN: ${dag}`);
  const genome = foldGenome(inputs, registry);
  const freshJson = serializeGenome(genome);
  const freshBrief = renderGenomeBrief(genome);

  // artifact presence + byte equality (F-GENOME.2 — no hand edits, no staleness)
  if (inputs.committedGenome === null) issues.push("GENOME_MISSING: build/genome.json is absent — run `bun run omega:genome` and commit the artifact in the same wave");
  else if (inputs.committedGenome !== freshJson) {
    // name the specific drift class when the committed genome still parses
    // (an unparseable committed artifact is a hand edit, not a direction)
    const committedNs = parseCommittedDecisionNs(inputs.committedGenome);
    const freshNs = genome.decisions.map((d) => d.n);
    const missing = committedNs.length > 0 ? freshNs.filter((n) => !committedNs.includes(n)) : [];
    const orphan = committedNs.length > 0 ? committedNs.filter((n) => !freshNs.includes(n)) : [];
    if (missing.length > 0) issues.push(`GENOME_INCOMPLETE: the tree has decisions the committed genome does not (${missing.map((n) => `D-${n}`).join(", ")}) — re-emit (bun run omega:genome) in the same commit as the ledger change`);
    else if (orphan.length > 0) issues.push(`GENOME_ORPHAN: the committed genome lists decisions the tree does not (${orphan.map((n) => `D-${n}`).join(", ")}) — re-emit (bun run omega:genome)`);
    else issues.push("GENOME_HAND_EDIT: build/genome.json is not the byte-exact fold of this tree — re-emit (bun run omega:genome); hand edits are unexpressible by design");
  }
  if (inputs.committedBrief === null) issues.push("GENOME_MISSING: build/genome.md is absent — run `bun run omega:genome` and commit the artifact in the same wave");
  else if (inputs.committedBrief !== freshBrief) issues.push("GENOME_HAND_EDIT: build/genome.md is not the byte-exact brief of this tree — re-emit (bun run omega:genome); hand edits are unexpressible by design");

  // registry ↔ tree honesty (F-GENOME.1's registry direction + status shape)
  const recordNs = new Set(inputs.records.map((r) => r.n));
  for (const l of registry.layers) {
    const kind = l.evidence ?? "record";
    if (l.treeId !== null && !recordNs.has(l.treeId)) issues.push(`GENOME_ORPHAN: layer ${l.id} claims tree record D-${l.treeId}, which has no file in docs/decisions/`);
    if (l.status === "implemented" && kind === "record" && l.treeId === null) issues.push(`GENOME_STATUS_LIE: layer ${l.id} claims implemented with no tree record — implemented is a claim about THIS tree`);
    if (l.status === "implemented" && kind === "program" && (l.treeId !== null || l.falsifier !== null)) issues.push(`GENOME_STATUS_LIE: layer ${l.id} claims program evidence but names a record or falsifier — the program is the witness, pick one`);
    if (l.status === "external-assumed" && l.treeId !== null) issues.push(`GENOME_STATUS_LIE: layer ${l.id} claims external-assumed but names a tree record — external-assumed means no tree evidence`);
    if (l.status === "implemented" && kind === "record" && l.falsifier !== null && l.treeId !== null) {
      const gl = genome.layers.find((x) => x.id === l.id)!;
      if (gl.evidence.falsifierFile === null) issues.push(`GENOME_FALSIFIER_UNRESOLVED: layer ${l.id} is implemented but no test file carries its falsifier ${l.falsifier}`);
    }
  }

  // budgets (F-GENOME.5)
  if (freshJson.length > GENOME_BUDGET_BYTES) issues.push(`GENOME_BUDGET_EXCEEDED: the genome is ${freshJson.length} bytes (budget ${GENOME_BUDGET_BYTES}) — one context window is the point; fold less or split the artifact`);
  if (freshBrief.length > BRIEF_BUDGET_BYTES) issues.push(`GENOME_BUDGET_EXCEEDED: the brief is ${freshBrief.length} bytes (budget ${BRIEF_BUDGET_BYTES}) — the digest must stay loadable`);

  const inFlight = genome.layers.filter((l) => l.status === "implemented" && l.evidence.recordStatus === "PROPOSED").map((l) => l.id);
  return {
    ok: issues.length === 0,
    detail: {
      policy: "mechanical (D-425): artifact integrity fails; record-status and the assumed directive are reported facts (the ratify ceremony and the owner own them)",
      counts: genome.counts,
      genomeBytes: freshJson.length,
      briefBytes: freshBrief.length,
      inFlight,                       // implemented layers whose record flip is pending — reported, never failed
      externalAssumed: genome.counts.externalAssumed, // the owner directive, as data
      unresolvedFalsifiers: genome.falsifiers.filter((f) => f.file === null).map((f) => `${f.id} (${f.layer})`),
    },
    issues,
  };
}

// ---- the impure edge: gather + emit + the gate-stage entry ----

function walkTestFiles(root: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const skip = new Set(["node_modules", ".git", "build", "dev-vault", ".gen", ".test-tmp"]);
  const rec = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (skip.has(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { rec(p); continue; }
      if (!/\.(test\.ts|test\.mjs)$/.test(f)) continue;
      out.push({ path: p.slice(root.length + 1), text: readFileSync(p, "utf-8") });
    }
  };
  rec(root);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function gatherGenomeInputs(root: string): GenomeInputs {
  const decisionsDir = join(root, "docs/decisions");
  const records = readdirSync(decisionsDir)
    .filter((f) => /^D-\d+-.+\.md$/.test(f))
    .map((f) => ({ n: Number(/^D-(\d+)-/.exec(f)![1]), file: f, text: readFileSync(join(decisionsDir, f), "utf-8") }))
    .sort((a, b) => a.n - b.n);
  const genomePath = join(root, "build/genome.json");
  const briefPath = join(root, "build/genome.md");
  return {
    registryText: readFileSync(join(root, "genome/layers.json"), "utf-8"),
    indexText: readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8"),
    records,
    tests: walkTestFiles(root),
    committedGenome: existsSync(genomePath) ? readFileSync(genomePath, "utf-8") : null,
    committedBrief: existsSync(briefPath) ? readFileSync(briefPath, "utf-8") : null,
    gateStages: Object.keys(STAGE_DOCS),
    pluginsCount: readdirSync(join(root, "plugins")).length,
    compositionsCount: readdirSync(join(root, "compositions")).filter((f) => f.endsWith(".json")).length,
  };
}

/** Emit the artifacts (the ceremony command: run after touching decisions or
 *  the registry, commit them in the same wave). Returns the written bytes. */
export function emitGenome(root: string): { json: string; brief: string } {
  const inputs = gatherGenomeInputs(root);
  const { registry, issues } = parseLayerRegistry(inputs.registryText);
  if (!registry) throw new Error(`refused: cannot emit over an invalid registry — ${issues.join("; ")}`);
  const genome = foldGenome(inputs, registry);
  const json = serializeGenome(genome);
  const brief = renderGenomeBrief(genome);
  const buildDir = join(root, "build");
  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, "genome.json"), json);
  writeFileSync(join(buildDir, "genome.md"), brief);
  return { json, brief };
}

/** The gate-stage entry (wired as the `genome` stage, after `process`). */
export function checkGenome(root: string): GenomeCheckResult {
  try {
    const inputs = gatherGenomeInputs(root);
    return verifyGenome(inputs);
  } catch (e) {
    return { ok: false, detail: {}, issues: [`genome derivation failed: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`] };
  }
}

// ---- CLI (`bun run omega:genome` · `--check` · `--json`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  const checkOnly = process.argv.includes("--check");
  const asJson = process.argv.includes("--json");
  try {
    if (!checkOnly) emitGenome(ROOT);
    const r = checkGenome(ROOT);
    if (asJson) {
      const inputs = gatherGenomeInputs(ROOT);
      const { registry } = parseLayerRegistry(inputs.registryText);
      if (registry) console.log(serializeGenome(foldGenome(inputs, registry)));
    } else {
      for (const issue of r.issues) console.error(`✗ ${issue}`);
      console.log(`genome: ${r.ok ? "GREEN" : "RED"} — ${JSON.stringify(r.detail.counts ?? {})}${r.detail.inFlight && (r.detail.inFlight as string[]).length > 0 ? ` · in-flight (reported, the ratify ceremony owns the flip): ${(r.detail.inFlight as string[]).join(", ")}` : ""}`);
      console.log(r.ok ? "artifacts: build/genome.json + build/genome.md are the byte-exact fold of this tree" : "re-emit with `bun run omega:genome` after fixing the inputs; hand edits are unexpressible by design");
    }
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
