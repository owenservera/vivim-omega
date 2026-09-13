// @vivim/omega-contracts — agent.ts
// Ω Control Plane v0: agent identity, lineage, behavioral contracts.
//
// Agents are DATA (vault objects), not processes: an AgentIdentity is a
// persistent, permissioned, lineage-tracked actor record. There is no agent
// runtime loop in v0 — spawning validates authority and mints scope, while
// actual op calls keep flowing through the port under their own principals,
// gated by law.check as always.
//
// `state` reuses LifecycleState (./lifecycle.ts) — staged|verified|active|
// degraded|quarantined|retired — not a parallel enum. Agent liveness and
// behavior-contract rollout share the one lifecycle vocabulary.
import type { LifecycleState } from "./lifecycle.ts";
import type { VaultProvenanceRef } from "./vocabulary.ts";

export interface AgentIdentity {
  id: string;                    // "agent:researcher-7f2a"
  parentId?: string;             // spawning agent, if any — omitted for root/human-spawned
  behaviorContractId: string;    // → BehaviorContract.id below
  behaviorVersion: string;       // semver-ish, matches BehaviorContract.version
  capabilityToken: string;       // canonical attenuated scope string (tokens.ts grammar), NOT a host token
  state: LifecycleState;         // reuse existing enum — do NOT add a second one
  createdAt: string;             // ISO timestamp
  createdBy: string;             // principal id of the spawner (agent id or "human")
  provenance: VaultProvenanceRef[];
}

export interface BehaviorContract {
  id: string;                    // "researcher.v2"
  version: string;
  state: LifecycleState;
  preconditions: string[];       // human-readable predicate strings, evaluated by the plugin, not the host
  invariants: string[];
  forbiddenActions: string[];    // contract ids this agent may never invoke; enforced by vivim.law (law.forbidden.set@1)
  requiredCapabilities: string[]; // scope strings (tokens.ts grammar) the spawner must cover
  recovery: { onAmbiguity: "discover" | "escalate"; onContradiction: "surface" | "halt" };
  provenance: VaultProvenanceRef[];
}

/** Decision genealogy record (vault ns "decision"): an ordinary vault object
 *  with refs pointing at prior decisions — not a graph engine. The Merkle
 *  changelog gives it tamper-evidence for free. */
export interface DecisionRecord {
  decisionId: string;
  subject: string;
  priorState: string;
  proposedState: string;
  actor: string;                 // agent id or principal that decided
  evidence: VaultProvenanceRef[];
  parentDecisions: string[];     // decisionIds this decision descends from
  /** Which build decision authorized the deciding logic (D-324, optional):
   *  resolver decisions cite D-323, spawns cite D-309. A doc pointer ("D-###"),
   *  not a vault ref — validated by shape, never resolved. */
  buildDecisionRef?: string;
}
