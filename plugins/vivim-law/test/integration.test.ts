// GATE-Ω1 evidence — the real law plugin boots as phase-0 spine of a 3-plugin
// composition and the whole gate loop is exercised end-to-end through the µhost:
// read-not-gated, consent-refusal + journal, grant + retry, deny table, shadow
// divergence, token revocation, registry (live + journal replay at boot).
// Patterns copied from host/test/runtime.test.ts (compileComposition → bootComposition).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import { consentIdFor } from "../src/consent.ts";
import { isSubset } from "../src/tokens.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const SPEC = join(import.meta.dir, "../../../compositions/law.json");

type Entry = Record<string, unknown>;
function readJournal(path: string): Entry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Entry);
}
function loadSpec(journalPath: string): object {
  const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as { entries: Array<{ id: string; config?: object }> };
  const law = spec.entries.find((e) => e.id === "vivim.law")!;
  law.config = { journalPath };
  return spec;
}

describe("GATE-Ω1 — composition [vivim.law, omega.risky, omega.echo] boots and gates", () => {
  let vault: string;
  let journalFile: string;
  let host: BootedHost;
  let consentId = "";

  beforeAll(async () => {
    vault = omegaTmp("omega-law", `live-${Date.now()}-${process.pid}`);
    rmSync(vault, { recursive: true, force: true });
    mkdirSync(vault, { recursive: true });
    journalFile = join(vault, "law-journal.jsonl");
    const { rootKey } = ensureVault(vault);
    const { recipe, buildDir } = compileComposition(loadSpec(journalFile), join(SPEC, ".."), vault, rootKey);
    host = await bootComposition(recipe, buildDir, vault);
  });
  afterAll(async () => { await host.shutdown(); });

  const call = (op: string, payload?: unknown) => host.router.callAsRoot(op, payload ?? {});

  test("READ-class op from root is never gated (law.check not involved)", async () => {
    const r = await call("risky.read@1", { probe: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { read: boolean; payload: { probe: number } };
      expect(v.read).toBe(true);
      expect(v.payload.probe).toBe(1);
    }
    expect(readJournal(journalFile).filter((e) => e["op"] === "risky.read@1")).toHaveLength(0);
  });

  test("EXTERNAL_MUTATION op from root → REFUSED with `consent required: <consentId>` (stable id)", async () => {
    const r = await call("risky.op@1", { value: 42 });
    expect(r.ok).toBe(false);
    const detail = (!r.ok && r.detail) || "";
    expect(r.ok === false && r.error).toBe("REFUSED");
    expect(detail).toContain("consent required: consent_");
    consentId = detail.slice("consent required: ".length);
    expect(consentId).toBe(consentIdFor("root", "risky.op@1")); // refusal names the exact consent
  });

  test("journal records the require-consent decision with the causationId (both law + router entries)", () => {
    const entries = readJournal(journalFile);
    const routerEntry = entries.find((e) => e["op"] === "risky.op@1" && e["decision"] === "require-consent");
    expect(routerEntry).toBeDefined();
    expect(String(routerEntry?.["causationId"])).toMatch(/^c_\d+$/);
    expect(routerEntry?.["consentId"]).toBe(consentId);
    const lawEntry = entries.find((e) => e["op"] === "law.check" && e["targetOp"] === "risky.op@1" && e["decision"] === "require-consent");
    expect(lawEntry).toBeDefined();
    expect(lawEntry?.["causationId"]).toBe(routerEntry?.["causationId"]); // same causation chain
    expect(lawEntry?.["source"]).toBe("vivim.law");
  });

  test("grant via law.consent.grant@1 → retry risky.op@1 → ok (mutated); live attenuated cap returned", async () => {
    const g = await call("law.consent.grant@1", { consentId });
    expect(g.ok).toBe(true);
    if (g.ok) {
      const v = g.value as { action: string; grant: { consentId: string; grantedAt: number }; generation: number; cap: { scope: string; generation: number } };
      expect(v.action).toBe("grant");
      expect(v.grant.consentId).toBe(consentId);
      expect(v.grant.grantedAt).toBeGreaterThan(0);
      expect(v.cap.scope).toBe(`law.consent:id=${consentId}`);
      expect(isSubset(v.cap.scope, "law.consent")).toBe(true); // the algebra, live
      expect(v.generation).toBeGreaterThanOrEqual(2);
    }
    const r = await call("risky.op@1", { value: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { mutated: { value: number } }).mutated.value).toBe(42);
    const allow = readJournal(journalFile).find((e) => e["op"] === "risky.op@1" && e["decision"] === "allow");
    expect(allow).toBeDefined();
    expect(String(allow?.["reason"])).toContain(consentId);
  });

  test("deny rule: direct law.check with the denied principal → decision deny (sticky, journaled)", async () => {
    const d = await call("law.check@1", { principal: "omega.attacker", op: "risky.op@1", payload: {}, causationId: "test-deny-1" });
    expect(d.ok).toBe(true);
    if (d.ok) {
      const v = d.value as { decision: string; principal: string; reason: string };
      expect(v.decision).toBe("deny");
      expect(v.principal).toBe("omega.attacker");
      expect(v.reason).toContain("deny-listed");
    }
    expect(readJournal(journalFile).find((e) => e["op"] === "law.check" && e["decision"] === "deny")).toBeDefined();
  });

  test("shadow amendment: deny-revoke consent, register shadow, risky.op gets require-consent, divergence report lists it", async () => {
    // explicit deny-revoke of the live consent (the revocation path of law.consent.grant@1)
    const rv = await call("law.consent.grant@1", { consentId, action: "revoke" });
    expect(rv.ok).toBe(true);
    if (rv.ok) {
      const v = rv.value as { action: string; revoked: boolean; active: number };
      expect(v.action).toBe("revoke");
      expect(v.revoked).toBe(true);
      expect(v.active).toBe(0);
    }

    // register the shadow policy — never authoritative, observed only
    const am = await call("law.amendment@1", { action: "register-shadow", policy: { denyExternalMutations: true } });
    expect(am.ok).toBe(true);
    if (am.ok) {
      const v = am.value as { shadow: { registered: boolean; policyId?: string }; report: { count: number } };
      expect(v.shadow.registered).toBe(true);
      expect(v.report.count).toBe(0); // fresh ledger at registration
    }

    // primary: no active consent → require-consent (the router turns it into REFUSED);
    // shadow: denyExternalMutations → deny → DIVERGENCE recorded + journaled
    const r = await call("risky.op@1", { value: 7 });
    expect(r.ok).toBe(false);
    const detail = (!r.ok && r.detail) || "";
    expect(detail).toBe(`consent required: ${consentId}`);

    const rep = await call("law.amendment@1", { action: "report" });
    expect(rep.ok).toBe(true);
    if (rep.ok) {
      const v = rep.value as { report: { count: number; divergences: Array<{ op: string; principal: string; primary: { decision: string }; shadow: { decision: string } }>; swap: string } };
      expect(v.report.count).toBeGreaterThanOrEqual(1);
      const div = v.report.divergences[0]!;
      expect(div.op).toBe("risky.op@1");
      expect(div.principal).toBe("root");
      expect(div.primary.decision).toBe("require-consent");
      expect(div.shadow.decision).toBe("deny");
      expect(v.report.swap).toContain("recipe re-compile");
    }

    // the divergence is journaled on the law.check decision entry (shadow.diverged: true)
    const divEntry = readJournal(journalFile).find((e) => e["op"] === "law.check" && e["targetOp"] === "risky.op@1" && (e["shadow"] as { diverged?: boolean } | undefined)?.diverged === true);
    expect(divEntry).toBeDefined();
  });

  test("law.tokens.revoke@1 delegates to the host: scoped flip (D-384), generation flat, journal entry; echo still serves root", async () => {
    const before = host.router.status().generation;
    const tr = await call("law.tokens.revoke@1", { pluginId: "omega.echo" });
    expect(tr.ok).toBe(true);
    if (tr.ok) {
      const v = tr.value as { revoked: boolean; pluginId: string; hostGeneration?: number; affectedTokens?: number };
      expect(v.revoked).toBe(true);
      expect(v.pluginId).toBe("omega.echo");
      // D-384: scoped revoke flips matching records only — the generation stays FLAT
      // (pre-D-384 the unconditional bump here was the audit's §2 bug: "quarantine one
      // plugin" silently revoked every token in the composition)
      expect(v.hostGeneration).toBe(before);
      // echo granted no outbound capabilities → scoped count is 0
      expect(v.affectedTokens).toBe(0);
    }
    expect(host.router.status().generation).toBe(before); // scoped revoke: generation flat
    const e = await call("echo.ping@1", { still: "alive" });
    expect(e.ok).toBe(true); // root needs no token — echo unaffected for root callers
    const entries = readJournal(journalFile);
    expect(entries.find((x) => x["op"] === "law.tokens.revoke" && x["pluginId"] === "omega.echo")).toBeDefined();
    expect(entries.find((x) => x["op"] === "host.tokens.revoke" && x["scope"] === "omega.echo")).toBeDefined();
  });

  test("law.registry@1 returns active composition ids, live event count, consent count, generation", async () => {
    const reg = await call("law.registry@1");
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      const v = reg.value as { plugins: string[]; events: number; consents: number; generation: number; replayed: number; observed: number; states: Record<string, { state: string }> };
      expect(v.plugins).toContain("vivim.law");
      expect(v.plugins).toContain("omega.echo"); // seen via the revoke (payload + host journal scope)
      expect(v.replayed).toBe(0);                // fresh vault: nothing existed at init
      expect(v.events).toBeGreaterThanOrEqual(10); // live journal re-read (both routers' and law's entries)
      expect(v.observed).toBeGreaterThanOrEqual(8);  // in-process law op events
      expect(v.consents).toBe(0);                // the single grant was deny-revoked earlier
      expect(v.generation).toBeGreaterThanOrEqual(2);
      expect(v.states["omega.echo"]?.state).toBe("active");
    }
    // live consent counting: grant one for a different principal, the count follows.
    // D-384: the scoped revoke above no longer revokes the law's own journal token, so
    // the grant's journal append now LANDS (pre-D-384 the global bump killed it and the
    // journal stayed flat — the fix restores audit completeness for post-revoke grants).
    const linesBefore = readJournal(journalFile).length;
    const cid2 = consentIdFor("omega.risky", "risky.op@1");
    const g2 = await call("law.consent.grant@1", { consentId: cid2 });
    expect(g2.ok).toBe(true);
    const reg2 = await call("law.registry@1");
    expect(reg2.ok).toBe(true);
    if (reg2.ok) expect((reg2.value as { consents: number }).consents).toBe(1);
    expect(readJournal(journalFile).length).toBeGreaterThan(linesBefore);
  });

  test("D-384: cross-principal consent forgery refuses — a compartment may only grant its own consents", async () => {
    // register an emulated caller holding the real law.consent.grant capability (the
    // router validates the token host-side; the op routes to the REAL vivim.law here)
    const router = host.router as any;
    const sent: any[] = [];
    let cb: ((m: any) => void) | null = null;
    const fake = {
      pluginId: "omega.forger", state: "active",
      stats: { delivered: 0, calls: 0, errors: 0, crashes: 0, bootedAt: Date.now() },
      post: (m: any) => sent.push(m),
      onMessage: (f: (m: any) => void) => { cb = f; },
      onCrash: () => {},
      terminate: async () => {},
    };
    const entry = { id: "omega.forger", version: "0.0.1", source: ".", manifestPath: ".", manifestHash: "sha256:x", contentHash: "sha256:x", grant: { capabilities: ["port:law.consent.grant@1"], contracts: [] }, bootPhase: 1 };
    router.register(entry, host.manifests.get("omega.echo")!, fake, {});
    const toks = router.mintTokensFor(entry);
    for (const [cap, tok] of Object.entries(toks)) router.tokens.set(tok, { token: tok, pluginId: "omega.forger", cap, gen: router.generation });
    const tok = toks["port:law.consent.grant@1"];
    const ask = (callId: string, payload: unknown) => cb!({ type: "call", callId, capabilityToken: tok, op: "law.consent.grant@1", payload, deadlineMs: 500 });
    const replyFor = (callId: string) => sent.find((m) => m.type === "result" && m.callId === callId)?.result;
    const settle = () => new Promise((r) => setTimeout(r, 150));

    // a compartment naming ANOTHER principal → refused before any state change
    const foreignId = consentIdFor("vivim.director", "message.send@1");
    ask("f1", { consentId: foreignId, principal: "vivim.director" }); await settle();
    const f1 = replyFor("f1");
    expect(f1?.ok).toBe(false);
    expect(f1?.error).toBe("DEGRADED");
    expect(String(f1?.detail)).toContain("cross-principal refusal");

    // self-grant: the caller's own principal is the one legitimate non-root shape
    const selfId = consentIdFor("omega.forger", "risky.op@1");
    ask("f2", { consentId: selfId, principal: "omega.forger" }); await settle();
    expect(replyFor("f2")?.ok).toBe(true);

    // root — the surfaces' human proxy — still grants for any principal (the console ceremony)
    const g = await host.router.callAsRoot("law.consent.grant@1", { consentId: foreignId, principal: "vivim.director" });
    expect(g.ok).toBe(true);
  });
});

