// provider.email.file — test/integration.test.ts (Ω5, GATE-Ω5 evidence)
//
// THE LOOP through the real µhost: boot compositions/email.json (unique temp dirs,
// modified spec copies) → message.send@1 REFUSED (EXTERNAL_MUTATION, consent
// required) → extract consentId → law.consent.grant@1 → retry → ok → second send
// already consented → list → search (FTS) → read (marks seen as a separate gated
// append) → move (consent again under the law's fail-closed default) → Merkle
// verify → SHUT DOWN → boot a SECOND composition on the SAME dataDir → the
// messages survive the provider replacement (data sovereignty).
//
// Entry sources are relative to the vivim-omega root (specDir), mirroring the
// vault integration pattern; the shipped compositions/email.json is booted
// separately with an overridden dataDir.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → provider-email-file/ → plugins/ → root
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

/** Shutdown + deregister (double-terminate of an exited worker parks 2.5s in the host fallback). */
async function shutdownCase(h: BootedHost): Promise<void> {
  const i = hosts.indexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  await h.shutdown().catch(() => {});
}

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const MESSAGE_CONTRACTS = ["message.send@1", "message.list@1", "message.search@1", "message.read@1", "message.move@1", "message.receive@1"];
const PROVIDER_CAPS = ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:vault.search@1"];

/** Spec copy of compositions/email.json with a per-case dataDir (and optionally no pack — the sovereignty swap). */
function makeEmailSpec(name: string, dataDir: string, opts: { withPack?: boolean; from?: string } = {}): CompositionSpec {
  const withPack = opts.withPack ?? true;
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      ...(withPack
        ? [{ id: "pack.domain-email", source: "packs/domain-email", bootPhase: 1, grant: { capabilities: [], contracts: [] } as { capabilities: string[]; contracts: string[] } }]
        : []),
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "provider.email.file", source: "plugins/provider-email-file", bootPhase: 1, grant: { capabilities: PROVIDER_CAPS, contracts: MESSAGE_CONTRACTS }, config: { from: opts.from ?? "demo@omega.local" } },
    ],
  };
}

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

