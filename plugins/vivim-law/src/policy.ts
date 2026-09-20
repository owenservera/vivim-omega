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

/** The shipped Ω1 baseline policy (D-215 semantics: gate data, not code).
 *  1.1.0 (D-351): parity with manifest-declared risk — the host's `riskyOps()`
 *  (manifest) decides WHETHER law.check fires; this table decides WHAT the gate
 *  says. Two sources, one truth: every routed contract op with declared non-READ
 *  risk must classify identically here (exact rows added for `vault.roundtrip@1`
 *  and `providers.session.start@1`; `notes.*` repaired to `note.*` — it matched
 *  nothing). Enforced fail-closed by the parity net (D-351).
 *  1.2.0 (D-356): the credentials spine enters the net — exact row
 *  `credential.put@1` → MUTATION (the class is vault-internal), with an
 *  explicit require-consent RULE so storing a credential keeps the
 *  security-sensitive consent bar (the first-lineage put ceremony, now
 *  stated as policy data instead of default-riding).
 *  1.4.0 (D-374): the polyglot process tier enters the net — exact row
 *  `run.process.call@1` → MUTATION (journaled; pools exist only in signed
 *  composition config, unknown pool REFUSED broker-side — fail-closed).
 *  1.3.0 (D-358): the chat pilot enters the net — exact rows `chat.open@1`
 *  and `chat.append@1` → MUTATION (vault-internal conversation storage, the
 *  same class family as `vault.*`; never default-riding, D-351's lesson).
 *  `chat.history@1` / `chat.resolve@1` are READ (never gate-triggering).
 *  1.5.0 (Wave 0): the forge's bootstrap op enters the net — exact row
 *  `forge.author.init@1` → MUTATION (vault-internal proposal emission: the
 *  writes are proposal-namespace appends through granted vault ports, the
 *  same class family as `vault.*`; catalog-declared MUTATION, never
 *  default-riding — the parity net holds the two sources to one truth).
 *  1.6.0 (D-411, Core Phase S1): the intent family enters the net — exact
 *  rows `intent.submit@1`, `intent.resolve@1`, `intent.step.execute@1`,
 *  `intent.cancel@1`, `intent.resolution@1` → MUTATION (vault-internal intent
 *  storage, ns `intent` / `intent-plan`, the same class family as `vault.*`).
 *  First exercised when vivim.intent entered a composition (console, the
 *  canonical-intent seam's live path) — before that the family was unwired
 *  and silently default-rode EXTERNAL_MUTATION, exactly the drift class
 *  D-351's net exists to catch. `intent.status@1` is READ (never gated).
 *  1.7.0 (D-412, Core Phase S2): the principal-identity family enters the net
 *  — exact rows `law.principal.register@1` and `law.principal.retire@1` →
 *  MUTATION (vault-internal identity rows, ns `principal`, the class family
 *  of `vault.*`; granted in the agent composition where law holds vault
 *  caps). `law.principal.get@1` is READ (never gate-triggering).
 *  1.8.0 (D-416, Core Phase S3): `law.audit.drain@1` enters the net — exact
 *  row → MUTATION (the audit-chain persistence write, ns `audit`, the same
 *  vault-internal class family; catalog-declared MUTATION in the manifest,
 *  never default-riding — the parity net holds the two sources to one
 *  truth, the D-351 discipline). */
