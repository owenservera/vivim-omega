// Ω4 sdk — schema round-trip gate. Every real manifest in the repo must parse green
// against the zod mirror; a seeded mutation property (200 cases) proves no tampered
// manifest is silently accepted by schema OR semantic validator.
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseManifest, parseRecipeShape,
  PluginManifestSchema, RecipeSchema, PortResultSchema, PortMessageSchema, LawDecisionSchema, ConsentGrantSchema, CompositionSpecSchema, CompositionEntrySchema,
} from "@vivim/omega-sdk";
import { validateManifest } from "@vivim/omega-sdk";
import type { PluginManifest, Recipe, CompositionEntry } from "@vivim/omega-contracts";

const REPO = join(import.meta.dir, "../..");

// seeded PRNG (mulberry32) — deterministic property inputs
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pluginJsonFiles(): string[] {
  const out: string[] = [];
  for (const root of ["plugins", "examples"]) {
    const base = join(REPO, root);
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const f = join(base, d.name, "plugin.json");
      if (existsSync(f)) out.push(f);
    }
  }
  return out;
}

describe("Ω4 sdk schema — every repo manifest parses green", () => {
  test("all plugin.json under plugins/* and examples/* parse + validate green", () => {
    const files = pluginJsonFiles();
    expect(files.length).toBeGreaterThanOrEqual(9); // 4 spine plugins + 5 examples (incl. omega.notes)
    for (const f of files) {
      const text = readFileSync(f, "utf-8");
      const r = parseManifest(text);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(`${f}: ${r.errors.join("; ")}`);
      // round-trip fidelity: the zod value is the same JSON (no stripping, no transforms)
      expect(r.value).toEqual(JSON.parse(text));
      const issues = validateManifest(r.value);
      expect(issues).toEqual([]); // semantic law also green for every shipped manifest
    }
  });

  test("schema rejects each shipped sabotage class with a readable error", () => {
    const cases: Array<[unknown, string]> = [
      [{ manifestVersion: "2", id: "x.y", version: "1", entry: "src/index.ts", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "manifestVersion"],
      [{ manifestVersion: "1", id: "Ωmega", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "id"],
      [{ manifestVersion: "1", id: "x.y", version: "one", entry: "s", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "version"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "entry"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: { contract: [{ kind: "bogus", id: "a.b", version: "1" }] }, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "contributions"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: { contract: [{ kind: "contract", id: "a.b", version: "1", risk: "DESTROY" }] }, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" }, "risk"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "wasm-magic", budget: {} }, contentHash: "" }, "tier"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "md5:abc" }, "contentHash"],
      [{ manifestVersion: "1", id: "x.y", version: "1", entry: "s", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "", extra: "nope" }, "(root)"],
    ];
    for (const [input, pathHint] of cases) {
      const r = parseManifest(JSON.stringify(input));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => e.includes(pathHint))).toBe(true);
    }
  });

  test("parseManifest never throws: invalid JSON and non-object inputs fail closed", () => {
    expect(parseManifest("{not json").ok).toBe(false);
    expect(parseManifest("null").ok).toBe(false);
    expect(parseManifest("42").ok).toBe(false);
    expect(parseManifest([]).ok).toBe(false);
    const r = parseManifest("{not json");
    if (!r.ok) expect(r.errors[0]).toContain("invalid JSON");
  });
});

describe("Ω4 sdk schema — wire shapes round-trip", () => {
  const entry: CompositionEntry = {
    id: "vivim.law", version: "0.1.0", source: "../plugins/law-stub", manifestPath: "manifests/vivim.law.json",
    manifestHash: `sha256:${"a".repeat(64)}`, contentHash: `sha256:${"b".repeat(64)}`,
    grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1"] }, bootPhase: 0,
  };
  const recipe: Recipe = {
    recipeVersion: 1, hashAlgo: "sha256", name: "t", composition: [entry],
    rootOfTrust: { keyId: `sha256:${"c".repeat(64)}`, publicKey: "pubkeyb64" }, signature: "sigb64",
  };

  test("RecipeSchema + CompositionEntrySchema accept the pinned shape and reject drift", () => {
    expect(RecipeSchema.safeParse(recipe).success).toBe(true);
    expect(parseRecipeShape(JSON.parse(JSON.stringify(recipe))).ok).toBe(true);
    expect(parseRecipeShape({ ...recipe, recipeVersion: 2 }).ok).toBe(false);
    expect(parseRecipeShape({ ...recipe, hashAlgo: "md5" }).ok).toBe(false);
    expect(parseRecipeShape({ ...recipe, composition: [] }).ok).toBe(false);
    expect(CompositionEntrySchema.safeParse({ ...entry, bootPhase: -1 }).success).toBe(false);
    expect(CompositionEntrySchema.safeParse({ ...entry, manifestHash: "sha256:short" }).success).toBe(false);
  });

  test("PortResultSchema: both registers, error enum pinned, freshness optional", () => {
    expect(PortResultSchema.safeParse({ ok: true, value: { x: 1 }, freshness: "CURRENT", evidence: { rev: "r1" } }).success).toBe(true);
    expect(PortResultSchema.safeParse({ ok: true, value: null }).success).toBe(true);
    expect(PortResultSchema.safeParse({ ok: false, error: "REFUSED", detail: "no" }).success).toBe(true);
    expect(PortResultSchema.safeParse({ ok: false, error: "MAYBE" }).success).toBe(false);
    expect(PortResultSchema.safeParse({ ok: false }).success).toBe(false); // error required
    expect(PortResultSchema.safeParse({ ok: true, value: 1, freshness: "EXPIRED" }).success).toBe(false);
  });

  test("PortResultSchema: refusal report rides the error register (E-7, additive)", () => {
    const withRefusal = {
      ok: false, error: "REFUSED", detail: "consent required: consent_abc",
      refusal: { rule: "law.check@1", principal: "root", op: "risky.op@1", consentId: "consent_abc" },
    };
    expect(PortResultSchema.safeParse(withRefusal).success).toBe(true);
    expect(PortResultSchema.safeParse({ ok: false, error: "REFUSED" }).success).toBe(true); // refusal optional
    expect(PortResultSchema.safeParse({ ok: false, error: "REFUSED", refusal: { principal: "root" } }).success).toBe(false); // rule required
  });

  test("PortMessageSchema + LawDecisionSchema + ConsentGrantSchema + CompositionSpecSchema", () => {
    expect(PortMessageSchema.safeParse({ causationId: "c_1", capabilityToken: "tok_x", op: "echo.ping@1", payload: { a: 1 }, deadlineMs: 100 }).success).toBe(true);
    expect(PortMessageSchema.safeParse({ causationId: "", capabilityToken: "t", op: "o", payload: null, deadlineMs: 1 }).success).toBe(false);
    expect(LawDecisionSchema.safeParse({ decision: "require-consent", consentId: "consent_ab", reason: "r" }).success).toBe(true);
    expect(LawDecisionSchema.safeParse({ decision: "maybe" }).success).toBe(false);
    expect(ConsentGrantSchema.safeParse({ consentId: "consent_x", grantedAt: 123 }).success).toBe(true);
    expect(ConsentGrantSchema.safeParse({ consentId: "x" }).success).toBe(false);
    expect(CompositionSpecSchema.safeParse({ name: "demo", entries: [{ id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: [], contracts: [] } }] }).success).toBe(true);
    expect(CompositionSpecSchema.safeParse({ name: "", entries: [] }).success).toBe(false);
  });
});

// ---- the mutation property (seeded, 200 cases) --------------------------------

function baseManifest(): PluginManifest {
  return JSON.parse(JSON.stringify({
    manifestVersion: "1",
    id: "omega.prop",
    version: "0.1.0",
    description: "property-test base manifest",
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      schema: [{ kind: "schema", id: "prop", version: "1" }],
      contract: [
        { kind: "contract", id: "prop.read", version: "1", risk: "READ" },
        { kind: "contract", id: "prop.write", version: "1", risk: "MUTATION" },
      ],
      engine: [{ kind: "engine", id: "prop.engine", version: "1" }],
    },
    dependencies: [{ ref: "contract:echo.ping@1", range: "1.x" }],
    capabilities: { requested: ["port:echo.ping@1", "host.journal.append"], justification: "property" },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 64 } },
    contentHash: "",
  })) as PluginManifest;
}

