// µhost — ports.ts: the Port Router. B3: capability tokens are verified HERE, in the host
// process, outside every compartment. Risk gating is data-driven (manifest CONTRACT risk
// declarations) — no policy lives in the host; law.check is a plugin call.
// D-340: the router carries the kernel (graph + chain + arbiter + tool registry) when
// boot attaches one; a kernel-less router (bare test rigs) keeps v1 Map routing.
import type { LawDecision, PortResult, PluginManifest, CompositionEntry, Recipe } from "@vivim/omega-contracts";
import { routableOps, riskyOps, HOST_OPS, HOST_CAPS } from "@vivim/omega-contracts";
export { HOST_OPS, HOST_CAPS };
import type { CompartmentHandle, FromWorker, CallMsg } from "./worker.ts";
import type { Kernel } from "./genesis.ts";
import { mintToken } from "./canon.ts";
import { appendFileSync } from "node:fs";

/** host op -> the capability that guards it (single source of truth for token aliasing). */
export const HOST_OP_TO_CAP: Record<string, string> = {
  [HOST_OPS.compartmentSpawn]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentTerminate]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentStats]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.journalAppend]: HOST_CAPS.journal,
  [HOST_OPS.tokensRevoke]: HOST_CAPS.tokensRevoke,
  [HOST_OPS.stateAcquire]: HOST_CAPS.stateArbitration, // D-340: the one non-plugin arbiter
  [HOST_OPS.stateRelease]: HOST_CAPS.stateArbitration,
  [HOST_OPS.graphSnapshot]: HOST_CAPS.kernelLens,       // D-340: the lens reads; it never authors
  [HOST_OPS.auditChain]: HOST_CAPS.kernelLens,
};

export interface TokenRecord { token: string; pluginId: string; cap: string; gen: number }

export interface RouterOptions { vaultDir: string; journal: boolean; kernel?: Kernel }

/** A verified-but-unspawned entry (D-331 lazy activation): everything needed
 *  for spawn-on-first-routed-call, minted at boot. Dormant is "never started"
 *  — distinct from "degraded" (started and unwell) in status() and stats. */
