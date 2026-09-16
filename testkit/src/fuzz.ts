// @vivim/omega-testkit — fuzz.ts
// Seeded, DETERMINISTIC generators (the reproducibility law): the same integer
// seed always yields byte-identical output. Randomness never leaks Date.now(),
// Math.random, or iteration order — every decision comes from the seeded PRNG.
// Scope note (ISS-018): this law binds test *assertions and fixtures* —
// production tmp names (CAS, scratch dirs) may use ambient randomness freely;
// only what a test asserts on must be seeded.
import type { PluginManifest } from "@vivim/omega-contracts";
import { CONTRIBUTION_KINDS } from "@vivim/omega-contracts";

/** Deterministic PRNG (mulberry32) — the only source of "randomness" in the testkit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_PARTS = ["note", "echo", "law", "vault", "run", "msg", "task", "item", "alpha", "beta"];
const RISKS = ["EXTERNAL_MUTATION", "MUTATION", "READ"] as const;
const RANGES = ["1.x", "*", "1", "1.0.0"] as const;
const CAP_FORMS = ["port:%s@1", "host.journal.append", "host.tokens.revoke", "banana"] as const;

/** Injected mutation classes — INVALID ones must be caught by schema or semantic validator. */
export type FuzzMutationKind = "valid" | "invalid";

const MUTATIONS: Array<{ kind: FuzzMutationKind; apply: (m: PluginManifest, rng: () => number) => void }> = [
  { kind: "valid", apply: (m) => { m.description = `fuzzed at ${m.id}`; } },
  { kind: "valid", apply: (m, rng) => { m.version = `${1 + Math.floor(rng() * 3)}.0.0`; } },
  { kind: "valid", apply: (m, rng) => { m.runtime.budget.cpuMs = 50 + Math.floor(rng() * 500); } },
  { kind: "valid", apply: (m, rng) => { m.contributions.schema!.push({ kind: "schema", id: `fz${Math.floor(rng() * 1000)}`, version: "1" }); } },
  { kind: "valid", apply: (m, rng) => { m.capabilities.justification = `because ${Math.floor(rng() * 99)}`; } },
  { kind: "invalid", apply: (m) => { m.manifestVersion = "2"; } },
  { kind: "invalid", apply: (m, rng) => { m.id = ID_PARTS[Math.floor(rng() * ID_PARTS.length)].toUpperCase(); } },
  { kind: "invalid", apply: (m, rng) => { m.contributions.contract![0].version = `${1 + Math.floor(rng() * 9)}.2.3`; } },
  { kind: "invalid", apply: (m, rng) => { m.contributions.contract![0].risk = RISKS[Math.floor(rng() * RISKS.length)] === "READ" ? "WRITE" : "DESTROY" as never; } },
  { kind: "invalid", apply: (m) => { m.contributions.engine![0].risk = "MUTATION" as never; } },
  { kind: "invalid", apply: (m, rng) => { m.dependencies.push({ ref: rng() < 0.5 ? "contract:nope" : "plain.nope", range: RANGES[Math.floor(rng() * RANGES.length)] }); } },
  { kind: "invalid", apply: (m, rng) => { m.capabilities.requested.push(CAP_FORMS[3].replace("%s", "x")); } },
  { kind: "invalid", apply: (m) => { m.entry = "/abs/fuzz.ts"; } },
  { kind: "invalid", apply: (m, rng) => { m.contentHash = rng() > 0.5 ? "md5:fuzz" : "sha256:short"; } },
  { kind: "invalid", apply: (m) => { (m as Record<string, unknown>).dependencies = "nope"; } },
];

export interface FuzzManifestCase {
  manifest: PluginManifest;
  mutation: { index: number; kind: FuzzMutationKind };
}

/** The full deterministic case (manifest + which mutation class ran) — for property tests. */
export function fuzzManifestCase(seed: number): FuzzManifestCase {
  const rng = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  const manifest: PluginManifest = {
    manifestVersion: "1",
    id: `fuzz.${pick(ID_PARTS)}.${Math.floor(rng() * 1000)}`,
    version: "0.1.0",
    description: `seeded fuzz manifest (seed ${seed})`,
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      schema: [{ kind: "schema", id: `fz${Math.floor(rng() * 100)}`, version: "1" }],
      contract: [
        { kind: "contract", id: `fz.read${Math.floor(rng() * 50)}`, version: "1", risk: "READ" },
        { kind: "contract", id: `fz.write${Math.floor(rng() * 50)}`, version: "1", risk: "MUTATION" },
      ],
      engine: [{ kind: "engine", id: `fz.engine${Math.floor(rng() * 50)}`, version: "1" }],
    },
    dependencies: [{ ref: "contract:echo.ping@1", range: pick(RANGES) }],
    capabilities: { requested: [pick(CAP_FORMS).replace("%s", "echo.ping")], justification: "fuzz" },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 64 } },
    contentHash: "",
  };
  // drop the "banana" cap form when picked — the BASE must be valid; mutations break things
  if (manifest.capabilities.requested[0] === "banana") manifest.capabilities.requested = ["port:echo.ping@1"];

  const index = Math.floor(rng() * MUTATIONS.length);
  MUTATIONS[index].apply(manifest, rng);
  return { manifest, mutation: { index, kind: MUTATIONS[index].kind } };
}

/** A valid-ish manifest with one seeded mutation. Same seed → identical manifest. */
export function fuzzManifest(seed: number): PluginManifest {
  return fuzzManifestCase(seed).manifest;
}

/** A structured-clone-safe random payload (nested objects/arrays/scalars), seeded. */
export function fuzzPayload(seed: number): unknown {
  const rng = mulberry32(seed ^ 0x5eed);
  const depth = 1 + Math.floor(rng() * 3);
  const gen = (d: number): unknown => {
    const roll = rng();
    if (d >= depth || roll < 0.15) {
      if (roll < 0.05) return null;
      if (roll < 0.10) return rng() < 0.5;
      if (roll < 0.15) return Math.floor(rng() * 100000);
      return `s${Math.floor(rng() * 100000)}`;
    }
    if (roll < 0.55) {
      const obj: Record<string, unknown> = {};
      const n = 1 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) obj[`k${Math.floor(rng() * 1000)}`] = gen(d + 1);
      return obj;
    }
    const arr: unknown[] = [];
    const n = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) arr.push(gen(d + 1));
    return arr;
  };
  return gen(0);
}

/** Contribution kinds (re-export for generator-driven fixtures). */
export { CONTRIBUTION_KINDS };
