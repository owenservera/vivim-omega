// @vivim/omega-contracts — manifest.ts
// One manifest format, all plugins including the spine. The manifest is a REQUEST,
// never a grant — the user-signed Recipe is the only grantor.

export const CONTRIBUTION_KINDS = [
  "schema", "contract", "engine", "provider",
  "runtime", "surface", "policy", "pack", "test",
  "lang", // Ω13.5 — vocabulary/frames as data (see ./lang.ts). NOT routable.
  "parser", // D-355 (M7) — parser-as-governed-data: a signed, version-pinned
  // contribution whose whole job is producing M1 chunk rows (see ./parser.ts).
  // NOT routable: registers no op, never appears in routableOps()/riskyOps().
] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export type RiskClass = "EXTERNAL_MUTATION" | "MUTATION" | "READ";

export type ProviderClass = "SIMULATOR" | "API_NATIVE" | "BROWSER_MEDIATED";
// Note: Structured to admit a future 4th member (e.g. "INTELLIGENCE_HARNESS") without a breaking change.

export type PortPriority = "gate" | "normal";
export interface Contribution {
  kind: ContributionKind;
  id: string;          // namespace-scoped: "message.send" in pack domain-email
  version: string;     // contract version, semver-ish "1"
  risk?: RiskClass;    // CONTRACT kind only — declared data, not code switches
  priority?: PortPriority; // D-392: additive per-CONTRACT tier, default normal
  idempotent?: boolean;       // D-389: optional
  cancellable?: boolean;      // D-389: optional
  estimatedCostMs?: number;   // D-389: optional
}

export interface DependencyRef {
  ref: string;         // "contract:echo.ping@1" | "capability:vault.append"
  range: string;       // "1.x" | "*"
}

// D-374 (W0-10 / FOUNDATION-DRAFT-002): the runtime tier vocabulary widens
// additively. "worker-thread" is the only tier the µhost spawns (B2);
// "process" compartments are spawned by the vivim-run broker (platformSpawn,
// ndjson stdio); "wasm" is FORWARD-DECLARED ONLY — no WasmRuntime shape, no
// implementation, reserved for the D-354 isolation-taxonomy ruling.
export type RuntimeTier = "worker-thread" | "process" | "wasm";

/** How a process-tier compartment is spawned — declared on the TARGET plugin's
 *  manifest (additive, optional), embedded into broker config by the W0-1
 *  generator when it lands. `cmd` is the shim invocation; `stdio` is pinned to
 *  "ndjson" (the D-374 wire discipline); secrets ride credentialRefs resolved
 *  via credential.use — never literal env, never manifest values. */
export interface ProcessRuntime {
  cmd: string[];
  stdio: "ndjson";
  credentialRefs?: string[];
  poolSize?: number;
}

export interface PluginManifest {
  manifestVersion: "1";
  id: string;          // "vivim.law" | "vivim.vault" | "omega.echo" | "com.example.gmail"
  version: string;
  description?: string;
  entry: string;       // worker entry, relative to the plugin source dir (v1 addition)
  publisher: { keyId: string; signature: string }; // ed25519 over canonical manifest digest
  contributions: Partial<Record<ContributionKind, Contribution[]>>;
  dependencies: DependencyRef[];
  capabilities: { requested: string[]; justification?: string };
  runtime: {
    tier: RuntimeTier;
    budget: { cpuMs?: number; memMB?: number; maxConcurrentCalls?: number }; // D-392: additive cap, default 4
    process?: ProcessRuntime; // D-374: additive — manifests without it validate unchanged
  };
  contentHash: string; // "sha256:<hex>" over the plugin content dir (excl. plugin.json, node_modules)
  granularity?: Granularity;          // D-340 (kernel requirement #5): DATA, not a schema fork — a coarse legacy-wrapping plugin and a future atomic one declare the SAME shape. Defaults to "atomic".
  internalSeams?: string[];           // coarse plugins name the seams a later extraction would cut along
  extractionCandidate?: boolean;      // honest self-report; computed centrality (kernel.centrality@1) is the ground truth that checks it
}

export type Granularity = "coarse" | "atomic";

/** Manifest honesty validation (kernel requirement #5, the manifest.rs::validate port).
 *  Catches self-reporting lies the structural parse cannot: an atomic plugin still
 *  declaring internal seams (claiming to have extracted while it hasn't), and an
 *  extraction candidate naming no seams (flagging intent without doing the cheap work
 *  of naming what would be cut). Called at compile time — fail-closed, like every
 *  other manifest check. */
export function validateManifestHonesty(m: PluginManifest): string[] {
  const errors: string[] = [];
  const granularity = m.granularity ?? "atomic";
  const seams = m.internalSeams ?? [];
  if (granularity === "atomic" && seams.length > 0) {
    errors.push(`${m.id}: atomic plugin declaring internalSeams — seams belong to coarse plugins (still claiming an unextracted interior?)`);
  }
  if (m.extractionCandidate === true && granularity !== "atomic" && seams.length === 0) {
    errors.push(`${m.id}: extractionCandidate with no internalSeams — name the seams before flagging extraction intent`);
  }
  return errors;
}

/** Ops a plugin makes routable: contract/engine/provider contributions register ops as `<id>@<version>`. */
export function routableOps(manifest: PluginManifest): string[] {
  const ops: string[] = [];
  for (const kind of ["contract", "engine", "provider"] as const) {
    for (const c of manifest.contributions[kind] ?? []) ops.push(`${c.id}@${c.version}`);
  }
  return ops;
}

/** Ops with declared mutation-class risk (the router gates these through law.check). */
export function riskyOps(manifest: PluginManifest): Map<string, RiskClass> {
  const m = new Map<string, RiskClass>();
  for (const c of manifest.contributions.contract ?? []) {
    if (c.risk && c.risk !== "READ") m.set(`${c.id}@${c.version}`, c.risk);
  }
  return m;
}