// one random field sabotaged per case — every mutation is catchable by the zod
// schema OR the semantic validator (signature-VALUE tampering is excluded on
// purpose: that is verifyManifest's job, proven in sign.test.ts).
const MUTATIONS: Array<{ name: string; apply: (m: PluginManifest) => void }> = [
  { name: "manifestVersion→2", apply: (m) => { m.manifestVersion = "2"; } },
  { name: "manifestVersion→number", apply: (m) => { (m as Record<string, unknown>).manifestVersion = 1; } },
  { name: "delete manifestVersion", apply: (m) => { delete (m as Record<string, unknown>).manifestVersion; } },
  { name: "id→uppercase/space", apply: (m) => { m.id = "Omega Prop"; } },
  { name: "id→empty", apply: (m) => { m.id = ""; } },
  { name: "version→word", apply: (m) => { m.version = "one"; } },
  { name: "entry→empty", apply: (m) => { m.entry = ""; } },
  { name: "entry→absolute", apply: (m) => { m.entry = "/etc/passwd"; } },
  { name: "delete entry", apply: (m) => { delete (m as Record<string, unknown>).entry; } },
  { name: "publisher.keyId→number", apply: (m) => { (m.publisher as Record<string, unknown>).keyId = 1; } },
  { name: "delete publisher", apply: (m) => { delete (m as Record<string, unknown>).publisher; } },
  { name: "contribution kind→bogus", apply: (m) => { m.contributions.contract![0].kind = "bogus" as never; } },
  { name: "contribution risk→bad-enum", apply: (m) => { m.contributions.contract![0].risk = "DESTROY" as never; } },
  { name: "risk on schema kind", apply: (m) => { m.contributions.schema![0].risk = "READ"; } },
  { name: "risk on engine kind", apply: (m) => { m.contributions.engine![0].risk = "MUTATION" as never; } },
  { name: "routable version→1.0.0", apply: (m) => { m.contributions.contract![0].version = "1.0.0"; } },
  { name: "contribution id→uppercase", apply: (m) => { m.contributions.contract![0].id = "Prop.Read"; } },
  { name: "duplicate contract op", apply: (m) => { m.contributions.contract!.push({ ...m.contributions.contract![0] }); } },
  { name: "op collision engine/contract", apply: (m) => { m.contributions.engine![0] = { kind: "engine", id: "prop.read", version: "1" }; } },
  { name: "dep ref missing prefix", apply: (m) => { m.dependencies[0].ref = "echo.ping@1"; } },
  { name: "dep range→word", apply: (m) => { m.dependencies[0].range = "whenever"; } },
  { name: "cap request→banana", apply: (m) => { m.capabilities.requested = ["banana"]; } },
  { name: "cap request→number", apply: (m) => { (m.capabilities as Record<string, unknown>).requested = [42]; } },
  { name: "runtime tier→magic", apply: (m) => { m.runtime.tier = "wasm-magic" as never; } },
  { name: "budget cpuMs→string", apply: (m) => { m.runtime.budget.cpuMs = "lots" as never; } },
  { name: "contentHash→md5", apply: (m) => { m.contentHash = "md5:abc"; } },
  { name: "contributions→null", apply: (m) => { (m as Record<string, unknown>).contributions = null; } },
  { name: "delete contributions", apply: (m) => { delete (m as Record<string, unknown>).contributions; } },
  { name: "dependencies→string", apply: (m) => { (m as Record<string, unknown>).dependencies = "none"; } },
  { name: "capabilities.requested→string", apply: (m) => { (m.capabilities as Record<string, unknown>).requested = "port:x@1"; } },
  { name: "unknown extra field", apply: (m) => { (m as Record<string, unknown>).tasty = true; } },
];

