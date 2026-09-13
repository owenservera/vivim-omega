// vivim.agent — agent.ts (D-309): pure spawn/describe/propose/promote/rollback/
// decision machinery. NO port calls here — the caller (index.ts) does I/O and
// feeds rows in; every function below is deterministic given its inputs.
// Expected-but-negative results return Outcome<T> (contracts/src/outcome.ts);
// malformed INPUT SHAPES throw (genuinely unexpected → DEGRADED at the op
// boundary, house fail-closed discipline).
import type {
  AgentIdentity, BehaviorContract, DecisionRecord, Outcome, VaultProvenanceRef,
} from "@vivim/omega-contracts";
import type { DelegateEnvelope } from "@vivim/omega-contracts";
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

// ---- exec (B1a, D-327: one agent acts once; D-315(a) finish-then-halt, ratified) ----

export interface ExecInput {
  agentId: string;
  op: string; // "<id>@<version>", e.g. "vault.append@1"
  payload: Record<string, unknown>;
  realizationRef: VaultProvenanceRef | null;
}

export function parseExecInput(payload: unknown): ExecInput {
  const op = "agent.exec@1";
  const p = reqObj(op, "payload", payload);
  return {
    agentId: reqStr(op, "agentId", p.agentId),
    op: reqStr(op, "op", p.op),
    payload: p.payload === undefined ? {} : reqObj(op, "payload", p.payload),
    realizationRef: p.realizationRef === undefined || p.realizationRef === null
      ? null
      : asProvenanceRef(op, "realizationRef", p.realizationRef),
  };
}

export type ExecCallScope =
  | { kind: "scope"; scope: string }
  | { kind: "unsupported"; op: string } // recognized shape, outside the v0 verb scope (B1b widens)
  | { kind: "unattributable"; op: string }; // no payload ns to attribute the call to

/** v0 call-scope derivation: vault.<x>@<v> + string payload.ns → "<base>:ns=<ns>".
 *  Malformed op SHAPES throw (genuinely unexpected → DEGRADED); anything else
 *  is DATA the caller maps to an honest Outcome (UNSUPPORTED / REFUSED). */
export function execCallScope(op: string, payload: Record<string, unknown>): ExecCallScope {
  const m = /^([A-Za-z0-9_.-]+)@([0-9]+)$/.exec(op);
  if (!m) throw new Error(`agent.exec@1: op must look like <id>@<version> (got ${JSON.stringify(op)})`);
  const base = m[1]!;
  if (!base.startsWith("vault.")) return { kind: "unsupported", op };
  const ns = payload["ns"];
  if (typeof ns !== "string" || ns.length === 0) return { kind: "unattributable", op };
  return { kind: "scope", scope: `${base}:ns=${ns}` };
}

// ---- exec admission (D-315(a) finish-then-halt, ratified, B1a D-327) ----

/** Identity states that can never admit a new call (quarantined/retired are terminal). */
const TERMINAL_IDENTITY_STATES = ["quarantined", "retired"] as const;

export interface ExecAdmission {
  admittable: boolean;
  reason: string;
}

/** Pure admission gate: admittable iff the head contract is `active`, the
 *  identity is not terminal, and the agent's pinned behaviorVersion matches
 *  the head version (a rollback that reactivates a prior version refuses new
 *  calls from agents pinned to the quarantined version — D-315 refuse-new).
 *  Anything else is DATA (never throws): the caller maps it to REFUSED. */
export function decideExecAdmission(opts: {
  contractState: string;
  contractVersion: string;
  identityState: string;
  identityVersion: string;
}): ExecAdmission {
  if (opts.contractState !== "active") {
    return { admittable: false, reason: `behavior contract is "${opts.contractState}", not active` };
  }
  if ((TERMINAL_IDENTITY_STATES as readonly string[]).includes(opts.identityState)) {
    return { admittable: false, reason: `agent identity is "${opts.identityState}" (terminal)` };
  }
  if (opts.identityVersion !== opts.contractVersion) {
    return {
      admittable: false,
      reason: `agent pinned to behavior version "${opts.identityVersion}" but head is "${opts.contractVersion}" (quarantined-mid-flight refusal)`,
    };
  }
  return { admittable: true, reason: "admitted" };
}

/** Post-settle annotation: true when the head moved under a settled call
 *  (different rev, version, or non-active state) — the ledger proves the call
 *  completed AND proves the check ran once at admission (D-315 finish half).
 *  Pure so the matrix is unit-pinned; the wiring feeds it head revisions. */
