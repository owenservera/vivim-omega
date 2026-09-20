// surfaces/web — test/web.test.ts (Ω13 gate evidence)
// Boots the REAL console composition (law+vault+mind+nlcl+director+pack+provider+llm) as the
// live service on an ephemeral port, then drives the full loop over HTTP + socket.io:
// snapshot replication → interpret → execute (consent ceremony) → consent → retry → rules fire.
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { io, type Socket } from "socket.io-client";
import { startConsoleService, type RunningService } from "../src/server.ts";
import type { Interpretation, WorldModel } from "@vivim/omega-nlcl-pure";
import { consentIdFor } from "@vivim/omega-contracts"; // stable (principal, op) derivation — the single contracts definition
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const ROOT = join(import.meta.dir, "../../..");
const COMPOSITION = join(ROOT, "compositions/console.json");

interface ExecOutcomeWire {
  interpretation: Interpretation;
  surface?: { kind: string; payload: Record<string, unknown> };
  executed: boolean;
  op?: string;
  result?: unknown;
  refused?: { op: string; principal: string; consentId?: string; detail: string };
  ruleActionConsent?: { principal: string; op: string; consentId?: string; decision: string };
  /** D-411 (S1) — the canonical-intent seam on the wire. */
  intentRef?: string;
  payloadHash?: string;
  resolution?: "AMBIGUOUS" | "REFUSED" | "EXECUTED";
  resolutionRecorded?: boolean;
  worldV: number;
}

let service: RunningService;
let base: string;
const vaultDirs: string[] = [];

function uniqueVault(): string {
  const d = omegaTmp("omega-web-test", `${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(d, { recursive: true });
  vaultDirs.push(d);
  return d;
}

beforeAll(async () => {
  const vaultDir = uniqueVault();
  // house pattern (email integration): a spec COPY with a unique vault dataDir, so the
  // test never touches the repo's dev-vault (the live service's persistent home)
  const spec = JSON.parse(await Bun.file(COMPOSITION).text()) as { entries: Array<{ id: string; source: string; config?: Record<string, unknown> }> };
  for (const e of spec.entries) {
    e.source = join(dirname(COMPOSITION), e.source); // absolutize: the copy lives in a temp dir
    // Absolute (not ${TMP}) on purpose: this is a GENERATED spec copy whose
    // vault home is already unique per run — absolute is the operator-override
    // spelling (verbatim passthrough), and it keeps the copy hermetic.
    if (e.id === "vivim.vault" && e.config) e.config["dataDir"] = `${vaultDir}/vault-data`;
  }
  const specPath = `${vaultDir}/console-test.json`;
  await Bun.write(specPath, JSON.stringify(spec));
  service = await startConsoleService({
    port: 0, // ephemeral — we read back the assigned port
    vaultDir,
    composition: specPath,
    defaultComposition: specPath,
  });
  base = `http://127.0.0.1:${service.port}`;
});

afterAll(async () => {
  await service.close();
  for (const d of vaultDirs) rmSync(d, { recursive: true, force: true });
}, 30000);