describe("Ω4 sdk — mutation property (seeded, 200 cases): no silent acceptance", () => {
  test("one random field sabotaged per case → schema OR semantic validator catches it", () => {
    const rng = mulberry32(20260911);
    const seen = new Set<string>();
    let caught = 0;
    for (let i = 0; i < 200; i++) {
      const m = baseManifest();
      const mut = MUTATIONS[Math.floor(rng() * MUTATIONS.length)];
      seen.add(mut.name);
      mut.apply(m);
      const parsed = parseManifest(JSON.parse(JSON.stringify(m)));
      const semantic = parsed.ok ? validateManifest(parsed.value) : [];
      const caughtHere = !parsed.ok || semantic.length > 0;
      if (!caughtHere) {
        throw new Error(`silent acceptance: case ${i}, mutation "${mut.name}" passed schema AND semantics`);
      }
      expect(parsed.ok ? semantic.length > 0 : true).toBe(true);
      caught++;
    }
    expect(caught).toBe(200);
    expect(seen.size).toBe(MUTATIONS.length); // coverage: every sabotage class fired at least once
  });

  test("determinism: same seed stream picks the same mutation sequence", () => {
    const pick = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 50 }, () => MUTATIONS[Math.floor(rng() * MUTATIONS.length)].name);
    };
    expect(pick(42)).toEqual(pick(42));
    expect(pick(42)).not.toEqual(pick(43));
  });
});