/** Boots a unique temp case: own vault dir + build; the dataDir defaults INSIDE the case root (unique per run), overridable for the sovereignty swap. */
async function bootEmail(caseName: string, specFactory: (dataDir: string) => CompositionSpec, opts: { dataDir?: string } = {}): Promise<Case> {
  const root = omegaTmp("omega-email-test", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = opts.dataDir ?? join(root, "vault-data");
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(specFactory(dataDir), OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

interface SendResult { messageId: string; rev: number; sentAt: number }
interface ReceiveResult { messageId: string; rev: number; receivedAt: number; folder: string }
interface ListResult { messages: Array<{ id: string; threadId: string; folder: string; from: string; to: string; subject: string; sentAt: number; flags: { seen: boolean; flagged: boolean; draft: boolean }; rev: number }>; scanned: number }
interface ReadResult { message: { id: string; body: string; flags: { seen: boolean }; [k: string]: unknown }; rev: number; seenMarked: boolean }
interface SearchMatch { id: string; subject: string; rev: number; rank: number; [k: string]: unknown }

function journalLines(vaultDir: string): Array<Record<string, unknown>> {
  const jf = join(vaultDir, "law-journal.jsonl");
  if (!existsSync(jf)) return [];
  return readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** The consent ceremony helper: REFUSED → extract consentId → grant → (caller retries). */
async function extractConsentId(r: PortResult): Promise<string> {
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toBe("REFUSED");
    expect(r.detail).toContain("consent required");
  }
  const consentId = ((r as { detail?: string }).detail ?? "").split(":")[1]?.trim();
  expect(consentId).toMatch(/^consent_[0-9a-f]{16}$/); // stable FNV id — the law names the exact grant
  return consentId!;
}

describe("GATE-Ω5 — the email loop through vault + consent (compositions/email.json)", () => {
  let c: Case;
  const sent: SendResult[] = [];

  beforeAll(async () => {
    c = await bootEmail("loop", (dataDir) => makeEmailSpec("email-loop", dataDir));
  });

  test("law eager, pack+vault+provider dormant at boot (D-331); routes intact", async () => {
    const st = c.host.router.status();
    expect((st.compartments as Record<string, { state: string; delivered: number }>)["vivim.law"]?.state).toBe("active");
    expect(st.dormant).toEqual(["pack.domain-email", "provider.email.file", "vivim.vault"]);
    // the pack composes with EMPTY grants: its manifest declares the same contract ids
    // the provider implements — cross-plugin implementation is the PREFERRED state,
    // and the ops route to the provider, never to the pack.
    expect(st.routedOps).toEqual(expect.arrayContaining([...MESSAGE_CONTRACTS, ...VAULT_CONTRACTS, ...LAW_CONTRACTS]));
    // Touch the vault through a READ (no state change — the Merkle entry
    // counts below stay exact): the pack must stay unspawned — under lazy it
    // has no worker at all (strictly stronger than delivered 0).
    const touched = await c.host.router.callAsRoot("vault.query@1", { ns: "probe", filter: {} });
    expect(touched.ok).toBe(true);
    const st2 = c.host.router.status();
    expect((st2.compartments as Record<string, { state: string }>)["vivim.vault"]?.state).toBe("active");
    expect(st2.dormant).toContain("pack.domain-email");
    expect(st2.dormant).toContain("provider.email.file");
  });

  test("THE LOOP step 1 — message.send@1 from root: REFUSED (EXTERNAL_MUTATION, consent required)", async () => {
    const first = await c.host.router.callAsRoot("message.send@1", {
      to: "river@omega.local", subject: "the merkle chain is intact", body: "first full body — Ω5 lives",
    });
    const consentId = await extractConsentId(first);
    // journal evidence: the gate journaled require-consent with the consent id + causation chain
    const gate = journalLines(c.vaultDir).find((l) => l.op === "message.send@1" && l.decision === "require-consent");
    expect(gate).toBeTruthy();
    expect(gate!.consentId).toBe(consentId);
    expect(gate!.principal).toBe("root");
    expect(typeof gate!.causationId).toBe("string");
  });

  test("THE LOOP step 2 — grant + retry: send lands in the vault (rev 1, from config passthrough)", async () => {
    const first = await c.host.router.callAsRoot("message.send@1", {
      to: "river@omega.local", subject: "the merkle chain is intact", body: "first full body — Ω5 lives",
    });
    const consentId = await extractConsentId(first);
    const grant = await c.host.router.callAsRoot("law.consent.grant@1", { consentId });
    expect(grant.ok).toBe(true);
    if (grant.ok) {
      const v = grant.value as { action: string; grant: { consentId: string; grantedAt: number }; cap: string };
      expect(v.action).toBe("grant");
      expect(v.grant.consentId).toBe(consentId);
      expect((v.cap as { scope: string }).scope).toContain(`law.consent:id=${consentId}`); // attenuated live cap
    }
    const retry = await c.host.router.callAsRoot("message.send@1", {
      to: "river@omega.local", subject: "the merkle chain is intact", body: "first full body — Ω5 lives",
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      const v = retry.value as SendResult;
      expect(v.messageId).toMatch(/^msg_[0-9a-f]+$/);
      expect(v.rev).toBe(1);
      expect(typeof v.sentAt).toBe("number");
      sent.push(v);
    }
    // the retry is journaled as allow, naming the ACTIVE consent
    const allow = journalLines(c.vaultDir).find((l) => l.op === "message.send@1" && l.decision === "allow");
    expect(allow).toBeTruthy();
    expect(String(allow!.reason)).toContain(consentId);
  });

  test("THE LOOP step 3 — second send: same principal+op already consented → ok DIRECTLY (no ceremony)", async () => {
    const r = await c.host.router.callAsRoot("message.send@1", {
      to: "delta@omega.local", subject: "second missive", body: "another searchable body",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as SendResult;
      expect(v.rev).toBe(1); // fresh (ns,id) → its own revision 1
      sent.push(v);
    }
    expect(sent.length).toBe(2);
  });

  test("THE LOOP step 4 — message.list@1: both messages, summaries only (no bodies), newest first", async () => {
    const r = await c.host.router.callAsRoot("message.list@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as ListResult;
      expect(v.messages).toHaveLength(2);
      expect(v.scanned).toBe(2);
      for (const m of v.messages) {
        expect("body" in m).toBe(false);          // bodies never leave the vault on list
        expect(m.from).toBe("demo@omega.local");  // provider config passthrough
        expect(m.folder).toBe("sent");
        expect(m.flags.seen).toBe(false);
        expect(m.flags.draft).toBe(false);        // draft→sent completed inside send
        expect(m.rev).toBe(1);
      }
      // newest first
      expect(v.messages[0].sentAt).toBeGreaterThanOrEqual(v.messages[1].sentAt);
      // deterministic thread derivation: (subject, to) grouping
      const byId = new Map(v.messages.map((m) => [m.id, m]));
      expect(byId.get(sent[0].messageId)!.threadId).toMatch(/^thread_[0-9a-f]{12}$/);
      expect(byId.get(sent[1].messageId)!.threadId).not.toBe(byId.get(sent[0].messageId)!.threadId);
    }
  });

  test("THE LOOP step 5 — message.search@1 {q: <subject word>}: FTS finds it (summary back)", async () => {
    const r = await c.host.router.callAsRoot("message.search@1", { q: "merkle" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { matches: SearchMatch[]; q: string };
      expect(v.q).toBe("merkle");
      expect(v.matches).toHaveLength(1);
      const m = v.matches[0];
      expect(m.id).toBe(sent[0].messageId);
      expect(m.subject).toBe("the merkle chain is intact");
      expect("body" in m).toBe(false);
      expect(m.rank).toBeLessThanOrEqual(0); // best match first (FTS5 rank: more negative = better)
    }
  });

  test("THE LOOP step 6 — message.read@1: full body + marks seen via a SEPARATE gated append (idempotent)", async () => {
    const r1 = await c.host.router.callAsRoot("message.read@1", { id: sent[0].messageId });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const v = r1.value as ReadResult;
      expect(v.message.body).toBe("first full body — Ω5 lives"); // full body leaves the vault only via read
      expect(v.message.flags.seen).toBe(true);
      expect(v.seenMarked).toBe(true);
      expect(v.rev).toBe(2); // the seen flag flip appended revision 2
    }
    // the flag append was gated as vault.append@1 MUTATION under the PROVIDER's principal —
    // every internal append (2 sends + this seen flip) is journaled under provider.email.file
    const internal = journalLines(c.vaultDir).filter((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "provider.email.file");
    expect(internal.length).toBeGreaterThanOrEqual(3);

    const r2 = await c.host.router.callAsRoot("message.read@1", { id: sent[0].messageId });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const v = r2.value as ReadResult;
      expect(v.seenMarked).toBe(false); // idempotent: no new append
      expect(v.rev).toBe(2);
    }
  });

  test("THE LOOP step 7 — message.move@1: consent again under the law's fail-closed default, then folder changes", async () => {
    // The pack declares message.move@1 as MUTATION (the gate IS consulted — unlike READ
    // ops), but vivim.law's v1 risk table has no message.* row: its fail-closed
    // defaultRisk (EXTERNAL_MUTATION) classifies the unknown op strictest, so the move
    // needs consent too. A message.* policy row (pure data) flips this to allow+journal.
    const first = await c.host.router.callAsRoot("message.move@1", { id: sent[1].messageId, folder: "archive" });
    const consentId = await extractConsentId(first);
    const grant = await c.host.router.callAsRoot("law.consent.grant@1", { consentId });
    expect(grant.ok).toBe(true);
    const retry = await c.host.router.callAsRoot("message.move@1", { id: sent[1].messageId, folder: "archive" });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      const v = retry.value as { messageId: string; rev: number; folder: string; changed: boolean };
      expect(v.messageId).toBe(sent[1].messageId);
      expect(v.rev).toBe(2); // the move appended revision 2 of the second message
      expect(v.folder).toBe("archive");
      expect(v.changed).toBe(true);
    }
    // query again (contract-level): the folder change is visible through the provider
    const list = await c.host.router.callAsRoot("message.list@1", {});
    expect(list.ok).toBe(true);
    if (list.ok) {
      const v = list.value as ListResult;
      const moved = v.messages.find((m) => m.id === sent[1].messageId);
      expect(moved?.folder).toBe("archive");
      expect(v.messages.find((m) => m.id === sent[0].messageId)?.folder).toBe("sent");
    }
    const filtered = await c.host.router.callAsRoot("message.list@1", { folder: "archive" });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) expect((filtered.value as ListResult).messages).toHaveLength(1);
    // and at the vault level: latest revisions are 2/2
    const q = await c.host.router.callAsRoot("vault.query@1", { ns: "email", filter: {} });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as Array<{ rev: number }>).every((row) => row.rev === 2)).toBe(true);
  });

  test("THE LOOP step 8 — vault Merkle verify after ALL ops: chain intact, 4 entries (2 sends + seen + move)", async () => {
    const r = await c.host.router.callAsRoot("vault.verify@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { ok: boolean; entries: number; headHash: string };
      expect(v.ok).toBe(true);
      expect(v.entries).toBe(4);
      expect(v.headHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("DATA SOVEREIGNTY — shut down, boot a SECOND composition on the SAME dataDir: the messages survive the provider replacement", async () => {
    // Composition 2 replaces the provider (different worker, different config.from,
    // pack dropped — none of that mattered to the data) and reuses the SAME vault dataDir.
    const dataDir = c.dataDir;
    await shutdownCase(c.host);
    const second = await bootEmail("sovereignty", (dataDir) => makeEmailSpec("email-sovereignty", dataDir, { withPack: false, from: "replacement@omega.local" }), { dataDir });

    // The pack is load-bearing for the GATE: this composition omits it, and the
    // router's risk map is built from registered manifests — the provider's
    // PROVIDER contributions carry no risk (risk is contract-kind data, declared by
    // the pack). Without the pack, message.send@1 is NOT consent-gated: it reaches
    // the provider and fails on payload validation → DEGRADED, not REFUSED. Risk
    // declarations are composition data; the Recipe author chooses the gate.
    const ungated = await second.host.router.callAsRoot("message.send@1", { subject: "no to field" });
    expect(ungated.ok).toBe(false);
    if (!ungated.ok) expect(ungated.error).toBe("DEGRADED"); // delivered (not refused pre-flight) → gate skipped, nothing appended

    const list = await second.host.router.callAsRoot("message.list@1", {});
    expect(list.ok).toBe(true);
    if (list.ok) {
      const v = list.value as ListResult;
      expect(v.messages).toHaveLength(2); // the provider was replaced; the data was not
      const moved = v.messages.find((m) => m.id === sent[1].messageId);
      expect(moved?.folder).toBe("archive"); // the move survived
      const kept = v.messages.find((m) => m.id === sent[0].messageId);
      expect(kept?.folder).toBe("sent");
      expect(kept?.flags.seen).toBe(true);   // even the SEEN flag survived (it is vault data, not provider state)
    }
    const read = await second.host.router.callAsRoot("message.read@1", { id: sent[0].messageId });
    expect(read.ok).toBe(true);
    if (read.ok) {
      const v = read.value as ReadResult;
      expect(v.message.body).toBe("first full body — Ω5 lives"); // body intact end-to-end
      expect(v.seenMarked).toBe(false);                            // seen persisted → no new append
      expect(v.rev).toBe(2);
    }
    const verify = await second.host.router.callAsRoot("vault.verify@1", {});
    expect(verify.ok).toBe(true);
    if (verify.ok) {
      const v = verify.value as { ok: boolean; entries: number };
      expect(v.ok).toBe(true);
      expect(v.entries).toBe(4); // no history rewrite across the replacement
    }
    await shutdownCase(second.host);
  });

  test("the SHIPPED compositions/email.json boots (spec copy with an overridden temp dataDir) and gates send", async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/email.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-email-test", `shipped-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    // spec copy: only the dataDir moves (tests never touch the shipped spec's ${TMP} default —
    // the shipped path stays deterministic for repeated CLI gate runs)
    const shipped = JSON.parse(JSON.stringify(spec));
    const vaultEntry = shipped.entries.find((e: { id: string }) => e.id === "vivim.vault");
    vaultEntry.config.dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(shipped, join(SPEC, ".."), vaultDir, rootKey);
    const host = await bootComposition(recipe, buildDir, vaultDir);
    hosts.push(host);
    try {
      const st = host.router.status();
      expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
      expect(st.dormant).toEqual(["pack.domain-email", "provider.email.file", "vivim.vault"]); // D-331
      // the shipped spec's provider config flows through: demo@omega.local
      const first = await host.router.callAsRoot("message.send@1", { to: "a@b.c", subject: "shipped spec", body: "hi" });
      const consentId = await extractConsentId(first);
      await host.router.callAsRoot("law.consent.grant@1", { consentId });
      const send = await host.router.callAsRoot("message.send@1", { to: "a@b.c", subject: "shipped spec", body: "hi" });
      expect(send.ok).toBe(true);
      const list = await host.router.callAsRoot("message.list@1", {});
      expect(list.ok).toBe(true);
      if (list.ok) expect((list.value as ListResult).messages[0].from).toBe("demo@omega.local");
    } finally {
      await shutdownCase(host);
    }
  });
});

describe("GATE-Ω10 receive loop — message.receive@1: the inbound simulator lands, reads, moves (compositions/email.json v0.2.0)", () => {
  // The receive op is the substrate of the "when Peter messages me" rule loop (D-222):
  // ingestion is vault-internal (READ — ungated at the op level; the internal append is
  // gated as vault.append@1 MUTATION under the provider principal, like every append),
  // the message lands in folder inbox, to = the configured self address, flags unseen.
  let c: Case;

  beforeAll(async () => {
    c = await bootEmail("receive", (dataDir) => makeEmailSpec("email-receive", dataDir));
  });

  test("receive from peter.miller: UNGATED (READ) → one append, folder inbox, to = self, flags unseen", async () => {
    const r = await c.host.router.callAsRoot("message.receive@1", {
      from: "peter.miller@omega.local", subject: "the quarterly report", body: "numbers are attached, see the sheet",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as ReceiveResult;
      expect(v.messageId).toMatch(/^msg_[0-9a-f]+$/);
      expect(v.rev).toBe(1);             // a fresh (ns,id) — its own revision 1
      expect(v.folder).toBe("inbox");    // the default inbound leg
      expect(typeof v.receivedAt).toBe("number");
    }
    // the internal append was gated + journaled under the PROVIDER principal (vault.append@1 MUTATION)
    const internal = journalLines(c.vaultDir).filter((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "provider.email.file");
    expect(internal.length).toBe(1);
    // bad payloads fail closed: DEGRADED (validation throws at the provider boundary)
    const bad = await c.host.router.callAsRoot("message.receive@1", { from: "not-an-email", subject: "s", body: "b" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("DEGRADED");
    const badFolder = await c.host.router.callAsRoot("message.receive@1", { from: "p@x.local", subject: "s", body: "b", folder: "spam" });
    expect(badFolder.ok).toBe(false);
    if (!badFolder.ok) expect(badFolder.error).toBe("DEGRADED");
  });

  test("list shows it in the inbox with the folder filter; it is the only inbox message", async () => {
    // one outbound message first, so the folder filter is load-bearing (sent vs inbox)
    const first = await c.host.router.callAsRoot("message.send@1", { to: "sarah.chen@omega.local", subject: "outbound note", body: "hi" });
    const consentId = await extractConsentId(first);
    await c.host.router.callAsRoot("law.consent.grant@1", { consentId });
    const sent = await c.host.router.callAsRoot("message.send@1", { to: "sarah.chen@omega.local", subject: "outbound note", body: "hi" });
    expect(sent.ok).toBe(true);

    const inbox = await c.host.router.callAsRoot("message.list@1", { folder: "inbox" });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      const v = inbox.value as ListResult;
      expect(v.messages).toHaveLength(1);
      const m = v.messages[0];
      expect(m.from).toBe("peter.miller@omega.local"); // inbound leg
      expect(m.to).toBe("demo@omega.local");           // the configured self address
      expect(m.folder).toBe("inbox");
      expect(m.flags.seen).toBe(false);                // unread incoming
      expect(m.subject).toBe("the quarterly report");
    }
    const sentFolder = await c.host.router.callAsRoot("message.list@1", { folder: "sent" });
    expect(sentFolder.ok).toBe(true);
    if (sentFolder.ok) {
      const v = sentFolder.value as ListResult;
      expect(v.messages).toHaveLength(1);
      expect(v.messages[0].folder).toBe("sent");
    }
    // search finds the received body too (FTS over the ingested vault object)
    const found = await c.host.router.callAsRoot("message.search@1", { q: "sheet" });
    expect(found.ok).toBe(true);
    if (found.ok) expect((found.value as { matches: SearchMatch[] }).matches).toHaveLength(1);
  });

  test("read marks the received message seen (a separate gated append); move works on it", async () => {
    const q = await c.host.router.callAsRoot("vault.query@1", { ns: "email", filter: {} });
    let receivedId = "";
    if (q.ok) {
      for (const row of q.value as Array<{ id: string }>) {
        const g = await c.host.router.callAsRoot("vault.get@1", { ns: "email", id: row.id });
        if (g.ok) {
          const data = (g.value as { data: { from: string; folder: string } }).data;
          if (data.from === "peter.miller@omega.local" && data.folder === "inbox") { receivedId = row.id; break; }
        }
      }
    }
    expect(receivedId).toMatch(/^msg_[0-9a-f]+$/);

    const read = await c.host.router.callAsRoot("message.read@1", { id: receivedId });
    expect(read.ok).toBe(true);
    if (read.ok) {
      const v = read.value as ReadResult;
      expect(v.message.flags.seen).toBe(true);
      expect(v.seenMarked).toBe(true);
      expect(v.rev).toBe(2); // the seen flip appended revision 2
    }

    // move: consent under the law's fail-closed default (MUTATION-class), then archive it
    const first = await c.host.router.callAsRoot("message.move@1", { id: receivedId, folder: "archive" });
    const consentId = await extractConsentId(first);
    await c.host.router.callAsRoot("law.consent.grant@1", { consentId });
    const moved = await c.host.router.callAsRoot("message.move@1", { id: receivedId, folder: "archive" });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const v = moved.value as { messageId: string; rev: number; folder: string; changed: boolean };
      expect(v.messageId).toBe(receivedId);
      expect(v.folder).toBe("archive");
      expect(v.changed).toBe(true);
    }
    const inbox = await c.host.router.callAsRoot("message.list@1", { folder: "inbox" });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) expect((inbox.value as ListResult).messages).toHaveLength(0); // the inbox drained
  });
});
