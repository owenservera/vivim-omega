// @vivim/omega-sdk — schema.ts
// Zod 4 schemas mirroring @vivim/omega-contracts EXACTLY (the pinned wire types).
// The sdk is deliberately STRICTER than the µhost loader: unknown keys are rejected
// here (tamper surface), while the host ceremony stamps defaults. Changing any shape
// after Ω4 is an amendment-class event — mirrors contracts/src/port.ts header law.
import { z } from "zod";
import { CONTRIBUTION_KINDS, HARVEST_CLASSES } from "@vivim/omega-contracts";
import type { PluginManifest, Recipe, CompositionEntry, CompositionSpec, PortMessage, PortResult, LawDecision, ConsentGrant, DependencyRef, Contribution, RuntimeTier, GeneralityStamp, GeneralityLevel, HarvestClass } from "@vivim/omega-contracts";

// ---- shared atoms -----------------------------------------------------------

/** Contribution/contribution-id grammar: lowercase alnum with dots/dashes ("echo.ping", "note", "law.check"). */
export const ID_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
/** Concrete version grammar: "1" | "1.0" | "1.0.0" (semver-ish, pinned in the manifest doc). */
export const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){0,2}$/;
/** Content/manifest hash grammar: "sha256:<64 hex>" — or "" pre-compile (the ceremony stamps it). */
export const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
/** Routable op grammar: `<id>@<digit>` (contract version must be a bare major). */
export const OP_PATTERN = /^[a-z0-9.-]+@[0-9]+$/;

export const RISK_CLASSES = ["EXTERNAL_MUTATION", "MUTATION", "READ"] as const;
export const FRESHNESS_STATES = ["CURRENT", "LAGGING", "STALE"] as const;
export const PORT_ERROR_CODES = ["REFUSED", "REVOKED", "SCOPE", "BUDGET", "DEGRADED"] as const;

// D-405 (Omega Forge Wave 0): the generality axis — the evidence mirror of
// contracts/manifest.ts::GeneralityStamp. STRICT object (same posture as the
// manifest top level: a typo'd generality field is a real error). The SHAPE is
// all zod owns: level is the enum, mine/originPaths/harvestClass/evidence are
// plain typed fields. The LAW (mine pinning pattern, ref families, counts,
// independence) lives in validate.ts::validateGenerality — the same
// well-formed vs lawful split the rest of this package enforces.
export const GENEROSITY_LEVELS = ["speculative", "harvested", "generic"] as const;
export const MINE_PATTERN = /^[a-z0-9][a-z0-9.-]*@[0-9a-f]{7,64}$/;
export const EVIDENCE_REF_PATTERN = /^(ledger:[a-z0-9-]+\/[a-z0-9:._-]+|fixture:[^@\s]+@[0-9a-f]{7,64}|mine:[a-z0-9][a-z0-9.-]*@[0-9a-f]{7,64}|composition:[a-z0-9-]+@[0-9a-f]{7,64}|decision:D-[0-9]+)$/;

export const GeneralitySchema = z.strictObject({
  level: z.enum(GENEROSITY_LEVELS),
  mine: z.string().nullable().optional(),        // pinning PATTERN is law (validateGenerality) — shape is string
  originPaths: z.array(z.string().min(1)).optional(),
  harvestClass: z.enum(HARVEST_CLASSES).nullable().optional(), // vocabulary is pinned wire — a typo is malformed (same posture as risk)
  evidence: z.array(z.string()).optional(),       // ref families are law (validateGenerality) — shape is string[]
});

// D-405 mirror-exactness guards (the house _contribution idiom): the zod enums
// must exhaust the pinned contract unions — the sdk enum drifting from the
// contracts union is a wire break the compiler catches.
const _levelMirror: readonly GeneralityLevel[] = GENEROSITY_LEVELS;
const _harvestMirror: readonly HarvestClass[] = HARVEST_CLASSES;
void _levelMirror; void _harvestMirror;

// ---- contributions / manifest ------------------------------------------------

// Contributions are LOOSE: the pinned interface is structural, and shipped plugins
// (vivim.vault's SCHEMA contribution) carry extra declarative metadata ("fields",
// "doc") — legal per the pinned type, covered by the publisher signature. The
// manifest TOP LEVEL stays strict: a typo'd field there is a real error.
// ---- Ω13.5: language-as-data shapes (mirror contracts/lang.ts) ----
export const LangFrameSlotSchema = z.looseObject({
  role: z.string().min(1),
  kind: z.enum(["entity", "text", "content", "enum", "rest"]),
  preps: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  enumValues: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  patient: z.boolean().optional(),
  payloadKey: z.string().optional(),
  family: z.string().optional(),
});

