// µhost — ports.ts: the Port Router. B3: capability tokens are verified HERE, in the host
// process, outside every compartment. Risk gating is data-driven (manifest CONTRACT risk
// declarations) — no policy lives in the host; law.check is a plugin call.
import type { LawDecision, PortResult, PluginManifest, CompositionEntry, Recipe } from "@vivim/omega-contracts";
import { routableOps, riskyOps, HOST_OPS, HOST_CAPS } from "@vivim/omega-contracts";
export { HOST_OPS, HOST_CAPS };
import type { CompartmentHandle, FromWorker, CallMsg } from "./worker.ts";
import { mintToken } from "./canon.ts";
import { appendFileSync } from "node:fs";

/** host op -> the capability that guards it (single source of truth for token aliasing). */
export const HOST_OP_TO_CAP: Record<string, string> = {
  [HOST_OPS.compartmentSpawn]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentTerminate]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentStats]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.journalAppend]: HOST_CAPS.journal,
  [HOST_OPS.tokensRevoke]: HOST_CAPS.tokensRevoke,
};

export interface TokenRecord { token: string; pluginId: string; cap: string; gen: number }

export interface RouterOptions { vaultDir: string; journal: boolean }

export class PortRouter {
  private compartments = new Map<string, CompartmentHandle>();
  private manifests = new Map<string, PluginManifest>();
  private opRoute = new Map<string, string>();       // op -> pluginId
  private opRisk = new Map<string, string>();        // op -> risk class
  private tokens = new Map<string, TokenRecord>();   // token -> record
  private generation = 1;
  private callSeq = 0;
  private pending = new Map<string, { resolve: (r: PortResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private inflightByCompartment = new Map<string, Set<string>>();
  journalPath: string;

  constructor(private opts: RouterOptions) {
    this.journalPath = `${opts.vaultDir}/law-journal.jsonl`;
  }

  register(entry: CompositionEntry, manifest: PluginManifest, handle: CompartmentHandle, tokens: Record<string, string>): void {
    this.compartments.set(entry.id, handle);
    this.manifests.set(entry.id, manifest);
    for (const op of entry.grant.contracts) this.opRoute.set(op, entry.id);
    for (const [op, risk] of riskyOps(manifest)) this.opRisk.set(op, risk);
    for (const [cap, token] of Object.entries(tokens)) this.tokens.set(token, { token, pluginId: entry.id, cap, gen: this.generation });
    handle.onMessage((m) => this.onWorkerMessage(entry.id, m));
    handle.onCrash(() => this.failInflight(entry.id, `compartment ${entry.id} crashed`));
  }

  mintTokensFor(entry: CompositionEntry): Record<string, string> {
    const tokens: Record<string, string> = {};
    for (const cap of entry.grant.capabilities) {
      tokens[cap] = mintToken();
      // alias host ops to their guarding capability's token so compartments address them by op
      for (const [op, capName] of Object.entries(HOST_OP_TO_CAP)) if (capName === cap) tokens[`port:${op}`] = tokens[cap];
    }
    return tokens;
  }

  /** B3 structural check: token exists, belongs to sender, covers the op, and generation is current. */
  private checkToken(pluginId: string, token: string, op: string): PortResult | null {
    const rec = this.tokens.get(token);
    if (!rec) return { ok: false, error: "REFUSED", detail: "unknown capability token" };
    if (rec.gen < this.generation) return { ok: false, error: "REVOKED", detail: `generation ${rec.gen} revoked (current ${this.generation})` };
    if (rec.pluginId !== pluginId) return { ok: false, error: "REFUSED", detail: "token not issued to this compartment" };
    if (this.isHostOp(op)) {
      if (rec.cap !== this.hostCapFor(op)) return { ok: false, error: "SCOPE", detail: `op ${op} requires ${this.hostCapFor(op)}` };
      return null;
    }
    const needed = `port:${op}`;
    if (rec.cap !== needed) return { ok: false, error: "SCOPE", detail: `op ${op} requires capability ${needed}` };
    return null;
  }

  private isHostOp(op: string): boolean { return Object.values(HOST_OPS).includes(op as never); }
  private hostCapFor(op: string): string { return HOST_OP_TO_CAP[op] ?? ""; }

  private nextCausation(): string { return `c_${++this.callSeq}`; }

  /** Compartment-originated messages: `return` resolves a pending deliver; `call` is a new op request (B3-checked); `ready` flips state. */
  private onWorkerMessage(pluginId: string, m: FromWorker): void {
    if (m.type === "return") {
      const p = this.pending.get(m.causationId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(m.causationId);
        this.decInflight(pluginId, m.causationId);
        p.resolve(m.result);
      }
      return;
    }
    if (m.type === "call") { void this.compartmentCall(pluginId, m); return; }
    if (m.type === "ready") {
      const h = this.compartments.get(pluginId);
      if (h && h.state === "booting") h.state = "active";
      return;
    }
  }

  private async compartmentCall(callerId: string, m: CallMsg): Promise<void> {
    const fail = (r: PortResult) => this.compartments.get(callerId)?.post({ type: "result", callId: m.callId, causationId: "n/a", result: r });
    const structural = this.checkToken(callerId, m.capabilityToken, m.op);
    if (structural) { fail(structural); return; }
    if (this.isHostOp(m.op)) { const r = await this.hostOp(callerId, m.op, m.payload); fail(r); return; }
    const causationId = this.nextCausation();
    const result = await this.dispatch(callerId, m.op, m.payload, m.deadlineMs, causationId, m.capabilityToken);
    fail(result);
  }

  /** The Gate → Resolve → Execute step for a structurally-valid call. Risk gating is data-driven. */
  private async dispatch(principal: string, op: string, payload: unknown, deadlineMs: number, causationId: string, token: string): Promise<PortResult> {
    const target = this.opRoute.get(op);
    if (!target) return { ok: false, error: "REFUSED", detail: `no routed implementation for ${op}` };
    const targetHandle = this.compartments.get(target);
    if (!targetHandle || targetHandle.state === "stopped" || targetHandle.state === "degraded") {
      return { ok: false, error: "DEGRADED", detail: `implementation ${target} is ${targetHandle?.state ?? "absent"}` };
    }
    const risk = this.opRisk.get(op);
    if (risk) {
      const gate = await this.callLaw(principal, op, payload, causationId);
      if (!gate.ok) return gate;
      const decision = gate.value as LawDecision;
      if (decision.decision === "deny") { this.journal({ principal, op, decision: "deny", reason: decision.reason, causationId }); return { ok: false, error: "REFUSED", detail: `denied by law: ${decision.reason ?? ""}` }; }
      if (decision.decision === "require-consent") { this.journal({ principal, op, decision: "require-consent", reason: decision.reason, consentId: decision.consentId, causationId }); return { ok: false, error: "REFUSED", detail: `consent required${decision.consentId ? `: ${decision.consentId}` : ""}` }; }
      this.journal({ principal, op, decision: "allow", reason: decision.reason, causationId });
    }
    const deadlineAbs = deadlineMs > 0 ? Date.now() + deadlineMs : 0;
    return this.deliver(target, { type: "deliver", causationId, op, payload, deadlineMs, from: principal });
  }

  /** law.check is itself never gated (it IS the gate) — the one loop exception, by construction. */
  private async callLaw(principal: string, op: string, payload: unknown, causationId: string): Promise<PortResult> {
    const lawId = this.opRoute.get("law.check@1");
    if (!lawId) return { ok: false, error: "DEGRADED", detail: "law.check@1 not routed — refusing risky op (fail-closed)" };
    return this.deliver(lawId, { type: "deliver", causationId, op: "law.check@1", payload: { principal, op, payload, causationId }, deadlineMs: 500, from: "µhost-gate" });
  }

  deliver(targetId: string, msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string }): Promise<PortResult> {
    const handle = this.compartments.get(targetId);
    if (!handle) return Promise.resolve({ ok: false, error: "REFUSED", detail: `no compartment ${targetId}` });
    handle.stats.delivered++;
    return new Promise<PortResult>((resolve) => {
      const key = msg.causationId;
      const timer = msg.deadlineMs > 0 ? setTimeout(() => {
        if (this.pending.delete(key)) { this.decInflight(targetId, key); resolve({ ok: false, error: "BUDGET", detail: `deadline ${msg.deadlineMs}ms exceeded (op ${msg.op})` }); }
      }, msg.deadlineMs) : null;
      this.pending.set(key, { resolve, timer });
      this.incInflight(targetId, key);
      handle.post(msg);
    });
  }

  /** Host-internal transport ops (spawn/terminate/stats/journal/revoke) — capability-gated above. */
  private async hostOp(callerId: string, op: string, payload: unknown): Promise<PortResult> {
    switch (op) {
      case HOST_OPS.compartmentStats: {
        const stats: Record<string, unknown> = {};
        for (const [id, h] of this.compartments) stats[id] = { state: h.state, ...h.stats, inflight: this.inflightByCompartment.get(id)?.size ?? 0 };
        return { ok: true, value: stats };
      }
      case HOST_OPS.compartmentTerminate: {
        const { pluginId } = payload as { pluginId: string };
        const h = this.compartments.get(pluginId);
        if (!h) return { ok: false, error: "SCOPE", detail: `unknown compartment ${pluginId}` };
        this.failInflight(pluginId, `terminated by ${callerId}`);
        await h.terminate();
        return { ok: true, value: { terminated: pluginId } };
      }
      case HOST_OPS.compartmentSpawn: {
        // restart of an existing recipe entry (vivim.run governs policy; host provides transport)
        const { pluginId } = payload as { pluginId: string };
        return { ok: false, error: "REFUSED", detail: `compartment.spawn of '${pluginId}' requires reboot via recipe (v1: restart = reboot composition)` };
      }
      case HOST_OPS.journalAppend: {
        this.journal(payload as Record<string, unknown>);
        return { ok: true, value: { appended: true } };
      }
      case HOST_OPS.tokensRevoke: {
        const { pluginId } = payload as { pluginId?: string };
        // Revocation by generation bump: outstanding tokens stay in the table and now fail
        // with the distinct REVOKED register (attributable), instead of vanishing (REFUSED).
        this.generation++;
        let affected = 0;
        for (const rec of this.tokens.values()) if (!pluginId || rec.pluginId === pluginId) affected++;
        this.journal({ principal: callerId, op: "host.tokens.revoke", decision: "allow", reason: `generation bumped to ${this.generation}`, affected, scope: pluginId ?? "all" });
        return { ok: true, value: { generation: this.generation, affectedTokens: affected } };
      }
      default: return { ok: false, error: "REFUSED", detail: `unknown host op ${op}` };
    }
  }

  /** Root principal (host-held, e.g. the CLI): no token needed — the host IS the caller — but risky ops still pass the law gate. */
  async callAsRoot(op: string, payload: unknown, deadlineMs = 5000): Promise<PortResult> {
    if (this.isHostOp(op)) return this.hostOp("root", op, payload);
    const causationId = this.nextCausation();
    return this.dispatch("root", op, payload, deadlineMs, causationId, "root");
  }

  journal(entry: Record<string, unknown>): void {
    if (!this.opts.journal) return;
    try { appendFileSync(this.journalPath, JSON.stringify({ ts: Date.now(), ...entry }) + "\n"); } catch { /* journal best-effort, never blocks */ }
  }

  private incInflight(id: string, key: string) { (this.inflightByCompartment.get(id) ?? this.inflightByCompartment.set(id, new Set()).get(id)!).add(key); }
  private decInflight(id: string, key: string) { this.inflightByCompartment.get(id)?.delete(key); }

  private failInflight(pluginId: string, reason: string): void {
    const keys = this.inflightByCompartment.get(pluginId);
    if (!keys) return;
    for (const key of [...keys]) {
      const p = this.pending.get(key);
      if (p) { clearTimeout(p.timer); this.pending.delete(key); p.resolve({ ok: false, error: "DEGRADED", detail: reason }); }
    }
    keys.clear();
  }

  async shutdown(): Promise<void> {
    for (const h of this.compartments.values()) await h.terminate().catch(() => {});
  }

  status(): { compartments: Record<string, unknown>; generation: number; routedOps: string[] } {
    const compartments: Record<string, unknown> = {};
    for (const [id, h] of this.compartments) compartments[id] = { state: h.state, ...h.stats };
    return { compartments, generation: this.generation, routedOps: [...this.opRoute.keys()] };
  }
}

export function buildRoutingTable(recipe: Recipe, manifests: Map<string, PluginManifest>): { opRoute: Map<string, string>; errors: string[] } {
  const opRoute = new Map<string, string>();
  const errors: string[] = [];
  for (const e of recipe.composition) {
    const m = manifests.get(e.id);
    if (!m) { errors.push(`no manifest for entry ${e.id}`); continue; }
    const ops = routableOps(m);
    for (const declared of e.grant.contracts) {
      if (!ops.includes(declared)) errors.push(`${e.id} granted routed op ${declared} but its manifest does not declare it`);
      else opRoute.set(declared, e.id);
    }
    // light dependency check (full resolution happens at compile/composition time)
    for (const dep of m.dependencies) {
      if (dep.ref.startsWith("contract:")) {
        const want = dep.ref.slice("contract:".length);
        if (!recipe.composition.some((x) => x.grant.contracts.includes(want))) errors.push(`${e.id} dependency ${dep.ref} unsatisfied in composition`);
      }
    }
  }
  return { opRoute, errors };
}
