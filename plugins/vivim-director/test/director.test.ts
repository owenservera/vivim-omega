// vivim.director — test/director.test.ts (Ω12, GATE-Ω12 evidence)
//
// THE REPROGRAMMING LOOP end-to-end, through the real µhost: boot a composition
// built from compositions/email.json + the director entry (unique temp dirs,
// spec copies with per-case dataDir, live tick loop disabled via
// config.intervalMs 0 so the fire pass is driven deterministically by
// director.tick@1) → teach a word (a vault object in ns "nlcl") → create a rule
// (a vault object in ns "automation", carrying the actionConsent the console
// pre-checks) → receive a message → tick → the rule fires message.send@1
// THROUGH THE PORT under principal vivim.director → WITHOUT the grant: REFUSED,
// the fired ledger records ok:false + the consentId, no sent message — the
// honest consent ceremony at rule fire time → grant through law.consent.grant@1
// → receive a SECOND message → tick → the sent message EXISTS in the vault,
// ledger ok:true → no-refire (ledger + (id,rev) memory) → restart resilience
// (a second composition on the SAME vault: the ledger check alone suffices) →
// rule disable → no fire → "when anyone" rule → determinism.
//
// Entry sources are relative to the vivim-omega root (specDir), mirroring the
// email integration house pattern; the boot goes through compileComposition +
// bootWithRecovery (verify → pin → spawn).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { contactFromAddress } from "@vivim/omega-nlcl-pure";
import {
  actionSummary, asRule, asTeaching, nextFreeRuleId, ruleSlug, ruleSummary,
  validateRuleInput, validateTeachInput,
} from "../src/rules.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → vivim-director/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

/** Shutdown + deregister (double-terminate of an exited worker parks 2.5s in the host fallback). */
async function shutdownCase(h: BootedHost): Promise<void> {
  const i = hosts.indexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  await h.shutdown().catch(() => {});
}

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.getmany@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"]; // D-388: getmany routed
const MESSAGE_CONTRACTS = ["message.send@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1", "message.receive@1"];
const PROVIDER_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:vault.search@1"];
const DIRECTOR_CONTRACTS = ["director.rule@1", "director.registry@1", "director.teach@1", "director.tick@1"];
const DIRECTOR_CAPS = ["port:vault.append@1", "port:vault.query@1", "port:vault.get@1", "port:vault.getmany@1", "port:message.send@1"]; // D-388: batched tick read phase

/** Spec built from compositions/email.json + the director entry (live loop OFF for determinism). */
function makeDirectorSpec(name: string, dataDir: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      { id: "pack.domain-email", source: "packs/domain-email", bootPhase: 1, grant: { capabilities: [], contracts: [] } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "provider.email.file", source: "plugins/provider-email-file", bootPhase: 1, grant: { capabilities: PROVIDER_CAPS, contracts: MESSAGE_CONTRACTS }, config: { from: "demo@omega.local" } },
      { id: "vivim.director", source: "plugins/vivim-director", bootPhase: 1, grant: { capabilities: DIRECTOR_CAPS, contracts: DIRECTOR_CONTRACTS }, config: { intervalMs: 0 } },
    ],
  };
}

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