export interface DormantEntry {
  entry: CompositionEntry;
  manifest: PluginManifest;
  tokens: Record<string, string>;
  srcDir: string;
  entryFile: string;
  config?: Record<string, unknown>;
}

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
  private dormant = new Map<string, DormantEntry>(); // verified, never started (D-331)
  private spawning = new Map<string, Promise<void>>(); // singleflight per dormant id
  /** D-340: the kernel this router carries (graph/chain/arbiter/tools). Attached at
   *  boot via RouterOptions — dispatch consults it when present. Public read-only
   *  surface for tests/operators; the lens consumes snapshots via host ops. */
  readonly kernel: Kernel | null;
  /** Injected by boot.ts: spawn + register + init-post one dormant id. */
  onDemandSpawn: ((id: string) => Promise<void>) | null = null;
  journalPath: string;

  constructor(private opts: RouterOptions) {
    this.journalPath = `${opts.vaultDir}/law-journal.jsonl`;
    this.kernel = opts.kernel ?? null;
  }

  register(entry: CompositionEntry, manifest: PluginManifest, handle: CompartmentHandle, tokens: Record<string, string>): void {
    this.compartments.set(entry.id, handle);
    this.manifests.set(entry.id, manifest);
    for (const op of entry.grant.contracts) this.opRoute.set(op, entry.id);
    for (const [op, risk] of riskyOps(manifest)) this.opRisk.set(op, risk);
    this.registerGraph(entry, manifest);
    // One record per token. Alias keys ("port:host.compartment.stats@1") and their guarding
    // capability ("host.compartment.admin") resolve to the SAME effective cap, so insertion
    // order can never change what a token authorizes (order-independence is a B3 invariant).
    for (const [key, token] of Object.entries(tokens)) {
      if (this.tokens.has(token)) continue;
      const aliasedOp = key.startsWith("port:") ? key.slice("port:".length) : null;
      const effectiveCap = aliasedOp && HOST_OP_TO_CAP[aliasedOp] ? HOST_OP_TO_CAP[aliasedOp] : key;
      this.tokens.set(token, { token, pluginId: entry.id, cap: effectiveCap, gen: this.generation });
    }
    handle.onMessage((m) => this.onWorkerMessage(entry.id, m));
    handle.onCrash(() => this.failInflight(entry.id, `compartment ${entry.id} crashed`));
  }

  /** Register a verified entry WITHOUT spawning (D-331): phase > 0 boots
   *  dormant; the first routed call spawns transparently. Tokens are minted
   *  at boot like eager entries (same authority, just deferred transport). */
  registerDormant(entry: CompositionEntry, manifest: PluginManifest, tokens: Record<string, string>, spawn: { srcDir: string; entryFile: string; config?: Record<string, unknown> }): void {
    this.manifests.set(entry.id, manifest);
    for (const op of entry.grant.contracts) this.opRoute.set(op, entry.id);
    for (const [op, risk] of riskyOps(manifest)) this.opRisk.set(op, risk);
    this.registerGraph(entry, manifest);
    for (const [key, token] of Object.entries(tokens)) {
      if (this.tokens.has(token)) continue;
      const aliasedOp = key.startsWith("port:") ? key.slice("port:".length) : null;
      const effectiveCap = aliasedOp && HOST_OP_TO_CAP[aliasedOp] ? HOST_OP_TO_CAP[aliasedOp] : key;
      this.tokens.set(token, { token, pluginId: entry.id, cap: effectiveCap, gen: this.generation });
    }
    this.dormant.set(entry.id, { entry, manifest, tokens, ...spawn });
  }

  /** Read-only peek for boot.ts's on-demand spawner (the spawn itself stays
   *  the host's: singleflight + register live in spawnDormant below). */
  peekDormant(id: string): DormantEntry | undefined {
    return this.dormant.get(id);
  }

  /** Spawn one dormant id (singleflight: concurrent first touches share one
   *  spawn; failures stay dormant so the next call retries fail-closed). */
  private async spawnDormant(id: string): Promise<void> {
    let p = this.spawning.get(id);
    if (!p) {
      p = (async () => {
        if (!this.dormant.has(id)) return;
        if (!this.onDemandSpawn) throw new Error(`dormant ${id} has no lazy spawner (fail-closed)`);
        await this.onDemandSpawn(id);
        this.dormant.delete(id);
      })().finally(() => {
        if (this.spawning.get(id) === p) this.spawning.delete(id);
      });
      this.spawning.set(id, p);
    }
    await p;
  }

  /** D-340: entries whose grants already landed in the graph — dormant registration
   *  and the later lazy-spawn register() must be IDEMPOTENT, or every first touch
   *  mints duplicate chain entries and edges. */
  private graphSeen = new Set<string>();

  /** D-340: every registration lands in the kernel graph with signed provenance —
   *  OFFER edges for routed contracts, HOLD edges for granted capabilities. The
   *  graph is compiled FROM the Recipe (grant source of truth stays the Recipe);
   *  it is the queryable form (requirements #1, #6, #7, #8). Idempotent per id. */
  private registerGraph(entry: CompositionEntry, manifest: PluginManifest): void {
    const k = this.kernel;
    if (!k) return; // kernel-less router (bare test rigs): v1 behavior, no graph
    if (this.graphSeen.has(entry.id)) return;
    this.graphSeen.add(entry.id);
    k.graph.upsertNode({
      id: entry.id, kind: "principal",
      granularity: manifest.granularity ?? "atomic",
      extractionCandidate: manifest.extractionCandidate,
    });
    for (const op of entry.grant.contracts) {
      k.graph.upsertNode({ id: op, kind: "capability" });
      k.graph.grant(entry.id, entry.id, op, k.audit.record(entry.id, entry.id, op), "offer");
      const at = op.lastIndexOf("@");
      k.tools.publish(at > 0 ? op.slice(0, at) : op, at > 0 ? op.slice(at + 1) : "1", entry.id);
    }
    for (const cap of entry.grant.capabilities) {
      const held = cap.startsWith("port:") ? cap.slice("port:".length) : cap;
      if (!k.graph.node(held)) k.graph.upsertNode({ id: held, kind: "capability" });
      k.graph.grant(entry.id, entry.id, held, k.audit.record(entry.id, entry.id, held), "hold");
    }
  }

  /** The op's tool name: "echo.ping@1" → "echo.ping" (generations key by name). */
  private opName(op: string): string {
    const at = op.lastIndexOf("@");
    return at > 0 ? op.slice(0, at) : op;
  }

  /** The caller's DECLARED range for a tool name, from its manifest dependencies —
   *  undefined when the caller declared nothing (fail-closed: no fallback for
   *  undeclared callers, v1 REFUSED semantics preserved — D-340 impl note b). */
  private callerRange(principal: string, op: string): string | undefined {
    const deps = this.manifests.get(principal)?.dependencies;
    if (!deps || deps.length === 0) return undefined;
    const name = this.opName(op);
    for (const d of deps) {
      if (d.ref === `contract:${op}` || d.ref === `contract:${name}` || this.opName(d.ref.replace(/^contract:/, "")) === name) {
        return d.range || "*";
      }
    }
    return undefined;
  }

  /** Resolution by query (D-340, kernel requirement #6): the graph answers routing.
   *  Exact routed op first (byte-identical with v1 for every existing composition);
   *  when several offerors hold the exact op, the caller's declared range picks the
   *  generation; when NO offeror holds the exact op, generation resolution by name +
   *  DECLARED range — the seam that makes live upgrades and atomization additive
   *  instead of a breaking edit. Returns the target compartment AND the effective
   *  op string (the offeror's handler key when a generation fallback happened —
   *  the caller asked for a vanished version; the compatible generation answers).
   *  The returned pair is held by the dispatch frame for the full call — that held
   *  reference IS the per-execution generation pin (kernel requirement #9): a
   *  generation published mid-flight never yanks it. */
  private resolveTarget(principal: string, op: string): { impl: string; op: string } | undefined {
    if (!this.kernel) {
      const t = this.opRoute.get(op);
      return t ? { impl: t, op } : undefined;
    }
    const k = this.kernel;
    const offerors = k.graph.whoOffers(op);
    if (offerors.length > 0) {
      if (offerors.length === 1) return { impl: offerors[0], op };
      const pin = k.tools.resolve(this.opName(op), this.callerRange(principal, op) ?? "*");
      if (pin && offerors.includes(pin.impl)) return { impl: pin.impl, op: `${this.opName(op)}@${pin.version}` };
      return { impl: offerors[offerors.length - 1], op };
    }
    const range = this.callerRange(principal, op);
    if (range === undefined) return undefined; // undeclared caller: v1 REFUSED semantics, fail-closed
    const pin = k.tools.resolve(this.opName(op), range);
    if (!pin) return undefined;
    return { impl: pin.impl, op: `${this.opName(op)}@${pin.version}` };
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

  /** The Gate → Resolve → Execute step for a structurally-valid call. Risk gating is
   *  data-driven and gates the EFFECTIVE op (a generation fallback resolves to the
   *  offeror's actual op — the risk of the work actually being done governs). */
  private async dispatch(principal: string, op: string, payload: unknown, deadlineMs: number, causationId: string, token: string): Promise<PortResult> {
    const resolved = this.resolveTarget(principal, op);
    if (!resolved) return { ok: false, error: "REFUSED", detail: `no routed implementation for ${op}` };
    const risk = this.opRisk.get(resolved.op);
    if (risk) {
      const gate = await this.callLaw(principal, resolved.op, payload, causationId);
      if (!gate.ok) return gate;
      const decision = gate.value as LawDecision;
      if (decision.decision === "deny") { this.journal({ principal, op: resolved.op, decision: "deny", reason: decision.reason, causationId }); return { ok: false, error: "REFUSED", detail: `denied by law: ${decision.reason ?? ""}` }; }
      if (decision.decision === "require-consent") { this.journal({ principal, op: resolved.op, decision: "require-consent", reason: decision.reason, consentId: decision.consentId, causationId }); return { ok: false, error: "REFUSED", detail: `consent required${decision.consentId ? `: ${decision.consentId}` : ""}` }; }
      this.journal({ principal, op: resolved.op, decision: "allow", reason: decision.reason, causationId });
    }
    // D-331: a dormant target spawns on first touch — AFTER the gate, so a
    // refused call never pays a spawn. Transparent thereafter: the caller
    // cannot tell a just-spawned compartment from an eager one.
    if (!this.compartments.has(resolved.impl) && this.dormant.has(resolved.impl)) {
      try {
        await this.spawnDormant(resolved.impl);
      } catch (e) {
        return { ok: false, error: "DEGRADED", detail: `dormant ${resolved.impl} failed to spawn on first touch: ${String(e)}` };
      }
    }
    const targetHandle = this.compartments.get(resolved.impl);
    if (!targetHandle || targetHandle.state === "stopped" || targetHandle.state === "degraded") {
      return { ok: false, error: "DEGRADED", detail: `implementation ${resolved.impl} is ${targetHandle?.state ?? "absent"}` };
    }
    return this.deliver(resolved.impl, { type: "deliver", causationId, op: resolved.op, payload, deadlineMs, from: principal });
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
        // D-331: dormant ids report state "dormant" with zero counters — the
        // health loop (and operators) tell "never started" apart from
        // "started and unwell" without a second source.
        for (const id of this.dormant.keys()) {
          if (!(id in stats)) {
            stats[id] = { state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: 0, inflight: 0 };
          }
        }
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
      case HOST_OPS.stateAcquire: {
        // D-340 (kernel requirement #3): the one non-plugin arbiter. Fail-closed: a
        // conflicting acquisition is REFUSED naming the holders — policy (retry,
        // backpressure) stays outside the host.
        if (!this.kernel) return { ok: false, error: "DEGRADED", detail: "no kernel attached" };
        const { key, mode } = payload as { key?: string; mode?: string };
        if (typeof key !== "string" || !key) return { ok: false, error: "SCOPE", detail: "state.acquire requires a key" };
        const m: "shared" | "exclusive" = mode === "shared" ? "shared" : "exclusive";
        const r = this.kernel.state.tryAcquire(key, callerId, m);
        return r.ok ? { ok: true, value: { key, mode: m, holder: callerId } } : { ok: false, error: "REFUSED", detail: r.error };
      }
      case HOST_OPS.stateRelease: {
        if (!this.kernel) return { ok: false, error: "DEGRADED", detail: "no kernel attached" };
        const { key } = payload as { key?: string };
        if (typeof key !== "string" || !key) return { ok: false, error: "SCOPE", detail: "state.release requires a key" };
        this.kernel.state.release(key, callerId);
        return { ok: true, value: { released: key, by: callerId } };
      }
      case HOST_OPS.graphSnapshot: {
        // D-340: READ surface for the kernel-lens — a copy-out snapshot, never a
        // live handle into host state (the lens reports, it never authors).
        if (!this.kernel) return { ok: false, error: "DEGRADED", detail: "no kernel attached" };
        return { ok: true, value: this.kernel.graph.snapshot() };
      }
      case HOST_OPS.auditChain: {
        // D-340: the chain copy-out WITH the host-computed verdict — one canonical
        // verifyJson, never duplicated into a compartment (impl note c).
        if (!this.kernel) return { ok: false, error: "DEGRADED", detail: "no kernel attached" };
        return { ok: true, value: this.kernel.audit.export() };
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

  status(): { compartments: Record<string, unknown>; dormant: string[]; generation: number; routedOps: string[] } {
    const compartments: Record<string, unknown> = {};
    for (const [id, h] of this.compartments) compartments[id] = { state: h.state, ...h.stats };
    return { compartments, dormant: [...this.dormant.keys()].sort(), generation: this.generation, routedOps: [...this.opRoute.keys()] };
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
