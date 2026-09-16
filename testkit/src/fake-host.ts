// @vivim/omega-testkit — fake-host.ts
// FakeHost: an IN-PROCESS router implementing the µhost's B1–B4 SEMANTICS without
// worker threads — same error registers, same risk-gating walk, same token law.
// It is a test double for plugin authors (fast, debuggable, no vault needed);
// the real host remains the only security boundary. Differential tests keep the
// two honest against each other: every observable behavior here MIRRORS the real
// host/shim pair, including the ones that look lenient (see init/throw notes).
//
// B1 only declared ops route (manifest-declared, def-provided handlers)
// B2 every call traverses this router — handlers get a PluginContext with a
//    port that routes back through FakeHost (no shared heap with internals)
// B3 tokens are checked HERE, outside the plugin: grant() mints, forged/borrowed/
//    revoked tokens fail with the distinct registers
// B4 risky ops walk the gate: law.check@1 if routed, else fail-closed defaults
//    (EXTERNAL_MUTATION → require-consent until .grantConsent; MUTATION → allow
//    + journal). With a law installed the LAW decides — consent then flows
//    through the law def, exactly like the real host.
//
// State fidelity notes (differential law — mirror the real pair, not a nicer world):
//  - a HANDLER throw returns the DEGRADED register but does NOT degrade the
//    compartment (the shim catches and returns; the worker stays alive);
//  - an onInit throw leaves the plugin ACTIVE (the shim sends `ready` either
//    way, "degraded-but-alive"); the failure is journaled as init-failed;
//  - `degrade()` is the crash/health observation surface (v1: a crashed
//    compartment never comes back — the only honest path to state "degraded").
import type { PluginDef, PluginContext } from "@vivim/omega-shim";
import type { PluginManifest, PortResult, LawDecision, LifecycleState, RiskClass, CompositionEntry, ConsentGrant, StreamChunk, StreamEmit, RefusalReport } from "@vivim/omega-contracts";
import { routableOps, riskyOps, HOST_OPS, HOST_CAPS, STREAM_SEQ_START } from "@vivim/omega-contracts";
// Single definition (contracts/src/consent.ts): the fake owns default-gate state, never derivation.
import { CONSENT_ID_RE, consentIdFor } from "@vivim/omega-contracts";
import { HOST_OP_TO_CAP } from "@vivim/omega-contracts";
import { mintToken } from "@vivim/omega-host";
export { CONSENT_ID_RE, consentIdFor };

/** Consent grant narrowing (mirrors the law's GrantOptions: unset = widest). */
export interface FakeConsentOptions { principal?: string; op?: string }

/** A full manifest OR a minimal stand-in (id + contributions) for hand-rolled fixtures. */
export type ManifestLike = PluginManifest | { id: string; contributions?: PluginManifest["contributions"] };

export interface InstallOptions {
  /** Capabilities GRANTED to this plugin (the recipe's grant — not the manifest's request). */
  capabilities?: string[];
  config?: Record<string, unknown>;
}

export interface CallOptions {
  principal?: string;   // default "root" (host-held caller; risky ops still gated)
  deadlineMs?: number;  // default 5000 — BUDGET law
  token?: string;       // required for non-root principals (B3)
  onChunk?: (c: StreamChunk) => void; // D-352: sink for ordered partials (absent ⇒ chunks dropped — cold fallback, mirrored from the host)
  causationId?: string; // pre-minted causation (callAsRootStream uses it so chunk.streamId === the returned streamId, exactly like the real host)
}

interface TokenRecord { token: string; pluginId: string; cap: string; gen: number }

interface ConsentRecord extends ConsentGrant { active: boolean; revokedAt?: number }

interface InstalledPlugin {
  id: string;
  def: PluginDef;
  manifest: PluginManifest;
  capabilities: string[];
  config: Record<string, unknown>;
  state: LifecycleState;
  ctx: PluginContext | null;
  tokenByKey: Map<string, string>; // grant key (cap or port:alias) -> token
  stats: { delivered: number; calls: number; errors: number; crashes: number; bootedAt: number };
}