/** Boots a unique temp case through the full ceremony (compile → verify → pin → spawn). */
async function bootCase(caseName: string): Promise<Case> {
  const root = omegaTmp("omega-director-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = join(root, "vault-data");
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(makeDirectorSpec(caseName, dataDir), OMEGA_ROOT, vaultDir, rootKey);
  const { host, report } = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
  expect(report.booted).toBe(true);
  expect(report.source).toBe("incoming");
  if (!host) throw new Error(`boot failed: ${report.reason}`);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

// ---- router helpers (root principal) ----

interface VaultRow { id: string; rev: number; cid: string }
interface VaultGet { rev: number; cid: string; data: Record<string, unknown>; meta: Record<string, unknown>; refs: unknown }

async function vaultQuery(host: BootedHost, ns: string, filter: Record<string, unknown> = {}): Promise<VaultRow[]> {
  const r = await host.router.callAsRoot("vault.query@1", { ns, filter });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(String(r.detail));
  return (r.value as VaultRow[]) ?? [];
}

async function vaultGet(host: BootedHost, ns: string, id: string): Promise<VaultGet | null> {
  const r = await host.router.callAsRoot("vault.get@1", { ns, id });
  if (!r.ok) return null; // not found / absent
  return r.value as VaultGet;
}

interface EmailMessage {
  id: string; threadId: string; folder: string; from: string; to: string;
  subject: string; body: string; sentAt: number;
  flags: { seen: boolean; flagged: boolean; draft: boolean };
}

async function allMessages(host: BootedHost): Promise<EmailMessage[]> {
  const out: EmailMessage[] = [];
  for (const row of await vaultQuery(host, "email")) {
    const got = await vaultGet(host, "email", row.id);
    if (!got || got.meta?.["type"] !== "message") continue;
    out.push(got.data as unknown as EmailMessage);
  }
  return out;
}

/** Receive a message through the provider (documented interface: {from, subject, body} → inbox, unseen). */
async function receiveMessage(host: BootedHost, input: { from: string; subject: string; body: string }): Promise<EmailMessage> {
  const r = await host.router.callAsRoot("message.receive@1", input);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(String(r.detail));
  const m = (await allMessages(host)).find((x) => x.folder === "inbox" && x.from === input.from && x.subject === input.subject && x.body === input.body);
  expect(m).toBeTruthy();
  expect(m!.flags.seen).toBe(false); // a RECEIVED message is inbox + unseen + from the sender
  return m!;
}

interface TickResult {
  scanned: number; processed: number; at: number;
  fired: Array<{ messageId: string; ruleId: string; ok: boolean; error?: string; consentId?: string }>;
  error?: string;
}

async function tick(host: BootedHost): Promise<TickResult> {
  const r = await host.router.callAsRoot("director.tick@1", {});
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(String(r.detail));
  return r.value as TickResult;
}

interface FiredLedger { messageId: string; from: string; at: number; firedRules: Array<{ ruleId: string; ok: boolean; error?: string; consentId?: string }> }

async function firedLedger(host: BootedHost, messageId: string): Promise<FiredLedger | null> {
  const got = await vaultGet(host, "automation", `fired:${messageId}`);
  return got ? (got.data as unknown as FiredLedger) : null;
}

function journalLines(vaultDir: string): Array<Record<string, unknown>> {
  const jf = join(vaultDir, "law-journal.jsonl");
  if (!existsSync(jf)) return [];
  return readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// =====================================================================
// Ω12 · unit — the pure vocabulary (rules.ts is import-safe outside a worker)
// =====================================================================
describe("Ω12 · pure rule/teach vocabulary (unit)", () => {
  test("rule validation: v1 boundaries are fail-closed", () => {
    const good = { when: { event: "message.received", from: "contact:peter-miller" }, then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } } };
    expect(validateRuleInput("director.rule@1", good).messageFromTrigger).toBe(true);
    expect(() => validateRuleInput("director.rule@1", { ...good, when: { event: "message.sent", from: null } })).toThrow("message.received");
    expect(() => validateRuleInput("director.rule@1", { ...good, when: { event: "message.received", from: "peter" } })).toThrow("contact");
    expect(() => validateRuleInput("director.rule@1", { ...good, then: { op: "vault.append@1", payload: {} } })).toThrow("message.send@1");
    expect(() => validateRuleInput("director.rule@1", { ...good, then: { op: "not an op", payload: {} } })).toThrow("@");
    expect(() => validateRuleInput("director.rule@1", { ...good, then: { op: "message.send@1", payload: "nope" } })).toThrow("object");
    expect(() => validateRuleInput("director.rule@1", null)).toThrow();
    expect(validateRuleInput("director.rule@1", { when: { event: "message.received", from: null }, then: { op: "message.send@1", payload: {} } }).when.from).toBeNull();
  });

  test("slug + collision + deterministic summaries", () => {
    expect(ruleSlug("contact:peter-miller")).toBe("rule:peter-miller-forward");
    expect(ruleSlug(null)).toBe("rule:any-forward");
    expect(nextFreeRuleId("rule:peter-miller-forward", new Set())).toBe("rule:peter-miller-forward");
    expect(nextFreeRuleId("rule:peter-miller-forward", new Set(["rule:peter-miller-forward"]))).toBe("rule:peter-miller-forward-2");
    expect(nextFreeRuleId("rule:peter-miller-forward", new Set(["rule:peter-miller-forward", "rule:peter-miller-forward-2"]))).toBe("rule:peter-miller-forward-3");
    const when = { event: "message.received" as const, from: "contact:peter-miller" };
    const then = { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } };
    expect(ruleSummary(when, then)).toBe("When Peter Miller messages me, send to Sarah Chen");
    expect(ruleSummary({ event: "message.received", from: null }, then)).toBe("When anyone messages me, send to Sarah Chen");
    expect(actionSummary({ op: "message.send@1", payload: {} })).toBe("run message.send@1");
    // the shared derivation: rule matching is byte-identical to the NCLL/console mind (D-216)
    expect(contactFromAddress("peter.miller@omega.local").id).toBe("contact:peter-miller");
  });

  test("teach validation: word grammar + op grammar on add; remove ignores op", () => {
    expect(validateTeachInput("director.teach@1", { word: "blitz", op: "message.send@1" })).toEqual({ word: "blitz", op: "message.send@1", action: "add" });
    expect(validateTeachInput("director.teach@1", { word: "Swoosh", op: "message.send@1" }).word).toBe("swoosh"); // folded
    expect(validateTeachInput("director.teach@1", { word: "blitz", action: "remove" })).toEqual({ word: "blitz", op: null, action: "remove" });
    expect(() => validateTeachInput("director.teach@1", { word: "x", op: "message.send@1" })).toThrow();
    expect(() => validateTeachInput("director.teach@1", { word: "this-word-is-way-too-long-for-v1", op: "message.send@1" })).toThrow();
    expect(() => validateTeachInput("director.teach@1", { word: "ok", op: "notanop" })).toThrow();
    expect(() => validateTeachInput("director.teach@1", { word: "ok", op: "message.send@1", action: "bogus" })).toThrow();
  });

  test("read-path defense: asRule/asTeaching reject malformed rows", () => {
    const rule = { id: "rule:peter-miller-forward", when: { event: "message.received", from: "contact:peter-miller" }, then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local" } }, enabled: true, summary: "s", createdAt: 1 };
    expect(asRule("x", "rule:peter-miller-forward", rule)).not.toBeNull();
    expect(asRule("x", "rule:other", rule)).toBeNull(); // id mismatch
    expect(asRule("x", "rule:peter-miller-forward", { ...rule, then: { op: "vault.append@1", payload: {} } })).toBeNull();
    expect(asRule("x", "rule:peter-miller-forward", null)).toBeNull();
    expect(asTeaching("x", "lexicon:blitz", { word: "blitz", op: null, action: "remove", source: "taught", createdAt: 1 })).not.toBeNull();
    expect(asTeaching("x", "lexicon:blitz", { word: "blitz", op: "bogus", action: "add", source: "taught", createdAt: 1 })).toBeNull();
    expect(asTeaching("x", "lexicon:blitz", { word: "other", op: null, action: "remove", source: "taught", createdAt: 1 })).toBeNull();
  });
});

// =====================================================================
// Ω12 · GATE — the reprogramming loop through the real µhost
// =====================================================================
describe("GATE-Ω12 — rules/teach as data, tick fires under principal vivim.director, consent-aware", () => {
  let c: Case;
  let ruleId: string;
  let msg1: EmailMessage;
  let consentIdNoGrant: string;

  beforeAll(async () => {
    c = await bootCase("director-loop");
  });

  test("law eager, pack+provider+vault+director dormant at boot (D-331); routes intact", () => {
    const st = c.host.router.status();
    expect((st.compartments as Record<string, { state: string; delivered: number }>)["vivim.law"]?.state).toBe("active");
    expect(st.dormant).toEqual(["pack.domain-email", "provider.email.file", "vivim.director", "vivim.vault"]);
    expect(st.routedOps).toEqual(expect.arrayContaining([...DIRECTOR_CONTRACTS, ...MESSAGE_CONTRACTS, ...VAULT_CONTRACTS, ...LAW_CONTRACTS]));
    // The pack never serves: under lazy it has no worker at all (the teach
    // call in the next test wakes only the director+vault — pack stays dormant).
  });

  test("1 · teach: blitz = message.send@1 lands as a vault object (ns nlcl); remove appends op:null", async () => {
    const add = await c.host.router.callAsRoot("director.teach@1", { word: "blitz", op: "message.send@1" });
    expect(add.ok).toBe(true);
    if (add.ok) {
      const v = add.value as { word: string; op: string; action: string; rev: number };
      expect(v).toEqual({ word: "blitz", op: "message.send@1", action: "add", rev: 1 });
    }
    // the vault query shows the entry — a DATA object the mind will surface in world.lexicon
    const rows = await vaultQuery(c.host, "nlcl");
    expect(rows.map((r) => r.id)).toContain("lexicon:blitz");
    const got = await vaultGet(c.host, "nlcl", "lexicon:blitz");
    expect(got?.data).toMatchObject({ word: "blitz", op: "message.send@1", action: "add", source: "taught" });

    // remove: the op:null revision IS the removal (the mind skips op:null rows)
    const rm = await c.host.router.callAsRoot("director.teach@1", { word: "blitz", action: "remove" });
    expect(rm.ok).toBe(true);
    if (rm.ok) {
      const v = rm.value as { word: string; op: string | null; action: string; rev: number };
      expect(v.op).toBeNull();
      expect(v.action).toBe("remove");
      expect(v.rev).toBe(2);
    }
    const after = await vaultGet(c.host, "nlcl", "lexicon:blitz");
    expect(after?.rev).toBe(2);
    expect(after?.data).toMatchObject({ word: "blitz", op: null, action: "remove" });

    // the fold law: case-insensitive words fold into one id
    const fold = await c.host.router.callAsRoot("director.teach@1", { word: "Swoosh", op: "message.send@1" });
    expect(fold.ok).toBe(true);
    expect((await vaultQuery(c.host, "nlcl")).map((r) => r.id)).toContain("lexicon:swoosh");
  });

  test("2 · rule create: When Peter Miller messages me → vault object + the actionConsent card", async () => {
    const r = await c.host.router.callAsRoot("director.rule@1", {
      when: { event: "message.received", from: "contact:peter-miller" },
      then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { ruleId: string; rev: number; summary: string; actionConsent: { principal: string; op: string } };
      expect(v.ruleId).toBe("rule:peter-miller-forward");
      expect(v.rev).toBe(1);
      expect(v.summary).toContain("Peter Miller");
      expect(v.summary).toBe("When Peter Miller messages me, send to Sarah Chen");
      expect(v.actionConsent).toEqual({ principal: "vivim.director", op: "message.send@1" });
      ruleId = v.ruleId;
    }
    // the rule IS a vault object (ns automation) — data, never codegen (D-219)
    const got = await vaultGet(c.host, "automation", "rule:peter-miller-forward");
    expect(got?.data).toMatchObject({
      id: "rule:peter-miller-forward",
      when: { event: "message.received", from: "contact:peter-miller" },
      then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } },
      enabled: true,
      summary: "When Peter Miller messages me, send to Sarah Chen",
    });
  });

  test("3a · fire WITHOUT the grant: REFUSED is a legitimate ledgered outcome — no sent message, the consentId is named", async () => {
    msg1 = await receiveMessage(c.host, { from: "peter.miller@omega.local", subject: "the report", body: "numbers inside" });

    const t = await tick(c.host);
    expect(t.processed).toBe(1);
    expect(t.fired).toHaveLength(1);
    const firedRow = t.fired[0]!;
    expect(firedRow.messageId).toBe(msg1.id);
    expect(firedRow.ruleId).toBe("rule:peter-miller-forward");
    expect(firedRow.ok).toBe(false);
    expect(firedRow.error).toContain("consent required"); // the tick RETURN carries the consent requirement
    expect(firedRow.consentId).toMatch(/^consent_[0-9a-f]{16}$/);
    consentIdNoGrant = firedRow.consentId!;

    // the fired LEDGER records ok:false + the consentId (one append per processed message)
    const ledger = await firedLedger(c.host, msg1.id);
    expect(ledger).not.toBeNull();
    expect(ledger!.from).toBe("peter.miller@omega.local");
    expect(ledger!.firedRules).toHaveLength(1);
    expect(ledger!.firedRules[0]!.ruleId).toBe("rule:peter-miller-forward");
    expect(ledger!.firedRules[0]!.ok).toBe(false);
    expect(ledger!.firedRules[0]!.consentId).toBe(consentIdNoGrant);

    // NO sent message was appended — the gate held
    const messages = await allMessages(c.host);
    expect(messages.filter((m) => m.to === "sarah.chen@omega.local")).toHaveLength(0);
    expect(messages.filter((m) => m.folder === "sent")).toHaveLength(0);

    // the gate journaled the refusal under principal vivim.director (router line)
    const gate = journalLines(c.vaultDir).find((l) => l.op === "message.send@1" && l.decision === "require-consent" && l.principal === "vivim.director");
    expect(gate).toBeTruthy();
    expect(gate!.consentId).toBe(consentIdNoGrant);
  });

  test("3b · the grant ceremony: law.check names the consent → grant → the second message fires clean", async () => {
    // the console pre-check: law.check under the director's principal
    const check = await c.host.router.callAsRoot("law.check@1", { principal: "vivim.director", op: "message.send@1" });
    expect(check.ok).toBe(true);
    if (check.ok) {
      const d = check.value as { decision: string; consentId?: string; reason: string };
      expect(d.decision).toBe("require-consent");
      expect(d.consentId).toMatch(/^consent_[0-9a-f]{16}$/);
      expect(d.consentId).toBe(consentIdNoGrant); // stable derivation — same id the tick surfaced
    }
    const grant = await c.host.router.callAsRoot("law.consent.grant@1", { consentId: consentIdNoGrant, principal: "vivim.director" });
    expect(grant.ok).toBe(true);
    // now the law allows the director's action
    const allow = await c.host.router.callAsRoot("law.check@1", { principal: "vivim.director", op: "message.send@1" });
    expect(allow.ok).toBe(true);
    if (allow.ok) expect((allow.value as { decision: string }).decision).toBe("allow");

    const msg2 = await receiveMessage(c.host, { from: "peter.miller@omega.local", subject: "the follow-up", body: "second body" });
    const t = await tick(c.host);
    expect(t.processed).toBe(1);
    expect(t.fired).toHaveLength(1);
    expect(t.fired[0]!.messageId).toBe(msg2.id);
    expect(t.fired[0]!.ok).toBe(true);

    // the SENT message exists — appended by the provider, body/subject bound to the trigger
    const sent = (await allMessages(c.host)).find((m) => m.to === "sarah.chen@omega.local");
    expect(sent).toBeTruthy();
    expect(sent!.folder).toBe("sent");
    expect(sent!.from).toBe("demo@omega.local");
    expect(sent!.subject).toBe("Fwd: the follow-up");
    expect(sent!.body).toBe("second body");

    const ledger = await firedLedger(c.host, msg2.id);
    expect(ledger?.firedRules[0]?.ok).toBe(true);
    // the allow decision is journaled, naming the active consent
    const allowLine = journalLines(c.vaultDir).find((l) => l.op === "message.send@1" && l.decision === "allow" && l.principal === "vivim.director");
    expect(allowLine).toBeTruthy();
    expect(String(allowLine!.reason)).toContain(consentIdNoGrant);
  });

  test("4 · no-refire: a second tick processes nothing; a FRESH BOOT on the same vault stays no-refire (ledger is the authority)", async () => {
    const t = await tick(c.host);
    expect(t.processed).toBe(0);
    expect(t.fired).toEqual([]); // the same message never refires — ledger + (id,rev) memory
    const sentBefore = (await allMessages(c.host)).filter((m) => m.folder === "sent").length;

    // restart resilience: boot a second composition on the SAME vault (pinned recipe),
    // fresh (id,rev) memory — the LEDGER CHECK ALONE must suffice
    const { host: second } = await bootWithRecovery(c.vaultDir);
    expect(second).toBeTruthy();
    hosts.push(second!);
    try {
      // Reboot lands dormant again (D-331) — law gates from the first tick,
      // the rest wake on touch; the tick below is the touch.
      const st = second!.router.status();
      expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
      expect(st.dormant).toEqual(["pack.domain-email", "provider.email.file", "vivim.director", "vivim.vault"]);
      const t2 = await tick(second!);
      expect(t2.processed).toBe(0);
      expect(t2.fired).toEqual([]);
      // and no double-send materialized in the shared vault
      expect((await allMessages(second!)).filter((m) => m.folder === "sent").length).toBe(sentBefore);
    } finally {
      await shutdownCase(second!);
    }
  });

  test("5 · rule disable (the '-' family): the third message is processed but never fires", async () => {
    const dis = await c.host.router.callAsRoot("director.registry@1", { action: "disable", ruleId: "rule:peter-miller-forward" });
    expect(dis.ok).toBe(true);
    if (dis.ok) {
      const v = dis.value as { id: string; enabled: boolean; rev: number; changed: boolean; summary: string };
      expect(v.id).toBe("rule:peter-miller-forward");
      expect(v.enabled).toBe(false);
      expect(v.rev).toBe(2);
      expect(v.changed).toBe(true);
    }
    // the registry lists it disabled — same summary, enabled flipped
    const list = await c.host.router.callAsRoot("director.registry@1", { filter: "rules" });
    expect(list.ok).toBe(true);
    if (list.ok) {
      const v = list.value as { rules: Array<{ id: string; enabled: boolean; summary: string }> };
      const rule = v.rules.find((r) => r.id === "rule:peter-miller-forward");
      expect(rule?.enabled).toBe(false);
      expect(rule?.summary).toContain("Peter Miller");
    }

    const msg3 = await receiveMessage(c.host, { from: "peter.miller@omega.local", subject: "the third", body: "third body" });
    const t = await tick(c.host);
    expect(t.processed).toBe(1); // processed (ledgered) — exactly once
    expect(t.fired).toEqual([]); // but NOT fired: the rule is data, disabled is a data revision
    const ledger = await firedLedger(c.host, msg3.id);
    expect(ledger?.firedRules).toEqual([]);
    // no new sent message
    expect((await allMessages(c.host)).filter((m) => m.folder === "sent")).toHaveLength(1);
  });

  test("6 · 'when anyone' rule (from null): a message from a NEW address fires (consent already active)", async () => {
    const create = await c.host.router.callAsRoot("director.rule@1", {
      when: { event: "message.received", from: null },
      then: { op: "message.send@1", payload: { to: "ops@omega.local", messageFromTrigger: true } },
    });
    expect(create.ok).toBe(true);
    if (create.ok) {
      const v = create.value as { ruleId: string; summary: string; actionConsent: { principal: string; op: string } };
      expect(v.ruleId).toBe("rule:any-forward");
      expect(v.summary).toBe("When anyone messages me, send to Ops");
      expect(v.actionConsent).toEqual({ principal: "vivim.director", op: "message.send@1" });
    }

    const maria = await receiveMessage(c.host, { from: "maria.garcia@omega.local", subject: "hello from maria", body: "maria body" });
    const t = await tick(c.host);
    expect(t.processed).toBe(1);
    expect(t.fired).toHaveLength(1);
    expect(t.fired[0]!.messageId).toBe(maria.id);
    expect(t.fired[0]!.ruleId).toBe("rule:any-forward");
    expect(t.fired[0]!.ok).toBe(true);

    const sent = (await allMessages(c.host)).find((m) => m.to === "ops@omega.local");
    expect(sent).toBeTruthy();
    expect(sent!.subject).toBe("Fwd: hello from maria");
    expect(sent!.body).toBe("maria body");
    const ledger = await firedLedger(c.host, maria.id);
    expect(ledger?.firedRules[0]?.ok).toBe(true);
  });

  test("7 · determinism: two ticks over identical state → identical fired arrays", async () => {
    const t1 = await tick(c.host);
    const t2 = await tick(c.host);
    expect(t1.processed).toBe(0);
    expect(t2.processed).toBe(0);
    expect(JSON.stringify(t1.fired)).toBe(JSON.stringify(t2.fired));
  });

  test("8 · the manifest parses + validates through @vivim/omega-sdk", () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.id).toBe("vivim.director");
    expect(parsed.value.contributions.engine?.map((e) => `${e.id}@${e.version}`)).toEqual([
      "director.rule@1", "director.registry@1", "director.teach@1", "director.tick@1",
      "resolve.classify@1", "resolve.report@1", "strategy.scorecard@1", // D-323: same plugin, no new caps
    ]);
    expect(parsed.value.capabilities.requested).toEqual(DIRECTOR_CAPS);
    const issues = validateManifest(parsed.value);
    expect(issues.length).toBe(0);
  });

  test("9 · fail-closed validation through the router (DEGRADED, never silent)", async () => {
    const cases: Array<[unknown, string]> = [
      [{ when: { event: "message.sent", from: null }, then: { op: "message.send@1", payload: {} } }, "message.received"],
      [{ when: { event: "message.received", from: "peter" }, then: { op: "message.send@1", payload: {} } }, "contact"],
      [{ when: { event: "message.received", from: null }, then: { op: "vault.append@1", payload: {} } }, "message.send@1"],
      [{ when: { event: "message.received", from: null }, then: { op: "message.send@1", payload: "flat" } }, "object"],
    ];
    for (const [payload, needle] of cases) {
      const r = await c.host.router.callAsRoot("director.rule@1", payload);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("DEGRADED");
        expect(String(r.detail)).toContain(needle);
      }
    }
    const unknownRule = await c.host.router.callAsRoot("director.registry@1", { action: "disable", ruleId: "rule:does-not-exist" });
    expect(unknownRule.ok).toBe(false);
    if (!unknownRule.ok) {
      expect(unknownRule.error).toBe("DEGRADED");
      expect(String(unknownRule.detail)).toContain("no rule");
    }
    const badFilter = await c.host.router.callAsRoot("director.registry@1", { filter: "bogus" });
    expect(badFilter.ok).toBe(false);
    const badTeach = await c.host.router.callAsRoot("director.teach@1", { word: "x", op: "message.send@1" });
    expect(badTeach.ok).toBe(false);
    const badTeachOp = await c.host.router.callAsRoot("director.teach@1", { word: "fine", op: "nope" });
    expect(badTeachOp.ok).toBe(false);
  });

  test("10 · the LIVE loop: intervalMs 100 fires the pass on schedule (no manual tick, no consent → ledgered refusal)", async () => {
    // a separate case with the live loop ON (100ms) — the tick pass runs on the
    // interval with the in-flight guard; nobody calls director.tick@1 here.
    const root = omegaTmp("omega-director-test", `director-live-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);
    const spec = makeDirectorSpec("director-live", dataDir);
    const liveEntry = spec.entries.find((e) => e.id === "vivim.director")!;
    liveEntry.config = { intervalMs: 100 };
    const { recipe, buildDir } = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const { host, report } = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    expect(report.booted).toBe(true);
    if (!host) throw new Error(`boot failed: ${report.reason}`);
    hosts.push(host);
    try {
      const rule = await host.router.callAsRoot("director.rule@1", {
        when: { event: "message.received", from: "contact:peter-miller" },
        then: { op: "message.send@1", payload: { to: "sarah.chen@omega.local", messageFromTrigger: true } },
      });
      expect(rule.ok).toBe(true);
      const received = await receiveMessage(host, { from: "peter.miller@omega.local", subject: "live loop", body: "fired by the interval" });
      // no manual tick: wait for at least one interval pass (100ms period; generous margin)
      let ledger: FiredLedger | null = null;
      for (let i = 0; i < 50 && ledger === null; i++) {
        await new Promise((r) => setTimeout(r, 100));
        ledger = await firedLedger(host, received.id);
      }
      expect(ledger).not.toBeNull();          // the LIVE loop processed the message
      expect(ledger!.firedRules).toHaveLength(1);
      expect(ledger!.firedRules[0]!.ok).toBe(false); // no consent in this composition — the honest refusal
      expect(ledger!.firedRules[0]!.consentId).toMatch(/^consent_[0-9a-f]{16}$/);
      expect((await allMessages(host)).filter((m) => m.folder === "sent")).toHaveLength(0);
    } finally {
      await shutdownCase(host);
    }
  });
});
