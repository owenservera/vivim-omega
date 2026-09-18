// vivim.mind — test/mind.test.ts (Ω10, GATE-Ω10 evidence)
//
// UNIT (src/derive.ts — the pure lens machinery, no ports) + INTEGRATION (the real
// µhost: law + pack.domain-email + vault + provider.email.file + vivim.mind booted
// as ONE composition through a spec copy with config injections — the email
// integration pattern: unique temp vault dirs, never the shipped data paths).
//
// The gate evidence, per docs/NCLL-AND-SELF-KNOWLEDGE.md §1 (wave Ω10):
//   derivation (ops/entities/kernel from registry+vault+config), contacts learned
//   from history (byte-identical contactFromAddress), determinism, bounds
//   (entityCap), evidence (every entity traces to a vault revision), the taught
//   lexicon surface, the rule surface, focused queries, manifest lawfulness.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { contactFromAddress } from "@vivim/omega-nlcl-pure";
import type { EntityView, WorldModel } from "@vivim/omega-nlcl-pure";
import {
  buildWorldModel, DEFAULT_ENTITY_CAP, deriveContactEntities, opsForWorld, parseMindConfig,
  mindConfigWarnings,
  projectLexiconEvidence, projectMessageEvidence, projectRuleEvidence, type OpRow,
} from "../src/derive.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → vivim-mind/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

// ---- the mind config (the documented shape — the ops catalog is RECIPE DATA,
// the user-signed grant is the authority; the registry cross-check adds liveness) ----

const MIND_OPS: OpRow[] = [
  { op: "message.send@1", risk: "EXTERNAL_MUTATION", provider: "provider.email.file", title: "send a message" },
  { op: "message.receive@1", risk: "READ", provider: "provider.email.file", title: "simulate an incoming message" },
  { op: "message.list@1", risk: "READ", provider: "provider.email.file", title: "list messages" },
  { op: "message.search@1", risk: "READ", provider: "provider.email.file", title: "search messages" },
  { op: "message.read@1", risk: "READ", provider: "provider.email.file", title: "read a message" },
  { op: "message.move@1", risk: "MUTATION", provider: "provider.email.file", title: "move a message" },
  { op: "director.rule@1", risk: "ENGINE", provider: "vivim.director", title: "define a rule" },
  { op: "director.registry@1", risk: "ENGINE", provider: "vivim.director", title: "list rules" },
  { op: "director.teach@1", risk: "ENGINE", provider: "vivim.director", title: "teach a word" },
];

const MIND_CONFIG = {
  composition: "console",
  nlclVersion: "0.1.0",
  selfAddresses: ["me@omega.local", "demo@omega.local"],
  entityCap: 200,
  ops: MIND_OPS,
};

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.getmany@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const MESSAGE_CONTRACTS = ["message.send@1", "message.receive@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1"];
const PROVIDER_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:vault.search@1"];
const MIND_CONTRACTS = ["mind.snapshot@1", "mind.query@1"];
const MIND_CAPS = ["port:law.registry@1", "port:vault.query@1", "port:vault.getmany@1", "port:vault.verify@1"]; // D-387: batched window reads replace per-row get // the four READ ports (D-350 adds the Merkle walk)

/** Spec copy of the console-style composition (law + pack + vault + provider + mind), with the
 *  mind's config injected and the law's journal replay pointed at the router's journal
 *  (the Ω1 integration pattern — the registry re-reads it live on every snapshot). */
function makeMindSpec(name: string, dataDir: string, mindConfig: Record<string, unknown>, journalPath: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS }, config: { journalPath } },
      { id: "pack.domain-email", source: "packs/domain-email", bootPhase: 1, grant: { capabilities: [], contracts: [] } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "provider.email.file", source: "plugins/provider-email-file", bootPhase: 1, grant: { capabilities: PROVIDER_CAPS, contracts: MESSAGE_CONTRACTS }, config: { from: "demo@omega.local" } },
      { id: "vivim.mind", source: "plugins/vivim-mind", bootPhase: 1, grant: { capabilities: MIND_CAPS, contracts: MIND_CONTRACTS }, config: mindConfig },
    ],
  };
}

interface Case { host: BootedHost; root: string; vaultDir: string }

/** Boots a unique temp case: own vault dir + build + composition (the house pattern). */
async function bootMind(caseName: string, specFactory: (dataDir: string, journalPath: string) => CompositionSpec): Promise<Case> {
  const root = omegaTmp("omega-mind-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const { rootKey } = ensureVault(vaultDir);
  const spec = specFactory(join(root, "vault-data"), join(vaultDir, "law-journal.jsonl"));
  const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root, vaultDir };
}

