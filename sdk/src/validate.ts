// @vivim/omega-sdk — validate.ts
// Semantic validators beyond shape. The zod schemas answer "is this a well-formed
// manifest?"; these answer "is it a LAWFUL one?" — contribution-kind rules, op
// ownership, dependency-ref grammar, capability-request grammar.
import type { PluginManifest, CompositionSpec, ContributionKind } from "@vivim/omega-contracts";
import { routableOps, HOST_CAPS } from "@vivim/omega-contracts";
import { OP_PATTERN, MINE_PATTERN, EVIDENCE_REF_PATTERN } from "./schema.ts";

export interface ValidationIssue {
  code: string;     // stable machine key, e.g. "RISK_NON_CONTRACT"
  path: string;     // dotted path into the validated object
  message: string;  // human-readable
}

const DEP_REF_PATTERN = /^contract:[a-z0-9.-]+@[0-9]+$|^capability:[a-z0-9.-]+$/;
const DEP_RANGE_PATTERN = /^(\*|[0-9]+(\.[0-9x]+)*)$/;
const CAP_PATTERN = /^port:[a-z0-9.-]+@[0-9]+$|^host\.[a-z0-9.-]+$/;
const ROUTABLE_KINDS: readonly ContributionKind[] = ["contract", "engine", "provider"];

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

/**
 * Manifest-level semantic rules. Shape errors are the schema's job; everything
 * here is law the zod mirror cannot express:
 *  - risk may be declared ONLY on contract-kind contributions (declared data, per
 *    contracts/manifest.ts — a risk on an engine would look like a code switch);
 *  - routable op ids must be unique across routable kinds (contract/engine/provider
 *    all register `<id>@<version>` ops — a duplicate is a routing collision);
 *  - dependency refs follow `contract:<op>@<v>` | `capability:<cap>` with a numeric
 *    range ("1.x" | "*" | "1.0.0");
 *  - capability requests follow `port:<op>@<v>` or a host capability (`host.*`);
 *  - entry is a relative path inside the plugin dir (no leading "/", no "..").
 */
export function validateManifest(m: PluginManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // risk only on CONTRACT kind; language data only on LANG kind
  for (const [kind, list] of Object.entries(m.contributions ?? {})) {
    for (const c of list ?? []) {
      if (c.risk !== undefined && kind !== "contract") {
        issues.push(issue("RISK_NON_CONTRACT", `contributions.${kind}[${c.id}]`, `risk "${c.risk}" is only legal on contract-kind contributions (found kind "${kind}")`));
      }
      // Ω13.5 — frames/lexicon are legal ONLY on lang-kind contributions
      const hasLangData = (c as { frames?: unknown; lexicon?: unknown }).frames !== undefined
        || (c as { frames?: unknown; lexicon?: unknown }).lexicon !== undefined;
      if (hasLangData && kind !== "lang") {
        issues.push(issue("LANG_DATA_NON_LANG", `contributions.${kind}[${c.id}]`, `frames/lexicon data is only legal on lang-kind contributions (found kind "${kind}")`));
      }
      if (kind === "lang") {
        const lc = c as { frames?: Array<{ op?: string }>; lexicon?: Array<{ word?: string; op?: string }> };
        for (const f of lc.frames ?? []) {
          if (typeof f.op !== "string" || !OP_PATTERN.test(`${f.op}@1`)) {
            issues.push(issue("LANG_FRAME_OP", `contributions.lang[${c.id}].frames`, `frame op "${String(f.op)}" must be a valid op id (routable as <op>@1)`));
          }
        }
        for (const lx of lc.lexicon ?? []) {
          if (typeof lx.word !== "string" || lx.word.length === 0) {
            issues.push(issue("LANG_LEXICON_WORD", `contributions.lang[${c.id}].lexicon`, `lexicon entry requires a non-empty word`));
          }
          if (typeof lx.op !== "string" || !OP_PATTERN.test(`${lx.op}@1`)) {
            issues.push(issue("LANG_LEXICON_OP", `contributions.lang[${c.id}].lexicon`, `lexicon entry op "${String(lx.op)}" must be a valid op id`));
          }
        }
      }
    }
  }

  // routable ops: format + uniqueness across routable kinds
  const seenOps = new Map<string, string>();
  for (const kind of ROUTABLE_KINDS) {
    for (const c of m.contributions?.[kind] ?? []) {
      const op = `${c.id}@${c.version}`;
      if (!OP_PATTERN.test(op)) {
        issues.push(issue("OP_FORMAT", `contributions.${kind}[${c.id}]`, `routable op "${op}" must match <id>@<digit> (bare-major version)`));
      }
      if (seenOps.has(op)) {
        issues.push(issue("OP_COLLISION", `contributions.${kind}[${c.id}]`, `op "${op}" already registered by ${seenOps.get(op)} — routable ids are unique within a manifest`));
      } else {
        seenOps.set(op, `contributions.${kind}`);
      }
    }
  }

  // duplicate contributions within one kind
  for (const [kind, list] of Object.entries(m.contributions ?? {})) {
    const seen = new Set<string>();
    for (const c of list ?? []) {
      const key = `${c.id}@${c.version}`;
      if (seen.has(key)) issues.push(issue("DUP_CONTRIBUTION", `contributions.${kind}[${c.id}]`, `duplicate contribution ${kind} ${key}`));
      seen.add(key);
    }
  }

  // dependency-ref grammar
  m.dependencies.forEach((d, i) => {
    if (!DEP_REF_PATTERN.test(d.ref)) {
      issues.push(issue("DEP_REF_SYNTAX", `dependencies[${i}].ref`, `dependency ref "${d.ref}" must be "contract:<op>@<version>" or "capability:<cap>"`));
    }
    if (!DEP_RANGE_PATTERN.test(d.range)) {
      issues.push(issue("DEP_RANGE_SYNTAX", `dependencies[${i}].range`, `dependency range "${d.range}" must be "1.x", "*", or a numeric version`));
    }
  });

  // capability-request grammar
  m.capabilities.requested.forEach((cap, i) => {
    if (!CAP_PATTERN.test(cap)) {
      issues.push(issue("CAP_SYNTAX", `capabilities.requested[${i}]`, `capability request "${cap}" must be "port:<op>@<version>" or a host capability ("host.*")`));
    }
  });

  // entry: relative path inside the plugin dir
  if (m.entry.startsWith("/") || m.entry.startsWith("\\") || m.entry.split(/[/\\]/).includes("..")) {
    issues.push(issue("ENTRY_PATH", "entry", `entry "${m.entry}" must be a relative path inside the plugin dir (no leading "/" and no ".." segments)`));
  }

  // a signature without a key id is a broken publisher record (tamper surface)
  if (m.publisher.signature !== "" && !/^sha256:[0-9a-f]{64}$/.test(m.publisher.keyId)) {
    issues.push(issue("PUBLISHER_KEYID", "publisher.keyId", `signed manifest must carry a sha256 keyId (found "${m.publisher.keyId}")`));
  }

  return issues;
}