function asManifest(like: ManifestLike, grantedCaps: string[]): PluginManifest {
  const base: PluginManifest = "manifestVersion" in like
    ? (like as PluginManifest)
    : {
        manifestVersion: "1",
        id: like.id,
        version: "0.0.0",
        entry: "src/index.ts",
        publisher: { keyId: "", signature: "" },
        contributions: like.contributions ?? {},
        dependencies: [],
        capabilities: { requested: grantedCaps },
        runtime: { tier: "worker-thread", budget: {} },
        contentHash: "",
      };
  return base;
}

export class FakeHost {
  private plugins = new Map<string, InstalledPlugin>();
  private opRoute = new Map<string, string>();  // op -> pluginId (B1)
  private opRisk = new Map<string, RiskClass>();
  private tokenIndex = new Map<string, TokenRecord>(); // token -> record (B3)
  private consents = new Map<string, ConsentRecord>();  // consentId -> grant (B4 ceremony)
  private generation = 1;
  private callSeq = 0;
  private journalEntries: Array<Record<string, unknown>> = [];

  /** Lifecycle states per plugin: staged → verified → active (→ degraded | quarantined | retired). */
  get states(): Record<string, LifecycleState> {
    const out: Record<string, LifecycleState> = {};
    for (const [id, p] of this.plugins) out[id] = p.state;
    return out;
  }

  /** The law journal (queryable copy): gate decisions, host-op events. */
  get journal(): Array<Record<string, unknown>> {
    return [...this.journalEntries];
  }

  /**
   * Install a plugin: register its manifest-declared ops (B1), risk map, build its
   * PluginContext, and run onInit. Lifecycle: staged → verified (ops registered) →
   * active (onInit resolved) | degraded (onInit threw). Op conflicts throw (fail-closed,
   * mirroring the host's composition invariant: an op is owned by exactly one entry).
   */
  async install(def: PluginDef, manifestLike: ManifestLike, opts: InstallOptions = {}): Promise<void> {
    const capabilities = opts.capabilities ?? asManifest(manifestLike, []).capabilities?.requested ?? [];
    const manifest = asManifest(manifestLike, capabilities);
    const rec: InstalledPlugin = {
      id: manifest.id,
      def,
      manifest,
      capabilities,
      config: opts.config ?? {},
      state: "staged",
      ctx: null,
      tokenByKey: new Map(),
      stats: { delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: Date.now() },
    };
    this.plugins.set(manifest.id, rec);

    // B1: ONLY manifest-declared routable ops become routable
    for (const op of routableOps(manifest)) {
      const prev = this.opRoute.get(op);
      if (prev !== undefined && prev !== manifest.id) {
        rec.state = "degraded";
        throw new Error(`routed op conflict: ${op} already owned by ${prev} (FakeHost refuses — an op is owned by exactly one entry)`);
      }
      this.opRoute.set(op, manifest.id);
    }
    for (const [op, risk] of riskyOps(manifest)) this.opRisk.set(op, risk);
    rec.state = "verified";

    // B2: the plugin's ONLY view of the world is this context + its port
    const self = this;
    rec.ctx = {
      manifest,
      capabilities,
      config: rec.config,
      port: {
        call: (op: string, payload?: unknown, callOpts?: { deadlineMs?: number }) => {
          const token = rec.tokenByKey.get(`port:${op}`) ?? "";
          if (!token) {
            return Promise.resolve({ ok: false, error: "REFUSED", detail: `no capability token for ${op}` } satisfies PortResult);
          }
          return self.call(op, payload, { principal: rec.id, token, deadlineMs: callOpts?.deadlineMs ?? 5000 });
        },
      },
      log: (...args: unknown[]) => { console.log(`[fakehost ${manifest.id}]`, ...args.map(String)); },
    };

    try {
      await rec.def.onInit?.(rec.ctx);
      rec.state = "active";
    } catch (e) {
      // MIRRORS the shim: onInit failure logs and sends `ready` anyway
      // ("degraded-but-alive; law/health machinery observes failures later") —
      // the compartment is ACTIVE; the failure is journaled, not hidden.
      rec.state = "active";
      rec.stats.errors++;
      this.journalEntries.push({ ts: Date.now(), principal: "µhost", op: "init-failed", pluginId: manifest.id, decision: "allow", reason: `onInit threw: ${String(e)}` });
    }
  }

