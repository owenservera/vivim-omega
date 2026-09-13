// vivim.mind — index.ts (Ω10), the self-knowledge plugin (wiring only).
//
// THE LENS, never an author: everything below READS through three ports
// (law.registry@1, vault.query@1, vault.get@1 — exactly the capabilities this
// manifest requests) and assembles the WorldModel via the pure machinery in
// derive.ts. There is no write path anywhere in this plugin.
//
// Ops exposed (ENGINE contributions — no risk BY KIND, READ semantics):
//   mind.snapshot@1  {} | {includeBodies?: boolean} → {world: WorldModel}
//   mind.query@1     {kind, filter?} → {kind, filter, count, rows, worldV}
//   control.bootstrap@1 {} → {bootstrap: Bootstrap} (D-328a: versioned first contact)
//   control.describe@1 {focus?} → Outcome<{control: ControlModel}> (D-328a: bounded orient)
//
// Fail-closed: every port call goes through portCall (non-ok → throw); a throw
// surfaces as DEGRADED at the port boundary. The mind NEVER degrades to guessing.
// describe answers UNKNOWN (never a crash, never a guess) for unknown
// kind/capability/version — an orienting agent detects skew and stops.
import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import type { WorldModel } from "@vivim/omega-nlcl-pure";
import {
  BOOTSTRAP_VERSION, CONTROL_ENTRYPOINTS, CONTROL_MODEL_VERSION, CONTROL_NAMESPACES,
  type Bootstrap, type ControlModel, type DescribeFocus, type Outcome, type PortResult,
} from "@vivim/omega-contracts";
import { fail, ok } from "@vivim/omega-contracts";
//
// D-215 (quoted): "Self-knowledge is a PLUGIN (vivim.mind, Ω10), not µhost code.
// The mind derives the WorldModel from law.registry + vault + composition-config
// projections; it writes nothing, so a wrong self-model is falsifiable against
// intact evidence."
import {
  AUTOMATION_NS, buildWorldModel, EMAIL_NS, MESSAGE_META_TYPE, NLCL_NS, parseMindConfig,
  QUERY_BOUND, type EvidenceRow, type MindConfig, type RegistrySnapshotView,
} from "./derive.ts";

// ---- port plumbing (fail-closed, same discipline as the provider's vaultCall) ----

interface VaultQueryRow { id: string; rev: number; cid: string }
interface VaultGetResult { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown }

/** Port call that fails closed: a non-ok result becomes a thrown error → DEGRADED. */
async function portCall<T>(ctx: PluginContext, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await ctx.port.call(op, payload);
  if (!r.ok) throw new Error(`mind: ${op} ${r.error}: ${r.detail ?? ""}`);
  return r.value as T;
}

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/** law.registry@1 → the slice of the snapshot the lens consumes (shape-validated). */
async function fetchRegistry(ctx: PluginContext): Promise<RegistrySnapshotView> {
  const snap = await portCall<Record<string, unknown>>(ctx, "law.registry@1", {});
  const plugins = snap["plugins"];
  const events = snap["events"];
  const states = snap["states"];
  if (!Array.isArray(plugins) || plugins.some((p) => typeof p !== "string")) {
    throw new Error("mind: law.registry@1 returned a malformed plugins list");
  }
  if (typeof events !== "number" || !Number.isFinite(events)) {
    throw new Error("mind: law.registry@1 returned a malformed events count");
  }
  if (states === null || typeof states !== "object" || Array.isArray(states)) {
    throw new Error("mind: law.registry@1 returned a malformed states map");
  }
  const view: Record<string, { state: string }> = {};
  for (const [id, o] of Object.entries(states as Record<string, unknown>)) {
    const state = asObj(o)["state"];
    view[id] = { state: typeof state === "string" ? state : "unknown" };
  }
  return { plugins, events, states: view };
}

/** One namespace's rows (latest revision per id), bounded at QUERY_BOUND fetches —
 *  the lens reads a bounded window, never the whole warehouse. */
async function fetchNamespaceRows(ctx: PluginContext, ns: string): Promise<Array<{ id: string; meta: unknown; data: unknown }>> {
  const rows = await portCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns, filter: {} });
  const out: Array<{ id: string; meta: unknown; data: unknown }> = [];
  for (const row of rows.slice(0, QUERY_BOUND)) {
    const got = await portCall<VaultGetResult>(ctx, "vault.get@1", { ns, id: row.id });
    out.push({ id: row.id, meta: got.meta, data: got.data });
  }
  return out;
}

