// pack.builder — src/schemas.ts (Omega Forge Wave 0, D-406)
// The machine-readable half of the Builder Contract: FORGE_OP_CATALOG (the
// frozen forge.* wire — op@version → risk, mirrored 1:1 by the plugin.json
// contract contributions, proven identical by the pack test) and the zod
// schemas for the seven Forge artifact shapes (mirroring the plugin.json
// schema contributions' declared fields).
//
// Consumers: packs/builder/test/schema.test.ts (conformance + fixtures),
// tooling/gates/forge-surface.ts (FORGE_CONTRACT_DRIFT + fixture validation).
// A pack is passive: this module is pure data + pure functions — no ports, no
// I/O, no capability may ever grow here (the implementing Forge plugins carry
// capabilities; pack.builder only declares).
import { z } from "zod";
import { HARVEST_CLASSES } from "@vivim/omega-contracts";
import type { RiskClass, GeneralityLevel, HarvestClass, GeneralityStamp } from "@vivim/omega-contracts";

// ---- the frozen op wire (packet §5 — op names are frozen wire) ----------------

/** op@version → declared risk. Every op a landed forge plugin manifest
 *  declares MUST match this catalog exactly (id, version, risk) — the
 *  forge-surface gate's FORGE_CONTRACT_DRIFT check enforces it. Adding an op
 *  is a pack.builder amendment; renaming one is amendment-class. */
export const FORGE_OP_CATALOG: Readonly<Record<string, RiskClass>> = {
  // forge.mine — capture is the ONE filesystem seam (Class 3: reading a foreign
  // tree is the highest-risk act in the system); the rest are READ.
  "forge.mine.capture@1": "EXTERNAL_MUTATION",
  "forge.mine.verify@1": "READ",
  "forge.mine.diff@1": "READ",
  "forge.mine.list@1": "READ",
  // forge.survey — pure past the capture (Class 1)
  "forge.survey.run@1": "READ",
  "forge.survey.render@1": "READ",
  // forge.assay (Class 1)
  "forge.assay.run@1": "READ",
  "forge.assay.distill@1": "READ",
  // forge.shape (Class 1)
  "forge.shape.map@1": "READ",
  "forge.shape.budget@1": "READ",
  "forge.shape.validate@1": "READ",
  // forge.emit — Class 2, proposal-only, ns proposal / scratch proposal path
  "forge.emit.plugin@1": "MUTATION",
  "forge.emit.pack@1": "MUTATION",
  "forge.emit.composition@1": "MUTATION",
  "forge.emit.fixture@1": "MUTATION",
  "forge.emit.record@1": "MUTATION",
  // forge.proof — returns reports (Class 1)
  "forge.proof.conform@1": "READ",
  "forge.proof.replay@1": "READ",
  "forge.proof.refusal@1": "READ",
  "forge.proof.secondmine@1": "READ",
  // forge.author — the self-hosting keystone (Class 2)
  "forge.author.init@1": "MUTATION",
  // forge.tier — governance shapes (Class 4 posture, Wave 0 declares the wire)
  "forge.tier.stamp@1": "MUTATION",
  "forge.tier.promote@1": "MUTATION",
  "forge.tier.docs@1": "MUTATION",
};

/** The eight canonical Forge plugin ids (ids use dots, directories use dashes). */
export const FORGE_PLUGIN_IDS = [
  "forge.mine", "forge.survey", "forge.assay", "forge.shape",
  "forge.emit", "forge.proof", "forge.author", "forge.tier",
] as const;

// ---- shared atoms ---------------------------------------------------------------

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MINE_ID = /^[a-z0-9][a-z0-9.-]*@[0-9a-f]{7,64}$/;
const EVIDENCE_REF = /^(ledger:[a-z0-9-]+\/[a-z0-9:._-]+|fixture:[^@\s]+@[0-9a-f]{7,64}|mine:[a-z0-9][a-z0-9.-]*@[0-9a-f]{7,64}|composition:[a-z0-9-]+@[0-9a-f]{7,64}|decision:D-[0-9]+)$/;