  /**
   * Mint capability tokens for an installed plugin (B3). Aliases host ops to the
   * guarding capability's token — one record per token, exactly like the host's
   * mintTokensFor + register pair. Re-granting after a revoke issues fresh tokens.
   */
  grant(pluginId: string, caps: string[]): Record<string, string> {
    const rec = this.plugins.get(pluginId);
    if (!rec) throw new Error(`grant: no installed plugin ${pluginId}`);
    const out: Record<string, string> = {};
    for (const cap of caps) {
      const tok = mintToken();
      out[cap] = tok;
      rec.tokenByKey.set(cap, tok);
      this.tokenIndex.set(tok, { token: tok, pluginId, cap, gen: this.generation });
      for (const [op, capName] of Object.entries(HOST_OP_TO_CAP)) {
        if (capName === cap) {
          const aliasKey = `port:${op}`;
          out[aliasKey] = tok; // same token — the alias IS the capability (host invariant)
          rec.tokenByKey.set(aliasKey, tok);
        }
      }
    }
    return out;
  }

  /** Generation bump (mirrors host.tokens.revoke): outstanding tokens now fail REVOKED. */
  revoke(pluginId?: string): { generation: number; affectedTokens: number } {
    this.generation++;
    let affected = 0;
    for (const rec of this.tokenIndex.values()) if (!pluginId || rec.pluginId === pluginId) affected++;
    this.journalEntries.push({ ts: Date.now(), principal: "root", op: "host.tokens.revoke", decision: "allow", reason: `generation bumped to ${this.generation}`, affected, scope: pluginId ?? "all" });
    return { generation: this.generation, affectedTokens: affected };
  }

  /** Quarantine a plugin: state flips, its ops answer DEGRADED. */
  quarantine(pluginId: string): boolean {
    const rec = this.plugins.get(pluginId);
    if (!rec) return false;
    rec.state = "quarantined";
    this.journalEntries.push({ ts: Date.now(), principal: "µhost", op: "quarantine", pluginId, decision: "deny", reason: "quarantined by testkit" });
    return true;
  }

  /**
   * The crash/health observation surface: mark a plugin DEGRADED (v1 semantics —
   * a crashed compartment never comes back; its ops answer DEGRADED forever).
   * This is the honest path to state "degraded" in-process: handler throws do
   * NOT degrade (the shim returns a DEGRADED result, the worker stays alive).
   */
  degrade(pluginId: string, reason = "degraded via FakeHost.degrade()"): boolean {
    const rec = this.plugins.get(pluginId);
    if (!rec) return false;
    rec.state = "degraded";
    rec.stats.crashes++;
    this.journalEntries.push({ ts: Date.now(), principal: "µhost", op: "degrade", pluginId, decision: "deny", reason });
    return true;
  }

  /**
   * B4 consent ceremony for the fail-closed default gate (no law.check@1 routed):
   * grant the consent a refusal named and the next EXTERNAL_MUTATION call for a
   * matching (principal, op) proceeds. With a law installed, consent flows
   * through the law def — this table is the DEFAULT gate's law.
   */
  grantConsent(consentId: string, opts: FakeConsentOptions = {}): ConsentGrant {
    if (!CONSENT_ID_RE.test(consentId)) throw new Error(`grantConsent: malformed consent id "${consentId}" (expected consent_<16hex>)`);
    const rec: ConsentRecord = {
      consentId,
      ...(opts.principal ? { principal: opts.principal } : {}),
      ...(opts.op ? { scope: opts.op } : {}),
      grantedAt: Date.now(),
      active: true,
    };
    this.consents.set(consentId, rec);
    this.journalEntries.push({ ts: Date.now(), principal: "root", op: "consent.grant", decision: "allow", consentId, ...(opts.principal ? { grantPrincipal: opts.principal } : {}), ...(opts.op ? { grantOp: opts.op } : {}) });
    return { consentId, ...(opts.principal ? { principal: opts.principal } : {}), ...(opts.op ? { scope: opts.op } : {}), grantedAt: rec.grantedAt };
  }