export const LangOpFrameSchema = z.looseObject({
  op: z.string().min(1),
  verbs: z.array(z.string()),
  title: z.string(),
  slots: z.array(LangFrameSlotSchema),
  reading: z.string(),
  examples: z.array(z.string()),
  family: z.string(),
  surfaceOnly: z.boolean().optional(),
});

export const LangLexiconEntrySchema = z.looseObject({
  word: z.string().min(1),
  op: z.string().min(1),
  note: z.string().optional(),
  source: z.string().optional(),
});

export const ContributionSchema = z.looseObject({
   kind: z.enum(CONTRIBUTION_KINDS),
   id: z.string().regex(ID_PATTERN, { error: "contribution id must match ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$" }),
   version: z.string().regex(VERSION_PATTERN, { error: 'version must be "1" | "1.0" | "1.0.0" style' }),
    risk: z.enum(RISK_CLASSES).optional(),
    priority: z.enum(["gate", "normal"]).optional(), // D-392: per-CONTRACT admission tier, default normal
   // Ω13.5 — language data rides on `lang`-kind contributions (validated semantically
   // by validateManifest; carried here so the shared contributions record parses them).
   frames: z.array(LangOpFrameSchema).optional(),
   lexicon: z.array(LangLexiconEntrySchema).optional(),
});

/** Explicit `lang` contribution schema (kind pinned to "lang"). */
export const LangContributionSchema = ContributionSchema.extend({
  kind: z.literal("lang"),
});

export const DependencyRefSchema = z.strictObject({
  ref: z.string().min(1),
  range: z.string().min(1),
});

/** D-374: the tier enum is ONE source of truth — contracts owns the union, the schema satisfies it. */
export const RUNTIME_TIERS = ["worker-thread", "process", "wasm"] as const satisfies readonly RuntimeTier[];

export const PluginManifestSchema = z.strictObject({
  manifestVersion: z.literal("1"),
  id: z.string().regex(ID_PATTERN, { error: "manifest id must match ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$" }),
  version: z.string().regex(VERSION_PATTERN, { error: 'version must be "1" | "1.0" | "1.0.0" style' }),
  description: z.string().optional(),
  entry: z.string().min(1),
  publisher: z.strictObject({ keyId: z.string(), signature: z.string() }),
  contributions: z.partialRecord(z.enum(CONTRIBUTION_KINDS), z.array(ContributionSchema)),
  dependencies: z.array(DependencyRefSchema),
  capabilities: z.strictObject({
    requested: z.array(z.string()),
    justification: z.string().optional(),
  }),
  runtime: z.strictObject({
    // D-374: tier vocabulary widens additively — "worker-thread" is the only tier
    // the µhost spawns (B2); "process" compartments spawn through the vivim-run
    // broker; "wasm" is forward-declared only (D-354 reserve, no shape yet).
    tier: z.enum(RUNTIME_TIERS),
    // D-388: intervalMs is the per-compartment WATCHDOG probe cadence (ms) —
    // the interim L-1 measure: latency-sensitive compositions declare a tighter
    // detection window without changing the global default. Policy data for the
    // out-of-tree watchdog (tooling/watchdog), never host plumbing.
    budget: z.strictObject({ cpuMs: z.number().optional(), memMB: z.number().optional(), intervalMs: z.number().optional(), maxConcurrentCalls: z.number().int().positive().optional() }), // D-392: admission cap, default 4
    process: z.strictObject({
      cmd: z.array(z.string().min(1)).min(1),
      stdio: z.literal("ndjson"),
      credentialRefs: z.array(z.string()).optional(), // resolved via credential.use — never literal env/manifest secrets
      poolSize: z.number().int().positive().optional(),
    }).optional(),
  }),
  contentHash: z.union([z.literal(""), z.string().regex(HASH_PATTERN, { error: 'contentHash must be "sha256:<hex>" or "" (pre-compile)' })]),
  granularity: z.enum(["atomic", "coarse"]).optional(), // D-340 mirror: data, not a schema fork — absent = atomic (host盖默认)
  internalSeams: z.array(z.string().min(1)).optional(), // coarse plugins name the seams a later extraction cuts along
  generality: GeneralitySchema.optional(), // D-405: additive evidence axis — absent = undeclared (validators decide who must declare)
});

// ---- recipe / composition ----------------------------------------------------

export const CompositionEntrySchema = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  manifestPath: z.string().min(1),
  manifestHash: z.string().regex(HASH_PATTERN),
  contentHash: z.string().regex(HASH_PATTERN),
  grant: z.strictObject({
    capabilities: z.array(z.string()),
    contracts: z.array(z.string()),
  }),
  bootPhase: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const RecipeSchema = z.strictObject({
  recipeVersion: z.literal(1),
  hashAlgo: z.literal("sha256"),
  name: z.string().min(1),
  composition: z.array(CompositionEntrySchema).min(1),
  rootOfTrust: z.strictObject({ keyId: z.string().min(1), publicKey: z.string().min(1) }),
  signature: z.string().min(1),
});

