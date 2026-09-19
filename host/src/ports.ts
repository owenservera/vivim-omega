// µhost ports.ts: Port Router (B3 tokens verified here; risk data-driven; D-340 kernel when attached).
import type { LawDecision, PortResult, PluginManifest, CompositionEntry, Recipe, StreamChunk, RefusalReport, PortPriority } from "@vivim/omega-contracts";
import { routableOps, riskyOps, HOST_OPS, HOST_CAPS } from "@vivim/omega-contracts";
export { HOST_OPS, HOST_CAPS };
// Single definition (contracts/src/lifecycle.ts): the router owns enforcement, never the mapping.
import { HOST_OP_TO_CAP } from "@vivim/omega-contracts";
export { HOST_OP_TO_CAP };
import type { CompartmentHandle, FromWorker, CallMsg } from "./worker.ts";
import type { Worker } from "node:worker_threads";
import type { Kernel } from "./genesis.ts";
import { mintToken } from "./canon.ts";
import { appendFileSync } from "node:fs";

export interface TokenRecord { token: string; pluginId: string; cap: string; gen: number; revoked?: boolean }

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
  private pending = new Map<string, { resolve: (r: PortResult) => void; timer: ReturnType<typeof setTimeout>; onChunk?: (c: StreamChunk) => void }>();
  private inflightByCompartment = new Map<string, Set<string>>();
  private waiting = new Map<string, Array<{ targetId: string; msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string }; onChunk?: (c: StreamChunk) => void; resolve: (r: PortResult) => void; priority: PortPriority; at: number }>>();
  private opPriority = new Map<string, PortPriority>();
  private dormant = new Map<string, DormantEntry>(); // verified, never started (D-331)
  private spawning = new Map<string, Promise<void>>(); // singleflight per dormant id
  /** D-363: pending ready-waiters per compartment id — the `ready` message resolves them directly (no polling). */
  private readyWaiters = new Map<string, Set<{ resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>>();
  /** D-340: the kernel this router carries (graph/chain/arbiter/tools). Attached at
   *  boot via RouterOptions — dispatch consults it when present. Public read-only
   *  surface for tests/operators; the lens consumes snapshots via host ops. */
  readonly kernel: Kernel | null;
  /** D-340: entries whose grants already landed in the graph — dormant registration
   *  and the later lazy-spawn register() must be IDEMPOTENT, or every first touch
   *  mints duplicate chain entries and edges. */
  private graphSeen = new Set<string>();
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
    for (const c of manifest.contributions.contract ?? []) this.opPriority.set(`${c.id}@${c.version}`, c.priority ?? "normal");
    this.registerGraph(entry, manifest);
    this.installTokens(entry.id, tokens);
    handle.onMessage((m) => this.onWorkerMessage(entry.id, m));
    handle.onCrash(() => this.failInflight(entry.id, `compartment ${entry.id} crashed`));
  }

  /** One record per token. Alias keys ("port:host.compartment.stats@1") and their guarding
   *  capability resolve to the SAME effective cap — insertion order never changes authority (B3). */
  private installTokens(pluginId: string, tokens: Record<string, string>): void {
    for (const [key, token] of Object.entries(tokens)) {
      if (this.tokens.has(token)) continue;
      const aliasedOp = key.startsWith("port:") ? key.slice("port:".length) : null;
      const effectiveCap = aliasedOp && HOST_OP_TO_CAP[aliasedOp] ? HOST_OP_TO_CAP[aliasedOp] : key;
      this.tokens.set(token, { token, pluginId, cap: effectiveCap, gen: this.generation });
    }
  }

  /** Register a verified entry WITHOUT spawning (D-331): phase > 0 boots
   *  dormant; the first routed call spawns transparently. Tokens are minted
   *  at boot like eager entries (same authority, just deferred transport). */
  registerDormant(entry: CompositionEntry, manifest: PluginManifest, tokens: Record<string, string>, spawn: { srcDir: string; entryFile: string; config?: Record<string, unknown> }): void {
    this.manifests.set(entry.id, manifest);
    for (const op of entry.grant.contracts) this.opRoute.set(op, entry.id);
    for (const [op, risk] of riskyOps(manifest)) this.opRisk.set(op, risk);
    for (const c of manifest.contributions.contract ?? []) this.opPriority.set(`${c.id}@${c.version}`, c.priority ?? "normal");
    this.registerGraph(entry, manifest);
    this.installTokens(entry.id, tokens);
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

  /** D-340 graph registration (see record): OFFER+HOLD, idempotent per id. */
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

  /** Declared range or undefined fail-closed (D-340 impl note b, see record). */
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

  /** D-340 query resolution + generation pin (see record). */
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

  /** B3 structural check: token exists, belongs to sender, covers the op, and is not revoked.
   *  Ownership is checked BEFORE revocation state (D-384): a token belonging to a different
   *  plugin reports REFUSED (what it is) — never REVOKED (what it used to be), so error
   *  registers carry no stale-vs-foreign distinction to a caller holding a leaked token. */
  private checkToken(pluginId: string, token: string, op: string): PortResult | null {
    const rec = this.tokens.get(token);
    if (!rec) return { ok: false, error: "REFUSED", detail: "unknown capability token" };
    if (rec.pluginId !== pluginId) return { ok: false, error: "REFUSED", detail: "token not issued to this compartment" };
    if (rec.revoked) return { ok: false, error: "REVOKED", detail: "token revoked" };
    if (rec.gen < this.generation) return { ok: false, error: "REVOKED", detail: `generation ${rec.gen} revoked (current ${this.generation})` };
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

  /** Compartment-originated messages: `return` resolves a pending deliver; `chunk` relays an ordered partial to its sink — or drops it (D-352 cold fallback: a caller that never asked to stream observes nothing); `call` is a new op request (B3-checked); `ready` flips state. */
  private onWorkerMessage(pluginId: string, m: FromWorker): void {
    if (m.type === "chunk") { this.pending.get(m.causationId)?.onChunk?.(m.chunk); return; }
    if (m.type === "return") {
      const p = this.pending.get(m.causationId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(m.causationId);
        this.release(pluginId, m.causationId);
        p.resolve(m.result);
      }
      return;
    }
    if (m.type === "call") { void this.compartmentCall(pluginId, m); return; }
    if (m.type === "ready") {
      const h = this.compartments.get(pluginId);
      if (h && h.state === "booting") h.state = "active";
      this.wakeReady(pluginId);
      return;
    }
  }

  /** D-363 ready event (see record): immediate if active, else via ready message. */
  waitActive(id: string, timeoutMs = 10_000): Promise<void> {
    const h = this.compartments.get(id);
    if (h?.state === "active") return Promise.resolve();
    if (h?.state === "degraded") return Promise.reject(new Error(`compartment ${id} degraded before ready`));
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null as unknown as ReturnType<typeof setTimeout> };
      w.timer = setTimeout(() => { this.readyWaiters.get(id)?.delete(w); reject(new Error(`compartment ${id} not active within ${timeoutMs}ms`)); }, timeoutMs);
      if (!this.readyWaiters.has(id)) this.readyWaiters.set(id, new Set());
      this.readyWaiters.get(id)!.add(w);
    });
  }

  private wakeReady(id: string, err?: Error): void {
    const set = this.readyWaiters.get(id);
    if (!set) return;
    this.readyWaiters.delete(id);
    for (const w of set) { clearTimeout(w.timer); err ? w.reject(err) : w.resolve(); }
  }

  /** D-360 raw worker for out-of-tree watchdog (see record). */
  compartmentWorker(id: string): Worker | undefined { return this.compartments.get(id)?.worker; }

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
  private async dispatch(principal: string, op: string, payload: unknown, deadlineMs: number, causationId: string, token: string, onChunk?: (c: StreamChunk) => void): Promise<PortResult> {
    const resolved = this.resolveTarget(principal, op);
    if (!resolved) return { ok: false, error: "REFUSED", detail: `no routed implementation for ${op}` };
    const risk = this.opRisk.get(resolved.op);
    if (risk) {
      const gate = await this.callLaw(principal, resolved.op, payload, causationId);
      if (!gate.ok) return gate;
      const decision = gate.value as LawDecision;
      if (decision.decision === "deny") { this.journal({ principal, op: resolved.op, decision: "deny", reason: decision.reason, causationId }); return { ok: false, error: "REFUSED", detail: `denied by law: ${decision.reason ?? ""}`, refusal: { rule: "law.check@1", principal, op: resolved.op, reason: decision.reason } satisfies RefusalReport }; }
      if (decision.decision === "require-consent") { this.journal({ principal, op: resolved.op, decision: "require-consent", reason: decision.reason, consentId: decision.consentId, causationId }); return { ok: false, error: "REFUSED", detail: `consent required${decision.consentId ? `: ${decision.consentId}` : ""}`, refusal: { rule: "law.check@1", principal, op: resolved.op, reason: decision.reason, ...(decision.consentId !== undefined ? { consentId: decision.consentId } : {}) } satisfies RefusalReport }; }
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
    return this.deliver(resolved.impl, { type: "deliver", causationId, op: resolved.op, payload, deadlineMs, from: principal }, onChunk);
  }

  /** law.check is itself never gated (it IS the gate) — the one loop exception, by construction. */
  private async callLaw(principal: string, op: string, payload: unknown, causationId: string): Promise<PortResult> {
    const lawId = this.opRoute.get("law.check@1");
    if (!lawId) return { ok: false, error: "DEGRADED", detail: "law.check@1 not routed — refusing risky op (fail-closed)" };
    return this.deliver(lawId, { type: "deliver", causationId, op: "law.check@1", payload: { principal, op, payload, causationId }, deadlineMs: 500, from: "µhost-gate" });
  }

  private maxInflight(targetId: string): number { return this.manifests.get(targetId)?.runtime?.budget?.maxConcurrentCalls ?? 4; }
  deliver(targetId: string, msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string }, onChunk?: (c: StreamChunk) => void): Promise<PortResult> {
    if (!this.compartments.get(targetId)) return Promise.resolve({ ok: false, error: "REFUSED", detail: `no compartment ${targetId}` });
    const priority = this.opPriority.get(msg.op) ?? (msg.op === "law.check@1" ? "gate" : "normal");
    return new Promise<PortResult>((resolve) => this.enqueue({ targetId, msg, onChunk, resolve, priority, at: Date.now() }));
  }
  private enqueue(item: { targetId: string; msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string }; onChunk?: (c: StreamChunk) => void; resolve: (r: PortResult) => void; priority: PortPriority; at: number }): void {
    if ((this.inflightByCompartment.get(item.targetId)?.size ?? 0) < this.maxInflight(item.targetId)) { this.admit(item); return; }
    const q = this.waiting.get(item.targetId) ?? [];
    const idx = q.findIndex((w) => w.priority === "normal" && item.priority === "gate");
    q.splice(idx === -1 ? q.length : idx, 0, item);
    this.waiting.set(item.targetId, q);
  }
  private admit(item: { targetId: string; msg: { type: "deliver"; causationId: string; op: string; payload: unknown; deadlineMs: number; from: string }; onChunk?: (c: StreamChunk) => void; resolve: (r: PortResult) => void; priority: PortPriority; at: number }): void {
    const waited = Date.now() - item.at;
    if (item.msg.deadlineMs > 0 && waited >= item.msg.deadlineMs) { item.resolve({ ok: false, error: "BUDGET", detail: `deadline ${item.msg.deadlineMs}ms exceeded in queue (op ${item.msg.op})` }); this.release(item.targetId, ""); return; }
    const handle = this.compartments.get(item.targetId)!;
    handle.stats.delivered++;
    const key = item.msg.causationId;
    const remain = item.msg.deadlineMs > 0 ? item.msg.deadlineMs - waited : 0;
    const timer = item.msg.deadlineMs > 0 ? setTimeout(() => {
      if (this.pending.delete(key)) { this.release(item.targetId, key); item.resolve({ ok: false, error: "BUDGET", detail: `deadline ${item.msg.deadlineMs}ms exceeded (op ${item.msg.op})` }); }
    }, remain) : null;
    this.pending.set(key, { resolve: item.resolve, timer: timer!, ...(item.onChunk ? { onChunk: item.onChunk } : {}) });
    this.incInflight(item.targetId, key);
    handle.post(item.msg);
  }
  private release(targetId: string, key: string): void {
    this.decInflight(targetId, key);
    const next = this.waiting.get(targetId)?.shift();
    if (next) this.admit(next);
  }

  /** Host-internal transport ops (spawn/terminate/stats/journal/revoke/state/graph/audit) — capability-gated above. */
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
        const { pluginId, fast } = payload as { pluginId: string; fast?: boolean };
        const h = this.compartments.get(pluginId);
        if (!h) return { ok: false, error: "SCOPE", detail: `unknown compartment ${pluginId}` };
        this.failInflight(pluginId, `terminated by ${callerId}${fast ? " (fast)" : ""}`);
        if (fast) await h.terminateFast();
        else await h.terminate();
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
        // D-384: scoped revoke is SCOPED. The old unconditional generation bump turned
        // "quarantine one plugin" into "revoke every token in the composition" (the
        // pluginId argument only shaped the journal). The ConsentTable pattern — per-record
        // revocation state — is the fix: matching records flip, everything else keeps
        // working. The generation bump is reserved for the explicit revoke-all case.
        const { pluginId } = payload as { pluginId?: string };
        let affected = 0;
        if (pluginId) {
          for (const rec of this.tokens.values()) {
            if (rec.pluginId === pluginId && !rec.revoked) { rec.revoked = true; affected++; }
          }
        } else {
          // Revoke-all: outstanding tokens stay in the table and now fail with the
          // distinct REVOKED register (attributable), instead of vanishing (REFUSED).
          this.generation++;
          for (const rec of this.tokens.values()) if (!rec.revoked) { rec.revoked = true; affected++; }
        }
        this.journal({ principal: callerId, op: "host.tokens.revoke", decision: "allow", reason: pluginId ? `scoped revoke: ${affected} token(s) of ${pluginId}` : `revoke-all: generation bumped to ${this.generation}`, affected, scope: pluginId ?? "all" });
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

  /** D-352 the streaming root call — the ONLY host surface the primitive adds
   *  (D-329 placement law): ordered chunks flow to `onChunk`, the terminating
   *  PortResult stays the single authoritative outcome, and the stream id IS
   *  the delivering call's causation id (one stream per call, by construction). */
  async callAsRootStream(op: string, payload: unknown, onChunk: (c: StreamChunk) => void, deadlineMs = 5000): Promise<{ streamId: string; result: PortResult }> {
    if (this.isHostOp(op)) return { streamId: "n/a", result: await this.hostOp("root", op, payload) };
    const causationId = this.nextCausation();
    const result = await this.dispatch("root", op, payload, deadlineMs, causationId, "root", onChunk);
    return { streamId: causationId, result };
  }

  journal(entry: Record<string, unknown>): void {
    if (!this.opts.journal) return;
    try { appendFileSync(this.journalPath, JSON.stringify({ ts: Date.now(), ...entry }) + "\n"); } catch { /* journal best-effort, never blocks */ }
  }

  private incInflight(id: string, key: string) { (this.inflightByCompartment.get(id) ?? this.inflightByCompartment.set(id, new Set()).get(id)!).add(key); }
  private decInflight(id: string, key: string) { this.inflightByCompartment.get(id)?.delete(key); }

  private failInflight(pluginId: string, reason: string): void {
    this.wakeReady(pluginId, new Error(reason)); // D-363: a crash rejects boot waiters too
    for (const q of this.waiting.get(pluginId) ?? []) q.resolve({ ok: false, error: "DEGRADED", detail: reason });
    this.waiting.delete(pluginId);
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
