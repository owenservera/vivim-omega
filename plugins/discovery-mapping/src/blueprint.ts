// discovery.mapping — blueprint.ts (Ω8)
//
// Blueprint normalization: the domain pack's CONTRACT contributions become the
// constraint set. TOLERANT INPUT — either of:
//   • a pack manifest object (e.g. the parsed packs/domain-email/plugin.json —
//     its contributions.contract[] is extracted: {op: "message.send@1", risk}),
//   • a normalized doc {ops: [{op, risk}]}.
// The blueprint is DATA (declarations); the mapping engine never imports pack
// code. Contract entries without a declared risk bind as READ (same semantics
// as the router's riskyOps: no declared risk → not gated / read-class).
//
// Duplicated per the B2 import law (plugins never import each other or packs).

export type RiskClass = "EXTERNAL_MUTATION" | "MUTATION" | "READ";

export interface BlueprintOp {
  op: string;    // full op id with version, e.g. "message.send@1"
  risk: RiskClass;
}

export interface Blueprint { ops: BlueprintOp[]; source: string }

const RISK_CLASSES: RiskClass[] = ["EXTERNAL_MUTATION", "MUTATION", "READ"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRisk(v: unknown): RiskClass | null {
  return typeof v === "string" && (RISK_CLASSES as string[]).includes(v) ? (v as RiskClass) : null;
}

/** "message.send@1" → "message.send" (name-only comparison for candidate binding). */
export function baseOp(op: string): string {
  const at = op.lastIndexOf("@");
  return at > 0 ? op.slice(0, at) : op;
}

/** Normalize any supported blueprint input into {ops, source}; throws on unusable input. */
export function normalizeBlueprint(input: unknown, source: string): Blueprint {
  if (!isPlainObject(input)) throw new Error(`discovery.map@1: blueprint must be an object (pack manifest or {ops:[]}) — got ${typeof input}`);
  const ops: BlueprintOp[] = [];

  // Form 1: a pack manifest — extract the CONTRACT contributions.
  const contributions = isPlainObject(input.contributions) ? input.contributions : {};
  const contractList = Array.isArray(contributions.contract) ? contributions.contract : null;
  if (contractList) {
    for (const c of contractList) {
      if (!isPlainObject(c)) continue;
      if (typeof c.id !== "string" || c.id.length === 0) continue;
      const version = typeof c.version === "string" && c.version.length > 0 ? c.version : "1";
      const risk = asRisk(c.risk) ?? "READ";
      ops.push({ op: `${c.id}@${version}`, risk });
    }
  }

  // Form 2: a normalized doc {ops: [...]}, or {contracts: [...]} aliases.
  for (const key of ["ops", "contracts"] as const) {
    if (Array.isArray(input[key])) {
      for (const c of input[key] as unknown[]) {
        if (typeof c === "string") { ops.push({ op: c, risk: "READ" }); continue; }
        if (!isPlainObject(c)) continue;
        if (typeof c.op !== "string" && typeof c.id !== "string") continue;
        const rawOp = (c.op ?? c.id) as string;
        if (rawOp.length === 0) continue;
        const version = typeof c.version === "string" && c.version.length > 0 && !rawOp.includes("@") ? c.version : "";
        const op = version ? `${baseOp(rawOp)}@${version}` : rawOp;
        const risk = asRisk(c.risk) ?? "READ";
        ops.push({ op, risk });
      }
    }
  }

  if (ops.length === 0) {
    throw new Error(`discovery.map@1: blueprint carries no ops (checked contributions.contract and ops/contracts arrays) — source ${source}`);
  }
  return { ops, source };
}
