// D-332 — contract call-site check (mechanical half of the plan's top-risk
// mitigation). Flags exported `contracts/` vocabulary with zero tree-wide
// call sites: vocabulary without a writer/reader. Folded into the W1 net
// (checkCompositions) — a conformance-net change, not subsystem work.
//
// A "call site" is any non-`export` line outside `contracts/src/` naming the
// export (imports, annotations, calls — including tests, which ARE readers:
// a real-boot test proving the wire is live counts). Re-export pass-through
// (`export …` lines) never counts — otherwise the barrel would launder every
// name. Intentional reservations are allowlisted LOUDLY with a D-record
// pointer (e.g. D-306), never silently.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Exported name → why zero tree-wide call sites are intentional. */
const CALL_SITE_ALLOWLIST: Record<string, string> = {
  // Grandfathered pre-V2 vocabulary: exported before the D-332 rule existed,
  // verified zero-hit on adoption day and kept deliberately. This list holds
  // ONLY zero-hit names — an entry whose export gains a call site should be
  // REMOVED (a live name needs no reservation), and an entry whose export is
  // deleted should be removed with it. Any NEW zero-hit export fails until
  // allowlisted here with a D-record pointer.
  CompositionSpecEntry: "D-332 grandfathered: recipe composition row exercised through CompositionSpec entries arrays, never imported by name",
  LangContribution: "D-332 grandfathered: post-v1 lang-kind path (D-218 deferred: contract-grammar change = amendment-class event)",
  LangFamilyChar: "D-332 grandfathered: nlcl-pure internal alphabet exercised through LangOpFrame, never named directly",
  LangFrameSlot: "D-332 grandfathered: nlcl-pure frame internals exercised through LangOpFrame, never named directly",
  LangLexiconEntry: "D-332 grandfathered: lexicon row shape exercised through WorldModel lexicon arrays, never named directly",
  LangOpFrame: "D-332 grandfathered: frame-table shape consumed inside nlcl-pure, referenced by file not by name",
  LangSlotKind: "D-332 grandfathered: slot-kind tag consumed inside nlcl-pure, referenced by file not by name",
  OutcomeStatus: "D-332 grandfathered: outcome-status union matched as literals at call sites (OK/UNKNOWN/REFUSED…); the union is kept for SDK consumers",
  PROMOTION_INVARIANT: "D-332 grandfathered: cross-track reference constant cited by docs and decision records, not imported by product code (yet — the DB-track conformance of D-314 is its future reader)",
  PortErrorCode: "D-332 grandfathered: error-code union matched as literals at call sites, never imported by name",
  ProvenanceTier: "D-332 grandfathered: lifecycle-tier tag reserved for a second provenance authority that was never built (non-goal held)",
  // D-373 step-2 reservations: the storage.kv WIRE vocabulary (FOUNDATION-DRAFT-002
  // §2) for cross-plugin drivers — the Postgres driver and the vault-as-spine
  // routing land against these types with their own falsifier (byte-identical CAS
  // hashes sqlite vs postgres). The sqlite driver lane consumes the driver-scoped
  // subset (StorageDriverId/StorageDriverInfo/isValidStorageDriverId are wired);
  // the op/result batch shapes stay reserved until the composition generator (W0-1)
  // unblocks driver compositions under the D-370 freeze.
  StorageOp: "D-373 step-2 reservation: storage.kv wire op batch (Postgres driver falsifier lands against it; generator-dependent)",
  StorageResult: "D-373 step-2 reservation: storage.kv wire result batch (same landing as StorageOp)",
  StorageDriverContract: "D-373 step-2 reservation: the cross-plugin driver contract (execute+health) for the broker-plugin driver step",
  StorageKey: "D-373 step-2 reservation: storage.kv key alias (rides the StorageOp wire shape)",
  StorageTable: "D-373 step-2 reservation: storage.kv table alias (rides the StorageOp wire shape)",
  // D-389 deferred-by-design reservations (the intent mechanism's plan/saga
  // vocabulary): the D-389 record ships the wire shapes and explicitly defers
  // their consumers — projection mapping waits for plan:<type>@2 "once real
  // workflow needs it", and the saga/compensation engine is out of scope
  // (fresh consent required, implying rollback would be worse than stating the
  // limit). Same posture as the D-373 storage.kv reservations above: the names
  // are committed wire vocabulary; the writers arrive with their own wave and
  // falsifier. Remove an entry the day its export gains a call site.
  PlanTemplate: "D-389 deferred-by-design: v1 plan-template wire shape (same-payload DAG); projection consumer lands with plan:<type>@2",
  PlanStepTemplate: "D-389 deferred-by-design: plan-step template row (rides PlanTemplate); projection consumer lands with plan:<type>@2",
  PlanTemplateV2: "D-389 Phase-3 reservation: InputMapping-carrying template shape; consumer is the deferred projection mapping (plan:<type>@2 trigger)",
  SagaEvidenceRef: "D-389 Phase-4 reservation: consent-gated compensation evidence ref; saga/rollback engine explicitly out of scope (D-389 deferred list)",
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dev-vault", "build"]);

export interface ContractSitesResult {
  ok: boolean;
  detail: { checked: number; allowlisted: string[] };
  issues: string[];
}

/** Exported names per contracts/src file (barrel index.ts carries no definitions). */
export function collectContractExports(ROOT: string): Map<string, string[]> {
  const dir = join(ROOT, "contracts", "src");
  const out = new Map<string, string[]>();
  const add = (name: string, file: string) => {
    if (name === "*") return;
    out.set(name, [...(out.get(name) ?? []), file]);
  };
  let files: string[];
  try {
    files = readdirSync(dir).sort(); // filesystem order is unspecified — sort so per-export file lists are deterministic everywhere
  } catch {
    return out; // no contracts tree here (unit scaffolds) — nothing to check
  }
  for (const f of files) {
    if (!f.endsWith(".ts") || f === "index.ts") continue;
    const text = readFileSync(join(dir, f), "utf-8");
    for (const m of text.matchAll(/export\s+(?:interface|type|function|const|class|enum)\s+([A-Za-z0-9_]+)/g)) {
      add(m[1]!, f);
    }
    for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
      for (const part of m[1]!.split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) add(name, f);
      }
    }
  }
  return out;
}

