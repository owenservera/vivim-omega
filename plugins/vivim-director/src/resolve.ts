// vivim.director — resolve.ts (D-323)
// The PURE computation-routing core: rule-table classification + scorecard
// aggregation. No ports, no I/O — import-safe outside a worker; index.ts
// layers the vault calls on top (same split as rules.ts / agent.ts).
//
// THE RULE TABLE (in order — first match wins):
//   (1) a matching ENABLED automation rule → DETERMINISTIC + its action op;
//   (2) else a PROMOTED providers realization for the archetype →
//       class-mapped kind (SIMULATOR→DETERMINISTIC, else PROBABILISTIC);
//   (3) else HUMAN with an empty capability — the safe default (escalate
//       rather than guess). An empty capability routes NOWHERE by construction.
import type {
  ComputationKind, ProviderClass, ProviderRealization, ResolveBranch,
  ResolveOutcome, ResolveOutcomeStatus, ScorecardRow, VaultProvenanceRef,
} from "@vivim/omega-contracts";
import type { EpistemicStatus } from "@vivim/omega-contracts";
import { archetypeSlugForOp } from "@vivim/omega-contracts";

/** Vault namespace owning resolve decisions (rev 1) + outcomes (rev 2). */
export const RESOLVE_NS = "resolve";
/** Vault namespace + id prefix scanned for rule branch (1). */
export const RESOLVE_AUTOMATION_NS = "automation";
/** Vault namespace scanned for realization branch (2). */
export const RESOLVE_PROVIDERS_NS = "providers";
/** Bound: at most this many realization rows examined per classify. */
export const REALIZATION_SCAN_CAP = 50;
/** Bound: at most this many rule rows examined per classify. */
export const RULE_SCAN_CAP = 200;
/** Bound: at most this many resolve rows aggregated per scorecard. */
export const SCORECARD_ROW_CAP = 200;

/** Minimal rule view the classifier needs (projected from RuleData). */
export interface ClassifiableRule {
  id: string;
  rev: number;
  event: string;
  from: string | null;
  op: string;
  enabled: boolean;
}

/** Minimal realization view the classifier needs (projected from ProviderRealization). */
export interface ClassifiableRealization {
  id: string;
  rev: number;
  archetypeSlug: string;
  providerClass: ProviderClass;
  status: string;
}

export interface ClassifyInput {
  op?: string;
  archetypeSlug?: string;
  event?: string;
  from?: string | null;
}

export interface ClassifyVerdict {
  kind: ComputationKind;
  capability: string;
  branch: ResolveBranch;
  reason: string;
  evidenceRefs: VaultProvenanceRef[];
}

/** Parse + cross-check the classify payload. Contradictory input (op vs
 *  archetypeSlug disagreeing) throws → DEGRADED (fail-closed on stale input:
 *  a caller holding a stale slug must refresh, never route on a lie). */
export function parseClassifyInput(payload: unknown): { op: string | null; slug: string | null; event: string | null; from: string | null } {
  const opName = "resolve.classify@1";
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${opName}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  const strOrNull = (v: unknown): string | null =>
    v === undefined || v === null ? null : typeof v === "string" ? v : (() => { throw new Error(`${opName}: fields must be strings when provided`); })();
  const op = strOrNull(p["op"]);
  const slugIn = strOrNull(p["archetypeSlug"]);
  const event = strOrNull(p["event"]);
  const from = strOrNull(p["from"]);
  if (op !== null && !/^[A-Za-z0-9_.-]+@[0-9]+$/.test(op)) {
    throw new Error(`${opName}: op must look like <id>@<version> (got ${JSON.stringify(op)})`);
  }
  const derived = op !== null ? archetypeSlugForOp(op) : null;
  if (op !== null && slugIn !== null && derived !== slugIn) {
    throw new Error(`${opName}: archetypeSlug "${slugIn}" contradicts op "${op}" (want "${derived}" — stale input refused)`);
  }
  return { op, slug: slugIn ?? derived, event, from };
}

/** The rule table over already-loaded rows. Pure: same rows + same input ⇒
 *  same verdict. Rules must arrive enabled-only, id-asc (the wiring sorts);
 *  realizations PROMOTED-only is NOT required here — the status gate below is
 *  explicit so a misfiltered caller still routes honestly. */