  /** Revoke a consent grant: the gated op requires consent again. Returns true when an active grant was revoked. */
  revokeConsent(consentId: string): boolean {
    const rec = this.consents.get(consentId);
    if (!rec || !rec.active) return false;
    rec.active = false;
    rec.revokedAt = Date.now();
    this.journalEntries.push({ ts: Date.now(), principal: "root", op: "consent.revoke", decision: "allow", consentId });
    return true;
  }

  /** Root-principal convenience (mirrors host router.callAsRoot). */
  callAsRoot(op: string, payload?: unknown, deadlineMs = 5000): Promise<PortResult> {
    return this.call(op, payload, { principal: "root", deadlineMs });
  }

  /** D-352 differential mirror of the host router's streaming root call: mint
   *  the causation id first, deliver with the sink attached, return
   *  { streamId, result } — the stream id IS the delivering call's causation id. */
  async callAsRootStream(op: string, payload: unknown, onChunk: (c: StreamChunk) => void, deadlineMs = 5000): Promise<{ streamId: string; result: PortResult }> {
    const streamId = `c_${++this.callSeq}`;
    const result = await this.call(op, payload, { principal: "root", deadlineMs, onChunk, causationId: streamId });
    return { streamId, result };
  }

  /**
   * THE call path — Gate → Resolve → Execute with B1–B4 semantics:
   * token law (B3) → host ops → routing (B1) → risk gate (B4) → delivery (B2).
   */
  async call(op: string, payload: unknown = null, opts: CallOptions = {}): Promise<PortResult> {
    const principal = opts.principal ?? "root";

    // B3: tokens verified outside every plugin
    if (principal !== "root" || opts.token !== undefined) {
      if (opts.token === undefined) {
        return { ok: false, error: "REFUSED", detail: "capability token required for non-root principal" };
      }
      const structural = this.checkToken(principal, opts.token, op);
      if (structural) return structural;
    }

    if (HOST_OP_TO_CAP[op]) return this.hostOp(principal, op, payload);

    // B1: routing
    const targetId = this.opRoute.get(op);
    if (!targetId) return { ok: false, error: "REFUSED", detail: `no routed implementation for ${op}` };
    const target = this.plugins.get(targetId)!;
    if (target.state !== "active") {
      return { ok: false, error: "DEGRADED", detail: `implementation ${targetId} is ${target.state}` };
    }

    // B4: risk gate — law.check@1 is itself never gated (the loop exception)
    const risk = this.opRisk.get(op);
    const causationId = opts.causationId ?? `c_${++this.callSeq}`;
    if (risk) {
      const gate = await this.callLaw(principal, op, payload, causationId);
      if (!gate.ok) return gate;
      const decision = gate.value as LawDecision;
      if (decision.decision === "deny") {
        this.journalEntries.push({ ts: Date.now(), principal, op, decision: "deny", reason: decision.reason, causationId });
        return { ok: false, error: "REFUSED", detail: `denied by law: ${decision.reason ?? ""}`, refusal: { rule: "law.check@1", principal, op, reason: decision.reason } satisfies RefusalReport };
      }
      if (decision.decision === "require-consent") {
        this.journalEntries.push({ ts: Date.now(), principal, op, decision: "require-consent", reason: decision.reason, consentId: decision.consentId, causationId });
        return { ok: false, error: "REFUSED", detail: `consent required${decision.consentId ? `: ${decision.consentId}` : ""}`, refusal: { rule: "law.check@1", principal, op, reason: decision.reason, ...(decision.consentId !== undefined ? { consentId: decision.consentId } : {}) } satisfies RefusalReport };
      }
      this.journalEntries.push({
        ts: Date.now(), principal, op, decision: "allow", reason: decision.reason, causationId,
        ...(decision.consentId ? { consentId: decision.consentId } : {}),
      });
    }

    return this.deliver(target, op, payload, principal, opts.deadlineMs ?? 5000, causationId, opts.onChunk);
  }

