// @vivim/omega-testkit — fixtures.ts
// Deterministic fixture builders for tests: one valid world and every classic
// way to break it (tamper, unsigned, conflicting ownership, bad dependency).
import type { PluginManifest, CompositionSpec } from "@vivim/omega-contracts";

/** A fully-loaded, lawful manifest: schema + contract + engine contributions, deps, caps. */
export function validManifest(): PluginManifest {
  return JSON.parse(JSON.stringify({
    manifestVersion: "1",
    id: "omega.fixture",
    version: "0.1.0",
    description: "testkit fixture: valid in every dimension",
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
  })) as PluginManifest;
}

/** Tampered: a mutated field breaks the pinned schema (fails at the STAGED stage). */
export function tamperedManifest(): PluginManifest {
  const m = validManifest();
  m.manifestVersion = "2";                 // not "1"
  m.contributions.contract![0].risk = "DESTROY" as never; // not a risk class
  m.id = "Ωmega.Fixture";                  // violates the id grammar
  return m;
}

/** Unsigned: shape + semantics valid, but publisher.{keyId,signature} empty (fails signature verification, not parsing). */
export function unsignedManifest(): PluginManifest {
  return validManifest(); // the fixture world is unsigned by construction
}

/** Two entries both granting note.write@1 — the ownership law broken (fails at VERIFIED). */
export function conflictingComposition(): CompositionSpec {
  return {
    name: "conflict",
    entries: [
      { id: "vivim.law", source: "../plugins/law-stub", bootPhase: 0, grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] } },
      { id: "omega.notes", source: "../examples/plugin-notes", bootPhase: 1, grant: { capabilities: ["host.journal.append"], contracts: ["note.write@1", "note.list@1"] } },
      { id: "omega.notes.shadow", source: "../examples/plugin-notes", bootPhase: 1, grant: { capabilities: [], contracts: ["note.write@1"] } }, // the squatter
    ],
  };
}

/** Bad dependency: ref violates the grammar (and could never be satisfied anyway). */
export function badDependency(): PluginManifest {
  const m = validManifest();
  m.dependencies = [{ ref: "echo.ping@1", range: "whenever" }];
  return m;
}