export function classifyPure(opts: {
  input: { event: string | null; from: string | null; slug: string | null };
  rules: ClassifiableRule[];
  realizations: ClassifiableRealization[];
}): ClassifyVerdict {
  const { input, rules, realizations } = opts;
  // Branch (1): first enabled rule (id asc) matching event + from.
  if (input.event !== null) {
    const hit = rules.find((r) => r.enabled && r.event === input.event && (r.from === null || r.from === input.from));
    if (hit) {
      return {
        kind: "DETERMINISTIC",
        capability: hit.op,
        branch: "rule",
        reason: `automation rule "${hit.id}" covers event "${input.event}" (deterministic by policy)`,
        evidenceRefs: [{ ns: RESOLVE_AUTOMATION_NS, id: hit.id, rev: hit.rev, epistemicStatus: "INFERRED" as EpistemicStatus }],
      };
    }
  }
  // Branch (2): first PROMOTED realization (id asc) for the archetype.
  if (input.slug !== null) {
    const cands = realizations
      .filter((r) => r.archetypeSlug === input.slug && r.status === "PROMOTED")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const best = cands[0];
    if (best) {
      const kind: ComputationKind = best.providerClass === "SIMULATOR" ? "DETERMINISTIC" : "PROBABILISTIC";
      return {
        kind,
        capability: `${input.slug}@1`,
        branch: "realization",
        reason: `PROMOTED realization "${best.id}" (${best.providerClass} → ${kind})`,
        evidenceRefs: [{ ns: RESOLVE_PROVIDERS_NS, id: best.id, rev: best.rev, epistemicStatus: "VERIFIED" as EpistemicStatus }],
      };
    }
  }
  // Branch (3): escalate.
  return {
    kind: "HUMAN",
    branch: "human",
    capability: "",
    reason: "no covering rule and no PROMOTED realization — escalate rather than guess",
    evidenceRefs: [],
  };
}

/** Map a stored ProviderRealization row to the classifier view (null when
 *  malformed — skipped, never throws the scan). */
export function asClassifiableRealization(id: string, rev: number, data: unknown): ClassifiableRealization | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["archetypeSlug"] !== "string" || typeof d["providerClass"] !== "string" || typeof d["status"] !== "string") return null;
  return { id, rev, archetypeSlug: d["archetypeSlug"], providerClass: d["providerClass"] as ProviderClass, status: d["status"] };
}

export interface ReportInput { decisionId: string; status: ResolveOutcomeStatus; execMs: number }

/** Parse the report payload. Malformed shapes throw → DEGRADED; a MISSING
 *  decision is DATA (UNKNOWN) — checked by the wiring against the vault. */
export function parseReportInput(payload: unknown): ReportInput {
  const opName = "resolve.report@1";
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${opName}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  const decisionId = p["decisionId"];
  if (typeof decisionId !== "string" || decisionId.length === 0) {
    throw new Error(`${opName}: decisionId must be a non-empty string`);
  }
  if (p["status"] !== "ok" && p["status"] !== "failed") {
    throw new Error(`${opName}: status must be "ok" | "failed" (got ${JSON.stringify(p["status"])})`);
  }
  if (typeof p["execMs"] !== "number" || !Number.isFinite(p["execMs"]) || p["execMs"] < 0) {
    throw new Error(`${opName}: execMs must be a finite number >= 0`);
  }
  return { decisionId, status: p["status"], execMs: p["execMs"] };
}

/** Pure aggregation: group outcomes by (kind, capability) → scorecard rows,
 *  sorted by (kind, capability). p50 is the lower median (sorted[(n-1)>>1]) —
 *  exact, deterministic, and pinned by test arithmetic. No thresholds, no
 *  auto-actions: scoreboards inform, they never decide. */
export function scorecardPure(outcomes: Pick<ResolveOutcome, "kind" | "capability" | "status" | "execMs">[]): ScorecardRow[] {
  const groups = new Map<string, { kind: ComputationKind; capability: string; n: number; ok: number; ms: number[] }>();
  for (const o of outcomes) {
    const key = `${o.kind}\u0000${o.capability}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind: o.kind, capability: o.capability, n: 0, ok: 0, ms: [] };
      groups.set(key, g);
    }
    g.n++;
    if (o.status === "ok") g.ok++;
    g.ms.push(o.execMs);
  }
  return [...groups.values()]
    .map((g) => {
      const sorted = [...g.ms].sort((a, b) => a - b);
      return {
        kind: g.kind,
        capability: g.capability,
        n: g.n,
        okRate: g.ok / g.n,
        p50ExecMs: sorted[(g.n - 1) >> 1]!,
      };
    })
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.capability < b.capability ? -1 : 1));
}

/** Type-narrow a stored resolve row to a decision (rev 1). Null when malformed. */
export function asResolveDecision(data: unknown): { decisionId: string; kind: ComputationKind; capability: string } | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["decisionId"] !== "string") return null;
  if (d["kind"] !== "DETERMINISTIC" && d["kind"] !== "PROBABILISTIC" && d["kind"] !== "HUMAN") return null;
  if (typeof d["capability"] !== "string") return null;
  return { decisionId: d["decisionId"], kind: d["kind"], capability: d["capability"] };
}

/** ProviderRealization import is type-only (no runtime import — keeps this
 *  module dependency-free at runtime). */
export type { ProviderRealization };