  private checkToken(principal: string, token: string, op: string): PortResult | null {
    const rec = this.tokenIndex.get(token);
    if (!rec) return { ok: false, error: "REFUSED", detail: "unknown capability token" };
    if (rec.gen < this.generation) return { ok: false, error: "REVOKED", detail: `generation ${rec.gen} revoked (current ${this.generation})` };
    if (rec.pluginId !== principal) return { ok: false, error: "REFUSED", detail: "token not issued to this compartment" };
    if (HOST_OP_TO_CAP[op]) {
      if (rec.cap !== HOST_OP_TO_CAP[op]) return { ok: false, error: "SCOPE", detail: `op ${op} requires ${HOST_OP_TO_CAP[op]}` };
      return null;
    }
    if (rec.cap !== `port:${op}`) return { ok: false, error: "SCOPE", detail: `op ${op} requires capability port:${op}` };
    return null;
  }

  /** law.check delivery — never gated, µhost-gate principal, 500ms budget (mirrors host). */
  private async callLaw(principal: string, op: string, payload: unknown, causationId: string): Promise<PortResult> {
    const lawId = this.opRoute.get("law.check@1");
    if (lawId) {
      const law = this.plugins.get(lawId)!;
      if (law.state === "active" && law.def.ops?.["law.check@1"]) {
        return this.deliver(law, "law.check@1", { principal, op, payload, causationId }, "µhost-gate", 500, `c_${++this.callSeq}`);
      }
    }
    // No law routed: fail-closed defaults (declared-risk data drives the walk).
    // EXTERNAL_MUTATION → require-consent UNLESS a matching .grantConsent exists
    // (the refusal names the derived consent id — the B4 ceremony, in-process).
    const risk = this.opRisk.get(op);
    if (risk === "EXTERNAL_MUTATION") {
      const consentId = consentIdFor(principal, op);
      const grant = this.consents.get(consentId);
      const matches = grant?.active
        && (!grant.principal || grant.principal === principal)
        && (!grant.scope || grant.scope === op);
      if (matches) {
        return { ok: true, value: { decision: "allow", reason: `consent ${consentId} granted`, consentId } satisfies LawDecision };
      }
      this.journalEntries.push({ ts: Date.now(), principal, op, decision: "require-consent", reason: `${op} declares EXTERNAL_MUTATION; no law.check@1 routed (fail-closed)`, consentId, causationId });
      return { ok: false, error: "REFUSED", detail: `consent required: ${consentId} (${op} declares EXTERNAL_MUTATION and no law.check@1 is routed)`, refusal: { rule: "default-gate (no law.check@1 routed)", principal, op, reason: `${op} declares EXTERNAL_MUTATION`, consentId } satisfies RefusalReport };
    }
    // MUTATION (and READ-by-declaration oddities): allow — the CALLER journals the
    // gate decision (one entry per gated call, never two)
    return { ok: true, value: { decision: "allow", reason: `${risk} default: allow + journal (no law.check@1 routed)` } satisfies LawDecision };
  }