// ---- 1 · capture receipt ----------------------------------------------------------

export const CaptureReceiptSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  op: z.literal("forge.mine.capture@1"),
  mineId: z.string().regex(MINE_ID),
  mineRoot: z.string().min(1),
  capturedAt: z.string().min(1), // UTC ISO — the receipt records WHEN, replay ignores it
  fileCount: z.number().int().nonnegative(),
  rootHash: z.string().regex(SHA256),
  files: z.array(z.strictObject({
    path: z.string().min(1),
    hash: z.string().regex(SHA256),
    bytes: z.number().int().nonnegative(),
    casRef: z.string().min(1),
  })),
  refusals: z.array(z.strictObject({
    path: z.string().min(1),
    reason: z.string().min(1),
  })),
});

// ---- 2 · inventory row -------------------------------------------------------------

export const InventoryRowSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  path: z.string().min(1),
  hash: z.string().regex(SHA256),
  bytes: z.number().int().nonnegative(),
  language: z.string().min(1).nullable(),
  exports: z.array(z.string().min(1)),
  imports: z.array(z.string().min(1)),
  models: z.array(z.string().min(1)),
  headings: z.array(z.string().min(1)),
});

// ---- 3 · assay verdict --------------------------------------------------------------

export const AssayBoundarySchema = z.strictObject({
  op: z.string().min(1),
  rationale: z.string().min(1),
  refusable: z.boolean(),
  substitutable: z.boolean(),
  provable: z.boolean(),
});

export const AssayVerdictSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  subjectPath: z.string().min(1),
  disposition: z.enum(["PORT", "DISTILL", "REMOVE", "DEFER"]),
  harvestClass: z.enum(HARVEST_CLASSES).nullable(),
  clusters: z.array(z.string().min(1)),
  boundaries: z.array(AssayBoundarySchema),
  risks: z.array(z.string().min(1)),
  evidence: z.array(z.string().regex(EVIDENCE_REF)),
});

/** The three-axis admissibility law: a boundary is admissible as an op ONLY
 *  when refusable AND substitutable AND provable. Violations are named issues,
 *  not silent accepts — the verdict must not propose the op. */
export function assayBoundaryIssues(v: z.infer<typeof AssayVerdictSchema>): string[] {
  const issues: string[] = [];
  for (const b of v.boundaries) {
    if (!(b.refusable && b.substitutable && b.provable)) {
      const failed = [
        !b.refusable ? "refusable" : null,
        !b.substitutable ? "substitutable" : null,
        !b.provable ? "provable" : null,
      ].filter(Boolean).join(", ");
      issues.push(`boundary ${b.op} inadmissible (${failed}) — merge it into its neighbour; it is an implementation detail wearing a contract's clothes`);
    }
  }
  return issues;
}

// ---- 4 · shape blueprint -------------------------------------------------------------

export const ShapeBlueprintSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  namespaces: z.array(z.strictObject({
    name: z.string().min(1),
    writer: z.string().min(1),
    readers: z.array(z.string().min(1)),
    retention: z.string().min(1),
  })),
  plugins: z.array(z.strictObject({
    id: z.string().min(1),
    ops: z.array(z.string().min(1)),
    writtenNamespace: z.string().min(1).nullable(),
    generality: z.strictObject({
      level: z.enum(["speculative", "harvested", "generic"]),
      mine: z.string().regex(MINE_ID).nullable(),
      originPaths: z.array(z.string().min(1)),
      harvestClass: z.enum(HARVEST_CLASSES).nullable(),
      evidence: z.array(z.string().regex(EVIDENCE_REF)),
    }),
  })),
  compositions: z.array(z.strictObject({
    id: z.string().min(1),
    members: z.array(z.string().min(1)),
  })),
  mappings: z.array(z.strictObject({
    source: z.string().min(1),
    targetOp: z.string().min(1),
    reason: z.string().min(1),
  })),
});

/** The partition invariant: every namespace exactly ONE writer. A second
 *  writer is an amendment-class event, never a blueprint row. */
