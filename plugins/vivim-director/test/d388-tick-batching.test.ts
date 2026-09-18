// vivim.director — test/d388-tick-batching.test.ts (D-388, perf review round 2 §2.1)
//
// THE FALSIFIER for the batched tick read phase: runTick drives a SCRIPTED
// vault port that records every op call, so the N+1 fix is pinned by
// arithmetic, not vibes:
//   · N new/changed candidates ⇒ exactly ONE vault.getmany@1 for the email
//     bodies + ONE vault.getmany@1 for the fired-ledger keys — NEVER a per-row
//     vault.get@1 (the old loop paid up to 2×200 sequential hops per tick);
//   · unchanged (id → rev) rows cost one query row and NOTHING else (zero
//     batch hops, zero rule loads — laziness preserved);
//   · the semantics are byte-for-byte the old ones: ledger-hit ⇒ no refire,
//     missing row ⇒ error + rev unrecorded (honest retry), batch failure ⇒
//     partial report that never throws, foreign/seen/self rows are skipped
//     cheaply, at-least-once when the ledger read fails.
// Pure unit level (import-safe types only) — the real-host integration
// behavior stays covered by director.test.ts, which boots the composition and
// pins the same no-refire/consent semantics end to end.
import { describe, test, expect } from "bun:test";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import { runTick, type TickConfig, type TickState } from "../src/tick.ts";
import { AUTOMATION_NS, EMAIL_NS, FIRED_PREFIX, RULE_PREFIX } from "../src/rules.ts";

// ---- the scripted, recording vault port ----

interface Call { op: string; payload: Record<string, unknown> }

interface FakeMessage {
  id: string;
  folder?: string;
  from?: string;
  subject?: string;
  body?: string;
  seen?: boolean;
  metaType?: string; // defaults to "message"
  rev?: number;
  missing?: boolean; // getmany answers {found:false}
}

const RULE_ROW = {
  id: "rule:any-forward",
  when: { event: "message.received", from: null },
  then: { op: "message.send@1", payload: { to: "friend@omega.local", body: "auto" } },
  enabled: true,
  summary: "When anyone messages me, send to Friend",
  createdAt: 1_700_000_000_000,
};

function makePort(messages: FakeMessage[], opts: {
  ledgerFired?: Set<string>; // ids with a fired:<id> row present
  failEmailBatch?: boolean;
  failLedgerBatch?: boolean;
} = {}) {
  const calls: Call[] = [];
  const rows = messages.map((m) => ({ id: m.id, rev: m.rev ?? 1, cid: `cas_${m.id}` }));
  const port = {
    calls,
    count(op: string): number { return calls.filter((c) => c.op === op).length; },
    ops(): string[] { return calls.map((c) => c.op); },
    async call(op: string, payload: Record<string, unknown>): Promise<PortResult> {
      calls.push({ op, payload });
      if (op === "vault.query@1") {
        if (payload.ns === EMAIL_NS) return { ok: true, value: rows };
        if (payload.ns === AUTOMATION_NS) {
          if ((payload.filter as { idPrefix?: string })?.idPrefix === RULE_PREFIX) {
            return { ok: true, value: [{ id: RULE_ROW.id, rev: 1, cid: `cas_${RULE_ROW.id}` }] };
          }
          return { ok: true, value: [] };
        }
        return { ok: true, value: [] };
      }
      if (op === "vault.getmany@1") {
        const ns = payload.ns as string;
        const ids = payload.ids as string[];
        if (ns === EMAIL_NS) {
          if (opts.failEmailBatch) return { ok: false, error: "DEGRADED", detail: "scripted batch failure" };
          return {
            ok: true,
            value: ids.map((id) => {
              const m = messages.find((x) => x.id === id)!;
              if (!m || m.missing) return { id, found: false };
              return {
                id, found: true, rev: m.rev ?? 1, cid: `cas_${id}`,
                data: { id, folder: m.folder ?? "inbox", from: m.from ?? "alice@example.com", subject: m.subject ?? "hi", body: m.body ?? "hello", flags: { seen: m.seen ?? false } },
                meta: { type: m.metaType ?? "message" },
              };
            }),
          };
        }
        if (ns === AUTOMATION_NS) {
          if (opts.failLedgerBatch) return { ok: false, error: "DEGRADED", detail: "scripted ledger failure" };
          const fired = opts.ledgerFired ?? new Set<string>();
          return {
            ok: true,
            value: ids.map((id) => fired.has(id)
              ? { id, found: true, rev: 1, cid: `cas_${id}`, data: { messageId: id.slice(FIRED_PREFIX.length) }, meta: { type: "fired" } }
              : { id, found: false }),
          };
        }
        return { ok: true, value: [] };
      }
      if (op === "vault.get@1") {
        // single-id reads (rule loading) — never legitimate for the tick's read phase
        const id = payload.id as string;
        if (payload.ns === AUTOMATION_NS && id === RULE_ROW.id) {
          return { ok: true, value: { rev: 1, cid: `cas_${id}`, data: RULE_ROW, meta: { type: "rule" }, refs: [] } };
        }
        return { ok: false, error: "NOT_FOUND", detail: `scripted: no row ${id}` };
      }
      if (op === "vault.append@1") return { ok: true, value: { rev: 1 } };
      if (op === "message.send@1") return { ok: true, value: { id: "sent_1" } };
      return { ok: false, error: "REFUSED", detail: `scripted port: unknown op ${op}` };
    },
  };
  return {
    port,
    ctx: { port, log: () => {} } as unknown as PluginContext,
  };
}