interface SendResult { messageId: string; rev: number; sentAt: number }
interface ReceiveResult { messageId: string; rev: number; receivedAt: number; folder: string }
interface SnapshotResult { world: WorldModel }
interface QueryResult { kind: string; filter: string | null; count: number; rows: unknown[]; worldV: number }

/** The consent ceremony helper: REFUSED → extract consentId → (caller grants + retries). */
async function extractConsentId(r: PortResult): Promise<string> {
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toBe("REFUSED");
    expect(r.detail).toContain("consent required");
  }
  const consentId = ((r as { detail?: string }).detail ?? "").split(":")[1]?.trim();
  expect(consentId).toMatch(/^consent_[0-9a-f]{16}$/);
  return consentId!;
}

async function snapshot(host: BootedHost, payload: unknown = {}): Promise<WorldModel> {
  const r = await host.router.callAsRoot("mind.snapshot@1", payload);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`mind.snapshot@1 failed: ${r.detail ?? ""}`);
  return (r.value as SnapshotResult).world;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The derivation's deterministic entity order, computed independently from the same
 *  candidate set (at desc, id asc) — the expectation is derived from the ACTUAL
 *  send results, so ties in sentAt cannot make the test flaky. */
function expectedEntityIds(candidates: Array<{ id: string; at: number }>, cap = DEFAULT_ENTITY_CAP): string[] {
  return [...candidates]
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, cap)
    .map((c) => c.id);
}

// =================================================================================================
// UNIT — src/derive.ts (the pure lens: no ports, no I/O, no clocks)
// =================================================================================================

describe("Ω10 unit · parseMindConfig (composition passthrough — data, never authority; fail-closed)", () => {
  test("defaults: composition unknown, nlclVersion '', no self addresses, entityCap 200, no ops", () => {
    expect(parseMindConfig(undefined)).toEqual({
      composition: "unknown", nlclVersion: "", selfAddresses: [], entityCap: DEFAULT_ENTITY_CAP, ops: [],
    });
    expect(parseMindConfig({})).toEqual(parseMindConfig(undefined));
  });

  test("the documented config shape parses round-trip exact", () => {
    expect(parseMindConfig(MIND_CONFIG)).toEqual(MIND_CONFIG);
  });

  test("garbage fails closed (bad entityCap / risk / selfAddresses / ops)", () => {
    expect(() => parseMindConfig({ entityCap: 0 })).toThrow(/entityCap/);
    expect(() => parseMindConfig({ entityCap: 1.5 })).toThrow(/entityCap/);
    expect(() => parseMindConfig({ ops: [{ op: "x@1", risk: "WEIRD", provider: "p", title: "t" }] })).toThrow(/row\.risk/);
    expect(() => parseMindConfig({ selfAddresses: ["no-at-sign"] })).toThrow(/selfAddresses/);
    expect(() => parseMindConfig({ selfAddresses: "demo@x.local" })).toThrow(/selfAddresses/);
    expect(() => parseMindConfig({ ops: "nope" })).toThrow(/ops/);
    expect(() => parseMindConfig({ ops: [{ op: "", risk: "READ", provider: "p", title: "t" }] })).toThrow(/row\.op/);
  });

  test("mindConfigWarnings (E-5): empty raw config warns per defaulted field; full config is silent", () => {
    const empty = mindConfigWarnings(undefined);
    expect(empty.length).toBe(5);
    expect(empty.join("\n")).toMatch(/composition/);
    expect(empty.join("\n")).toMatch(/ops catalog empty/);
    expect(mindConfigWarnings(MIND_CONFIG)).toEqual([]);
    expect(mindConfigWarnings({ ...MIND_CONFIG, ops: [] }).join("\n")).toMatch(/ops catalog empty/);
  });
});

describe("Ω10 unit · opsForWorld (config rows — RECIPE DATA is the authority; liveness is call-time)", () => {
  const registry = {
    plugins: ["provider.email.file", "vivim.director", "vivim.law"],
    events: 7,
    states: { "provider.email.file": { state: "active" }, "vivim.director": { state: "active" }, "vivim.law": { state: "active" } },
  };

  test("all providers active → exactly the config rows, config order preserved", () => {
    expect(opsForWorld(MIND_OPS, registry)).toEqual(MIND_OPS);
  });

  test("the catalog passes through AS GRANTED regardless of registry observations — the registry is a gated-caller journal, not a liveness oracle (fresh boots have zero law.check callers; filtering would blank the world)", () => {
    const emptyRegistry = { ...registry, plugins: [], states: {} };
    expect(opsForWorld(MIND_OPS, emptyRegistry)).toEqual(MIND_OPS);
    const degraded = { ...registry, states: { ...registry.states, "vivim.director": { state: "degraded" } } };
    expect(opsForWorld(MIND_OPS, degraded)).toEqual(MIND_OPS);
  });
});

