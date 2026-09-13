// @vivim/omega-contracts — control.ts
// D-328: control-plane v0 vocabulary (read/orient 4a, act/evolve 4b).
//
// An agent with no prior knowledge discovers the system through three
// read ops (control.bootstrap + control.describe on vivim.mind,
// agent.snapshot on vivim.agent) and evolves it through five governed ops
// (agent.delegate + evolution.propose/evaluate/promote/rollback). All shapes
// are DATA (D-219): envelopes, proposals, and evaluations are vault objects
// in ns "control" — journaled, attributable, revertable. No codegen, ever.
import type { AgentIdentity, BehaviorContract } from "./agent.ts";
import type { ComputationKind, VaultProvenanceRef } from "./provider.ts";

/** Version tag of the first-contact bootstrap object. */
export const BOOTSTRAP_VERSION = "control-bootstrap/1";
/** Version tag of the ControlModel projection. */
export const CONTROL_MODEL_VERSION = "control-model/1";

/** Canonical namespace orientation list (mirrors docs/VAULT-NAMESPACES.md;
 *  `control` is reserved in 4a and first written by 4b evolution records). */
export const CONTROL_NAMESPACES: readonly string[] = [
  "email", "automation", "nlcl", "discovery", "agent", "behavior",
  "decision", "providers", "probe", "law", "resolve", "control",
];

/** Control-plane entry points an orienting agent can call (static orientation). */
export const CONTROL_ENTRYPOINTS: readonly string[] = [
  "control.bootstrap@1", "control.describe@1", "agent.snapshot@1",
  "agent.exec@1", "agent.delegate@1",
  "evolution.propose@1", "evolution.evaluate@1",
  "evolution.promote@1", "evolution.rollback@1",
];

/** First-contact orientation (control.bootstrap@1, READ-only): who this
 *  system is and where to look next. Versioned so a zero-knowledge agent can
 *  detect skew (unknown version → stop, never guess). */
export interface Bootstrap {
  bootstrapVersion: typeof BOOTSTRAP_VERSION;
  composition: string;
  controlModel: typeof CONTROL_MODEL_VERSION;
  entrypoints: typeof CONTROL_ENTRYPOINTS;
  namespaces: typeof CONTROL_NAMESPACES;
  /** The orienting sequence: describe (system) → snapshot (self) → act. */
  next: readonly ["control.describe@1", "agent.snapshot@1"];
  at: number;
}

/** Bounded system projection (control.describe@1, READ-only): versions,
 *  namespaces, kinds, capabilities, contracts, evaluators, policy
 *  boundaries. Zero write path — a wrong projection is falsifiable against
 *  the vault it was derived from. */
export interface ControlModel {
  controlVersion: typeof CONTROL_MODEL_VERSION;
  composition: string;
  generatedAt: number;
  namespaces: typeof CONTROL_NAMESPACES;
  kinds: readonly ComputationKind[];
  /** The config ops catalog (recipe data — the grant is the authority). */
  capabilities: Array<{ op: string; risk: string; provider: string; title: string }>;
  /** Callable control-plane entry points (orientation, not authorization). */
  contracts: typeof CONTROL_ENTRYPOINTS;
  /** What evaluates claims before they promote (orientation prose, stable). */
  evaluators: readonly string[];
  policy: {
    gate: "law.check@1";
    /** Live forbidden-overlay state when the registry reports it, else null. */
    forbidden: { persistence: boolean; loaded: boolean; count: number } | null;
  };
  /** Governed-evolution activity (ns "control" prefix `evolution:`, bounded). */
  evolution: { proposals: number };
}

/** Optional focus pointer for control.describe@1: unknown kind, capability,
 *  or version answers UNKNOWN — never a crash, never a guess. */
export interface DescribeFocus {
  kind?: string;
  capability?: string;
  version?: string;
}

/** Self-orientation slice (agent.snapshot@1, READ-only): identity + resolved
 *  contract + ledger cursor (how many exec attempts this agent has made). */
export interface AgentSnapshot {
  agentId: string;
  identity: AgentIdentity;
  contract: BehaviorContract;
  contractRev: number;
  ledgerCursor: {
    attempts: number;
    latest: { id: string; rev: number } | null;
  };
  at: number;
}

/** Structured handoff envelope (agent.delegate@1). The receiver re-discovers
 *  its own contract via agent.describe/agent.snapshot — it never trusts the
 *  envelope's claims about itself (carried claims are routing hints, the
 *  vault is the authority). */
export interface DelegateEnvelope {
  parentAgentId: string;
  behaviorContractId: string;
  /** Requested scope for the child (tokens.ts grammar — subset of the parent). */
  authority: string;
  task?: string;
  intent?: string;
  constraints?: string[];
  deadline?: number;
  evidenceRequirements?: string[];
  expectedOutputs?: string[];
}

/** Stored delegation record (vault ns "control", id `delegation:<childId>`). */
export interface DelegationRecord extends DelegateEnvelope {
  childId: string;
  actor: string;
  buildDecisionRef: "D-328";
  createdAt: number;
}

/** Evolution proposal (vault ns "control", id `evolution:<contractId>` rev 1):
 *  mirrors the staged behavior contract (ns "behavior" stays the mechanics). */
export interface EvolutionProposal {
  kind: "proposal";
  id: string;
  version: string;
  preconditions: string[];
  invariants: string[];
  forbiddenActions: string[];
  requiredCapabilities: string[];
  recovery: BehaviorContract["recovery"];
  actor: string;
  evidence: VaultProvenanceRef[];
  behaviorRev: number;
  buildDecisionRef: "D-328";
  createdAt: number;
}

/** Evolution evaluation (same ns "control" object, later rev): an
 *  evidence-backed verdict that informs promotion but never performs it. */
export interface EvolutionEvaluation {
  kind: "evaluation";
  id: string;
  verdict: "adopt" | "reject";
  note?: string;
  actor: string;
  evidence: VaultProvenanceRef[];
  createdAt: number;
}

/** Evolution promotion/rollback mirror (same ns "control" object, later rev):
 *  genealogy-distinct names over the identical behavior mechanics. */
export interface EvolutionTransition {
  kind: "promotion" | "rollback";
  id: string;
  actor: string;
  evidence: VaultProvenanceRef[];
  behaviorRev: number;
  quarantinedRev?: number;
  reactivatedRev?: number;
  createdAt: number;
}

/** Canonical vault object id for a delegation record (ns "control"). */
export function delegationId(childId: string): string {
  if (typeof childId !== "string" || childId.length === 0) {
    throw new Error("delegationId: childId must be a non-empty string");
  }
  if (/[\u0000|:]/.test(childId)) {
    throw new Error("delegationId: childId must not contain '|' or NUL or ':' (id grammar)");
  }
  return `delegation:${childId}`;
}

/** Canonical vault object id for an evolution record (ns "control"). */
export function evolutionId(contractId: string): string {
  if (typeof contractId !== "string" || contractId.length === 0) {
    throw new Error("evolutionId: contractId must be a non-empty string");
  }
  if (/[\u0000|:]/.test(contractId)) {
    throw new Error("evolutionId: contractId must not contain '|' or NUL or ':' (id grammar)");
  }
  return `evolution:${contractId}`;
}