const CFG: TickConfig = { selfAddresses: ["me@omega.local"] };
const state = (): TickState => ({ prevRevs: new Map() });

function msg(id: string, over: Partial<FakeMessage> = {}): FakeMessage {
  return { id, ...over };
}

// ---- the falsifiers ----

describe("D-388 §2.1 · the tick read phase is batched (getmany, never per-row gets)", () => {
  test("50 candidates ⇒ exactly 2 getmany hops (bodies + ledger), ZERO vault.get@1 in the read phase", async () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg(`m${i}`));
    const { ctx, port } = makePort(messages);
    const report = await runTick(ctx, CFG, state());

    expect(report.error).toBeUndefined();
    expect(report.scanned).toBe(50);
    expect(report.processed).toBe(50);
    expect(report.fired.length).toBe(50);

    // THE ARITHMETIC: one bodies hop with all 50 ids, one ledger hop with all 50 keys.
    expect(port.count("vault.getmany@1")).toBe(2);
    const bodyCalls = port.calls.filter((c) => c.op === "vault.getmany@1" && c.payload.ns === EMAIL_NS);
    expect(bodyCalls.length).toBe(1);
    expect((bodyCalls[0]!.payload.ids as string[]).length).toBe(50);
    const ledgerCalls = port.calls.filter((c) => c.op === "vault.getmany@1" && c.payload.ns === AUTOMATION_NS);
    expect(ledgerCalls.length).toBe(1);
    expect(ledgerCalls[0]!.payload.ids).toEqual(Array.from({ length: 50 }, (_, i) => `fired:m${i}`));

    // the old loop's per-row get is GONE from the read phase — the only
    // vault.get@1 left is the single rule-row fetch (lazy rule loading)
    const gets = port.calls.filter((c) => c.op === "vault.get@1");
    expect(gets.length).toBe(1);
    expect(gets[0]!.payload.ns).toBe(AUTOMATION_NS);
    expect(gets[0]!.payload.id).toBe(RULE_ROW.id);

    // deterministic: fired rows follow the scan order
    expect(report.fired.map((f) => f.messageId)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i}`));
    // every candidate's rev is recorded (no-refire memory primed for next tick)
    expect(report.fired.every((f) => f.ok)).toBe(true);
  });

  test("unchanged (id → rev) rows cost ONE query row — zero batch hops, rules never loaded", async () => {
    const messages = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, { rev: 3 }));
    const { ctx, port } = makePort(messages);
    const st = state();
    for (const m of messages) st.prevRevs.set(m.id, 3);

    const report = await runTick(ctx, CFG, st);

    expect(report.scanned).toBe(30);
    expect(report.processed).toBe(0);
    expect(report.fired).toEqual([]);
    expect(port.count("vault.getmany@1")).toBe(0);
    expect(port.count("vault.get@1")).toBe(0);
    expect(port.ops()).toEqual(["vault.query@1"]); // the email scan and NOTHING else
    // laziness preserved: no rule query was ever issued
    expect(port.calls.filter((c) => c.op === "vault.query@1" && c.payload.ns === AUTOMATION_NS).length).toBe(0);
  });

  test("ledger-hit candidates never refire — one hop answers for the whole batch", async () => {
    const messages = [msg("a"), msg("b"), msg("c")];
    const { ctx, port } = makePort(messages, { ledgerFired: new Set(["fired:a", "fired:c"]) });
    const st = state();
    const report = await runTick(ctx, CFG, st);

    expect(report.processed).toBe(1);
    expect(report.fired.map((f) => f.messageId)).toEqual(["b"]);
    expect(port.count("vault.getmany@1")).toBe(2);
    expect(port.calls.filter((c) => c.op === "vault.append@1").length).toBe(1);
    // the skipped candidates' revs are recorded (cheap next tick — never re-read)
    expect(st.prevRevs.get("a")).toBe(1);
    expect(st.prevRevs.get("c")).toBe(1);
    expect(st.prevRevs.get("b")).toBe(1);
  });

  test("missing row is DATA: error noted, rev unrecorded (honest retry), the batch's other rows still fire", async () => {
    const messages = [msg("gone", { missing: true }), msg("here")];
    const { ctx, port } = makePort(messages);
    const st = state();
    const report = await runTick(ctx, CFG, st);

    expect(report.error).toContain("missing at read time");
    expect(report.processed).toBe(1);
    expect(report.fired.map((f) => f.messageId)).toEqual(["here"]);
    expect(st.prevRevs.has("gone")).toBe(false); // retried honestly next tick
    expect(st.prevRevs.get("here")).toBe(1);
    expect(port.count("vault.getmany@1")).toBe(2); // still batched — no per-row fallback
  });

  test("email batch failure ⇒ partial report, zero appends, revs unrecorded — never throws", async () => {
    const messages = [msg("a"), msg("b")];
    const { ctx, port } = makePort(messages, { failEmailBatch: true });
    const st = state();
    const report = await runTick(ctx, CFG, st);

    expect(report.error).toContain("vault.getmany@1 (email bodies)");
    expect(report.processed).toBe(0);
    expect(report.fired).toEqual([]);
    expect(port.calls.filter((c) => c.op === "vault.append@1").length).toBe(0);
    expect(st.prevRevs.size).toBe(0);
  });

  test("ledger batch failure (proper): candidates fire, error recorded", async () => {
    const messages = [msg("a"), msg("b")];
    const { ctx, port } = makePort(messages, { failLedgerBatch: true });
    const st = state();
    const report = await runTick(ctx, CFG, st);

    expect(report.error).toContain("vault.getmany@1 (fired ledger)");
    expect(report.processed).toBe(2);
    expect(report.fired.map((f) => f.messageId).sort()).toEqual(["a", "b"]);
    expect(port.calls.filter((c) => c.op === "vault.append@1").length).toBe(2);
  });

  test("semantics preserved: foreign meta, seen, self, and wrong-folder rows are skipped cheaply", async () => {
    const messages = [
      msg("valid"),
      msg("foreign", { metaType: "contact" }),
      msg("seen", { seen: true }),
      msg("self", { from: "me@omega.local" }),
      msg("drafts", { folder: "drafts" }),
    ];
    const { ctx, port } = makePort(messages);
    const st = state();
    const report = await runTick(ctx, CFG, st);

    expect(report.processed).toBe(1);
    expect(report.fired.map((f) => f.messageId)).toEqual(["valid"]);
    for (const skipped of ["foreign", "seen", "self", "drafts"]) expect(st.prevRevs.get(skipped)).toBe(1);
    expect(st.prevRevs.get("valid")).toBe(1);
    // ledger hop covers ONLY the one trigger candidate
    const ledgerCalls = port.calls.filter((c) => c.op === "vault.getmany@1" && c.payload.ns === AUTOMATION_NS);
    expect(ledgerCalls[0]!.payload.ids).toEqual(["fired:valid"]);
  });

  test("hop count is flat in the candidate count: 200 candidates still pay exactly 2 getmany hops", async () => {
    const messages = Array.from({ length: 200 }, (_, i) => msg(`m${i}`));
    const { ctx, port } = makePort(messages);
    const report = await runTick(ctx, CFG, state());

    expect(report.processed).toBe(200);
    expect(port.count("vault.getmany@1")).toBe(2); // the whole point: 2 hops, not 400
    // total port calls for the pass: 1 query + 2 batches + 1 rule query + 1 rule get + 200 appends + 200 sends
    expect(port.calls.length).toBe(1 + 2 + 1 + 1 + 200 + 200);
  });
});