describe("Ω10 unit · projectMessageEvidence (message → EntityView)", () => {
  const row = { id: "msg_ab12cd", data: {
    id: "msg_ab12cd", threadId: "thread_abc", folder: "inbox", from: "peter.miller@omega.local",
    to: "demo@omega.local", subject: "Quarterly report", body: "The numbers are attached.", sentAt: 120,
    flags: { seen: false, flagged: true, draft: false },
  } };

  test("exact EntityView: id message:<vaultId>, label subject, names = subject + subject words + from-local words, data 8 fields, at sentAt", () => {
    const e = projectMessageEvidence("mind.snapshot@1", row, { includeBodies: true });
    expect(e.id).toBe("message:msg_ab12cd");
    expect(e.type).toBe("message");
    expect(e.label).toBe("Quarterly report");
    expect(e.at).toBe(120);
    expect(e.names).toEqual([...new Set(["quarterly report", "quarterly", "report", "peter", "miller"])]);
    expect(e.data).toEqual({
      id: "msg_ab12cd", subject: "Quarterly report", body: "The numbers are attached.",
      from: "peter.miller@omega.local", to: "demo@omega.local", folder: "inbox", sentAt: 120,
      flags: { seen: false, flagged: true, draft: false },
    });
  });

  test("includeBodies false strips data.body only (light replication); includeBodies true keeps the full body", () => {
    const e = projectMessageEvidence("mind.snapshot@1", row, { includeBodies: false });
    expect("body" in (e.data ?? {})).toBe(false);
    expect((e.data as Record<string, unknown>)["subject"]).toBe("Quarterly report");
    expect(Object.keys(e.data ?? {}).length).toBe(7);
  });

  test("corrupt message evidence fails CLOSED (throw — the mind never silently drops evidence)", () => {
    expect(() => projectMessageEvidence("mind.snapshot@1", { id: "x", data: { id: "x" } }, { includeBodies: true })).toThrow(/not a message|field/);
    expect(() => projectMessageEvidence("mind.snapshot@1", { id: "x", data: null }, { includeBodies: true })).toThrow(/not a message/);
    const mismatch = { id: "msg_a", data: { ...row.data, id: "msg_DIFFERENT" } };
    expect(() => projectMessageEvidence("mind.snapshot@1", mismatch, { includeBodies: true })).toThrow(/mismatched data\.id/);
  });
});

describe("Ω10 unit · deriveContactEntities (the system LEARNS who you correspond with)", () => {
  const mk = (id: string, from: string, to: string, at: number): EntityView =>
    ({ id, type: "message", label: "l", names: [], data: { id, from, to }, at });

  test("byte-identical contactFromAddress: id/label/names/data.address, at = latest seen", () => {
    const messages = [mk("message:m1", "demo@omega.local", "peter.miller@omega.local", 10), mk("message:m2", "peter.miller@omega.local", "demo@omega.local", 30)];
    const contacts = deriveContactEntities(messages, ["demo@omega.local"]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toEqual(contactFromAddress("peter.miller@omega.local", 30)); // the EXACT function, byte-identical
    expect(contacts[0].id).toBe("contact:peter-miller");
    expect(contacts[0].label).toBe("Peter Miller");
    expect((contacts[0].data as Record<string, unknown>)["address"]).toBe("peter.miller@omega.local");
  });

  test("self addresses are excluded; duplicates dedupe (from AND to collapse to one contact); case-insensitive", () => {
    const messages = [
      mk("message:m1", "DEMO@omega.local", "sarah.chen@omega.local", 10),
      mk("message:m2", "sarah.chen@omega.local", "me@omega.local", 20),
    ];
    const contacts = deriveContactEntities(messages, ["me@omega.local", "demo@omega.local"]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].id).toBe("contact:sarah-chen");
    expect(contacts[0].at).toBe(20);
  });

  test("deterministic order: latest-seen at desc, then address asc", () => {
    const messages = [
      mk("message:m1", "a@x.local", "demo@omega.local", 5),
      mk("message:m2", "b@x.local", "demo@omega.local", 9),
      mk("message:m3", "c@x.local", "demo@omega.local", 9),
    ];
    expect(deriveContactEntities(messages, ["demo@omega.local"]).map((c) => c.id)).toEqual(["contact:b", "contact:c", "contact:a"]);
  });
});