export interface CompositionValidationOptions {
  /** Manifests by plugin id: enables granted-op declaration checks + dependency satisfaction. */
  manifests?: Map<string, PluginManifest> | Record<string, PluginManifest>;
}

/**
 * Composition-level rules (the namespace/ownership law). An id may be DECLARED by
 * many plugins, but each routed op is OWNED by exactly one entry — grant.contracts
 * uniqueness across the composition. Also: bootPhase 0 belongs to vivim.law, grant
 * capabilities follow the cap grammar, and (when manifests are provided) every
 * granted op must be declared by that entry's manifest and every contract
 * dependency must be satisfied by the union of grants.
 */
export function validateComposition(spec: CompositionSpec, opts: CompositionValidationOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifests = opts.manifests instanceof Map ? opts.manifests : new Map(Object.entries(opts.manifests ?? {}));

  // bootPhase 0 belongs to vivim.law (host invariant — mirrored)
  const phase0 = spec.entries.filter((e) => e.bootPhase === 0);
  if (phase0.length !== 1 || phase0[0].id !== "vivim.law") {
    issues.push(issue("PHASE0_LAW", "entries", `bootPhase 0 must be exactly one entry with id "vivim.law" (found ${phase0.length}: ${phase0.map((e) => e.id).join(", ") || "none"})`));
  }

  // entry ids unique
  const seenIds = new Set<string>();
  spec.entries.forEach((e, i) => {
    if (seenIds.has(e.id)) issues.push(issue("DUP_ENTRY", `entries[${i}].id`, `duplicate composition entry id "${e.id}"`));
    seenIds.add(e.id);
    if (e.source.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(e.source)) {
      issues.push(issue("SOURCE_PATH", `entries[${i}].source`, `source "${e.source}" must be relative to the spec dir`));
    }
    e.grant.capabilities.forEach((cap, j) => {
      if (!CAP_PATTERN.test(cap) && cap !== "*") {
        issues.push(issue("CAP_SYNTAX", `entries[${i}].grant.capabilities[${j}]`, `granted capability "${cap}" must be "port:<op>@<version>" or a host capability ("host.*")`));
      }
    });
    e.grant.contracts.forEach((op, j) => {
      if (!OP_PATTERN.test(op)) {
        issues.push(issue("OP_FORMAT", `entries[${i}].grant.contracts[${j}]`, `granted op "${op}" must match <id>@<digit>`));
      }
    });
  });

  // op ownership: each routable op granted to exactly ONE entry
  const owner = new Map<string, string>();
  spec.entries.forEach((e, i) => {
    e.grant.contracts.forEach((op, j) => {
      const prev = owner.get(op);
      if (prev !== undefined) {
        issues.push(issue("OP_CONFLICT", `entries[${i}].grant.contracts[${j}]`, `routed op conflict: ${op} granted to both ${prev} and ${e.id} — an op is owned by exactly one entry`));
      } else {
        owner.set(op, e.id);
      }
    });
  });

  // with manifests: granted ops must be declared; dependencies must be satisfied
  for (const e of spec.entries) {
    const m = manifests.get(e.id);
    if (!m) continue;
    const declared = new Set(routableOps(m));
    e.grant.contracts.forEach((op) => {
      if (!declared.has(op)) {
        issues.push(issue("GRANT_NOT_DECLARED", `entries[${e.id}].grant.contracts`, `${e.id} granted routed op ${op} but its manifest does not declare it`));
      }
    });
    for (const dep of m.dependencies) {
      if (!dep.ref.startsWith("contract:")) continue;
      const want = dep.ref.slice("contract:".length);
      if (!spec.entries.some((x) => x.grant.contracts.includes(want))) {
        issues.push(issue("DEP_UNSATISFIED", `${e.id}.dependencies`, `${e.id} dependency ${dep.ref} unsatisfied in composition (no entry grants it)`));
      }
    }
    // capability grant sanity vs known host caps is the recipe's judgment; we only
    // check the manifest's REQUESTED caps against grantable forms when manifests are
    // supplied for the whole composition (the conformance runner does the fit check).
  }

  return issues;
}

