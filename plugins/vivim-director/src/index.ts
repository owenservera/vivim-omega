// vivim.director — index.ts (Ω12), the reprogramming plugin.
//
// "Backend fully reprogrammable by non-technical users" as DATA, never codegen
// (D-219): rules (vault ns "automation"), teachings (ns "nlcl"), the fired
// ledger (ns "automation") are vault objects — journaled, Merkle-chained,
// revertable. The tick loop INTERPRETS them deterministically; rule ACTIONS
// execute through the port under principal "vivim.director", so the LAW still
// gates them (one consent at rule-creation time — director.rule@1 returns the
// exact actionConsent so the console can pre-check law.check and grant once).
//
// Ops exposed (ENGINE contributions — engines declare no risk; semantics are
// READ/derivative, see plugin.json docs):
//   director.rule@1     create a rule (data revision in ns "automation")
//   director.registry@1 list rules / enable / disable (data revisions)
//   director.teach@1    teach or unteach a word (data revisions in ns "nlcl")
//   director.tick@1     the deterministic fire pass (also scheduled live)
//   resolve.classify@1  route by computation kind (D-323: rule → PROMOTED realization → HUMAN)
//   resolve.report@1    record a routed execution's outcome (same ns "resolve" object, rev 2)
//   strategy.scorecard@1 pure aggregation over ns "resolve" (scoreboards inform, never decide)
//
// Handlers throw on bad payloads/failed port calls — the shim converts throws
// into DEGRADED returns at the port boundary (fail-closed propagation), except
// director.tick@1 which NEVER throws (partial reports are honest outcomes).
// resolve.report@1 returns an Outcome (UNKNOWN when the decision doesn't
// exist) — a missing decision is expected-but-negative, not malformed.
import { clearInterval, setInterval } from "node:timers";
import { randomBytes } from "node:crypto";
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult, ResolveDecision, ResolveOutcome } from "@vivim/omega-contracts";
import { fail, resolveDecisionId } from "@vivim/omega-contracts";
import {
  AUTOMATION_NS, LEXICON_PREFIX, NLCL_NS, RULE_PREFIX, nextFreeRuleId, ruleSlug, ruleSummary,
  validateRuleInput, validateTeachInput, asRule,
} from "./rules.ts";
import {
  REALIZATION_SCAN_CAP, RESOLVE_NS, RULE_SCAN_CAP, SCORECARD_ROW_CAP,
  asClassifiableRealization, asResolveDecision, classifyPure, parseClassifyInput,
  parseReportInput, scorecardPure,
  type ClassifiableRealization, type ClassifiableRule,
} from "./resolve.ts";
import {
  DEFAULT_SELF_ADDRESSES, DEFAULT_TICK_MS, runTick,
  type TickConfig, type TickReport, type TickState, type VaultGetResult, type VaultQueryRow,
} from "./tick.ts";

/** Registry bound: at most 200 rule fetches per list call. */
const REGISTRY_CAP = 200;

// ---- the director's principal — rule actions run under this id (law-gated) ----
const DIRECTOR_PRINCIPAL = "vivim.director";

interface VaultAppendResult { rev: number; cid: string; seq: number }

