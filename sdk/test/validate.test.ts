// Ω4 sdk — semantic validator laws beyond shape.
import { describe, test, expect } from "bun:test";
import { validateManifest, validateComposition, grantableFromOps, parseManifest } from "@vivim/omega-sdk";
import type { PluginManifest, CompositionSpec } from "@vivim/omega-contracts";

function validManifest(): PluginManifest {
  return {
    manifestVersion: "1",
    id: "omega.fixture",
    version: "0.1.0",
    description: "sdk validator fixture",
    entry: "src/index.ts",
    publisher: { keyId: "", signature: "" },
    contributions: {
      schema: [{ kind: "schema", id: "fixture", version: "1" }],
      contract: [
        { kind: "contract", id: "fixture.read", version: "1", risk: "READ" },
        { kind: "contract", id: "fixture.write", version: "1", risk: "MUTATION" },
      ],
      engine: [{ kind: "engine", id: "fixture.engine", version: "1" }],
    },
    dependencies: [{ ref: "contract:echo.ping@1", range: "1.x" }],
    capabilities: { requested: ["port:echo.ping@1", "host.journal.append"], justification: "fixture" },
    runtime: { tier: "worker-thread", budget: { cpuMs: 100, memMB: 64 } },
    contentHash: "",
  };
}

describe("Ω4 sdk validate — manifest semantics", () => {
  test("valid manifest: zero issues (unsigned is shape+law valid; signing is separate)", () => {
    expect(validateManifest(validManifest())).toEqual([]);
  });

  test("risk only on contract kind (RISK_NON_CONTRACT)", () => {
    const m = validManifest();
    m.contributions.schema![0].risk = "READ";
    expect(validateManifest(m).map((i) => i.code)).toContain("RISK_NON_CONTRACT");
  });

  test("routable op format: <id>@<digit> (OP_FORMAT)", () => {
    const m = validManifest();
    m.contributions.contract![0].version = "1.2.3";
    expect(validateManifest(m).map((i) => i.code)).toContain("OP_FORMAT");
  });

  test("op collision across routable kinds (OP_COLLISION) + duplicate contribution (DUP_CONTRIBUTION)", () => {
    const m = validManifest();
    m.contributions.engine = [{ kind: "engine", id: m.contributions.contract![0].id, version: "1" }];
    expect(validateManifest(m).map((i) => i.code)).toContain("OP_COLLISION");
    const m2 = validManifest();
    m2.contributions.contract!.push({ ...m2.contributions.contract![0] });
    const codes = validateManifest(m2).map((i) => i.code);
    expect(codes).toContain("DUP_CONTRIBUTION");
    expect(codes).toContain("OP_COLLISION");
  });

  test("dependency grammar (DEP_REF_SYNTAX / DEP_RANGE_SYNTAX)", () => {
    const m = validManifest();
    m.dependencies = [{ ref: "echo.ping@1", range: "1.x" }, { ref: "contract:x@1", range: "whenever" }];
    const issues = validateManifest(m);
    expect(issues.map((i) => i.code)).toContain("DEP_REF_SYNTAX");
    expect(issues.map((i) => i.code)).toContain("DEP_RANGE_SYNTAX");
  });

  test("capability request grammar (CAP_SYNTAX)", () => {
    const m = validManifest();
    m.capabilities.requested = ["banana", "port:echo.ping@1", "host.journal.append"];
    const issues = validateManifest(m);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe("CAP_SYNTAX");
    expect(issues[0].message).toContain("banana");
  });

  test("entry path law (ENTRY_PATH): absolute and traversal", () => {
    const m = validManifest();
    m.entry = "/abs/entry.ts";
    expect(validateManifest(m).map((i) => i.code)).toContain("ENTRY_PATH");
    const m2 = validManifest();
    m2.entry = "../escape.ts";
    expect(validateManifest(m2).map((i) => i.code)).toContain("ENTRY_PATH");
  });

  test("signed manifest with broken keyId (PUBLISHER_KEYID)", () => {
    const m = validManifest();
    m.publisher = { keyId: "not-a-hash", signature: "sig" };
    expect(validateManifest(m).map((i) => i.code)).toContain("PUBLISHER_KEYID");
  });
});