export function execQuarantinedMidFlight(opts: {
  admittedRev: number;
  admittedVersion: string;
  headRev: number;
  headVersion: string;
  headState: string;
}): boolean {
  if (opts.headRev !== opts.admittedRev) return true;
  if (opts.headVersion !== opts.admittedVersion) return true;
  if (opts.headState !== "active") return true;
  return false;
}

/** Canonical ledger id for an exec attempt (ns "agent"): one row per attempt,
 *  keyed by the host causation id — retries are new attempts, never overwrites. */
export function execLedgerId(causationId: string): string {
  return `exec:${causationId}`;
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
  /** D-324: which build decision authorized the deciding logic ("D-###").
   *  Optional; when present it must match the doc-pointer grammar. */
  buildDecisionRef?: string;
}

export function parseDecisionInput(payload: unknown): DecisionInput {
  const op = "decision.record@1";
  const p = reqObj(op, "payload", payload);
  if (!Array.isArray(p.parentDecisions)) throw new Error(`${op}: parentDecisions must be an array of decision ids`);
  for (const pd of p.parentDecisions) {
    if (typeof pd !== "string" || pd.length === 0) throw new Error(`${op}: parentDecisions must be an array of decision ids`);
  }
  const ref = p.buildDecisionRef;
  if (ref !== undefined && (typeof ref !== "string" || !/^D-[0-9]+$/.test(ref))) {
    throw new Error(`${op}: buildDecisionRef must look like "D-###" when provided (got ${JSON.stringify(ref)})`);
  }
  return {
    decisionId: reqStr(op, "decisionId", p.decisionId),
    subject: reqStr(op, "subject", p.subject),
    priorState: reqStr(op, "priorState", p.priorState),
    proposedState: reqStr(op, "proposedState", p.proposedState),
    actor: reqStr(op, "actor", p.actor),
    evidence: asProvenanceList(op, "evidence", p.evidence ?? []),
    parentDecisions: p.parentDecisions as string[],
    ...(ref !== undefined ? { buildDecisionRef: ref as string } : {}),
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
    ...(input.buildDecisionRef !== undefined ? { buildDecisionRef: input.buildDecisionRef } : {}),
  };
}

export function decisionRefs(input: DecisionInput, parentRevs: number[]): VaultProvenanceRef[] {
  return [
    ...input.evidence,
    ...input.parentDecisions.map((id, i) => ({ ns: "decision", id, rev: parentRevs[i]! })),
  ];
}

// ---- snapshot (D-328a: read/orient) ----

export function parseSnapshotInput(payload: unknown): { agentId: string } {
  const op = "agent.snapshot@1";
  const p = reqObj(op, "payload", payload);
  return { agentId: reqStr(op, "agentId", p.agentId) };
}

// ---- delegate (D-328b: structured handoff) ----

export interface DelegateInput extends DelegateEnvelope {
  // The handoff envelope IS the contract vocabulary (control.ts) — the pure
  // parser validates it; the wiring executes it. No second envelope shape.
}

function optStrArray(op: string, field: string, v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error(`${op}: ${field} must be an array of strings when provided`);
  for (const s of v) {
    if (typeof s !== "string") throw new Error(`${op}: ${field} must be an array of strings when provided`);
  }
  return v as string[];
}

export function parseDelegateInput(payload: unknown): DelegateInput {
  const op = "agent.delegate@1";
  const p = reqObj(op, "payload", payload);
  const authority = reqStr(op, "authority", p.authority);
  try {
    canonicalScope(authority);
  } catch (e) {
    throw new Error(`${op}: malformed authority scope — ${e instanceof Error ? e.message : String(e)}`);
  }
  const deadline = p.deadline;
  if (deadline !== undefined && (typeof deadline !== "number" || !Number.isFinite(deadline) || deadline < 0)) {
    throw new Error(`${op}: deadline must be a finite number >= 0 when provided`);
  }
  return {
    parentAgentId: reqStr(op, "parentAgentId", p.parentAgentId),
    behaviorContractId: reqStr(op, "behaviorContractId", p.behaviorContractId),
    authority,
    ...(optStr(p.task) !== undefined ? { task: optStr(p.task)! } : {}),
    ...(optStr(p.intent) !== undefined ? { intent: optStr(p.intent)! } : {}),
    ...(optStrArray(op, "constraints", p.constraints) !== undefined ? { constraints: optStrArray(op, "constraints", p.constraints)! } : {}),
    ...(deadline !== undefined ? { deadline: deadline as number } : {}),
    ...(optStrArray(op, "evidenceRequirements", p.evidenceRequirements) !== undefined
      ? { evidenceRequirements: optStrArray(op, "evidenceRequirements", p.evidenceRequirements)! } : {}),
    ...(optStrArray(op, "expectedOutputs", p.expectedOutputs) !== undefined
      ? { expectedOutputs: optStrArray(op, "expectedOutputs", p.expectedOutputs)! } : {}),
  };
}