/** Grantable capability universe for a composition context: host caps + port: forms of its routed ops. */
export function grantableFromOps(ops: string[]): string[] {
  return [...Object.values(HOST_CAPS), ...ops.map((op) => `port:${op}`)];
}

// ---- generality validators (Omega Forge Wave 0, D-405) ------------------------
// The evidence axis: WHAT HAS THIS ARTIFACT BEEN PROVEN AGAINST. Orthogonal to
// ProvenanceTier (who vouches). Four codes, all pure functions of the manifest
// (+ caller-supplied context for the report-only stale check):
//   GEN_LEVEL_MISSING      — no declared level (hard for forge.*/pack.builder/new
//                            manifests; report-only for the legacy retrofit batch)
//   GEN_MINE_UNPINNED      — harvested without a pinned <repo>@<sha>, empty
//                            originPaths, or a missing/invalid harvestClass
//   GEN_UNPROVEN           — generic without >=2 resolvable evidence refs, one
//                            independent of the declared mine
//   GEN_SPECULATIVE_STALE  — speculative with a live caller and no promotion
//                            evidence, or caller-less past the wave threshold
//                            (REPORT-ONLY in Wave 0 — no wave/caller tracking yet)

export interface GeneralityContext {
  /** Treat a missing level as an issue (forge.* plugins, pack.builder, new/modified manifests). */
  hard?: boolean;
  /** Caller tracking (report-only in Wave 0): does this artifact have a live consumer? */
  liveCaller?: boolean;
  /** Waves since first record with no caller (report-only in Wave 0). */
  wavesWithoutCaller?: number;
  /** Stale threshold in waves (default 3, packet §10). */
  staleAfterWaves?: number;
}

/** Is one evidence ref independent of the declared mine `repo@sha`?
 *  Dependent iff it IS that mine, or it is a fixture whose path carries the
 *  mine's repo name as a segment (a fixture derived from that mine). Ledger,
 *  composition, decision, second-mine, and foreign-path fixture refs are
 *  independent — the consumer/decision families name consumers, not sources. */
function evidenceIndependentOf(ref: string, mine: string | null | undefined): boolean {
  if (!mine) return true; // no declared mine: every resolvable ref is independent
  if (ref === `mine:${mine}`) return false;
  const repo = mine.split("@")[0] ?? "";
  if (repo && ref.startsWith("fixture:")) {
    const path = ref.slice("fixture:".length).split("@")[0] ?? "";
    if (path.split("/").includes(repo)) return false;
  }
  return true;
}

