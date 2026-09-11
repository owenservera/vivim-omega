// vivim.law — policy.ts
// The versioned POLICY CONTENT. Policy is DATA (a versioned object a recipe can pin),
// never switch statements: risk classification, per-risk default decisions, and the
// deny/exception rule table are all plain rows evaluated by one interpreter.
import type { RiskClass, LawDecision } from "@vivim/omega-contracts";

export type LawAction = NonNullable<LawDecision["decision"]>; // "allow" | "deny" | "require-consent"

/** One row of the rule table. A row matches when every set field matches. `op` may end with "*" (prefix). */
export interface PolicyRule {
  match: { principal?: string; op?: string };
  decision: LawAction;
  reason: string;
}

/** One row of the risk table. `op` may be exact ("risky.op@1") or prefix ("vault.*"). */
export interface RiskEntry {
  op: string;
  risk: RiskClass;
}

/** What the interpreter does for a risk class by default. */
export interface RiskDefault {
  decision: LawAction;
  journal: boolean;
  reason: string;
}

/** The policy document — the whole policy, as versioned data. */
export interface PolicyDoc {
  policyId: string;
  version: string;
  description?: string;
  riskTable: RiskEntry[];                       // op → risk classification
  defaultRisk: RiskClass;                       // unknown ops (fail-closed choice)
  riskDefaults: Record<RiskClass, RiskDefault>; // risk → default action
  rules: PolicyRule[];                          // principal/op rules, deny rows first
}

/** The shipped Ω1 baseline policy (D-215 semantics: gate data, not code). */
export const LAW_POLICY_V1: PolicyDoc = {
  policyId: "law.policy",
  version: "1.0.0",
  description: "Ω1 baseline: risk-class defaults, mutation journaling, principal deny-list",
  riskTable: [
    { op: "risky.op@1", risk: "EXTERNAL_MUTATION" },
    { op: "risky.read@1", risk: "READ" },
    { op: "vault.*", risk: "MUTATION" },
    { op: "notes.*", risk: "MUTATION" },
  ],
  defaultRisk: "EXTERNAL_MUTATION", // unknown ops are treated as the strictest class (fail-closed)
  riskDefaults: {
    READ: { decision: "allow", journal: false, reason: "read-class: not gated" },
    MUTATION: { decision: "allow", journal: true, reason: "mutation-class: allowed and journaled" },
    EXTERNAL_MUTATION: { decision: "require-consent", journal: true, reason: "external mutation: consent required" },
  },
  rules: [
    { match: { principal: "omega.attacker" }, decision: "deny", reason: "principal deny-listed (adversarial fixture, Ω0 runtime suite)" },
  ],
};

export interface PolicyEval {
  action: RiskDefault;
  risk: RiskClass;
  rule?: PolicyRule; // the rule that overrode the risk default, if any
}

function opMatches(pattern: string, op: string): boolean {
  if (pattern === "*" || pattern === op) return true;
  if (pattern.endsWith("*")) return op.startsWith(pattern.slice(0, -1));
  return false;
}

/** Classify an op against the risk table (exact rows before prefix rows, first hit wins). */
export function classifyRisk(doc: PolicyDoc, op: string): RiskClass {
  const exact = doc.riskTable.find((r) => !r.op.endsWith("*") && r.op === op);
  if (exact) return exact.risk;
  const prefix = doc.riskTable.find((r) => r.op.endsWith("*") && opMatches(r.op, op));
  if (prefix) return prefix.risk;
  return doc.defaultRisk;
}

function ruleMatches(rule: PolicyRule, principal: string, op: string): boolean {
  if (rule.match.principal !== undefined && rule.match.principal !== principal) return false;
  if (rule.match.op !== undefined && !opMatches(rule.match.op, op)) return false;
  return true;
}

/**
 * The one interpreter. Pass 1: any matching deny row wins (deny is sticky).
 * Pass 2: first matching non-deny row overrides the risk default.
 * Pass 3: the risk-class default for the classified risk.
 */
export function evalPolicy(doc: PolicyDoc, principal: string, op: string): PolicyEval {
  for (const rule of doc.rules) {
    if (rule.decision === "deny" && ruleMatches(rule, principal, op)) {
      return { action: { decision: "deny", journal: true, reason: rule.reason }, risk: classifyRisk(doc, op), rule };
    }
  }
  for (const rule of doc.rules) {
    if (rule.decision !== "deny" && ruleMatches(rule, principal, op)) {
      return { action: { decision: rule.decision, journal: true, reason: rule.reason }, risk: classifyRisk(doc, op), rule };
    }
  }
  const risk = classifyRisk(doc, op);
  return { action: doc.riskDefaults[risk], risk };
}

/** A compact shadow spec as accepted by `law.amendment@1 {action:"register-shadow"}`. */
export interface ShadowSpec {
  policyId?: string;
  description?: string;
  denyExternalMutations?: boolean;
  policy?: PolicyDoc; // full override (validated: must carry the three risk defaults)
}

/** Deep clone via JSON — policy docs are structured-clone-safe data by construction. */
export function cloneDoc(doc: PolicyDoc): PolicyDoc {
  return JSON.parse(JSON.stringify(doc)) as PolicyDoc;
}

/** Normalize a shadow spec into a full PolicyDoc derived from the primary (one-way overrides). */
export function normalizeShadowSpec(primary: PolicyDoc, spec: ShadowSpec): PolicyDoc {
  const doc = spec.policy ? cloneDoc(spec.policy) : cloneDoc(primary);
  if (spec.policyId !== undefined) doc.policyId = spec.policyId;
  if (spec.description !== undefined) doc.description = spec.description;
  if (spec.denyExternalMutations) {
    doc.riskDefaults.EXTERNAL_MUTATION = {
      decision: "deny",
      journal: true,
      reason: "shadow: external mutations denied",
    };
  }
  for (const rc of ["EXTERNAL_MUTATION", "MUTATION", "READ"] as RiskClass[]) {
    if (!doc.riskDefaults[rc]) throw new Error(`normalizeShadowSpec: policy doc missing riskDefaults.${rc}`);
  }
  return doc;
}