describe("GATE-Ω1 — registry journal replay at boot (state survives reboots)", () => {
  let vault: string;
  let host2: BootedHost;

  beforeAll(async () => {
    vault = omegaTmp("omega-law", `replay-${Date.now()}-${process.pid}`);
    rmSync(vault, { recursive: true, force: true });
    mkdirSync(vault, { recursive: true });
    // seed a journal as a previous run would have left it (line-delimited JSON)
    const seedFile = join(vault, "seed-journal.jsonl");
    const seed: Entry[] = [
      { ts: 1730000000000, principal: "root", op: "risky.op@1", decision: "require-consent", reason: "external mutation: consent required", consentId: "consent_dead0000beef0000", causationId: "c_1" },
      { ts: 1730000000001, principal: "root", op: "risky.op@1", decision: "allow", reason: "external mutation: consent required — consent consent_dead0000beef0000 active (gen 1)", consentId: "consent_dead0000beef0000", causationId: "c_2" },
      { ts: 1730000000002, principal: "omega.risky", op: "vault.append@1", decision: "allow", reason: "mutation-class: allowed and journaled", causationId: "c_3" },
      { ts: 1730000000003, principal: "vivim.law", op: "host.tokens.revoke", decision: "allow", reason: "generation bumped to 2", affected: 1, scope: "omega.echo" },
    ];
    writeFileSync(seedFile, seed.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const { rootKey } = ensureVault(vault);
    const { recipe, buildDir } = compileComposition(loadSpec(seedFile), join(SPEC, ".."), vault, rootKey);
    host2 = await bootComposition(recipe, buildDir, vault);
  });
  afterAll(async () => { await host2.shutdown(); });

  test("init replay rebuilds known history: events/replayed counts and composition ids seen", async () => {
    const r = await host2.router.callAsRoot("law.registry@1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { plugins: string[]; events: number; replayed: number; consents: number; generation: number };
      expect(v.replayed).toBe(4); // the four seeded lines
      expect(v.events).toBe(4);   // journal-derived history (no live writes to the seed file)
      expect(v.plugins).toEqual(["omega.echo", "omega.risky", "vivim.law"]); // ids seen in the replayed journal + self
      expect(v.consents).toBe(0); // consents do not survive reboots — only journal evidence does
      expect(v.generation).toBeGreaterThanOrEqual(1);
    }
  });

  test("replayed policy state still gates: risky.op requires fresh consent on the new boot", async () => {
    const r = await host2.router.callAsRoot("risky.op@1", { value: 9 });
    expect(r.ok).toBe(false);
    const detail = (!r.ok && r.detail) || "";
    expect(detail).toContain("consent required: consent_");
    expect(detail.slice("consent required: ".length)).toBe(consentIdFor("root", "risky.op@1"));
  });
});

describe("D-310 — forbidden-action overlay through the real gate", () => {
  let vault: string;
  let host3: BootedHost;

  beforeAll(async () => {
    vault = omegaTmp("omega-law", `forbidden-${Date.now()}-${process.pid}`);
    rmSync(vault, { recursive: true, force: true });
    mkdirSync(vault, { recursive: true });
    const { rootKey } = ensureVault(vault);
    const { recipe, buildDir } = compileComposition(loadSpec(join(vault, "law-journal.jsonl")), join(SPEC, ".."), vault, rootKey);
    host3 = await bootComposition(recipe, buildDir, vault);
  });
  afterAll(async () => { await host3.shutdown(); });

  const call = (op: string, payload?: unknown) => host3.router.callAsRoot(op, payload ?? {});

  test("set → law.check denies before policy; clear restores the baseline decision", async () => {
    const principal = "agent:forbidden-probe";
    const op = "risky.op@1";
    // baseline first (self-calibrating: whatever the policy says without the overlay)
    const before = await call("law.check@1", { principal, op });
    expect(before.ok).toBe(true);
    const baseline = before.ok ? (before.value as { decision: string }).decision : "unknown";

    const set = await call("law.forbidden.set@1", { principal, ops: [op] });
    expect(set.ok).toBe(true);
    if (set.ok) expect((set.value as { count: number }).count).toBe(1);

    const denied = await call("law.check@1", { principal, op });
    expect(denied.ok).toBe(true);
    if (denied.ok) {
      const d = denied.value as { decision: string; reason: string };
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain("forbidden action");
    }
    // sibling op for the same principal is unaffected
    const sibling = await call("law.check@1", { principal, op: "risky.read@1" });
    expect(sibling.ok).toBe(true);

    // malformed set payloads fail closed (DEGRADED), table untouched
    const bad = await call("law.forbidden.set@1", { principal, ops: [""] });
    expect(bad.ok).toBe(false);
    const stillDenied = await call("law.check@1", { principal, op });
    expect(stillDenied.ok && (stillDenied.value as { decision: string }).decision).toBe("deny");

    // clear restores the exact baseline decision
    const cleared = await call("law.forbidden.set@1", { principal, ops: [] });
    expect(cleared.ok).toBe(true);
    const after = await call("law.check@1", { principal, op });
    expect(after.ok && (after.value as { decision: string }).decision).toBe(baseline);
  });
});

// ---- D-353 — the human principal (user:<id>) through the REAL gate ----------
// Zero new tables: the forbidden overlay, the consent table, and the policy
// walk are all keyed per-principal already. user:<id> only needs acceptance of
// the prefix — and the describe read making the state inspectable, the same
// way agent.describe@1 makes an agent's state inspectable (D-309 discipline).
describe("D-353 — user:<id> is a first-class principal end-to-end (real law.json boot)", () => {
  let vault: string;
  let host: BootedHost;

  beforeAll(async () => {
    vault = omegaTmp("omega-law", `d336-${Date.now()}-${process.pid}`);
    rmSync(vault, { recursive: true, force: true });
    mkdirSync(vault, { recursive: true });
    const { rootKey } = ensureVault(vault);
    const { recipe, buildDir } = compileComposition(loadSpec(join(vault, "law-journal.jsonl")), join(SPEC, ".."), vault, rootKey);
    host = await bootComposition(recipe, buildDir, vault);
  });
  afterAll(async () => { await host.shutdown(); });

  const call = (op: string, payload?: unknown) => host.router.callAsRoot(op, payload ?? {});

  test("user:ada's require-consent names HER stable id; grant-with-narrowing → allow; describe attributes the consent to her", async () => {
    const refused = await call("law.check@1", { principal: "user:ada", op: "risky.op@1" });
    expect(refused.ok).toBe(true);
    let decision = (refused.value as { decision: string; consentId?: string });
    expect(decision.decision).toBe("require-consent");
    expect(decision.consentId).toBe(consentIdFor("user:ada", "risky.op@1")); // the user's OWN consent id — not root's, not shared

    const grant = await call("law.consent.grant@1", { consentId: decision.consentId, principal: "user:ada", scope: "risky.op@1" });
    expect(grant.ok).toBe(true);

    const allowed = await call("law.check@1", { principal: "user:ada", op: "risky.op@1" });
    decision = (allowed.value as { decision: string; reason?: string });
    expect(decision.decision).toBe("allow");
    expect(String(decision.reason)).toContain("consent");

    const described = await call("law.describe@1", { principal: "user:ada" });
    expect(described.ok).toBe(true);
    if (described.ok) {
      const d = described.value as { principal: string; kind: string; consents: Array<{ consentId: string; active: boolean }>; forbidden: { ops: string[]; persisted: boolean } };
      expect(d.principal).toBe("user:ada");
      expect(d.kind).toBe("user");
      expect(d.consents).toHaveLength(1); // narrowed: ada's grant, and nothing else
      expect(d.consents[0]!.consentId).toBe(consentIdFor("user:ada", "risky.op@1"));
      expect(d.consents[0]!.active).toBe(true);
      expect(d.forbidden.ops).toEqual([]);
      expect(d.forbidden.persisted).toBe(false); // law.json is memory-only by composition
    }
  });

  test("per-user forbidden scoping: user:ada is forbidden an op, sibling user:bob is unaffected (zero new tables)", async () => {
    const set = await call("law.forbidden.set@1", { principal: "user:ada", ops: ["vault.append@1"] });
    expect(set.ok).toBe(true);

    const adaDenied = await call("law.check@1", { principal: "user:ada", op: "vault.append@1" });
    expect((adaDenied.value as { decision: string }).decision).toBe("deny"); // the overlay precedes policy eval
    const bobNotDenied = await call("law.check@1", { principal: "user:bob", op: "vault.append@1" });
    expect((bobNotDenied.value as { decision: string }).decision).toBe("allow"); // vault.append is MUTATION → allow + journal

    const adaDesc = await call("law.describe@1", { principal: "user:ada" });
    const bobDesc = await call("law.describe@1", { principal: "user:bob" });
    expect(((adaDesc.value as { forbidden: { ops: string[] } }).forbidden).ops).toEqual(["vault.append@1"]);
    expect(((bobDesc.value as { forbidden: { ops: string[] } }).forbidden).ops).toEqual([]);
    expect(((bobDesc.value as { consents: unknown[] }).consents)).toEqual([]); // sibling isolation in the describe read too
  });

  test("all principal kinds classify through the real gate (agent-channel regression included)", async () => {
    for (const [principal, kind] of [
      ["root", "host"],
      ["µhost-gate", "host"],
      ["agent:worker-7", "agent"],
      ["user:ada", "user"],
      ["vivim.director", "composition"],
      ["omega.risky", "composition"],
      ["some-future-shape", "composition"], // unknown stays LEGAL — classification is never rejection
    ] as const) {
      const d = await call("law.describe@1", { principal });
      expect(d.ok).toBe(true);
      if (d.ok) expect((d.value as { kind: string }).kind).toBe(kind);
    }
  });

  test("malformed payload → DEGRADED (fail-closed, never a fabricated describe)", async () => {
    const r = await call("law.describe@1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DEGRADED");
  });
});
