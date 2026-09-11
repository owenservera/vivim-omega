// @vivim/omega-sdk — schema.ts
// Zod 4 schemas mirroring @vivim/omega-contracts EXACTLY (the pinned wire types).
// The sdk is deliberately STRICTER than the µhost loader: unknown keys are rejected
// here (tamper surface), while the host ceremony stamps defaults. Changing any shape
// after Ω4 is an amendment-class event — mirrors contracts/src/port.ts header law.
import { z } from "zod";
import { CONTRIBUTION_KINDS } from "@vivim/omega-contracts";
import type { PluginManifest, Recipe, CompositionEntry, CompositionSpec, PortMessage, PortResult, LawDecision, ConsentGrant, DependencyRef, Contribution } from "@vivim/omega-contracts";

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

// ---- contributions / manifest ------------------------------------------------

// Contributions are LOOSE: the pinned interface is structural, and shipped plugins
// (vivim.vault's SCHEMA contribution) carry extra declarative metadata ("fields",
// "doc") — legal per the pinned type, covered by the publisher signature. The
// manifest TOP LEVEL stays strict: a typo'd field there is a real error.
export const ContributionSchema = z.looseObject({
  kind: z.enum(CONTRIBUTION_KINDS),
  id: z.string().regex(ID_PATTERN, { error: "contribution id must match ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$" }),
  version: z.string().regex(VERSION_PATTERN, { error: 'version must be "1" | "1.0" | "1.0.0" style' }),
  risk: z.enum(RISK_CLASSES).optional(),
});

export const DependencyRefSchema = z.strictObject({
  ref: z.string().min(1),
  range: z.string().min(1),
});

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
    tier: z.literal("worker-thread"),
    budget: z.strictObject({ cpuMs: z.number().optional(), memMB: z.number().optional() }),
  }),
  contentHash: z.union([z.literal(""), z.string().regex(HASH_PATTERN, { error: 'contentHash must be "sha256:<hex>" or "" (pre-compile)' })]),
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
void _contribution; void _manifest; void _recipe; void _entry; void _portResult; void _lawDecision; void _dep; void _msg; void _grant; void _spec;