export const LAW_POLICY_V1: PolicyDoc = {
  policyId: "law.policy",
  version: "1.8.0",
  description: "Ω1 baseline: risk-class defaults, mutation journaling, principal deny-list, credential-consent rule",
  riskTable: [
    { op: "risky.op@1", risk: "EXTERNAL_MUTATION" },
    { op: "risky.read@1", risk: "READ" },
    { op: "vault.roundtrip@1", risk: "EXTERNAL_MUTATION" }, // D-351: exact row outranks the vault.* prefix (was silently downgraded)
    { op: "providers.session.start@1", risk: "MUTATION" },  // D-351: exact row outranks the fail-closed default (was silently upgraded)
    { op: "vault.*", risk: "MUTATION" },
    { op: "note.*", risk: "MUTATION" },                     // D-351: repaired from "notes.*" (note.write@1 never matched)
    { op: "credential.put@1", risk: "MUTATION" },           // D-356: vault-internal class — the consent bar lives in the rule below, not the class
    { op: "chat.open@1", risk: "MUTATION" },                // D-358: vault-internal conversation storage (same class family as vault.*)
    { op: "chat.append@1", risk: "MUTATION" },              // D-358: vault-internal message append — exact rows, never default-riding
    { op: "run.process.call@1", risk: "MUTATION" },         // D-374: process-tier call — journaled; pools exist only in signed config, unknown pool REFUSED broker-side
    { op: "forge.author.init@1", risk: "MUTATION" },        // Wave 0: forge bootstrap emission — vault-internal proposal appends (class family of vault.*), catalog-parity exact row
    { op: "intent.submit@1", risk: "MUTATION" },            // D-411 (S1): vault-internal intent storage — exact rows, never default-riding
    { op: "intent.resolve@1", risk: "MUTATION" },            // D-411 (S1): plan resolution writes ns intent/intent-plan
    { op: "intent.step.execute@1", risk: "MUTATION" },       // D-411 (S1): step-state writes under delegation
    { op: "intent.cancel@1", risk: "MUTATION" },             // D-411 (S1): cancellation + compensation evidence writes
    { op: "intent.resolution@1", risk: "MUTATION" },         // D-411 (S1): the four-state resolution rows (ns intent)
    { op: "law.principal.register@1", risk: "MUTATION" },    // D-412 (S2): principal identity rows (ns principal) — exact rows, never default-riding
    { op: "law.principal.retire@1", risk: "MUTATION" },      // D-412 (S2): retirement appends the identity row's terminal state
    { op: "law.audit.drain@1", risk: "MUTATION" },           // D-416 (S3): the audit-chain persistence point (ns audit) — vault-internal class family, exact row, never default-riding
  ],
  defaultRisk: "EXTERNAL_MUTATION", // unknown ops are treated as the strictest class (fail-closed)
  riskDefaults: {
    READ: { decision: "allow", journal: false, reason: "read-class: not gated" },
    MUTATION: { decision: "allow", journal: true, reason: "mutation-class: allowed and journaled" },
    EXTERNAL_MUTATION: { decision: "require-consent", journal: true, reason: "external mutation: consent required" },
  },
  rules: [
    { match: { principal: "omega.attacker" }, decision: "deny", reason: "principal deny-listed (adversarial fixture, Ω0 runtime suite)" },
    { match: { op: "credential.put@1" }, decision: "require-consent", reason: "storing a credential is the security-sensitive bar — consent required even though the class is vault-internal (D-356)" },
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

/** D-387 (perf review #9): the classification index is precomputed ONCE per policy
 *  document instead of filter()+sort() on every risky-op call. Keyed by WeakMap on
 *  the doc object: policy is DATA replaced by reference on amendment (ShadowAmendment
 *  clones — never mutates a live doc), so a new doc builds a new index and stale
 *  entries are garbage-collected. Exact rows keep first-wins (the old find());
 *  prefix rows are sorted longest-first ONCE (stable sort — equal lengths keep
 *  table order), and the call-time linear scan resolves the same winner the old
 *  per-call sort resolved. Semantics byte-identical (D-351 exact-outranks-prefix
 *  and D-384 specificity both preserved, pinned by the differential falsifier). */
interface CompiledRiskIndex { exact: Map<string, RiskClass>; prefixes: RiskEntry[] }
const riskIndexCache = new WeakMap<PolicyDoc, CompiledRiskIndex>();

function riskIndex(doc: PolicyDoc): CompiledRiskIndex {
  const cached = riskIndexCache.get(doc);
  if (cached) return cached;
  const exact = new Map<string, RiskClass>();
  const prefixes: RiskEntry[] = [];
  for (const r of doc.riskTable) {
    if (r.op.endsWith("*")) prefixes.push(r);
    else if (!exact.has(r.op)) exact.set(r.op, r.risk); // first exact row wins
  }
  prefixes.sort((a, b) => b.op.length - a.op.length); // stable: equal-length patterns keep table order
  const idx: CompiledRiskIndex = { exact, prefixes };
  riskIndexCache.set(doc, idx);
  return idx;
}

/** Classify an op against the risk table (exact rows before prefix rows, first hit wins).
 *  D-384: among PREFIX rows, the most specific (longest pattern) wins — specificity is
 *  enforced by the interpreter, not by table-authoring order, so two overlapping prefixes
 *  (e.g. `chat.*` and `chat.append.*`) can never silently swap outcomes by list order.
 *  Equal-length patterns keep table order (stable sort).
 *  D-387: evaluated against the precomputed index (see riskIndex) — no per-call allocation. */
export function classifyRisk(doc: PolicyDoc, op: string): RiskClass {
  const idx = riskIndex(doc);
  const exact = idx.exact.get(op);
  if (exact !== undefined) return exact;
  for (const r of idx.prefixes) {
    if (opMatches(r.op, op)) return r.risk;
  }
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
