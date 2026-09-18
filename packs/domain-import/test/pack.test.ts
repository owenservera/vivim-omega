// pack.domain-import — test/pack.test.ts (Ω5/W1, pack #2 — GAP-M5 clean pass)
// PACK ONTOLOGY VALIDATION — asserted from the plugin.json CONTENT (parsed here),
// not from imported code: a pack is declarations, so the declarations are the
// product. Same shape as the domain-email pack test; the W0 checklist
// (SCHEMA+CONTRACT+POLICY+TEST) is each describe block below.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";

const PACK_DIR = join(import.meta.dir, "..");
const raw = readFileSync(join(PACK_DIR, "plugin.json"), "utf-8");
const json = JSON.parse(raw);

function schemaById(id: string): Record<string, unknown> {
  const list = json.contributions.schema as Array<Record<string, unknown>>;
  const hit = list.find((c) => c.id === id);
  if (!hit) throw new Error(`schema ${id} missing`);
  return hit;
}
function fieldsOf(id: string): Array<Record<string, unknown>> {
  return schemaById(id).fields as Array<Record<string, unknown>>;
}
function contractById(id: string): Record<string, unknown> {
  const list = json.contributions.contract as Array<Record<string, unknown>>;
  const hit = list.find((c) => c.id === id);
  if (!hit) throw new Error(`contract ${id} missing`);
  return hit;
}

describe("pack.domain-import — the manifest is a lawful plugin", () => {
  test("parses green against the sdk zod mirror and the semantic validator (round-trip exact)", () => {
    const r = parseManifest(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.value).toEqual(json); // no stripping, no transforms — declarations survive verbatim
    expect(validateManifest(r.value)).toEqual([]);
  });

  test("identity: id pack.domain-import, entry src/index.ts, passive (no caps, no deps)", () => {
    expect(json.id).toBe("pack.domain-import");
    expect(json.manifestVersion).toBe("1");
    expect(json.entry).toBe("src/index.ts");
    expect(json.capabilities.requested).toEqual([]);        // a pack requests nothing
    expect(json.dependencies).toEqual([]);                  // and depends on nothing
    expect(json.contributions.provider ?? []).toEqual([]);  // writers implement; the pack never does
    expect(json.contributions.engine ?? []).toEqual([]);
  });

  test("SCHEMA: the three import.* contributions are present and namespace-clean (W0 checklist item 1)", () => {
    const ids = (json.contributions.schema as Array<{ id: string; version: string }>).map((c) => `${c.id}@${c.version}`);
    expect(ids).toEqual(["import.source@1", "import.conversation@1", "import.message@1"]);
    for (const c of json.contributions.schema as Array<{ id: string }>) {
      expect(c.id.startsWith("import.")).toBe(true); // no foreign namespaces leak in
      expect(c.id).toMatch(/^import\.[a-z]+$/);      // lowercase per the pinned id grammar
    }
  });

  test("import.source@1 declares the complete field set (mine pin + recordedOnly law)", () => {
    expect(fieldsOf("import.source").map((f) => f.name)).toEqual(["id", "mine", "originPath", "recordedOnly"]);
    const byName = Object.fromEntries(fieldsOf("import.source").map((f) => [f.name as string, f]));
    expect(byName.mine).toMatchObject({ type: "string", required: true });      // <repo>@<sha> pin (W0-9a)
    expect(byName.recordedOnly).toMatchObject({ type: "json", required: true }); // recorded sessions only
  });

  test("import.conversation@1 / import.message@1 declare their complete field sets (clock-free: ts=0 + tsEstimated)", () => {
    expect(fieldsOf("import.conversation").map((f) => f.name)).toEqual(["externalId", "source", "title", "createdAt", "updatedAt", "messageCount"]);
    expect(fieldsOf("import.message").map((f) => f.name)).toEqual(["externalId", "conversationExternalId", "source", "role", "content", "model", "ts", "tsEstimated"]);
    const byName = Object.fromEntries(fieldsOf("import.message").map((f) => [f.name as string, f]));
    expect(byName.model).toMatchObject({ required: false });                     // chatgpt-only, optional
    expect(byName.ts).toMatchObject({ type: "integer", required: true });        // 0 when absent — never Date.now()
    expect(byName.tsEstimated).toMatchObject({ type: "json", required: true });  // attributable + byte-stable
  });

  test("CONTRACT: history.import@1 is the one boundary, READ risk (W0 checklist item 2)", () => {
    const contracts = json.contributions.contract as Array<{ id: string; version: string; risk: string }>;
    expect(contracts.map((c) => `${c.id}@${c.version}`)).toEqual(["history.import@1"]);
    expect(contractById("history.import").risk).toBe("READ");
    const m = parseManifest(raw);
    if (m.ok) expect(validateManifest(m.value).filter((i) => i.code === "RISK_NON_CONTRACT")).toEqual([]);
  });

  test("POLICY: import.policy@1 is a declarative JSON object with consent defaults, retention, state machine (W0 checklist item 3)", () => {
    const policies = json.contributions.policy as Array<Record<string, unknown>>;
    expect(policies.length).toBe(1);
    expect(`${policies[0].id}@${policies[0].version}`).toBe("import.policy@1");
    const policy = policies[0].policy as Record<string, unknown>;
    expect(policy.policyId).toBe("import.policy");
    expect(typeof policy.version).toBe("string");

    const consent = policy.consent as Record<string, unknown>;
    expect(consent.default).toBe("allow"); // the parse is vault-internal READ
    const ops = consent.ops as Record<string, string>;
    expect(ops["history.import@1"]).toBe("allow");

    const retention = policy.retention as Record<string, unknown>;
    expect(retention.strategy).toBe("keep-all");
    expect(retention.coldRevisionsKept).toBe(true);

    const sm = policy.stateMachine as Record<string, unknown>;
    expect(sm.entity).toBe("import.message@1");
    expect(sm.initial).toBe("parsed");
    expect(sm.states).toEqual(["parsed", "materialized"]);
    const transitions = sm.transitions as Array<{ from: string; to: string; via: string; doc?: string }>;
    // per-field compare: the manifest rows may carry reviewer doc text beside the machine fields
    expect(transitions.map((t) => ({ from: t.from, to: t.to, via: t.via }))).toEqual([
      { from: "parsed", to: "materialized", via: "chat.append@1" },
    ]);
    // acyclic: the transition target is not the initial state via the same op
    expect(transitions.every((t) => t.from !== t.to)).toBe(true);
  });

  test("TEST: the pack carries its conformance dir declaration (W0 checklist item 4)", () => {
    const tests = json.contributions.test as Array<{ id: string; dir: string; runner: string }>;
    expect(tests.map((t) => `${t.id}@1`)).toEqual(["import.pack-test@1"]);
    expect(tests[0].dir).toBe("test");
    expect(tests[0].runner).toBe("bun test");
  });
});