export const CompositionSpecEntrySchema = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
  bootPhase: z.number().int().min(0),
  grant: z.strictObject({
    capabilities: z.array(z.string()),
    contracts: z.array(z.string()),
  }),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const CompositionSpecSchema = z.strictObject({
  name: z.string().min(1),
  entries: z.array(CompositionSpecEntrySchema).min(1),
});

// ---- port wire ---------------------------------------------------------------

export const PortMessageSchema = z.strictObject({
  causationId: z.string().min(1),
  capabilityToken: z.string().min(1),
  op: z.string().min(1),
  payload: z.unknown(),
  deadlineMs: z.number(),
});

export const RefusalReportSchema = z.looseObject({
  rule: z.string().min(1),
  principal: z.string().optional(),
  op: z.string().optional(),
  reason: z.string().optional(),
  consentId: z.string().optional(),
  bar: z.string().optional(),
});

export const PortResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.unknown(),
    freshness: z.enum(FRESHNESS_STATES).optional(),
    evidence: z.strictObject({ rev: z.string() }).optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(PORT_ERROR_CODES),
    detail: z.string().optional(),
    refusal: RefusalReportSchema.optional(),
  }),
]);

export const LawDecisionSchema = z.strictObject({
  decision: z.enum(["allow", "deny", "require-consent"]),
  reason: z.string().optional(),
  principal: z.string().optional(),
  consentId: z.string().optional(),
});

export const ConsentGrantSchema = z.strictObject({
  consentId: z.string().min(1),
  principal: z.string().optional(),
  scope: z.string().optional(),
  grantedAt: z.number(),
});

// ---- parse entry point -------------------------------------------------------

export interface ParseOk { ok: true; value: PluginManifest }
export interface ParseFail { ok: false; errors: string[] }
export type ParseManifestResult = ParseOk | ParseFail;

/**
 * Parse + validate a manifest (JSON text or pre-parsed object) against the pinned shape.
 * Failures are human-readable, one per zod issue: `<path>: <message>`.
 */
export function parseManifest(json: string | unknown): ParseManifestResult {
  let input: unknown;
  if (typeof json === "string") {
    try { input = JSON.parse(json); } catch (e) { return { ok: false, errors: [`invalid JSON: ${String(e)}`] }; }
  } else { input = json; }
  const r = PluginManifestSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data as PluginManifest };
  const errors = r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
  return { ok: false, errors };
}

/** Parse a recipe against the pinned shape (same human-readable aggregation). */
export function parseRecipeShape(json: string | unknown): { ok: true; value: Recipe } | { ok: false; errors: string[] } {
  let input: unknown;
  if (typeof json === "string") {
    try { input = JSON.parse(json); } catch (e) { return { ok: false, errors: [`invalid JSON: ${String(e)}`] }; }
  } else { input = json; }
  const r = RecipeSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data as Recipe };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`) };
}

// ---- static type mirrors (compile-time exactness proof against contracts) ----
export type SchemaContribution = z.infer<typeof ContributionSchema>;
export type SchemaManifest = z.infer<typeof PluginManifestSchema>;
export type SchemaRecipe = z.infer<typeof RecipeSchema>;
export type SchemaCompositionEntry = z.infer<typeof CompositionEntrySchema>;
export type SchemaPortResult = z.infer<typeof PortResultSchema>;
export type SchemaLawDecision = z.infer<typeof LawDecisionSchema>;
export type SchemaGenerality = z.infer<typeof GeneralitySchema>;

// Compile-time equality guards: the zod output types must be assignable BOTH ways
// with the pinned contract interfaces — mirroring is exact or the build breaks.
const _contribution: Contribution = null as unknown as SchemaContribution;
const _manifest: PluginManifest = null as unknown as SchemaManifest;
const _recipe: Recipe = null as unknown as SchemaRecipe;
const _entry: CompositionEntry = null as unknown as SchemaCompositionEntry;
const _portResult: PortResult = null as unknown as SchemaPortResult;
const _lawDecision: LawDecision = null as unknown as SchemaLawDecision;
const _dep: DependencyRef = null as unknown as z.infer<typeof DependencyRefSchema>;
const _msg: PortMessage = null as unknown as z.infer<typeof PortMessageSchema>;
const _grant: ConsentGrant = null as unknown as z.infer<typeof ConsentGrantSchema>;
const _spec: CompositionSpec = null as unknown as z.infer<typeof CompositionSpecSchema>;
const _generality: GeneralityStamp = null as unknown as SchemaGenerality;
void _contribution; void _manifest; void _recipe; void _entry; void _portResult; void _lawDecision; void _dep; void _msg; void _grant; void _spec; void _generality;
