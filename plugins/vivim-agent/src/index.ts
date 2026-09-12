// vivim.agent — index.ts (D-309, Ω Control Plane v0)
// Agents are DATA, not processes: this plugin mints and governs AgentIdentity
// and BehaviorContract vault objects. Wiring only — all decisions live in the
// pure ./agent.ts machinery (same split as vivim.mind's derive.ts).
//
// Ops exposed (ENGINE contributions — no risk BY KIND, READ semantics by kind;
// the ops below APPEND vault data objects through the port, exactly like
// director.rule@1 does: the write is data, gated by the port grant):
//   agent.spawn@1      {parentId?, behaviorContractId, requestedScope, task?} → Outcome<{identity, scope}>
//   agent.describe@1   {agentId} → Outcome<{identity, contract}>
//   behavior.propose@1 {id, version, preconditions, invariants, forbiddenActions, requiredCapabilities, recovery, provenance?} → Outcome<{rev, id, state}>
//   behavior.promote@1 {contractId, evidence: VaultProvenanceRef[]} → Outcome<{rev}>
//   behavior.rollback@1 {contractId} → Outcome<{quarantinedRev, reactivatedRev, rev}>
//   decision.record@1  {decisionId, subject, priorState, proposedState, actor, evidence?, parentDecisions} → Outcome<{rev, decisionId}>
//
// Expected-but-negative results return Outcome<T> with a non-OK status (never
// throw for them). Throws are reserved for malformed payloads and failed port
// calls → DEGRADED at the op boundary (fail-closed propagation).
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import type { AgentIdentity, BehaviorContract, Outcome, PortResult, VaultProvenanceRef } from "@vivim/omega-contracts";
import { fail } from "@vivim/omega-contracts";
import { randomBytes } from "node:crypto";
import {
  asProvenanceRef, buildAgentIdentity, buildDecisionRecord, checkPromote,
  decideRollback, decisionRefs, parseBehaviorProposeInput, parseDecisionInput,
  parseDescribeInput, parseSpawnInput, resolveSpawnAuthority, stageBehaviorContract,
  type RevState,
} from "./agent.ts";

const AGENT_NS = "agent";
const BEHAVIOR_NS = "behavior";
const DECISION_NS = "decision";