  /** B2 delivery to a handler: missing handler → REFUSED; throw → DEGRADED; deadline → BUDGET.
   *  D-352: the handler's meta.emit mirrors the shim exactly (strict 1-based
   *  contiguous seq, close-once, emit-after-final throws ⇒ DEGRADED); chunks
   *  relay to the call's sink or drop when absent (cold fallback). */
  private async deliver(target: InstalledPlugin, op: string, payload: unknown, from: string, deadlineMs: number, causationId: string, onChunk?: (c: StreamChunk) => void): Promise<PortResult> {
    target.stats.delivered++;
    const handler = target.def.ops?.[op];
    if (!handler) return { ok: false, error: "REFUSED", detail: `no handler for ${op}` };
    let seq = STREAM_SEQ_START, closed = false;
    const emit: StreamEmit = (data, final = false) => {
      if (closed) throw new Error(`emit after final (stream ${causationId}) — protocol violation`);
      if (final) closed = true;
      const chunk: StreamChunk = { streamId: causationId, seq: seq++, data, final };
      if (onChunk) onChunk(chunk); // no sink ⇒ drop: non-streaming callers observe nothing
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handlerPromise = Promise.resolve()
      .then(() => handler(payload, target.ctx!, { causationId, deadlineMs, from, emit }))
      .then((value) => ({ ok: true as const, value: value ?? null, freshness: "CURRENT" as const }));
    handlerPromise.catch(() => {}); // a late rejection (after BUDGET won the race) is attributed, never unhandled
    try {
      return await Promise.race([
        handlerPromise,
        new Promise<PortResult>((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, error: "BUDGET", detail: `deadline ${deadlineMs}ms exceeded (op ${op})` }), Math.max(1, deadlineMs));
        }),
      ]);
    } catch (e) {
      // MIRRORS the shim: the handler throw becomes a DEGRADED *result*; the
      // compartment stays alive (the worker did not crash). Only degrade()
      // (crash/health observation) or quarantine() flip the state.
      target.stats.errors++;
      return { ok: false, error: "DEGRADED", detail: `handler ${op} threw: ${String(e)}` };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Host-internal transport ops — capability-gated above, semantics mirrored. */
  private async hostOp(callerId: string, op: string, payload: unknown): Promise<PortResult> {
    switch (op) {
      case HOST_OPS.compartmentStats: {
        const stats: Record<string, unknown> = {};
        for (const [id, p] of this.plugins) stats[id] = { state: p.state, ...p.stats };
        return { ok: true, value: stats };
      }
      case HOST_OPS.compartmentTerminate: {
        const { pluginId } = (payload ?? {}) as { pluginId?: string };
        const rec = pluginId ? this.plugins.get(pluginId) : undefined;
        if (!rec) return { ok: false, error: "SCOPE", detail: `unknown compartment ${pluginId}` };
        rec.state = "retired";
        return { ok: true, value: { terminated: pluginId } };
      }
      case HOST_OPS.compartmentSpawn: {
        const { pluginId } = (payload ?? {}) as { pluginId?: string };
        return { ok: false, error: "REFUSED", detail: `compartment.spawn of '${pluginId}' requires reboot via recipe (v1: restart = reboot composition)` };
      }
      case HOST_OPS.journalAppend: {
        this.journalEntries.push({ ts: Date.now(), ...(typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : { payload }) });
        return { ok: true, value: { appended: true } };
      }
      case HOST_OPS.tokensRevoke: {
        const { pluginId } = (payload ?? {}) as { pluginId?: string };
        const r = this.revoke(pluginId);
        return { ok: true, value: r };
      }
      default:
        return { ok: false, error: "REFUSED", detail: `unknown host op ${op}` };
    }
  }

  status(): { compartments: Record<string, unknown>; generation: number; routedOps: string[] } {
    const compartments: Record<string, unknown> = {};
    for (const [id, p] of this.plugins) compartments[id] = { state: p.state, ...p.stats };
    return { compartments, generation: this.generation, routedOps: [...this.opRoute.keys()] };
  }

  /** Run every onShutdown (best-effort) and retire all plugins. */
  async shutdown(): Promise<void> {
    for (const rec of this.plugins.values()) {
      if (rec.state === "active") {
        try { await rec.def.onShutdown?.(); } catch { /* best-effort */ }
      }
      rec.state = "retired";
    }
  }
}

/** Build a CompositionEntry-shaped object for FakeHost-flavored composition tests. */
export function fakeEntry(id: string, contracts: string[], capabilities: string[] = [], bootPhase = 1): CompositionEntry {
  return {
    id, version: "0.0.0", source: ".", manifestPath: ".", manifestHash: "sha256:" + "0".repeat(64), contentHash: "sha256:" + "0".repeat(64),
    grant: { capabilities, contracts }, bootPhase,
  };
}

export { HOST_OPS, HOST_CAPS, HOST_OP_TO_CAP };