describe("Ω10 unit · projectRuleEvidence / projectLexiconEvidence (the director's data surfaces)", () => {
  const ruleRow = { id: "rule:peter-forward", data: {
    id: "rule:peter-forward", when: { event: "message.received", from: "contact:peter-miller" },
    then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } },
    enabled: true, summary: "When Peter Miller messages me, forward to Sarah Chen", createdAt: 1,
  } };

  test("RuleView shape: id, enabled, summary, when {event, from}, then {op, to mapped from then.payload.to}", () => {
    const p = projectRuleEvidence("mind.snapshot@1", ruleRow);
    expect(p).not.toBeNull();
    expect(p!.rule).toEqual({
      id: "rule:peter-forward", enabled: true, summary: "When Peter Miller messages me, forward to Sarah Chen",
      when: { event: "message.received", from: "contact:peter-miller" },
      then: { op: "message.send@1", to: "sarah.chen@omega.local" },
    });
  });

  test("the rule ENTITY grounds 'disable rule X': type rule, id = vault id, label = summary, names include summary words + slug", () => {
    const e = projectRuleEvidence("mind.snapshot@1", ruleRow)!.entity;
    expect(e.id).toBe("rule:peter-forward");
    expect(e.type).toBe("rule");
    expect(e.label).toBe("When Peter Miller messages me, forward to Sarah Chen");
    expect(e.at).toBe(1);
    for (const w of ["when", "peter", "miller", "messages", "forward", "sarah", "chen", "rule-peter-forward"]) {
      expect(e.names).toContain(w);
    }
  });

  test("a row without when/then is skipped (null) — the lens maps what it can represent", () => {
    expect(projectRuleEvidence("mind.snapshot@1", { id: "r", data: { id: "r" } })).toBeNull();
    expect(projectRuleEvidence("mind.snapshot@1", { id: "r", data: { when: {}, then: { op: "x@1" } } })).toBeNull();
    expect(projectRuleEvidence("mind.snapshot@1", { id: "r", data: null })).toBeNull();
  });

  test("lexicon: taught rows project; op null and action 'remove' rows are SKIPPED; source defaults to 'taught'", () => {
    expect(projectLexiconEvidence({ id: "lexicon:blitz", data: { word: "blitz", op: "message.send@1", source: "taught", createdAt: 1 } }))
      .toEqual({ word: "blitz", op: "message.send@1", source: "taught", createdAt: 1 });
    expect(projectLexiconEvidence({ id: "lexicon:blitz", data: { word: "blitz", op: null, action: "remove", createdAt: 2 } })).toBeNull();
    expect(projectLexiconEvidence({ id: "lexicon:x", data: { word: "x" } })).toBeNull(); // no op
    expect(projectLexiconEvidence({ id: "lexicon:x", data: { op: "x@1" } })).toBeNull(); // no word
    expect(projectLexiconEvidence({ id: "lexicon:x", data: { word: "zap", op: "message.send@1" } }))
      .toEqual({ word: "zap", op: "message.send@1", source: "taught", createdAt: 0 });
  });
});

