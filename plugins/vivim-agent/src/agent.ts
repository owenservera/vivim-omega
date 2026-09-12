// vivim.agent — agent.ts (D-309): pure spawn/describe/propose/promote/rollback/
// decision machinery. NO port calls here — the caller (index.ts) does I/O and
// feeds rows in; every function below is deterministic given its inputs.
// Expected-but-negative results return Outcome<T> (contracts/src/outcome.ts);
// malformed INPUT SHAPES throw (genuinely unexpected → DEGRADED at the op
// boundary, house fail-closed discipline).
import type {
  AgentIdentity, BehaviorContract, DecisionRecord, Outcome, VaultProvenanceRef,
} from "@vivim/omega-contracts";
import { fail, ok } from "@vivim/omega-contracts";
import { attenuate, canonicalScope, isSubset, mintCap } from "./tokens.ts";

// ---- input validation (throw on malformed) ----

function reqObj(op: string, field: string, v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${op}: ${field} must be an object`);
  }
  return v as Record<string, unknown>;
}

function reqStr(op: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${op}: ${field} must be a non-empty string`);
  }
  return v;
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function reqStrArray(op: string, field: string, v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error(`${op}: ${field} must be an array of strings`);
  for (const s of v) {
    if (typeof s !== "string") throw new Error(`${op}: ${field} must be an array of strings`);
  }
  return v as string[];
}

/** VaultProvenanceRef shape check (rev is an integer ≥ 1 — "HEAD" is refused). */
export function asProvenanceRef(op: string, field: string, v: unknown): VaultProvenanceRef {
  const o = reqObj(op, field, v);
  const ns = reqStr(op, `${field}.ns`, o.ns);
  const id = reqStr(op, `${field}.id`, o.id);
  if (typeof o.rev !== "number" || !Number.isInteger(o.rev) || o.rev < 1) {
    throw new Error(`${op}: ${field}.rev must be an integer >= 1 (got ${JSON.stringify(o.rev)})`);
  }
  return { ns, id, rev: o.rev };
}