function asObject(op: string, v: unknown): Record<string, unknown> {
  if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${op}: payload must be an object`);
  }
  return v as Record<string, unknown>;
}

/** Port call that fails closed: a non-ok vault result becomes a thrown error → DEGRADED. */
async function vaultCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

// ---- shared tick state (single compartment, single thread) ----
const tickState: TickState = { prevRevs: new Map() };
let tickCfg: TickConfig = { selfAddresses: [...DEFAULT_SELF_ADDRESSES] };
let inFlight: Promise<TickReport> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Bound: a manual tick waits at most this long for a prior pass (E-3). */
const TICK_WAIT_MAX_MS = 30_000;

/** Wait for any in-flight pass; throws (→ DEGRADED, caller retries) past the
 *  bound instead of queueing manual ticks behind a hung pass forever. The live
 *  interval never waits (a slow pass skips beats); only on-demand callers land here. */
async function waitForPriorPass(): Promise<void> {
  const start = Date.now();
  while (inFlight !== null) {
    if (Date.now() - start > TICK_WAIT_MAX_MS) {
      throw new Error(`director.tick: prior pass still in flight after ${TICK_WAIT_MAX_MS}ms — refusing fail-closed (retry the tick)`);
    }
    await inFlight.catch(() => {});
  }
}

/** Serialized tick: awaits any in-flight pass, then runs one of its own. */
async function tickSerialized(ctx: PluginContext): Promise<TickReport> {
  await waitForPriorPass();
  const run: Promise<TickReport> = runTick(ctx, tickCfg, tickState).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** The live loop: setInterval with an in-flight guard (a slow pass skips beats, never overlaps). */
function startInterval(ctx: PluginContext, intervalMs: number): void {
  timer = setInterval(() => {
    if (inFlight !== null) return; // in-flight guard — this beat is skipped, the next catches up
    const run: Promise<TickReport> = runTick(ctx, tickCfg, tickState).then(
      (r) => {
        if (r.error) ctx.log(`[tick] partial: ${r.error}`);
        return r;
      },
      (e) => {
        ctx.log(`[tick] failed: ${String(e)}`);
        return { scanned: 0, processed: 0, fired: [], at: Date.now(), error: String(e) } satisfies TickReport;
      },
    ).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
  }, intervalMs);
}

startPlugin(definePlugin({
  onInit: (ctx) => {
    const rawMs = ctx.config["intervalMs"];
    const intervalMs = typeof rawMs === "number" && Number.isFinite(rawMs) ? rawMs : DEFAULT_TICK_MS;
    const rawSelf = ctx.config["selfAddresses"];
    tickCfg = {
      selfAddresses: Array.isArray(rawSelf)
        ? rawSelf.filter((s): s is string => typeof s === "string" && s.length > 0).map((s) => s.toLowerCase())
        : [...DEFAULT_SELF_ADDRESSES],
    };
    if (intervalMs > 0) startInterval(ctx, intervalMs);
    else ctx.log("vivim.director: live tick loop disabled (config.intervalMs <= 0) — director.tick@1 drives the fire pass");
    ctx.log(
      `vivim.director up (Ω12) — rules/teachings/ledger are vault objects (data, never codegen — D-219); ` +
      `tick ${intervalMs > 0 ? `every ${intervalMs}ms` : "manual"}; actions fire under principal ${DIRECTOR_PRINCIPAL} (law-gated); self: ${tickCfg.selfAddresses.join(", ")}`,
    );
  },

  onShutdown() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  },

  ops: {
    /**
     * Create a rule — a vault object, nothing more.
     * payload {when: {event: "message.received", from: "contact:<slug>"|null},
     *          then: {op: "message.send@1", payload: {...}}}
     * → {ruleId, rev, summary, actionConsent: {principal: "vivim.director", op}}.
     * actionConsent lets the surface pre-check law.check for the rule's action
     * so the user grants ONCE at rule-creation time (the console ceremony).
     */
    "director.rule@1": async (payload: unknown, ctx: PluginContext) => {
      const input = validateRuleInput("director.rule@1", payload);
      // slug: rule:<from-slug|any>-forward, numeric suffix on collision
      // (occupied ids come from the vault itself — query ns "automation" first)
      const base = ruleSlug(input.when.from);
      const qr = await vaultCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: AUTOMATION_NS, filter: { idPrefix: RULE_PREFIX } });
      const occupied = new Set(((qr as VaultQueryRow[]) ?? []).map((r) => r.id));
      const ruleId = nextFreeRuleId(base, occupied);
      const summary = ruleSummary(input.when, input.then);
      const data = {
        id: ruleId,
        when: input.when,
        then: input.then,
        enabled: true,
        summary,
        createdAt: Date.now(),
      };
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: AUTOMATION_NS, id: ruleId, data, meta: { type: "rule" },
      });
      return { ruleId, rev: append.rev, summary, actionConsent: { principal: DIRECTOR_PRINCIPAL, op: input.then.op } };
    },

    /**
     * List rules ({filter: "rules"}) or flip one ({action: "enable"|"disable", ruleId}
     * → a NEW revision with enabled flipped — append-only, revertable by construction).
     * Unknown ruleId → throw → DEGRADED (fail-closed).
     */
    "director.registry@1": async (payload: unknown, ctx: PluginContext) => {
      const p = asObject("director.registry@1", payload);

      if (p["action"] === undefined) {
        // ---- list ----
        if (p["filter"] !== "rules") {
          throw new Error(`director.registry@1: payload must be {filter: "rules"} or {action: "enable"|"disable", ruleId} (got filter ${JSON.stringify(p["filter"])})`);
        }
        const qr = await vaultCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: AUTOMATION_NS, filter: { idPrefix: RULE_PREFIX } });
        const rows = ((qr as VaultQueryRow[]) ?? []).slice(0, REGISTRY_CAP);
        const rules: Array<{ id: string; enabled: boolean; summary: string; when: unknown; then: unknown; createdAt: number }> = [];
        for (const row of rows) {
          const got = await vaultCall<VaultGetResult>(ctx, "vault.get@1", { ns: AUTOMATION_NS, id: row.id });
          const rule = asRule("director.registry@1", row.id, got.data);
          if (!rule) continue; // malformed rows are skipped — a wrong row can never fire
          rules.push({ id: rule.id, enabled: rule.enabled, summary: rule.summary, when: rule.when, then: rule.then, createdAt: rule.createdAt });
        }
        return { rules };
      }

      // ---- enable / disable ----
      const action = p["action"];
      if (action !== "enable" && action !== "disable") {
        throw new Error(`director.registry@1: action must be "enable" or "disable" (got ${JSON.stringify(action)})`);
      }
      const ruleId = p["ruleId"];
      if (typeof ruleId !== "string" || ruleId.length === 0 || !ruleId.startsWith(RULE_PREFIX)) {
        throw new Error(`director.registry@1: ruleId must be a rule id ("rule:*", got ${JSON.stringify(ruleId)})`);
      }
      // validate the rule exists (fail-closed): a failed get or a malformed row both throw → DEGRADED
      const gr: PortResult = await ctx.port.call("vault.get@1", { ns: AUTOMATION_NS, id: ruleId });
      if (!gr.ok) throw new Error(`director.registry@1: no rule ${ruleId} — vault.get@1 ${gr.error}: ${gr.detail ?? ""}`);
      const rule = asRule("director.registry@1", ruleId, (gr.value as VaultGetResult).data);
      if (!rule) throw new Error(`director.registry@1: no rule ${ruleId} (not found or malformed)`);
      const enabled = action === "enable";
      if (rule.enabled === enabled) {
        return { id: rule.id, enabled: rule.enabled, summary: rule.summary, when: rule.when, then: rule.then, createdAt: rule.createdAt, rev: (gr.value as VaultGetResult).rev, action, changed: false };
      }
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: AUTOMATION_NS, id: ruleId, data: { ...rule, enabled }, meta: { type: "rule" },
      });
      return { id: rule.id, enabled, summary: rule.summary, when: rule.when, then: rule.then, createdAt: rule.createdAt, rev: append.rev, action, changed: true };
    },

    /**
     * Teach a word to the language layer — a vault object in ns "nlcl".
     * payload {word, op, action?: "add"|"remove"} → {word, op, action, rev}.
     * Remove appends op:null — the mind skips op:null rows, which IS the
     * removal (append-only by construction; "unteach" never deletes).
     */
    "director.teach@1": async (payload: unknown, ctx: PluginContext) => {
      const input = validateTeachInput("director.teach@1", payload);
      const data = { word: input.word, op: input.op, action: input.action, source: "taught", createdAt: Date.now() };
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: NLCL_NS, id: `${LEXICON_PREFIX}${input.word}`, data, meta: { type: "lexicon" },
      });
      return { word: input.word, op: input.op, action: input.action, rev: append.rev };
    },

    /**
     * The deterministic fire pass — payload {} (the interval schedules the same
     * pass live; this op drives it on demand). NEVER throws: per-rule errors
     * are captured into the result/ledger; vault failures return partial reports.
     * → {scanned, processed, fired: [{messageId, ruleId, ok, error?, consentId?}], at}.
     */
    "director.tick@1": async (payload: unknown, ctx: PluginContext) => {
      asObject("director.tick@1", payload ?? {}); // payload {} by contract; garbage → DEGRADED
      return tickSerialized(ctx);
    },

    /**
     * Route by computation kind (D-323) — payload
     * {op?, archetypeSlug?, event?, from?} → {decisionId, kind, capability,
     * branch, reason, rev}. Rule table: enabled automation rule →
     * DETERMINISTIC + its op; else PROMOTED realization → class-mapped kind;
     * else HUMAN + empty capability (escalate). Appends decision rev 1 to ns
     * "resolve" (id `resolve:<decisionId>`, minted `res_<hex>`); the writer
     * AND this reader ship together — never touches the hot run.submit path.
     */
    "resolve.classify@1": async (payload: unknown, ctx: PluginContext) => {
      const input = parseClassifyInput(payload); // contradictory/stale → DEGRADED
      // Branch-(1) rows: enabled automation rules, id asc (bounded).
      const rules: ClassifiableRule[] = [];
      const qr = await vaultCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: AUTOMATION_NS, filter: { idPrefix: RULE_PREFIX } });
      for (const row of ((qr as VaultQueryRow[]) ?? []).slice(0, RULE_SCAN_CAP)) {
        const gr: PortResult = await ctx.port.call("vault.get@1", { ns: AUTOMATION_NS, id: row.id });
        if (!gr.ok) continue; // unreadable rows can't route — skipped, not fatal
        const rule = asRule("resolve.classify@1", row.id, (gr.value as VaultGetResult).data);
        if (!rule || !rule.enabled) continue;
        rules.push({ id: rule.id, rev: (gr.value as VaultGetResult).rev, event: rule.when.event, from: rule.when.from, op: rule.then.op, enabled: true });
      }
      rules.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      // Branch-(2) rows: realizations for the archetype (bounded; the
      // PROMOTED gate lives in classifyPure so misfiltered callers stay honest).
      const realizations: ClassifiableRealization[] = [];
      if (input.slug !== null) {
        const pr: PortResult = await ctx.port.call("vault.query@1", { ns: "providers", filter: { idPrefix: `realization:${input.slug}:` } });
        if (!pr.ok) throw new Error(`resolve.classify@1: vault.query@1 providers ${pr.error}: ${pr.detail ?? ""}`);
        for (const row of ((pr.value as VaultQueryRow[]) ?? []).slice(0, REALIZATION_SCAN_CAP)) {
          const gr: PortResult = await ctx.port.call("vault.get@1", { ns: "providers", id: row.id });
          if (!gr.ok) continue;
          const c = asClassifiableRealization(row.id, (gr.value as VaultGetResult).rev, (gr.value as VaultGetResult).data);
          if (c) realizations.push(c);
        }
      }
      const verdict = classifyPure({ input: { event: input.event, from: input.from, slug: input.slug }, rules, realizations });
      const decisionId = `res_${randomBytes(8).toString("hex")}`;
      const data: ResolveDecision = {
        decisionId, kind: verdict.kind, capability: verdict.capability, branch: verdict.branch,
        reason: verdict.reason, evidenceRefs: verdict.evidenceRefs,
        buildDecisionRef: "D-323", createdAt: Date.now(),
      };
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: RESOLVE_NS, id: resolveDecisionId(decisionId), data,
        meta: { type: "resolve-decision", kind: verdict.kind, branch: verdict.branch },
        refs: verdict.evidenceRefs,
      });
      return { decisionId, kind: verdict.kind, capability: verdict.capability, branch: verdict.branch, reason: verdict.reason, rev: append.rev };
    },

    /**
     * Record a routed execution's outcome — payload {decisionId, status:
     * "ok"|"failed", execMs} → {decisionId, rev, status}. Appends outcome rev
     * 2 to the SAME ns "resolve" object (two revs of one object: decision then
     * outcome). UNKNOWN when the decision doesn't exist — never a throw.
     */
    "resolve.report@1": async (payload: unknown, ctx: PluginContext) => {
      const input = parseReportInput(payload); // malformed → DEGRADED
      const id = resolveDecisionId(input.decisionId);
      const gr: PortResult = await ctx.port.call("vault.get@1", { ns: RESOLVE_NS, id });
      if (!gr.ok) return fail("UNKNOWN", `resolve decision "${input.decisionId}" not found`);
      const dec = asResolveDecision((gr.value as VaultGetResult).data);
      if (!dec) throw new Error(`resolve.report@1: stored decision "${input.decisionId}" is malformed (fail-closed)`);
      const data: ResolveOutcome = {
        decisionId: input.decisionId, kind: dec.kind, capability: dec.capability,
        status: input.status, execMs: input.execMs, reportedAt: Date.now(),
      };
      const append = await vaultCall<VaultAppendResult>(ctx, "vault.append@1", {
        ns: RESOLVE_NS, id, data,
        meta: { type: "resolve-outcome", status: input.status },
        refs: [{ ns: RESOLVE_NS, id, rev: (gr.value as VaultGetResult).rev }],
      });
      return { decisionId: input.decisionId, rev: append.rev, status: input.status };
    },

    /**
     * Pure aggregation over ns "resolve" — payload {} →
     * {rows: [{kind, capability, n, okRate, p50ExecMs}], at}. Latest rev per
     * id; ids without an outcome yet are skipped (decided but unreported).
     * No thresholds, no auto-actions — scoreboards inform, they never decide.
     */
    "strategy.scorecard@1": async (payload: unknown, ctx: PluginContext) => {
      asObject("strategy.scorecard@1", payload ?? {}); // garbage → DEGRADED
      const qr = await vaultCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: RESOLVE_NS, filter: { idPrefix: "resolve:" } });
      const outcomes: Array<{ kind: "DETERMINISTIC" | "PROBABILISTIC" | "HUMAN"; capability: string; status: "ok" | "failed"; execMs: number }> = [];
      for (const row of ((qr as VaultQueryRow[]) ?? []).slice(0, SCORECARD_ROW_CAP)) {
        const gr: PortResult = await ctx.port.call("vault.get@1", { ns: RESOLVE_NS, id: row.id });
        if (!gr.ok) continue;
        const d = (gr.value as VaultGetResult).data as Record<string, unknown>;
        if ((d["kind"] === "DETERMINISTIC" || d["kind"] === "PROBABILISTIC" || d["kind"] === "HUMAN") &&
          typeof d["capability"] === "string" &&
          (d["status"] === "ok" || d["status"] === "failed") &&
          typeof d["execMs"] === "number" && Number.isFinite(d["execMs"]) && d["execMs"] >= 0) {
          outcomes.push({ kind: d["kind"], capability: d["capability"], status: d["status"], execMs: d["execMs"] });
        }
      }
      return { rows: scorecardPure(outcomes), at: Date.now() };
    },
  },
}));