/** Assemble the full snapshot (the one machinery behind both ops). */
async function buildSnapshot(ctx: PluginContext, config: MindConfig, opts: { includeBodies: boolean; t: number }): Promise<WorldModel> {
  const registry = await fetchRegistry(ctx);
  const emailRows = await fetchNamespaceRows(ctx, EMAIL_NS);
  const messageRows: EvidenceRow[] = emailRows
    .filter((r) => asObj(r.meta)["type"] === MESSAGE_META_TYPE) // threads/contacts may share the ns; the mind projects messages only
    .map((r) => ({ id: r.id, data: r.data }));
  const ruleRows = (await fetchNamespaceRows(ctx, AUTOMATION_NS)).map((r) => ({ id: r.id, data: r.data }));
  const lexiconRows = (await fetchNamespaceRows(ctx, NLCL_NS)).map((r) => ({ id: r.id, data: r.data }));
  return buildWorldModel(
    { registry, messageRows, ruleRows, lexiconRows },
    config,
    { includeBodies: opts.includeBodies, t: opts.t },
  );
}

/** Governed-evolution activity for control.describe: rows in ns "control"
 *  under prefix "evolution:" (bounded; 4a reads what 4b writes — before any
 *  evolution exists this is honestly 0). */
async function countEvolution(ctx: PluginContext): Promise<number> {
  const rows = await portCall<VaultQueryRow[]>(ctx, "vault.query@1", { ns: "control", filter: { idPrefix: "evolution:" } });
  return ((rows as VaultQueryRow[]) ?? []).length;
}

// ---- focused-view slicing (mind.query@1) ----

const QUERY_KINDS = ["ops", "entities", "rules", "lexicon", "plugins", "contacts"] as const;
type QueryKind = (typeof QUERY_KINDS)[number];

/** The row's identifying fields — the substring filter's search surface (case-insensitive). */
function searchableFields(kind: QueryKind, row: Record<string, unknown>): string[] {
  switch (kind) {
    case "ops": return [row["op"] as string, row["provider"] as string, row["title"] as string];
    case "entities": return [row["id"] as string, row["label"] as string, row["type"] as string];
    case "rules": return [row["id"] as string, row["summary"] as string];
    case "lexicon": return [row["word"] as string, row["op"] as string];
    case "plugins": return [row["id"] as string];
    case "contacts": return [row["id"] as string, row["label"] as string, row["type"] as string];
  }
}

function sliceWorld(world: WorldModel, kind: QueryKind): unknown[] {
  switch (kind) {
    case "ops": return world.ops;
    case "entities": return world.entities;
    case "rules": return world.rules;
    case "lexicon": return world.lexicon;
    case "plugins": return world.kernel.plugins;
    case "contacts": return world.entities.filter((e) => e.type === "contact");
  }
}

// ---- the plugin ----