function asProvenanceList(op: string, field: string, v: unknown): VaultProvenanceRef[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${op}: ${field} must be an array`);
  return v.map((e, i) => asProvenanceRef(op, `${field}[${i}]`, e));
}

// ---- spawn ----

export interface SpawnInput {
  parentId?: string;
  behaviorContractId: string;
  requestedScope: string; // tokens.ts scope grammar, e.g. "vault.append:ns=email"
  task?: string;
}

export function parseSpawnInput(payload: unknown): SpawnInput {
  const op = "agent.spawn@1";
  const p = reqObj(op, "payload", payload);
  return {
    ...(optStr(p.parentId) !== undefined ? { parentId: optStr(p.parentId)! } : {}),
    behaviorContractId: reqStr(op, "behaviorContractId", p.behaviorContractId),
    requestedScope: reqStr(op, "requestedScope", p.requestedScope),
    ...(optStr(p.task) !== undefined ? { task: optStr(p.task)! } : {}),
  };
}

/** A granted composition capability in port form → the scope path it covers.
 *  "port:vault.append@1" covers scope path "vault.append". host.* caps cover
 *  nothing in scope grammar (least privilege: journal/revoke caps mint no
 *  agent scopes). Returns null when unmappable. */
export function portCapToScope(cap: string): string | null {
  const m = /^port:([A-Za-z0-9_.-]+)@([0-9]+)$/.exec(cap);
  if (!m) return null;
  return m[1];
}

/** Authority decision for a spawn. Pure scope math — no law.check call: the
 *  law gates actual op CALLS at runtime; spawn-time validates that the
 *  requested scope is covered (by the parent agent's recorded scope, or —
 *  for root spawns — by the composition grants mapped to scope paths). */
export function resolveSpawnAuthority(opts: {
  parent: AgentIdentity | null;
  ownCaps: string[];
  requestedScope: string;
  contract: BehaviorContract;
}): Outcome<{ scope: string; parentScope: string | null }> {
  let canonical: string;
  try {
    canonical = canonicalScope(opts.requestedScope);
  } catch (e) {
    throw new Error(`agent.spawn@1: malformed requestedScope — ${e instanceof Error ? e.message : String(e)}`);
  }
  const parentScope = opts.parent?.capabilityToken ?? null;
  if (parentScope !== null) {
    // Child of an agent: requested ⊆ parent's recorded scope (attenuation chain).
    let child: string;
    try {
      child = attenuate(mintCap(parentScope), canonical).scope;
    } catch {
      return fail("REFUSED", `requested scope "${canonical}" exceeds parent scope "${parentScope}"`);
    }
    void child;
  } else {
    // Root spawn: requested ⊆ at least one granted composition capability.
    const covered = opts.ownCaps
      .map(portCapToScope)
      .filter((s): s is string => s !== null)
      .some((s) => { try { return isSubset(canonical, s); } catch { return false; } });
    if (!covered) {
      return fail("REFUSED", `requested scope "${canonical}" is covered by no granted composition capability`);
    }
  }
  // The contract's demands must be satisfiable by what the agent receives.
  for (const req of opts.contract.requiredCapabilities) {
    let okSubset = false;
    try { okSubset = isSubset(req, canonical); } catch { okSubset = false; }
    if (!okSubset) {
      return fail("UNSUPPORTED", `behavior contract requires "${req}", outside requested scope "${canonical}"`);
    }
  }
  return ok({ scope: canonical, parentScope });
}

export function buildAgentIdentity(opts: {
  id: string;
  input: SpawnInput;
  contract: BehaviorContract;
  scope: string;
  createdBy: string;
  parentRev: number | null;
  contractRev: number;
}): AgentIdentity {
  return {
    id: opts.id,
    ...(opts.input.parentId !== undefined ? { parentId: opts.input.parentId } : {}),
    behaviorContractId: opts.input.behaviorContractId,
    behaviorVersion: opts.contract.version,
    capabilityToken: opts.scope,
    state: "staged", // born staged: a spawned agent activates only via behavior.promote-style evidence (never live by construction)
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy,
    provenance: [
      { ns: "behavior", id: opts.input.behaviorContractId, rev: opts.contractRev },
      ...(opts.input.parentId !== undefined && opts.parentRev !== null
        ? [{ ns: "agent", id: opts.input.parentId, rev: opts.parentRev }]
        : []),
    ],
  };
}

// ---- describe ----

export function parseDescribeInput(payload: unknown): { agentId: string } {
  const op = "agent.describe@1";
  const p = reqObj(op, "payload", payload);
  return { agentId: reqStr(op, "agentId", p.agentId) };
}

// ---- behavior propose / promote ----

const RECOVERY_ARMS = ["discover", "escalate"] as const;
const RECOVERY_CONTRA = ["surface", "halt"] as const;

export function parseBehaviorProposeInput(payload: unknown): Omit<BehaviorContract, "state" | "provenance"> & { provenance?: VaultProvenanceRef[] } {
  const op = "behavior.propose@1";
  const p = reqObj(op, "payload", payload);
  const recovery = reqObj(op, "recovery", p.recovery);
  if (!(RECOVERY_ARMS as readonly string[]).includes(recovery.onAmbiguity as string)) {
    throw new Error(`${op}: recovery.onAmbiguity must be "discover" | "escalate"`);
  }
  if (!(RECOVERY_CONTRA as readonly string[]).includes(recovery.onContradiction as string)) {
    throw new Error(`${op}: recovery.onContradiction must be "surface" | "halt"`);
  }
  return {
    id: reqStr(op, "id", p.id),
    version: reqStr(op, "version", p.version),
    preconditions: reqStrArray(op, "preconditions", p.preconditions),
    invariants: reqStrArray(op, "invariants", p.invariants),
    forbiddenActions: reqStrArray(op, "forbiddenActions", p.forbiddenActions),
    requiredCapabilities: reqStrArray(op, "requiredCapabilities", p.requiredCapabilities),
    recovery: {
      onAmbiguity: recovery.onAmbiguity as "discover" | "escalate",
      onContradiction: recovery.onContradiction as "surface" | "halt",
    },
    ...(p.provenance !== undefined ? { provenance: asProvenanceList(op, "provenance", p.provenance) } : {}),
  };
}

/** Stage a proposed contract: state is FORCED to "staged" (never live by construction). */
export function stageBehaviorContract(
  input: Omit<BehaviorContract, "state" | "provenance"> & { provenance?: VaultProvenanceRef[] },
): BehaviorContract {
  return { ...input, state: "staged", provenance: input.provenance ?? [] };
}

/** Promotion gate (D-303 applied to behaviors): staged + non-empty evidence.
 *  Evidence EXISTENCE (refs resolve via vault.get) is checked by the caller;
 *  here: shape gate only. verified is a reserved intermediate — promote moves
 *  staged→active; rollback reactivates staged|verified candidates. */
export function checkPromote(
  current: BehaviorContract | null,
  evidence: VaultProvenanceRef[],
): Outcome<BehaviorContract> {
  if (current === null) return fail("UNKNOWN", "behavior contract not found");
  if (current.state !== "staged") {
    return fail("UNSUPPORTED", `only staged contracts promote (found "${current.state}")`);
  }
  if (evidence.length === 0) {
    return fail("REFUSED", "promotion requires attached evidence (confidence never promotes alone)");
  }
  return ok({ ...current, state: "active" as const, provenance: [...current.provenance, ...evidence] });
}

// ---- rollback (rev-walk over vault history, no new primitives) ----

export interface RevState { rev: number; version: string; state: string }

/** Rollback decision over a newest-first rev list. Quarantines the latest
 *  active rev; reactivates the newest staged|verified rev of a DIFFERENT
 *  version below it (the version rollback actually means). Either missing →
 *  UNSUPPORTED. Append-only: nothing deleted, both stay fetchable by rev. */
export function decideRollback(revsNewestFirst: RevState[]): Outcome<{ quarantineRev: number; reactivateRev: number }> {
  const quarantine = revsNewestFirst.find((r) => r.state === "active");
  if (!quarantine) return fail("UNSUPPORTED", "no active revision to quarantine");
  const reactivate = revsNewestFirst.find(
    (r) => r.rev !== quarantine.rev && r.version !== quarantine.version && (r.state === "staged" || r.state === "verified"),
  );
  if (!reactivate) return fail("UNSUPPORTED", "no prior staged|verified version to reactivate");
  return ok({ quarantineRev: quarantine.rev, reactivateRev: reactivate.rev });
}

// ---- decision.record ----

export interface DecisionInput {
  decisionId: string;
  subject: string;
  priorState: string;
  proposedState: string;
  actor: string;
  evidence: VaultProvenanceRef[];
  parentDecisions: string[];
}

export function parseDecisionInput(payload: unknown): DecisionInput {
  const op = "decision.record@1";
  const p = reqObj(op, "payload", payload);
  if (!Array.isArray(p.parentDecisions)) throw new Error(`${op}: parentDecisions must be an array of decision ids`);
  for (const pd of p.parentDecisions) {
    if (typeof pd !== "string" || pd.length === 0) throw new Error(`${op}: parentDecisions must be an array of decision ids`);
  }
  return {
    decisionId: reqStr(op, "decisionId", p.decisionId),
    subject: reqStr(op, "subject", p.subject),
    priorState: reqStr(op, "priorState", p.priorState),
    proposedState: reqStr(op, "proposedState", p.proposedState),
    actor: reqStr(op, "actor", p.actor),
    evidence: asProvenanceList(op, "evidence", p.evidence ?? []),
    parentDecisions: p.parentDecisions as string[],
  };
}

export function buildDecisionRecord(input: DecisionInput): DecisionRecord {
  return {
    decisionId: input.decisionId,
    subject: input.subject,
    priorState: input.priorState,
    proposedState: input.proposedState,
    actor: input.actor,
    evidence: input.evidence,
    parentDecisions: input.parentDecisions,
  };
}

export function decisionRefs(input: DecisionInput, parentRevs: number[]): VaultProvenanceRef[] {
  return [
    ...input.evidence,
    ...input.parentDecisions.map((id, i) => ({ ns: "decision", id, rev: parentRevs[i]! })),
  ];
}