function walkTs(ROOT: string, cb: (file: string) => void): void {
  const visit = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        if (SKIP_DIRS.has(f.name)) continue;
        if (dir === ROOT && f.name === "contracts") continue; // definitions never count
        visit(join(dir, f.name));
      } else if (f.isFile() && f.name.endsWith(".ts")) {
        const full = join(dir, f.name);
        // Harness self-exclusion: the checker and its own unit test name
        // allowlisted exports in string literals (allowlist keys, fixture
        // bodies) — counting them would launder reservations into fake call
        // sites (the check must not observe its harness).
        if (
          full === join(ROOT, "tooling", "gates", "contract-sites.ts") ||
          full === join(ROOT, "tooling", "gates", "test", "contract-sites.test.ts")
        ) continue;
        cb(full);
      }
    }
  };
  visit(ROOT);
}

/** Names with ≥1 non-export line outside contracts/src. */
export function findCallSites(ROOT: string, names: Set<string>): Set<string> {
  const hit = new Set<string>();
  const patterns = [...names].map((n) => ({ n, re: new RegExp(`\\b${n}\\b`) }));
  walkTs(ROOT, (file) => {
    const text = readFileSync(file, "utf-8");
    const lines = text.split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("export ")) continue; // barrel/manifest pass-through never counts
      for (const { n, re } of patterns) {
        if (!hit.has(n) && re.test(line)) hit.add(n);
      }
      if (hit.size === names.size) return;
    }
  });
  return hit;
}

export async function checkContractCallSites(ROOT: string): Promise<ContractSitesResult> {
  const issues: string[] = [];
  const exported = collectContractExports(ROOT);
  const hit = findCallSites(ROOT, new Set(exported.keys()));
  const allowlisted: string[] = [];
  for (const name of [...exported.keys()].sort()) {
    if (hit.has(name)) continue;
    const reason = CALL_SITE_ALLOWLIST[name];
    if (reason) {
      allowlisted.push(name);
      continue;
    }
    issues.push(
      `contracts: exported "${name}" (${exported.get(name)!.join(", ")}) has zero call sites tree-wide ` +
      `— vocabulary without a writer/reader (D-332). Wire it (writer + reader + real-boot test) or ` +
      `allowlist it in tooling/gates/contract-sites.ts with a D-record pointer.`,
    );
  }
  return { ok: issues.length === 0, detail: { checked: exported.size, allowlisted }, issues };
}

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  checkContractCallSites(ROOT).then((r) => {
    console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