/** Port call that fails closed: a non-ok vault/law result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`vivim.agent: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }
interface VaultAppendResult { rev: number; cid: string; seq: number }
interface VaultRow { id: string; rev: number; cid: string }

async function vaultGet(ctx: PluginContext, ns: string, id: string, rev?: number): Promise<VaultGetResult | null> {
  const r: PortResult = await ctx.port.call("vault.get@1", rev === undefined ? { ns, id } : { ns, id, rev });
  if (!r.ok) return null; // not found / absent (cold-miss reads as absent — the caller decides)
  return r.value as VaultGetResult;
}

function asAgentIdentity(op: string, v: unknown): AgentIdentity | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.behaviorContractId !== "string" || typeof o.capabilityToken !== "string") return null;
  void op;
  return v as AgentIdentity;
}

function asBehaviorContract(v: unknown): BehaviorContract | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.version !== "string" || typeof o.state !== "string") return null;
  return v as BehaviorContract;
}

startPlugin(definePlugin({
  onInit: (ctx) => {
    ctx.log("vivim.agent up (D-309) — control plane v0: spawn/describe/propose/promote/rollback/decision over vault data");
  },

  ops: {
    "agent.spawn@1": async (payload: unknown, ctx: PluginContext, meta: CallMeta): Promise<Outcome> => {
      const input = parseSpawnInput(payload); // throws on malformed → DEGRADED
      // 1. resolve the behavior contract (must exist and be active)
      const contractRow = await vaultGet(ctx, BEHAVIOR_NS, input.behaviorContractId);
      const contract = contractRow ? asBehaviorContract(contractRow.data) : null;
      if (!contract) return fail("UNKNOWN", `behavior contract "${input.behaviorContractId}" not found`);
      if (contract.state !== "active") {
        return fail("UNSUPPORTED", `behavior contract "${input.behaviorContractId}" is "${contract.state}", not active`);
      }
      // 2. resolve the parent scope (vault-recorded) for child spawns
      let parent: AgentIdentity | null = null;
      let parentRev: number | null = null;
      if (input.parentId !== undefined) {
        const parentRow = await vaultGet(ctx, AGENT_NS, input.parentId);
        const found = parentRow ? asAgentIdentity("agent.spawn@1", parentRow.data) : null;
        if (!found) return fail("UNKNOWN", `parent agent "${input.parentId}" not found`);
        parent = found;
        parentRev = parentRow!.rev;
      }
      // 3. pure authority decision (subset math over recorded scopes + composition grants)
      const auth = resolveSpawnAuthority({
        parent,
        ownCaps: ctx.capabilities,
        requestedScope: input.requestedScope,
        contract,
      });
      if (auth.status !== "OK" || !auth.value) return auth as Outcome;
      // 4. register forbidden actions BEFORE the identity exists, so no tick
      //    can ever observe an unenforced agent (fail-closed: set failure aborts the spawn)
      const agentId = `agent_${randomBytes(8).toString("hex")}`;
      if (contract.forbiddenActions.length > 0) {
        await portCall(ctx, "law.forbidden.set@1", { principal: agentId, ops: contract.forbiddenActions });
      }
      return await finishSpawn(ctx, meta, input, contract, contractRow!.rev, auth.value.scope, parentRev, agentId);
    },

    "agent.describe@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const { agentId } = parseDescribeInput(payload);
      const row = await vaultGet(ctx, AGENT_NS, agentId);
      const identity = row ? asAgentIdentity("agent.describe@1", row.data) : null;
      if (!identity) return fail("UNKNOWN", `agent "${agentId}" not found`);
      const contractRow = await vaultGet(ctx, BEHAVIOR_NS, identity.behaviorContractId);
      const contract = contractRow ? asBehaviorContract(contractRow.data) : null;
      if (!contract) return fail("UNKNOWN", `behavior contract "${identity.behaviorContractId}" not found`);
      return { status: "OK", value: { identity, contract } };
    },

    "behavior.propose@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const staged = stageBehaviorContract(parseBehaviorProposeInput(payload));
      const r = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: BEHAVIOR_NS, id: staged.id, data: staged,
      });
      return { status: "OK", value: { rev: r.rev, id: staged.id, state: staged.state } };
    },

    "behavior.promote@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const contractId = typeof p?.contractId === "string" && p.contractId.length > 0
        ? p.contractId
        : (() => { throw new Error("behavior.promote@1: contractId must be a non-empty string"); })();
      const evidence = Array.isArray(p?.evidence)
        ? (p.evidence as unknown[]).map((e, i) => asProvenanceRef("behavior.promote@1", `evidence[${i}]`, e))
        : (() => { throw new Error("behavior.promote@1: evidence must be an array of {ns, id, rev}"); })();
      const row = await vaultGet(ctx, BEHAVIOR_NS, contractId);
      const current = row ? asBehaviorContract(row.data) : null;
      const gate = checkPromote(current, evidence);
      if (gate.status !== "OK" || !gate.value) return gate as Outcome;
      // proof-adjacent: every cited ref must actually resolve (citable, not vibes)
      for (const ref of evidence) {
        const got = await vaultGet(ctx, ref.ns, ref.id, ref.rev);
        if (!got) return fail("EVALUATION_FAILED", `evidence ref ${ref.ns}/${ref.id}@${ref.rev} does not resolve`);
      }
      const r = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: BEHAVIOR_NS, id: contractId, data: gate.value,
        refs: [{ ns: BEHAVIOR_NS, id: contractId, rev: row!.rev }],
      });
      return { status: "OK", value: { rev: r.rev } };
    },

    "behavior.rollback@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = payload as Record<string, unknown>;
      const contractId = typeof p?.contractId === "string" && p.contractId.length > 0
        ? p.contractId
        : (() => { throw new Error("behavior.rollback@1: contractId must be a non-empty string"); })();
      const head = await vaultGet(ctx, BEHAVIOR_NS, contractId);
      if (!head) return fail("UNKNOWN", `behavior contract "${contractId}" not found`);
      // rev-walk newest→oldest collecting (rev, version, state) triples.
      // No early break: a staged rev of the SAME version doesn't satisfy
      // rollback (it must be a different version), so the whole chain is
      // scanned. Bounded at 100 (histories are short; the cap guards depth).
      const revs: RevState[] = [];
      for (let rev = head.rev; rev >= 1 && revs.length < 100; rev--) {
        const got = await vaultGet(ctx, BEHAVIOR_NS, contractId, rev);
        if (!got) break; // cold gap or compacted past keep — stop honestly
        const data = got.data as { version?: unknown; state?: unknown };
        revs.push({
          rev,
          version: typeof data.version === "string" ? data.version : "?",
          state: typeof data.state === "string" ? data.state : "?",
        });
      }
      const plan = decideRollback(revs);
      if (plan.status !== "OK" || !plan.value) return plan as Outcome;
      const activeRow = await vaultGet(ctx, BEHAVIOR_NS, contractId, plan.value.quarantineRev);
      const priorRow = await vaultGet(ctx, BEHAVIOR_NS, contractId, plan.value.reactivateRev);
      if (!activeRow || !priorRow) return fail("EVALUATION_FAILED", "rollback target revisions unreadable");
      const q = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: BEHAVIOR_NS, id: contractId,
        data: { ...(activeRow.data as object), state: "quarantined" },
        refs: [{ ns: BEHAVIOR_NS, id: contractId, rev: plan.value.quarantineRev }],
      });
      const r = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: BEHAVIOR_NS, id: contractId,
        data: { ...(priorRow.data as object), state: "active" },
        refs: [{ ns: BEHAVIOR_NS, id: contractId, rev: q.rev }],
      });
      // Return the DECIDED revs (what was quarantined / reactivated) plus the new head.
      return { status: "OK", value: { quarantinedRev: plan.value.quarantineRev, reactivatedRev: plan.value.reactivateRev, rev: r.rev } };
    },

    "decision.record@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const input = parseDecisionInput(payload);
      // every parent must resolve (genealogy integrity — no dangling refs, G0 §4)
      const parentRevs: number[] = [];
      for (const id of input.parentDecisions) {
        const row = await vaultGet(ctx, DECISION_NS, id);
        if (!row) return fail("UNKNOWN", `parent decision "${id}" not found`);
        parentRevs.push(row.rev);
      }
      const { decisionId } = input;
      const data = buildDecisionRecord(input);
      const appendRefs = decisionRefs(input, parentRevs);
      const r = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: DECISION_NS, id: decisionId, data, refs: appendRefs,
      });
      return { status: "OK", value: { rev: r.rev, decisionId } };
    },
  },
}));

/** Shared spawn finalization (identity append with lineage refs). */
async function finishSpawn(
  ctx: PluginContext, meta: CallMeta,
  input: ReturnType<typeof parseSpawnInput>,
  contract: BehaviorContract, contractRev: number,
  scope: string, parentRev: number | null, agentId: string,
): Promise<Outcome> {
  const identity = buildAgentIdentity({
    id: agentId, input, contract, scope,
    createdBy: input.parentId ?? meta.from,
    parentRev, contractRev,
  });
  const r = await portCall<VaultAppendResult>(ctx, "vault.append@1", {
    ns: AGENT_NS, id: agentId, data: identity, refs: identity.provenance,
  });
  return { status: "OK", value: { identity, scope, rev: r.rev } };
}