describe("Ω13 · boot + seeding + snapshot replication", () => {
  test("health: all 8 entries reported, 20+ routed ops, nlcl pinned (D-331 dormant-aware)", async () => {
    const r = await (await fetch(`${base}/api/health`)).json() as { ok: boolean; plugins: Record<string, { state: string }>; routedOps: string[]; nlclVersion: string };
    expect(r.ok).toBe(true);
    // Seeding + snapshot replication wake law/vault/provider/mind; engines
    // with no routed calls yet read dormant (never started — not degraded);
    // the declarations-only pack is dormant by construction (nothing routes
    // to it, ever). No entry may read degraded/unknown/stopped here.
    for (const [id, c] of Object.entries(r.plugins)) {
      expect(["active", "dormant"]).toContain(c.state);
      expect(id).toBeTruthy();
    }
    expect(Object.keys(r.plugins).length).toBe(9); // D-411: vivim.intent joined the console composition
    expect(r.plugins["vivim.law"]?.state).toBe("active"); // bootPhase 0 gates from the first tick
    expect(r.plugins["pack.domain-email"]?.state).toBe("dormant"); // declarations only: unrouted by design
    // Seeding + snapshot replication wake law/vault/provider/mind; untouched
    // engines (nlcl serves parses from nlcl-pure locally, director ticks on
    // demand, llm is opt-in) honestly read dormant — touch→active is proven
    // at the host layer (host/test/lazy.test.ts), not re-proven per surface.
    for (const id of ["vivim.vault", "provider.email.file", "vivim.mind"]) {
      expect(r.plugins[id]?.state).toBe("active");
    }
    expect(r.routedOps.length).toBeGreaterThanOrEqual(20);
    expect(r.routedOps).toContain("nlcl.interpret@1");
    expect(r.nlclVersion).toBeTruthy();
  });

  test("snapshot: seeded world with contacts derived from message history", async () => {
    const r = await (await fetch(`${base}/api/snapshot`)).json() as { world: WorldModel };
    const w = r.world;
    expect(w.kernel.composition).toBe("console");
    expect(w.ops.length).toBe(9);
    const contacts = w.entities.filter((e) => e.type === "contact");
    const messages = w.entities.filter((e) => e.type === "message");
    expect(messages.length).toBe(4); // the seed batch
    expect(contacts.map((c) => c.label).sort()).toEqual(["Maria Garcia", "Peter Miller", "Peter Zhang", "Sarah Chen"]);
    expect(w.context.latestMessageId).toBeTruthy();
    // ops catalog carries the law's surface: send is EXTERNAL_MUTATION (consent preview)
    expect(w.ops.find((o) => o.op === "message.send@1")?.risk).toBe("EXTERNAL_MUTATION");
  });
});

describe("Ω13 · interpret + execute: the owner's example end-to-end", () => {
  test("POST /api/interpret 'send this to Peter' → grounded, ambiguous (two Peters), canonical form", async () => {
    const r = await (await fetch(`${base}/api/interpret`, { method: "POST", body: JSON.stringify({ text: "send this to Peter" }) })).json() as { interpretation: Interpretation };
    const interp = r.interpretation;
    expect(interp.ir?.intent).toBe("message.send@1");
    expect(interp.ir?.payload["to"]).toBe("peter.miller@omega.local");
    expect(interp.status).toBe("ambiguous");
    expect(interp.canonical).toMatch(/^\/send @msg_/);
    expect(interp.suggestions.filter((s) => s.kind === "disambiguation").length).toBe(2);
    expect(interp.effects[0]?.gate).toBe("consent");
  });

  test("execute → REFUSED with the consentId (the ✓ card), then consent → retry executes", async () => {
    // 1. first execute: the law gate refuses root's message.send
    const r1 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'hello from the console test' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r1.outcome.executed).toBe(false);
    expect(r1.outcome.refused?.consentId).toMatch(/^consent_[0-9a-f]+$/);
    expect(r1.outcome.refused?.op).toBe("message.send@1");
    // D-411 (S1): the refused command cites its persisted canonical intent and
    // resolves REFUSED with the row recorded
    expect(r1.outcome.intentRef).toMatch(/^intent:[0-9a-f]{16,64}$/);
    expect(r1.outcome.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r1.outcome.resolution).toBe("REFUSED");
    expect(r1.outcome.resolutionRecorded).toBe(true);
    // 2. the confirm card grants it
    const g = await (await fetch(`${base}/api/consent`, { method: "POST", body: JSON.stringify({ consentId: r1.outcome.refused!.consentId }) })).json() as { ok: boolean; granted: boolean };
    expect(g.granted).toBe(true);
    // 3. retry: same NL, now clean — a NEW intent (each command is its own
    // submission), identical payloadHash (F7 byte-identical canonical)
    const r2 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'hello from the console test' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r2.outcome.executed).toBe(true);
    expect(r2.outcome.result).toMatchObject({ messageId: expect.stringMatching(/^msg_/) });
    expect(r2.outcome.resolution).toBe("EXECUTED");
    expect(r2.outcome.resolutionRecorded).toBe(true);
    expect(r2.outcome.intentRef).toMatch(/^intent:[0-9a-f]{16,64}$/);
    expect(r2.outcome.intentRef).not.toBe(r1.outcome.intentRef);
    expect(r2.outcome.payloadHash).toBe(r1.outcome.payloadHash);
  });

  test("D-384: /api/consent ignores a client-supplied principal (no cross-principal forgery)", async () => {
    const socket: Socket = io(`http://127.0.0.1:${service.port}/?XTransformPort=${service.port}`, {
      path: "/", transports: ["websocket", "polling"], forceNew: true, reconnection: false, timeout: 5000,
    });
    const journalEvents: Array<Record<string, unknown>> = [];
    socket.on("journal", (p: { events?: Array<Record<string, unknown>> }) => { for (const e of p.events ?? []) journalEvents.push(e); });
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    // the old surface forwarded body.principal into law.consent.grant@1 — an
    // unauthenticated client could forge a grant naming ANY principal. The grant
    // must now go through with the principal field IGNORED (id-only ceremony).
    const id = consentIdFor("omega.attacker", "message.send@1");
    const g = await (await fetch(`${base}/api/consent`, { method: "POST", body: JSON.stringify({ consentId: id, principal: "omega.attacker" }) })).json() as { ok: boolean; granted: boolean };
    expect(g.granted).toBe(true);
    // the journal is the audit channel: the grant entry carries no client-chosen
    // principal — only the root caller attribution (a forged grant would carry
    // principal:"omega.attacker" as the narrowed owner).
    await new Promise((r) => setTimeout(r, 1200));
    const grant = [...journalEvents].reverse().find((e) => e["op"] === "law.consent.grant" && e["action"] === "grant" && e["consentId"] === id);
    expect(grant).toBeTruthy();
    expect(grant!["principal"]).toBeUndefined();
    expect(grant!["caller"]).toBe("root");
    socket.disconnect();
  });

  test("ambiguous Peter: execute with the primary pick works; disambiguation picks are data", async () => {
    const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send this to Peter about the follow-up" }) })).json() as { outcome: ExecOutcomeWire };
    // consent was granted in the previous test → executes with the primary (Peter Miller)
    expect(r.outcome.executed).toBe(true);
    const to = (r.outcome.interpretation.ir?.slots["to"]);
    expect(to?.entityId).toBe("contact:peter-miller");
    expect(to?.matches?.length).toBe(2);
  });
});