describe("Ω10 unit · buildWorldModel (the assembly: ordering, cap, context, kernel, v)", () => {
  const emptyRegistry = { plugins: ["vivim.law"], events: 3, states: { "vivim.law": { state: "active" } } };
  const msg = (id: string, from: string, to: string, subject: string, sentAt: number) => ({
    id, data: { id, threadId: `t_${id}`, folder: "sent", from, to, subject, body: `body ${id}`, sentAt, flags: { seen: false, flagged: false, draft: false } },
  });
  const config = parseMindConfig({ selfAddresses: ["demo@omega.local"], ops: MIND_OPS, composition: "console", nlclVersion: "0.1.0" });

  test("contacts interleave by latest-seen at; entities newest-first (at desc, id asc on ties); context is self-consistent", () => {
    const world = buildWorldModel(
      { registry: emptyRegistry, messageRows: [msg("m1", "demo@omega.local", "peter.miller@omega.local", "s1", 10), msg("m2", "demo@omega.local", "sarah.chen@omega.local", "s2", 20)], ruleRows: [], lexiconRows: [] },
      config, { t: 99 },
    );
    // m2 (20) and sarah (20) tie → id asc puts the contact first; m1 (10) and peter (10) tie likewise
    expect(world.entities.map((e) => e.id)).toEqual(["contact:sarah-chen", "message:m2", "contact:peter-miller", "message:m1"]);
    expect(world.context.latestEntityId).toBe("contact:sarah-chen");
    expect(world.context.latestMessageId).toBe("message:m2");
    expect(world.t).toBe(99);
  });

  test("entityCap caps the TOTAL entity list (messages + contacts + rules), newest-first", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => msg(`m${i}`, "demo@omega.local", "peter.miller@omega.local", `s${i}`, i * 10));
    const capped = parseMindConfig({ selfAddresses: ["demo@omega.local"], entityCap: 4 });
    const world = buildWorldModel({ registry: emptyRegistry, messageRows: rows, ruleRows: [], lexiconRows: [] }, capped, {});
    // candidates: 5 messages (at 10..50) + contact:peter-miller (at 50, tie → id asc first)
    expect(world.entities).toHaveLength(4);
    expect(world.entities.map((e) => e.id)).toEqual(["contact:peter-miller", "message:m5", "message:m4", "message:m3"]);
  });

  test("v = registry events + entity count + rules count + lexicon count (deterministic in the evidence)", () => {
    const world = buildWorldModel(
      { registry: { plugins: ["vivim.law"], events: 7, states: { "vivim.law": { state: "active" } } }, messageRows: [msg("m1", "a@x.local", "demo@omega.local", "s", 1)], ruleRows: [{ id: "rule:r", data: { id: "rule:r", when: { event: "e" }, then: { op: "o@1" }, enabled: true, summary: "s" } }], lexiconRows: [{ id: "lexicon:x", data: { word: "x", op: "x@1", source: "taught", createdAt: 1 } }] },
      config, {},
    );
    // entities: 1 message + 1 contact (a@x.local) + 1 rule = 3; rules 1; lexicon 1; events 7
    expect(world.v).toBe(7 + 3 + 1 + 1);
  });

  test("kernel: composition/nlclVersion from config; plugins from the LIVE registry (version honestly 'unknown' — the registry knows liveness, not versions)", () => {
    const world = buildWorldModel(
      { registry: { plugins: ["provider.email.file", "vivim.law"], events: 0, states: { "provider.email.file": { state: "active" }, "vivim.law": { state: "active" } } }, messageRows: [], ruleRows: [], lexiconRows: [] },
      config, {},
    );
    expect(world.kernel.composition).toBe("console");
    expect(world.kernel.nlclVersion).toBe("0.1.0");
    expect(world.kernel.plugins).toEqual([
      { id: "provider.email.file", version: "unknown", state: "active" },
      { id: "vivim.law", version: "unknown", state: "active" },
    ]);
  });

  test("empty world: null context refs, empty slices — no guessing", () => {
    const world = buildWorldModel({ registry: emptyRegistry, messageRows: [], ruleRows: [], lexiconRows: [] }, config, {});
    expect(world.entities).toEqual([]);
    expect(world.context).toEqual({ latestMessageId: null, latestEntityId: null });
    expect(world.ops).toEqual(config.ops.map((o) => ({ op: o.op, risk: o.risk, provider: o.provider, title: o.title }))); // the recipe-granted catalog, unfiltered (liveness is enforced at call time by the router)
  });
});

// =================================================================================================
// INTEGRATION — the real µhost: law + pack + vault + provider + mind (GATE-Ω10)
// =================================================================================================

