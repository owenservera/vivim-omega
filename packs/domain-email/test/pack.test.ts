// pack.domain-email — test/pack.test.ts (Ω5)
// PACK ONTOLOGY VALIDATION — asserted from the plugin.json CONTENT (parsed here),
// not from imported code: a pack is declarations, so the declarations are the product.
// Every assertion reads the manifest the way the host/compiler would (JSON → shape →
// semantics), including the sdk's zod mirror + semantic validator (borrowed by
// relative path like plugin-notes borrows the host ceremony).
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";
import type { PluginManifest } from "@vivim/omega-contracts";

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

describe("Ω5 pack.domain-email — the manifest is a lawful plugin", () => {
  test("parses green against the sdk zod mirror and the semantic validator (round-trip exact)", () => {
    const r = parseManifest(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.value).toEqual(json); // no stripping, no transforms — declarations survive verbatim
    expect(validateManifest(r.value)).toEqual([]);
  });

  test("identity: id pack.domain-email, entry src/index.ts, passive (no caps, no deps)", () => {
    expect(json.id).toBe("pack.domain-email");
    expect(json.manifestVersion).toBe("1");
    expect(json.entry).toBe("src/index.ts");
    expect(json.capabilities.requested).toEqual([]);        // a pack requests nothing
    expect(json.dependencies).toEqual([]);                  // and depends on nothing
    expect(json.contributions.provider ?? []).toEqual([]);  // providers implement; the pack never does
    expect(json.contributions.engine ?? []).toEqual([]);
  });

  test("all four SCHEMA contributions are present and namespace-clean (email.*, lowercase per the pinned id grammar)", () => {
    const ids = (json.contributions.schema as Array<{ id: string; version: string }>).map((c) => `${c.id}@${c.version}`);
    // entity names are email.Message/Thread/Folder/Contact (see each doc); contribution ids
    // follow the pinned lowercase grammar (^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$) so the sdk
    // zod mirror AND the conformance staged stage accept this pack.
    expect(ids).toEqual(["email.message@1", "email.thread@1", "email.folder@1", "email.contact@1"]);
    for (const c of json.contributions.schema as Array<{ id: string }>) {
      expect(c.id.startsWith("email.")).toBe(true);
    }
  });

  test("email.message@1 declares the complete field set with types and requiredness", () => {
    const fields = fieldsOf("email.message");
    const names = fields.map((f) => f.name);
    expect(names).toEqual(["id", "threadId", "folder", "from", "to", "subject", "body", "sentAt", "flags"]);
    const byName = Object.fromEntries(fields.map((f) => [f.name as string, f]));
    expect(byName.id).toMatchObject({ type: "string", required: true });
    expect(byName.threadId).toMatchObject({ type: "string", required: true });
    expect(byName.folder).toMatchObject({ type: "string", required: true });
    expect(byName.from).toMatchObject({ type: "string", required: true });
    expect(byName.to).toMatchObject({ type: "string", required: true });
    expect(byName.subject).toMatchObject({ type: "string", required: true });
    expect(byName.body).toMatchObject({ type: "string", required: true });
    expect(byName.sentAt).toMatchObject({ type: "integer", required: true });
    expect(byName.flags).toMatchObject({ type: "json", required: true });
  });

  test("email.thread@1 / email.folder@1 / email.contact@1 declare their complete field sets", () => {
    expect(fieldsOf("email.thread").map((f) => f.name)).toEqual(["id", "subject", "messageIds", "lastAt"]);
    expect(fieldsOf("email.folder").map((f) => f.name)).toEqual(["id", "name"]);
    expect(fieldsOf("email.contact").map((f) => f.name)).toEqual(["id", "email", "displayName"]);
    expect(fieldsOf("email.thread").find((f) => f.name === "messageIds")).toMatchObject({ type: "array", required: true });
    expect(fieldsOf("email.contact").find((f) => f.name === "displayName")).toMatchObject({ required: false });
  });

  test("the six CONTRACT contributions are namespace-clean (message.*) and version-pinned @1 (v0.2.0 appended receive)", () => {
    const contracts = json.contributions.contract as Array<{ id: string; version: string }>;
    expect(contracts.map((c) => `${c.id}@${c.version}`)).toEqual([
      "message.send@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1", "message.receive@1",
    ]);
    for (const c of contracts) {
      expect(c.id.startsWith("message.")).toBe(true); // no foreign namespaces leak in
      expect(c.id).toMatch(/^message\.[a-z]+$/);
    }
  });

  test("contracts carry the right risk classes (send EXTERNAL_MUTATION, move MUTATION, the rest READ — receive is READ: ingestion is vault-internal)", () => {
    expect(contractById("message.send").risk).toBe("EXTERNAL_MUTATION");
    expect(contractById("message.move").risk).toBe("MUTATION");
    expect(contractById("message.list").risk).toBe("READ");
    expect(contractById("message.search").risk).toBe("READ");
    expect(contractById("message.read").risk).toBe("READ");
    expect(contractById("message.receive").risk).toBe("READ"); // D-222: vault-internal ingestion, simulator semantics in the provider doc
    // risk is DECLARED data on contract kind only — the sdk validator pins this too
    const m = parseManifest(raw);
    if (m.ok) expect(validateManifest(m.value).filter((i) => i.code === "RISK_NON_CONTRACT")).toEqual([]);
  });

  test("policy email.policy@1 is a declarative JSON object with consent defaults, retention, state machine", () => {
    const policies = json.contributions.policy as Array<Record<string, unknown>>;
    expect(policies.length).toBe(1);
    expect(`${policies[0].id}@${policies[0].version}`).toBe("email.policy@1");
    const policy = policies[0].policy as Record<string, unknown>;
    expect(policy.policyId).toBe("email.policy");
    expect(typeof policy.version).toBe("string");

    const consent = policy.consent as Record<string, unknown>;
    expect(consent.default).toBe("require-consent");
    const ops = consent.ops as Record<string, string>;
    expect(ops["message.send@1"]).toBe("require-consent"); // sending leaves the vault world: consent
    expect(ops["message.move@1"]).toBe("allow-and-journal");
    expect(ops["message.list@1"]).toBe("allow");
    expect(ops["message.search@1"]).toBe("allow");
    expect(ops["message.read@1"]).toBe("allow");

    const retention = policy.retention as Record<string, unknown>;
    expect(retention.strategy).toBe("keep-all");
    expect(retention.version).toBe(1);
    expect(retention.coldRevisionsKept).toBe(true);
  });

  test("state machine: initial draft, exactly one transition draft→sent via message.send@1, NO cycles", () => {
    const policy = (json.contributions.policy as Array<{ policy: Record<string, unknown> }>)[0].policy;
    const sm = policy.stateMachine as {
      entity: string; initial: string; states: string[];
      transitions: Array<{ from: string; to: string; via: string }>;
    };
    expect(sm.entity).toBe("email.message@1");
    expect(sm.initial).toBe("draft");
    expect(sm.states).toEqual(["draft", "sent"]);
    expect(sm.transitions).toHaveLength(1);
    expect(sm.transitions[0]).toMatchObject({ from: "draft", to: "sent", via: "message.send@1" });

    // graph walk from the initial state: acyclic, every state reachable, none dangling
    const edges = new Map<string, string[]>();
    for (const t of sm.transitions) {
      if (!sm.states.includes(t.from) || !sm.states.includes(t.to)) throw new Error(`transition outside declared states: ${t.from}→${t.to}`);
      edges.set(t.from, [...(edges.get(t.from) ?? []), t.to]);
    }
    const visited = new Set<string>();
    const stack: string[] = [sm.initial];
    while (stack.length > 0) {
      const s = stack.pop()!;
      if (visited.has(s)) throw new Error(`cycle reachable from ${sm.initial} at ${s}`);
      visited.add(s);
      stack.push(...(edges.get(s) ?? []));
    }
    expect(visited.size).toBe(sm.states.length); // "sent" is reachable → no dangling state
  });

  test("TEST contribution email.pack-test@1 points at this directory and it exists on disk", () => {
    const tests = json.contributions.test as Array<Record<string, unknown>>;
    expect(tests.length).toBe(1);
    expect(`${tests[0].id}@${tests[0].version}`).toBe("email.pack-test@1");
    expect(tests[0].dir).toBe("test");
    expect(existsSync(join(PACK_DIR, "test"))).toBe(true);
    expect(existsSync(join(PACK_DIR, "test", "pack.test.ts"))).toBe(true); // the evidence itself
  });

  test("the pack entry point is import-safe outside a worker and exports a passive def", async () => {
    const mod = await import("../src/index.ts");
    expect(mod.def).toBeTruthy();
    expect(mod.def.ops).toBeUndefined(); // no ops — packs declare, providers implement
    expect(Object.keys(mod.def)).toEqual(["onInit"]); // logging only; no behavior
  });

  test("the manifest the HOST sees is exactly this JSON (no hidden fields, plugin.json is the source of truth)", () => {
    // the host loader stamps defaults for missing optional fields; this pack supplies
    // every one of them explicitly, so a compile-time round-trip must be lossless:
    const m: PluginManifest = json;
    expect(m.contributions.schema?.length).toBe(4);
    expect(m.contributions.contract?.length).toBe(6);
    expect(m.contributions.policy?.length).toBe(1);
    expect(m.contributions.test?.length).toBe(1);
    expect(m.runtime.tier).toBe("worker-thread");
    expect(m.contentHash).toBe(""); // pre-compile: the ceremony stamps it (B1)
  });
});