describe("D-411 (S1) · the canonical-intent seam, live path", () => {
  test("F-4/F-5: executed command → intent row cited + EXECUTED resolution; distinct intents, identical canonical hash", async () => {
    // consent for root/message.send@1 was granted in the prior test — this
    // command executes; the seam assertions are deterministic either way (the
    // refusal-path halves live in the prior test, where the state is fresh)
    const r1 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'seam evidence one' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r1.outcome.executed).toBe(true);
    expect(r1.outcome.intentRef).toMatch(/^intent:[0-9a-f]{16,64}$/);
    expect(r1.outcome.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r1.outcome.resolution).toBe("EXECUTED");
    expect(r1.outcome.resolutionRecorded).toBe(true);
    // a second, identical command: its OWN intent (distinct submission) with
    // the identical canonical payloadHash (F7 byte-identical, live-path form)
    const r2 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'seam evidence one' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r2.outcome.executed).toBe(true);
    expect(r2.outcome.intentRef).not.toBe(r1.outcome.intentRef);
    expect(r2.outcome.payloadHash).toBe(r1.outcome.payloadHash);
    // a different command: different hash (the hash is content-derived)
    const r3 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'seam evidence two' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r3.outcome.payloadHash).not.toBe(r1.outcome.payloadHash);
  });

  test("F-3 live: the law journal row for the pre-gate call carries {intentRef, payloadHash}", async () => {
    const socket: Socket = io(`http://127.0.0.1:${service.port}/?XTransformPort=${service.port}`, {
      path: "/", transports: ["websocket", "polling"], forceNew: true, reconnection: false, timeout: 5000,
    });
    const journalEvents: Array<Record<string, unknown>> = [];
    socket.on("journal", (p: { events?: Array<Record<string, unknown>> }) => { for (const e of p.events ?? []) journalEvents.push(e); });
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "send 'seam journal evidence' to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r.outcome.intentRef).toBeTruthy();
    await new Promise((res) => setTimeout(res, 1500));
    // the citation row: the surface's canonical pre-gate call (the host's own
    // mechanical gate row carries no citation — two rows, one citation)
    const cited = journalEvents.find((e) => e["op"] === "law.check" && e["targetOp"] === "message.send@1" && e["intentRef"] === r.outcome.intentRef);
    expect(cited).toBeTruthy();
    expect(cited!["payloadHash"]).toBe(r.outcome.payloadHash);
    socket.disconnect();
  });

  test("F-4: an unparseable command → AMBIGUOUS resolution row (the assist edge's evidence)", async () => {
    const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "ask the assistant about the flurb wozzle" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r.outcome.executed).toBe(false);
    expect(r.outcome.surface?.kind).toBe("assist");
    expect(r.outcome.resolution).toBe("AMBIGUOUS");
    expect(r.outcome.resolutionRecorded).toBe(true);
    expect(r.outcome.intentRef).toBeUndefined(); // no canonical artifact exists to cite
  });
});