// ---- evolution (D-328b: governed improvement) ----

export interface EvolutionProposeInput {
  behavior: Omit<BehaviorContract, "state" | "provenance"> & { provenance?: VaultProvenanceRef[] };
  actor: string;
  evidence: VaultProvenanceRef[];
}

export interface EvolutionEvaluateInput {
  contractId: string;
  evidence: VaultProvenanceRef[];
  verdict: "adopt" | "reject";
  note?: string;
  actor: string;
}

export interface EvolutionPromoteInput {
  contractId: string;
  evidence: VaultProvenanceRef[];
  actor: string;
}

export interface EvolutionRollbackInput {
  contractId: string;
  actor: string;
}

/** Actor accountability (D-328b): agent actors ("agent_*") must be named
 *  (non-empty); the wiring additionally requires a live, non-terminal
 *  identity under an active contract — agents never self-authorize evolution
 *  without an accountable, governed identity. There are no L-levels in v0
 *  (no second auth model, per the non-goals): the evidence requirement IS the
 *  authorization floor, identical to behavior.promote. */
export function isAgentActor(actor: string): boolean {
  return actor.startsWith("agent_");
}

function reqActor(op: string, v: unknown): string {
  return reqStr(op, "actor", v);
}

function reqEvidence(op: string, v: unknown, nonEmpty: boolean): VaultProvenanceRef[] {
  const list = asProvenanceList(op, "evidence", v ?? (nonEmpty ? v : []));
  if (nonEmpty && list.length === 0) {
    throw new Error(`${op}: evidence must be a non-empty array of {ns, id, rev} (evolution is evidence-required)`);
  }
  return list;
}

export function parseEvolutionProposeInput(payload: unknown): EvolutionProposeInput {
  const op = "evolution.propose@1";
  const p = reqObj(op, "payload", payload);
  const behavior = parseBehaviorProposeInput({
    id: p.id, version: p.version, preconditions: p.preconditions, invariants: p.invariants,
    forbiddenActions: p.forbiddenActions, requiredCapabilities: p.requiredCapabilities,
    recovery: p.recovery, ...(p.provenance !== undefined ? { provenance: p.provenance } : {}),
  });
  return {
    behavior,
    actor: reqActor(op, p.actor),
    evidence: reqEvidence(op, p.evidence, false),
  };
}

export function parseEvolutionEvaluateInput(payload: unknown): EvolutionEvaluateInput {
  const op = "evolution.evaluate@1";
  const p = reqObj(op, "payload", payload);
  const verdict = p.verdict;
  if (verdict !== "adopt" && verdict !== "reject") {
    throw new Error(`${op}: verdict must be "adopt" | "reject" (got ${JSON.stringify(verdict)})`);
  }
  return {
    contractId: reqStr(op, "contractId", p.contractId),
    evidence: reqEvidence(op, p.evidence, true),
    verdict,
    ...(optStr(p.note) !== undefined ? { note: optStr(p.note)! } : {}),
    actor: reqActor(op, p.actor),
  };
}

export function parseEvolutionPromoteInput(payload: unknown): EvolutionPromoteInput {
  const op = "evolution.promote@1";
  const p = reqObj(op, "payload", payload);
  return {
    contractId: reqStr(op, "contractId", p.contractId),
    evidence: reqEvidence(op, p.evidence, true),
    actor: reqActor(op, p.actor),
  };
}

export function parseEvolutionRollbackInput(payload: unknown): EvolutionRollbackInput {
  const op = "evolution.rollback@1";
  const p = reqObj(op, "payload", payload);
  return { contractId: reqStr(op, "contractId", p.contractId), actor: reqActor(op, p.actor) };
}