describe("Ω4 sdk validate — composition ownership law", () => {
  const manifestOf = (m: PluginManifest): Map<string, PluginManifest> => new Map([[m.id, m]]);

  test("two owners of one op → OP_CONFLICT (an op is owned by exactly one entry)", () => {
    const spec: CompositionSpec = {
      name: "conflict",
      entries: [
        { id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: [], contracts: ["law.check@1"] } },
        { id: "omega.a", source: "../examples/plugin-a", bootPhase: 1, grant: { capabilities: [], contracts: ["note.write@1"] } },
        { id: "omega.b", source: "../examples/plugin-b", bootPhase: 1, grant: { capabilities: [], contracts: ["note.write@1", "note.list@1"] } },
      ],
    };
    const issues = validateComposition(spec);
    const conflict = issues.find((i) => i.code === "OP_CONFLICT")!;
    expect(conflict).toBeTruthy();
    expect(conflict.message).toContain("note.write@1");
    expect(conflict.message).toContain("omega.a");
    expect(conflict.message).toContain("omega.b");
  });

  test("bootPhase 0 law (PHASE0_LAW) + duplicate entries (DUP_ENTRY)", () => {
    const spec: CompositionSpec = {
      name: "x",
      entries: [
        { id: "omega.echo", source: "../examples/plugin-echo", bootPhase: 0, grant: { capabilities: [], contracts: ["echo.ping@1"] } },
      ],
    };
    expect(validateComposition(spec).map((i) => i.code)).toContain("PHASE0_LAW");
    const dup: CompositionSpec = { name: "x", entries: [...spec.entries, { ...spec.entries[0], bootPhase: 1 }] };
    const codes = validateComposition(dup).map((i) => i.code);
    expect(codes).toContain("DUP_ENTRY");
    expect(codes).toContain("OP_CONFLICT");
  });

  test("grant/cap grammar inside entries (CAP_SYNTAX / OP_FORMAT at the path)", () => {
    const spec: CompositionSpec = {
      name: "x",
      entries: [
        { id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["banana"], contracts: ["not an op"] } },
      ],
    };
    const codes = validateComposition(spec).map((i) => i.code);
    expect(codes).toContain("CAP_SYNTAX");
    expect(codes).toContain("OP_FORMAT");
  });

  test("with manifests: GRANT_NOT_DECLARED + DEP_UNSATISFIED", () => {
    const fx = validManifest();
    const spec: CompositionSpec = {
      name: "x",
      entries: [{ id: fx.id, source: "./p", bootPhase: 1, grant: { capabilities: [], contracts: ["no.such@1"] } }],
    };
    expect(validateComposition(spec, { manifests: manifestOf(fx) }).map((i) => i.code)).toContain("GRANT_NOT_DECLARED");

    const counter = validManifest();
    counter.dependencies = [{ ref: "contract:missing.op@1", range: "1.x" }];
    const spec2: CompositionSpec = {
      name: "x",
      entries: [{ id: counter.id, source: "./p", bootPhase: 1, grant: { capabilities: [], contracts: [] } }],
    };
    expect(validateComposition(spec2, { manifests: manifestOf(counter) }).map((i) => i.code)).toContain("DEP_UNSATISFIED");
  });

  test("demo composition (repo shipped spec) validates green with its real manifests", () => {
    const spec = JSON.parse(require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../compositions/demo.json"), "utf-8")) as CompositionSpec;
    expect(validateComposition(spec)).toEqual([]);
  });

  test("grantableFromOps: host caps + port forms", () => {
    const g = grantableFromOps(["echo.ping@1"]);
    expect(g).toContain("host.journal.append");
    expect(g).toContain("host.compartment.admin");
    expect(g).toContain("host.tokens.revoke");
    expect(g).toContain("port:echo.ping@1");
  });

  test("parseManifest + validateManifest compose: a tampered shape fails at parse (staged), not semantics", () => {
    const m = validManifest();
    (m as Record<string, unknown>).manifestVersion = "2";
    const r = parseManifest(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("manifestVersion"))).toBe(true);
  });
});