describe("Ω13 · reprogramming: teach + rules fire through the live loop", () => {
  test("teach 'blitz means send' → the word parses immediately after", async () => {
    const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "teach blitz means send" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r.outcome.executed).toBe(true);
    expect(r.outcome.interpretation.canonical).toBe("blitz = /send");
    // the NEXT parse sees the taught word (the world version bumped → new lexicon entry)
    const p = await (await fetch(`${base}/api/interpret`, { method: "POST", body: JSON.stringify({ text: "blitz 'taught words work' to Sarah" }) })).json() as { interpretation: Interpretation };
    expect(p.interpretation.ir?.intent).toBe("message.send@1");
    expect(p.interpretation.ir?.payload["to"]).toBe("sarah.chen@omega.local");
  });

  test("rule: create → actionConsent card → grant for vivim.director → trigger fires", async () => {
    // 0. pre-grant the director's send consent BEFORE the rule exists: the live
    //    tick (500ms) must never attempt a matching message while ungranted —
    //    a refused attempt ledgers by design (no retry), which would drop the
    //    seed. The id is stable per (principal, op), so this grants exactly
    //    what the card will name (asserted in step 1).
    const preId = consentIdFor("vivim.director", "message.send@1");
    const pre = await (await fetch(`${base}/api/consent`, { method: "POST", body: JSON.stringify({ consentId: preId, principal: "vivim.director" }) })).json() as { granted: boolean };
    expect(pre.granted).toBe(true);
    // 1. create the rule; the response carries the rule-action consent pre-check
    const r1 = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "when Maria messages me, forward it to Sarah" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r1.outcome.executed).toBe(true);
    expect(r1.outcome.result).toMatchObject({ ruleId: "rule:maria-garcia-forward" });
    expect(r1.outcome.ruleActionConsent?.principal).toBe("vivim.director");
    const actionConsentId = r1.outcome.ruleActionConsent?.consentId;
    expect(actionConsentId).toMatch(/^consent_[0-9a-f]+$/);
    expect(actionConsentId).toBe(preId); // stable derivation: the card names the pre-granted id
    expect(r1.outcome.ruleActionConsent?.decision).toBe("allow"); // pre-granted: card reports, not requests
    // 2. grant the rule's action consent (principal vivim.director — the console user is root)
    const g = await (await fetch(`${base}/api/consent`, { method: "POST", body: JSON.stringify({ consentId: actionConsentId, principal: "vivim.director" }) })).json() as { granted: boolean };
    expect(g.granted).toBe(true);
    // 3. trigger: Maria messages; the director tick (500ms live interval) fires the rule.
    //    The rule applies to the UNPROCESSED inbox: the seeded "Welcome" message from Maria
    //    (arrived before the rule existed) fires too — pinned semantics: rules apply to
    //    unprocessed messages; the fired ledger prevents re-fires, never duplicates.
    const rec = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "Maria messages me: the trigger test" }) })).json() as { outcome: ExecOutcomeWire };
    expect(rec.outcome.executed).toBe(true);
    let fwd: WorldModel["entities"] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const snap = await (await fetch(`${base}/api/snapshot`)).json() as { world: WorldModel };
      fwd = snap.world.entities.filter((e) => e.type === "message" && (e.data as { to?: string })?.["to"] === "sarah.chen@omega.local" && ((e.data as { subject?: string })?.["subject"] ?? "").startsWith("Fwd:"));
      if (fwd.length >= 2) break;
    }
    expect(fwd.length).toBe(2); // Fwd: Welcome (the seed) + Fwd: the trigger test
    const subjects = fwd.map((m) => (m.data as { subject: string })["subject"]).sort();
    expect(subjects).toEqual(["Fwd: Welcome", "Fwd: the trigger test"]);
    const trigger = fwd.find((m) => (m.data as { subject: string })["subject"] === "Fwd: the trigger test")!;
    expect((trigger.data as { body: string })["body"]).toBe("the trigger test");
    // 4. the world catches up: the rule + the sent messages exist
    const snap2 = await (await fetch(`${base}/api/snapshot`)).json() as { world: WorldModel };
    expect(snap2.world.rules.length).toBe(1);
    expect(snap2.world.rules[0]?.enabled).toBe(true);
  }, 20000);
});