describe("GATE-Ω10 — vivim.mind: the self-knowledge loop through registry + vault + config projections", () => {
  let c: Case;
  const sent: SendResult[] = [];
  let received: ReceiveResult | null = null;

  beforeAll(async () => {
    c = await bootMind("loop", (dataDir, journalPath) => makeMindSpec("mind-loop", dataDir, MIND_CONFIG, journalPath));
  });

  test("law eager, pack+provider+vault+mind dormant at boot (D-331); routes intact", () => {
    const st = c.host.router.status();
    expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
    expect(st.dormant).toEqual(["pack.domain-email", "provider.email.file", "vivim.mind", "vivim.vault"]);
    expect(st.routedOps).toEqual(expect.arrayContaining([...MESSAGE_CONTRACTS, ...MIND_CONTRACTS, ...VAULT_CONTRACTS, ...LAW_CONTRACTS]));
  });

  test("THE LOOP step 1 — send ceremony (root → REFUSED + consentId → grant → retry ok), twice, strictly ordered in time", async () => {
    const first = await c.host.router.callAsRoot("message.send@1", {
      to: "peter.miller@omega.local", subject: "quarterly numbers", body: "the sheet is attached",
    });
    const consentId = await extractConsentId(first);
    const grant = await c.host.router.callAsRoot("law.consent.grant@1", { consentId });
    expect(grant.ok).toBe(true);
    const retry = await c.host.router.callAsRoot("message.send@1", {
      to: "peter.miller@omega.local", subject: "quarterly numbers", body: "the sheet is attached",
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) sent.push(retry.value as SendResult);

    await sleep(5); // strictly-ordered sentAt (the recency key the mind sorts on)
    const second = await c.host.router.callAsRoot("message.send@1", {
      to: "sarah.chen@omega.local", subject: "design review", body: "thursday at ten",
    });
    expect(second.ok).toBe(true); // same principal+op already consented
    if (second.ok) sent.push(second.value as SendResult);
    expect(sent).toHaveLength(2);
  });

  test("THE LOOP step 2 — the console pre-check pattern: law.check {principal: vivim.director} makes the director OBSERVABLE to the registry", async () => {
    // docs/NCLL-AND-SELF-KNOWLEDGE.md §3: "the console pre-checks
    // law.check{principal:"vivim.director"} for the action" — the registry observes
    // the director as a live principal, which the ops-catalog liveness cross-check needs.
    const r = await c.host.router.callAsRoot("law.check@1", { principal: "vivim.director", op: "message.send@1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { decision: string; principal: string };
      expect(v.principal).toBe("vivim.director");
      expect(["require-consent", "allow", "deny"]).toContain(v.decision);
    }
  });

  test("THE LOOP step 3 — mind.snapshot@1: the WorldModel from evidence (ops catalog, 2 messages, 2 DERIVED contacts, self excluded)", async () => {
    const world = await snapshot(c.host);

    // ops: EXACTLY the 9 config rows (all providers active in the registry snapshot)
    expect(world.ops).toEqual(MIND_OPS);

    // entities: 2 message entities (labels = subjects) + 2 derived contacts, newest-first
    // with contacts interleaved by latest-seen at (ties broken by id asc)
    expect(world.entities.map((e) => e.id)).toEqual(expectedEntityIds([
      { id: `message:${sent[0].messageId}`, at: sent[0].sentAt },
      { id: `message:${sent[1].messageId}`, at: sent[1].sentAt },
      { id: "contact:peter-miller", at: sent[0].sentAt },
      { id: "contact:sarah-chen", at: sent[1].sentAt },
    ]));

    // the contacts are BYTE-IDENTICAL contactFromAddress derivations (self demo@omega.local excluded)
    const byId = new Map(world.entities.map((e) => [e.id, e]));
    expect(byId.get("contact:peter-miller")).toEqual(contactFromAddress("peter.miller@omega.local", sent[0].sentAt));
    expect(byId.get("contact:sarah-chen")).toEqual(contactFromAddress("sarah.chen@omega.local", sent[1].sentAt));
    expect((byId.get("contact:peter-miller")!.data as Record<string, unknown>)["address"]).toBe("peter.miller@omega.local");

    // the message entities: label = subject, full body present, evidence fields projected
    const m1 = byId.get(`message:${sent[0].messageId}`)!;
    expect(m1.type).toBe("message");
    expect(m1.label).toBe("quarterly numbers");
    expect(m1.at).toBe(sent[0].sentAt);
    expect(m1.data).toEqual({
      id: sent[0].messageId, subject: "quarterly numbers", body: "the sheet is attached",
      from: "demo@omega.local", to: "peter.miller@omega.local", folder: "sent", sentAt: sent[0].sentAt,
      flags: { seen: false, flagged: false, draft: false },
    });
    expect(m1.names).toContain("quarterly");
    expect(m1.names).toContain("demo"); // from-local-part words — the SENDER's local part (the self address on a sent message)

    // context: latestMessageId = the newer message; latestEntityId = the first entity
    expect(world.context.latestMessageId).toBe(`message:${[...sent].sort((a, b) => b.sentAt - a.sentAt)[0].messageId}`);
    expect(world.context.latestEntityId).toBe(world.entities[0].id);

    // empty surfaces (nothing taught, no rules yet)
    expect(world.lexicon).toEqual([]);
    expect(world.rules).toEqual([]);

    // kernel: composition + nlclVersion from config; plugins from the LIVE registry
    expect(world.kernel.composition).toBe("console");
    expect(world.kernel.nlclVersion).toBe("0.1.0");
    const pluginIds = world.kernel.plugins.map((p) => p.id);
    for (const id of ["vivim.law", "provider.email.file", "vivim.director", "vivim.mind"]) {
      expect(pluginIds).toContain(id); // the registry observes gate-passers: the provider (journal), the director (pre-check), the mind (its own registry call)
    }
    for (const p of world.kernel.plugins) {
      expect(p.state).toBe("active");
      expect(typeof p.version).toBe("string"); // "unknown" — the registry knows liveness, not versions
    }

    // v and t are present and numeric (v = registry events + entities + rules + lexicon)
    expect(typeof world.v).toBe("number");
    expect(world.v).toBeGreaterThan(4);
    expect(typeof world.t).toBe("number");

    // includeBodies: false strips bodies only (the light replication path)
    const light = await snapshot(c.host, { includeBodies: false });
    const lightMessage = light.entities.find((e) => e.id === `message:${sent[0].messageId}`)!;
    expect("body" in (lightMessage.data ?? {})).toBe(false);
    expect((lightMessage.data as Record<string, unknown>)["subject"]).toBe("quarterly numbers");
  });

  test("DETERMINISM — two snapshots with NO vault writes → byte-identical entities/ops/rules/lexicon (v and t may differ)", async () => {
    const a = await snapshot(c.host);
    const b = await snapshot(c.host);
    expect(JSON.stringify(b.entities)).toBe(JSON.stringify(a.entities));
    expect(JSON.stringify(b.ops)).toBe(JSON.stringify(a.ops));
    expect(JSON.stringify(b.rules)).toBe(JSON.stringify(a.rules));
    expect(JSON.stringify(b.lexicon)).toBe(JSON.stringify(a.lexicon));
    expect(JSON.stringify(b.context)).toBe(JSON.stringify(a.context));
    expect(JSON.stringify(b.kernel.plugins)).toBe(JSON.stringify(a.kernel.plugins));
    // v is allowed to move (the registry's observed-event count grows with every law op);
    // it must stay a positive integer, never undefined
    expect(Number.isInteger(b.v)).toBe(true);
  });

  test("RECEIVE — message.receive@1 (READ, ungated) from peter → a 3rd message entity, latestMessageId updated, contacts NOT duplicated", async () => {
    await sleep(5); // the received message is strictly newer than both sends
    const r = await c.host.router.callAsRoot("message.receive@1", {
      from: "peter.miller@omega.local", subject: "the report is ready", body: "numbers attached, see the sheet",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      received = r.value as ReceiveResult;
      expect(received.folder).toBe("inbox");
    }

    const world = await snapshot(c.host);
    // 3 message entities now; the received one is in the inbox, from peter, to the self address
    const messages = world.entities.filter((e) => e.type === "message");
    expect(messages).toHaveLength(3);
    const inbox = messages.find((e) => e.id === `message:${received!.messageId}`)!;
    expect((inbox.data as Record<string, unknown>)["folder"]).toBe("inbox");
    expect((inbox.data as Record<string, unknown>)["from"]).toBe("peter.miller@omega.local");
    expect((inbox.data as Record<string, unknown>)["to"]).toBe("demo@omega.local");
    // the from-local-part words ground "peter's message": the received message's sender is Peter
    expect(inbox.names).toContain("peter");
    expect(inbox.names).toContain("miller");
    // contacts unchanged: peter already known — no duplicate contact (still exactly 2)
    const contacts = world.entities.filter((e) => e.type === "contact");
    expect(contacts.map((x) => x.id).sort()).toEqual(["contact:peter-miller", "contact:sarah-chen"]);
    // peter's contact recency updated to the latest message he appears in
    expect(contacts.find((x) => x.id === "contact:peter-miller")!.at).toBe(received!.receivedAt);
    // the context follows the newest message
    expect(world.context.latestMessageId).toBe(`message:${received!.messageId}`);
  });

  test("TAUGHT LEXICON — vault ns 'nlcl' (the director's surface): taught word appears; a removal entry unteaches it", async () => {
    // root appends directly through the vault (MUTATION class → allow + journal, no
    // consent): the REAL director is another agent — this proves the mind reads the
    // taught surface, whoever writes it.
    const teach = await c.host.router.callAsRoot("vault.append@1", {
      ns: "nlcl", id: "lexicon:blitz", data: { word: "blitz", op: "message.send@1", source: "taught", createdAt: 1 },
    });
    expect(teach.ok).toBe(true);

    const taught = await snapshot(c.host);
    expect(taught.lexicon).toEqual([{ word: "blitz", op: "message.send@1", source: "taught", createdAt: 1 }]);

    // unteach: the SAME object's latest revision is the removal — the lens reads latest state
    const unteach = await c.host.router.callAsRoot("vault.append@1", {
      ns: "nlcl", id: "lexicon:blitz", data: { word: "blitz", op: null, action: "remove", source: "taught", createdAt: 2 },
    });
    expect(unteach.ok).toBe(true);
    const untaught = await snapshot(c.host);
    expect(untaught.lexicon).toEqual([]);
  });

  test("RULE SURFACE — vault ns 'automation': rules[0] is the exact RuleView; a rule ENTITY exists so 'disable rule X' grounds", async () => {
    const append = await c.host.router.callAsRoot("vault.append@1", {
      ns: "automation", id: "rule:peter-forward",
      data: {
        id: "rule:peter-forward",
        when: { event: "message.received", from: "contact:peter-miller" },
        then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } },
        enabled: true, summary: "When Peter Miller messages me, forward to Sarah Chen", createdAt: 1,
      },
    });
    expect(append.ok).toBe(true);

    const world = await snapshot(c.host);
    expect(world.rules).toHaveLength(1);
    expect(world.rules[0]).toEqual({
      id: "rule:peter-forward", enabled: true, summary: "When Peter Miller messages me, forward to Sarah Chen",
      when: { event: "message.received", from: "contact:peter-miller" },
      then: { op: "message.send@1", to: "sarah.chen@omega.local" }, // "to" mapped from then.payload.to
    });
    // the rule ENTITY (type rule, names include the summary words) — "disable the rule" grounds on it
    const ruleEntity = world.entities.find((e) => e.id === "rule:peter-forward");
    expect(ruleEntity).toBeDefined();
    expect(ruleEntity!.type).toBe("rule");
    expect(ruleEntity!.label).toBe("When Peter Miller messages me, forward to Sarah Chen");
    expect(ruleEntity!.names).toContain("forward");
    expect(ruleEntity!.names).toContain("rule-peter-forward");
  });

  test("mind.query@1 — focused views from the same machinery: contacts slice; entities filter (case-insensitive substring)", async () => {
    const contacts = await c.host.router.callAsRoot("mind.query@1", { kind: "contacts" });
    expect(contacts.ok).toBe(true);
    if (contacts.ok) {
      const v = contacts.value as QueryResult;
      expect(v.kind).toBe("contacts");
      expect(v.filter).toBeNull();
      expect(v.count).toBe(2);
      expect(v.rows.every((r) => (r as EntityView).type === "contact")).toBe(true);
      expect((v.rows as EntityView[]).map((r) => r.id).sort()).toEqual(["contact:peter-miller", "contact:sarah-chen"]);
      expect(typeof v.worldV).toBe("number");
    }

    const peter = await c.host.router.callAsRoot("mind.query@1", { kind: "entities", filter: "peter" });
    expect(peter.ok).toBe(true);
    if (peter.ok) {
      const v = peter.value as QueryResult;
      expect(v.filter).toBe("peter");
      const rows = v.rows as EntityView[];
      expect(rows.some((r) => r.id === "contact:peter-miller")).toBe(true);
      // every row matches on id/label/type, case-insensitively (the rule's label mentions Peter)
      for (const r of rows) {
        const hay = [r.id, r.label, r.type].map((s) => s.toLowerCase());
        expect(hay.some((s) => s.includes("peter"))).toBe(true);
      }
    }

    // an unknown kind fails closed: DEGRADED (never a guessed slice)
    const bad = await c.host.router.callAsRoot("mind.query@1", { kind: "nope" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("DEGRADED");
  });

  test("BOUNDS — a second composition with entityCap 4 and 5 messages → the world holds at most 4 entities (newest-first)", async () => {
    const bounded = await bootMind("bounds", (dataDir, journalPath) =>
      makeMindSpec("mind-bounds", dataDir, { ...MIND_CONFIG, entityCap: 4 }, journalPath));
    // consent once, then five sends to the same recipient (5 messages + 1 contact = 6 candidates)
    const first = await bounded.host.router.callAsRoot("message.send@1", { to: "peter.miller@omega.local", subject: "b1", body: "x" });
    const consentId = await extractConsentId(first);
    await bounded.host.router.callAsRoot("law.consent.grant@1", { consentId });
    const sends: SendResult[] = [];
    for (let i = 1; i <= 5; i++) {
      await sleep(2);
      const r = await bounded.host.router.callAsRoot("message.send@1", { to: "peter.miller@omega.local", subject: `b${i}`, body: "x" });
      expect(r.ok).toBe(true);
      if (r.ok) sends.push(r.value as SendResult);
    }
    expect(sends).toHaveLength(5);

    const world = await snapshot(bounded.host);
    expect(world.entities.length).toBeLessThanOrEqual(4);
    expect(world.entities).toHaveLength(4); // the cap is binding at exactly 4
    // the newest 4 candidates (at desc, id asc on ties), computed from the ACTUAL sends
    const candidates = sends.map((s) => ({ id: `message:${s.messageId}`, at: s.sentAt }));
    candidates.push({ id: "contact:peter-miller", at: Math.max(...sends.map((s) => s.sentAt)) });
    expect(world.entities.map((e) => e.id)).toEqual(expectedEntityIds(candidates, 4));
    // the lens is bounded: the oldest message is OUT of the world
    expect(world.entities.map((e) => e.id)).not.toContain(`message:${sends[0].messageId}`);
    // context stays self-consistent: refs resolve into the capped entity list
    const ids = new Set(world.entities.map((e) => e.id));
    expect(ids.has(world.context.latestMessageId!)).toBe(true);
    expect(ids.has(world.context.latestEntityId!)).toBe(true);
  });

  test("MANIFEST — plugin.json parses + validates through the sdk (0 issues; engines declare no risk)", () => {
    const raw = readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8");
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.id).toBe("vivim.mind");
    expect(parsed.value.contributions.engine?.map((c) => `${c.id}@${c.version}`)).toEqual(["mind.snapshot@1", "mind.query@1", "control.bootstrap@1", "control.describe@1", "mind.portrait@1"]);
    for (const c of parsed.value.contributions.engine ?? []) {
      expect(c.risk).toBeUndefined(); // engines declare no risk — READ semantics by kind (D-215)
    }
    expect(parsed.value.capabilities.requested).toEqual(MIND_CAPS); // exactly the four READ ports (D-350)
    const issues = validateManifest(parsed.value);
    expect(issues).toEqual([]);
  });
});