/** The four generality validators over one manifest. Pure; issue codes are stable machine keys. */
export function validateGenerality(m: PluginManifest, ctx: GeneralityContext = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const g = m.generality;
  const at = `${m.id}.generality`;

  // GEN_LEVEL_MISSING — declared by every plugin and pack; the phase-in policy
  // (hard for forge.*/pack.builder/new manifests) is the CALLER's stance, encoded
  // by ctx.hard. Report-only callers list the finding without failing.
  if (!g || typeof g.level !== "string") {
    if (ctx.hard !== false) issues.push(issue("GEN_LEVEL_MISSING", at, `${m.id} declares no generality level (speculative | harvested | generic) — the evidence axis is mandatory for forge.* plugins, pack.builder, and new or modified manifests`));
    return issues; // nothing else can be checked without a level
  }

  if (g.level === "speculative") {
    // GEN_SPECULATIVE_STALE — report-only in Wave 0 (wave/caller tracking lands later).
    if (ctx.liveCaller && (g.evidence ?? []).length === 0) {
      issues.push(issue("GEN_SPECULATIVE_STALE", `${at}.level`, `${m.id} is speculative but has a live caller and no promotion evidence — promote (decision record) or remove the caller`));
    }
    const threshold = ctx.staleAfterWaves ?? 3;
    if (typeof ctx.wavesWithoutCaller === "number" && ctx.wavesWithoutCaller >= threshold) {
      issues.push(issue("GEN_SPECULATIVE_STALE", `${at}.level`, `${m.id} is speculative with no caller for ${ctx.wavesWithoutCaller} waves (threshold ${threshold}) — delete it or re-record the intent`));
    }
  }

  if (g.level === "harvested") {
    // GEN_MINE_UNPINNED — the full harvested discipline: pinned mine, real
    // origin paths, a valid harvest class. Each gap is its own named issue so
    // the fix is mechanical.
    if (typeof g.mine !== "string" || !MINE_PATTERN.test(g.mine)) {
      issues.push(issue("GEN_MINE_UNPINNED", `${at}.mine`, `${m.id} is harvested but mine is missing or unpinned (want "<repo>@<sha>", 7-64 hex)`));
    }
    if (!Array.isArray(g.originPaths) || g.originPaths.length === 0) {
      issues.push(issue("GEN_MINE_UNPINNED", `${at}.originPaths`, `${m.id} is harvested but names no originPaths inside the pinned mine`));
    }
    if (typeof g.harvestClass !== "string" || !/^(ALGORITHM|SHAPED|SCHEMA|FIXTURE|POLICY|TEST|TOOLING|OTHER)$/.test(g.harvestClass)) {
      issues.push(issue("GEN_MINE_UNPINNED", `${at}.harvestClass`, `${m.id} is harvested but harvestClass is missing or invalid (ALGORITHM|SHAPED|SCHEMA|FIXTURE|POLICY|TEST|TOOLING|OTHER)`));
    }
  }

  if (g.level === "generic") {
    // GEN_MINE_UNPINNED (generic + mine present): the origin mine, if declared,
    // is still pinned — genericity never licenses a vague origin.
    if (g.mine !== undefined && g.mine !== null && !MINE_PATTERN.test(g.mine)) {
      issues.push(issue("GEN_MINE_UNPINNED", `${at}.mine`, `${m.id} declares generic with an unpinned origin mine (want "<repo>@<sha>", 7-64 hex)`));
    }
    // GEN_UNPROVEN — >=2 resolvable refs, >=1 independent of the declared mine.
    const refs = Array.isArray(g.evidence) ? g.evidence : [];
    const unresolvable = refs.filter((r) => !EVIDENCE_REF_PATTERN.test(r));
    for (const bad of unresolvable) {
      issues.push(issue("GEN_UNPROVEN", `${at}.evidence`, `${m.id} evidence ref "${bad}" is not a resolvable ref (ledger:ns/id | fixture:path@sha | mine:repo@sha | composition:id@sha | decision:D-NNN)`));
    }
    if (refs.length < 2) {
      issues.push(issue("GEN_UNPROVEN", `${at}.evidence`, `${m.id} declares generic with ${refs.length} evidence ref(s) — generic requires >=2 resolvable refs`));
    } else if (!refs.some((r) => evidenceIndependentOf(r, g.mine))) {
      // independence is only decidable with the refs in hand — a count failure subsumes it
      issues.push(issue("GEN_UNPROVEN", `${at}.evidence`, `${m.id} declares generic but every evidence ref depends on the declared mine (${g.mine ?? "n/a"}) — one independent consumer or second-mine ref is required`));
    }
  }

  return issues;
}