describe("Ω13 · the live stream (socket.io, path '/')", () => {
  test("connect → snapshot + journal history; execute → 'result' pushes; world bumps broadcast", async () => {
    const socket: Socket = io(`http://127.0.0.1:${service.port}/?XTransformPort=${service.port}`, {
      path: "/", transports: ["websocket", "polling"], forceNew: true, reconnection: false, timeout: 5000,
    });
    try {
      const got: { snapshot?: { world: WorldModel }; journal?: { events: unknown[] }; results: ExecOutcomeWire[]; world?: { world: WorldModel } } = { results: [] };
      socket.on("snapshot", (p) => { got.snapshot = p; });
      socket.on("journal", (p) => { got.journal = p; });
      socket.on("result", (p) => { got.results.push(p); });
      socket.on("world", (p) => { got.world = p; });
      await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
      // initial replication
      for (let i = 0; i < 30 && !(got.snapshot && got.journal); i++) await new Promise((r) => setTimeout(r, 100));
      expect(got.snapshot?.world?.ops?.length).toBe(9);
      expect((got.journal?.events?.length ?? 0)).toBeGreaterThanOrEqual(0); // history exists on a used vault
      // an execute pushes the result; a RECEIVE bumps the world (v = events+entities+rules+lexicon)
      const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "search forward" }) })).json() as { outcome: ExecOutcomeWire };
      expect(r.outcome.executed).toBe(true);
      const rec = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "Peter Zhang messages me: the stream test" }) })).json() as { outcome: ExecOutcomeWire };
      expect(rec.outcome.executed).toBe(true);
      for (let i = 0; i < 60 && !(got.results.length >= 2 && got.world); i++) await new Promise((res) => setTimeout(res, 150));
      expect(got.results.map((x) => x.interpretation?.ir?.intent)).toContain("message.search@1");
      expect(got.results.map((x) => x.interpretation?.ir?.intent)).toContain("message.receive@1");
      expect(got.world?.world?.v).toBeGreaterThan(0);
    } finally {
      socket.disconnect();
    }
  }, 25000);
});

describe("Ω13 · surface pseudo-intents + the LLM edge", () => {
  test("'what can I say?' → the help payload with the ops catalog", async () => {
    const r = await (await fetch(`${base}/api/execute`, { method: "POST", body: JSON.stringify({ text: "what can I say?" }) })).json() as { outcome: ExecOutcomeWire };
    expect(r.outcome.surface?.kind).toBe("help");
    expect((r.outcome.surface?.payload?.["ops"] as unknown[]).length).toBe(9);
  });
  test("POST /api/assist → a deterministic simulator suggestion (the opt-in LLM edge, N2)", async () => {
    const r = await (await fetch(`${base}/api/assist`, { method: "POST", body: JSON.stringify({ text: "how do I mail Peter the report" }) })).json() as { ok: boolean; suggestion: string; sim: boolean };
    expect(r.ok).toBe(true);
    expect(r.sim).toBe(true);
    expect(r.suggestion.length).toBeGreaterThan(0);
  });
});