startPlugin(definePlugin({
  onInit: (ctx) => {
    // Validate the lens config at boot (fail-closed: bad config throws → degraded-but-alive,
    // and every op re-validates before use).
    const config = parseMindConfig(ctx.config);
    ctx.log(
      `vivim.mind up (Ω10) — lens: composition "${config.composition}", nlcl ${config.nlclVersion || "(none)"}, `
      + `${config.ops.length} ops, self ${config.selfAddresses.join(", ") || "(none)"}, entityCap ${config.entityCap}`,
    );
  },

  ops: {
    /**
     * snapshot {} or {includeBodies?: boolean} → {world: WorldModel}.
     * includeBodies defaults true (the NCLL grounding target needs bodies for
     * forward/compose payloads); false strips data.body for light replication.
     */
    "mind.snapshot@1": async (payload: unknown, ctx: PluginContext) => {
      const p = asObj(payload);
      if (p["includeBodies"] !== undefined && p["includeBodies"] !== null && typeof p["includeBodies"] !== "boolean") {
        throw new Error("mind.snapshot@1: includeBodies must be a boolean when provided");
      }
      const includeBodies = p["includeBodies"] === undefined || p["includeBodies"] === null ? true : p["includeBodies"] as boolean;
      const config = parseMindConfig(ctx.config);
      const world = await buildSnapshot(ctx, config, { includeBodies, t: Date.now() });
      ctx.log(
        `mind: snapshot v${world.v} — ${world.entities.length} entities, ${world.ops.length} ops, `
        + `${world.rules.length} rules, ${world.lexicon.length} lexicon, ${world.kernel.plugins.length} live plugins`,
      );
      return { world };
    },

    /**
     * query {kind: ops|entities|rules|lexicon|plugins|contacts, filter?} → the requested
     * slice of the SAME machinery (identical semantics to snapshot; only the slice
     * differs). filter = case-insensitive substring over the row's identifying fields.
     */
    "mind.query@1": async (payload: unknown, ctx: PluginContext) => {
      const p = asObj(payload);
      const kind = p["kind"];
      if (typeof kind !== "string" || !(QUERY_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`mind.query@1: kind must be one of ${QUERY_KINDS.join("|")} (got ${JSON.stringify(kind)})`);
      }
      const filterRaw = p["filter"];
      if (filterRaw !== undefined && filterRaw !== null && typeof filterRaw !== "string") {
        throw new Error("mind.query@1: filter must be a string when provided");
      }
      const filter = filterRaw === undefined || filterRaw === null ? null : filterRaw;
      const config = parseMindConfig(ctx.config);
      const world = await buildSnapshot(ctx, config, { includeBodies: true, t: Date.now() });
      let rows = sliceWorld(world, kind as QueryKind);
      if (filter !== null && filter.length > 0) {
        const q = filter.toLowerCase();
        rows = rows.filter((row) => {
          const rec = row as Record<string, unknown>;
          return searchableFields(kind as QueryKind, rec).some((s) => typeof s === "string" && s.toLowerCase().includes(q));
        });
      }
      return { kind, filter, count: rows.length, rows, worldV: world.v };
    },

    /**
     * bootstrap {} → {bootstrap: Bootstrap} (D-328a: versioned first contact).
     * READ-only orientation: who this system is, which model version to ask
     * for next, and the entry points to call. No vault write — 4a adds zero
     * write path; ns "control" is reserved here and first written by 4b.
     */
    "control.bootstrap@1": async (payload: unknown, ctx: PluginContext) => {
      asObj(payload ?? {}); // payload {} by contract; fields ignored, garbage → DEGRADED below
      if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) {
        throw new Error("control.bootstrap@1: payload must be an object");
      }
      const config = parseMindConfig(ctx.config);
      const bootstrap: Bootstrap = {
        bootstrapVersion: BOOTSTRAP_VERSION,
        composition: config.composition,
        controlModel: CONTROL_MODEL_VERSION,
        entrypoints: CONTROL_ENTRYPOINTS,
        namespaces: CONTROL_NAMESPACES,
        next: ["control.describe@1", "agent.snapshot@1"],
        at: Date.now(),
      };
      return { bootstrap };
    },

    /**
     * describe {focus?: {kind?, capability?, version?}} →
     * Outcome<{control: ControlModel}> (D-328a: bounded system projection).
     * READ-only: versions, namespaces, kinds, capabilities, contracts,
     * evaluators, policy boundaries, evolution activity. Unknown
     * kind/capability/version → UNKNOWN (never a crash, never a guess).
     */
    "control.describe@1": async (payload: unknown, ctx: PluginContext): Promise<Outcome> => {
      const p = asObj(payload ?? {});
      if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) {
        throw new Error("control.describe@1: payload must be an object");
      }
      const focusRaw = p["focus"];
      let focus: DescribeFocus = {};
      if (focusRaw !== undefined && focusRaw !== null) {
        const f = asObj(focusRaw);
        for (const k of ["kind", "capability", "version"] as const) {
          const v = f[k];
          if (v !== undefined && v !== null) {
            if (typeof v !== "string") throw new Error(`control.describe@1: focus.${k} must be a string when provided`);
            focus = { ...focus, [k]: v };
          }
        }
        for (const k of Object.keys(f)) {
          if (k !== "kind" && k !== "capability" && k !== "version") {
            throw new Error(`control.describe@1: unknown focus field "${k}" (want kind|capability|version)`);
          }
        }
      }
      const config = parseMindConfig(ctx.config);
      const snap = await portCall<Record<string, unknown>>(ctx, "law.registry@1", {});
      const forbidden = asObj(snap["forbidden"]);
      const control: ControlModel = {
        controlVersion: CONTROL_MODEL_VERSION,
        composition: config.composition,
        generatedAt: Date.now(),
        namespaces: CONTROL_NAMESPACES,
        kinds: ["DETERMINISTIC", "PROBABILISTIC", "HUMAN"],
        capabilities: config.ops.map((o) => ({ op: o.op, risk: o.risk, provider: o.provider, title: o.title })),
        contracts: CONTROL_ENTRYPOINTS,
        evaluators: [
          "discovery.verify@1: promotion is proof, not confidence (postcondition probes ≥ threshold with resolving evidence)",
        ],
        policy: {
          gate: "law.check@1",
          forbidden: typeof forbidden["persistence"] === "boolean" && typeof forbidden["loaded"] === "boolean" && typeof forbidden["count"] === "number"
            ? { persistence: forbidden["persistence"], loaded: forbidden["loaded"], count: forbidden["count"] }
            : null,
        },
        evolution: { proposals: await countEvolution(ctx) },
      };
      if (focus.kind !== undefined && !(control.kinds as readonly string[]).includes(focus.kind)) {
        return fail("UNKNOWN", `unknown computation kind "${focus.kind}" (want one of ${control.kinds.join("|")})`);
      }
      if (focus.capability !== undefined && !control.capabilities.some((c) => c.op === focus.capability)) {
        return fail("UNKNOWN", `unknown capability "${focus.capability}" (not in this composition's ops catalog)`);
      }
      if (focus.version !== undefined && focus.version !== CONTROL_MODEL_VERSION) {
        return fail("UNKNOWN", `unknown control version "${focus.version}" (this system speaks ${CONTROL_MODEL_VERSION})`);
      }
      return ok({ control });
    },
  },
}));