export function shapeBlueprintIssues(bp: z.infer<typeof ShapeBlueprintSchema>): string[] {
  const issues: string[] = [];
  const writers = new Map<string, string[]>();
  for (const ns of bp.namespaces) {
    writers.set(ns.name, [...(writers.get(ns.name) ?? []), ns.writer]);
  }
  for (const [name, ws] of writers) {
    if (ws.length > 1) issues.push(`namespace ${name} has ${ws.length} writers (${ws.join(", ")}) — exactly one writer per namespace; a second writer is amendment-class`);
  }
  // a plugin may write at most the namespaces declared... and a lens writes none
  const declared = new Set(bp.namespaces.map((n) => n.name));
  for (const p of bp.plugins) {
    if (p.writtenNamespace !== null && !declared.has(p.writtenNamespace)) {
      issues.push(`plugin ${p.id} writes undeclared namespace ${p.writtenNamespace} — declare the ns row (owner, writers, retention) in the same blueprint`);
    }
  }
  return issues;
}

// ---- 5 · proposal artifact ------------------------------------------------------------

export const ProposalArtifactSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  targetPath: z.string().min(1),
  artifactKind: z.enum(["manifest", "package", "source", "fixture", "composition", "record", "doc"]),
  contentHash: z.string().regex(SHA256),
  generatedBy: z.string().min(1),
  ledgerRef: z.string().regex(EVIDENCE_REF).nullable(),
  authority: z.literal("none"), // THE law: emission confers no authority — any other value fails HERE, not in review
  justification: z.string().min(1),
});

// ---- 6 · proof report -------------------------------------------------------------------

export const ProofReportSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  subject: z.string().min(1),
  op: z.string().min(1),
  result: z.enum(["pass", "fail"]),
  checks: z.array(z.strictObject({
    name: z.string().min(1),
    result: z.enum(["pass", "fail"]),
    diff: z.string().nullable(),
  })),
  replayHash: z.string().regex(SHA256).nullable(),
  refusalResults: z.array(z.strictObject({
    name: z.string().min(1),
    result: z.enum(["pass", "fail"]),
  })),
});

// ---- 7 · generality stamp ------------------------------------------------------------------

export const GeneralityStampSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  level: z.enum(["speculative", "harvested", "generic"]),
  mine: z.string().regex(MINE_ID).nullable(),
  originPaths: z.array(z.string().min(1)),
  harvestClass: z.enum(HARVEST_CLASSES).nullable(),
  evidence: z.array(z.string().regex(EVIDENCE_REF)),
});

// ---- the schema registry (fixture-driven conformance) -----------------------------------

/** Artifact kind → its zod schema. The registry IS the pack's seven-shape claim. */
export const BUILDER_SCHEMAS = {
  "capture-receipt": CaptureReceiptSchema,
  "inventory-row": InventoryRowSchema,
  "assay-verdict": AssayVerdictSchema,
  "shape-blueprint": ShapeBlueprintSchema,
  "proposal-artifact": ProposalArtifactSchema,
  "proof-report": ProofReportSchema,
  "generality-stamp": GeneralityStampSchema,
} as const;

export type BuilderArtifactKind = keyof typeof BUILDER_SCHEMAS;

/** Validate one artifact against its declared shape: {ok, errors[]} — the same
 *  human-readable aggregation the sdk's parseManifest uses. */
export function validateArtifact(kind: BuilderArtifactKind, value: unknown): { ok: boolean; errors: string[] } {
  const schema = BUILDER_SCHEMAS[kind];
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, errors: [] };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`) };
}

// ---- compile-time exactness guards (house idiom) --------------------------------------

type _StampWire = GeneralityStamp;
const _stampMirror: _StampWire = null as unknown as z.infer<typeof GeneralityStampSchema>;
const _levelMirror: readonly GeneralityLevel[] = ["speculative", "harvested", "generic"];
const _harvestMirror: readonly HarvestClass[] = HARVEST_CLASSES;
void _stampMirror; void _levelMirror; void _harvestMirror;
