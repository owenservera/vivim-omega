// plugins/vivim-chat — test/pilot.test.ts (D-358 + D-359 integration falsifier)
// THE D-337 PILOT OBLIGATION on one real boot of the shipped
// compositions/chat.json: exact commands resolve deterministically, one
// ambiguous utterance routes through the SHARED realization branch,
// unresolvable input escalates HUMAN — every verdict ledgered, nothing
// silent. Also proves the M2 storage side end-to-end: the `user:<id>`
// conversation (D-353), writer-assigned seqs, sibling isolation, the
// streamRef round-trip through D-352's chunk relay (chat.complete@1's
// additive emission → assembled content → Message.streamRef), and the
// attributable refusal table.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult, StreamChunk } from "@vivim/omega-contracts";
import { capabilityNamesFromRouted } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 30_000);

describe("D-358/D-359 — the chat pilot falsifier on one real boot of compositions/chat.json", () => {
  let host: BootedHost;
  let shippedSpec: CompositionSpec;

  beforeAll(async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/chat.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    shippedSpec = JSON.parse(JSON.stringify(spec)) as CompositionSpec;
    const root = omegaTmp("omega-chat-test", `pilot-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const shipped = JSON.parse(JSON.stringify(spec));
    shipped.entries.find((e: { id: string }) => e.id === "vivim.vault").config.dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(shipped, join(SPEC, ".."), vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    expect(booted.report.booted).toBe(true);
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
    const st = host.router.status();
    // D-331 lazy activation: only the phase-0 law compartment is active at
    // boot — the phase-1 compartments activate on first call. Routing is
    // provable now; activation is proven by the calls below.
    expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
    for (const op of ["chat.open@1", "chat.append@1", "chat.history@1", "chat.resolve@1", "chat.complete@1", "resolve.classify@1", "resolve.report@1"]) {
      expect((st.routedOps as string[]).includes(op), `${op} routed`).toBe(true);
    }
  }, 90_000);

  async function raw(op: string, payload: unknown): Promise<PortResult> {
    return host.router.callAsRoot(op, payload);
  }
  async function root<T>(op: string, payload: unknown): Promise<T> {
    const r = await raw(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as T;
  }

  test("the chat ops are routed with the manifest's declared capabilities granted", async () => {
    // Activate vivim.chat (D-331 lazy activation) with an attributable-miss
    // call — routing + the compartment's grant table are both provable after.
    const warm = await raw("chat.history@1", { conversationId: "conv_0000000000000000" });
    expect(warm.ok).toBe(false); // refuses, but the compartment is now active
    const st = host.router.status();
    expect((st.compartments as Record<string, { state: string }>)["vivim.chat"]?.state).toBe("active");
    // The grant table's authority is the user-signed recipe — assert the
    // SHIPPED composition grants exactly the capability surface the manifest
    // requests (nothing implied, G9).
    const chatEntry = shippedSpec.entries.find((e) => e.id === "vivim.chat");
    expect(chatEntry?.grant.capabilities).toEqual([
      "port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:resolve.classify@1",
    ]);
    expect(chatEntry?.grant.contracts).toEqual([
      "chat.open@1", "chat.append@1", "chat.history@1", "chat.resolve@1",
    ]);
  });

  let convId: string;

  test("chat.open@1: the conversation names a D-353 human principal — zero new authority machinery", async () => {
    const r = await root<{ conversationId: string; rev: number; createdAt: number }>(
      "chat.open@1", { principal: "user:ada", title: "the D-337 pilot conversation" },
    );
    expect(r.conversationId).toMatch(/^conv_[0-9a-f]{16}$/);
    expect(r.rev).toBe(1);
    convId = r.conversationId;
    const stored = await root<{ data: { principal: string; title?: string } }>("vault.get@1", { ns: "chat", id: convId });
    expect(stored.data.principal).toBe("user:ada");
    expect(stored.data.title).toBe("the D-337 pilot conversation");
  });

  test("D-337 deterministic half: the utterance names a routed capability → rule branch, ledgered by vivim.chat", async () => {
    // The capability set is DERIVED from the booted composition's routed ops
    // (the shared derivation — the same source MCP's tools/list consults).
    const capabilities = capabilityNamesFromRouted(host.router.status().routedOps as string[]);
    const r = await root<{ decisionId: string; branch: string; kind: string; capability: string; source: string }>(
      "chat.resolve@1", { conversationId: convId, utterance: "  chat.complete@1  ", capabilities },
    );
    expect(r.branch).toBe("rule");
    expect(r.kind).toBe("DETERMINISTIC");
    expect(r.capability).toBe("chat.complete@1");
    expect(r.source).toBe("chat-deterministic");
    expect(r.decisionId).toMatch(/^chat_[0-9a-f]{16}$/); // vivim.chat minted it
    // The ledger row exists in ns resolve with the D-323 build decision.
    const row = await root<{ data: { decisionId: string; branch: string; buildDecisionRef: string; evidenceRefs: unknown[] } }>(
      "vault.get@1", { ns: "resolve", id: `resolve:${r.decisionId}` },
    );
    expect(row.data.decisionId).toBe(r.decisionId);
    expect(row.data.branch).toBe("rule");
    expect(row.data.buildDecisionRef).toBe("D-323");
    expect(row.data.evidenceRefs.length).toBeGreaterThan(0);
  });

  test("D-337 human path: no covering realization → HUMAN, empty capability (routes nowhere), director's row", async () => {
    const capabilities = capabilityNamesFromRouted(host.router.status().routedOps as string[]);
    const r = await root<{ decisionId: string; branch: string; kind: string; capability: string; source: string }>(
      "chat.resolve@1", { conversationId: convId, utterance: "frobnicate the quantum flux capacitor", capabilities },
    );
    expect(r.branch).toBe("human");
    expect(r.kind).toBe("HUMAN");
    expect(r.capability).toBe(""); // routes NOWHERE by construction
    expect(r.source).toBe("resolve-classify");
    expect(r.decisionId).toMatch(/^res_[0-9a-f]{16}$/); // the director minted it
  });

  test("D-337 realization branch: a PROMOTED chat realization → the SHARED classifier routes it", async () => {
    // Seed the realization row the classifier scans for (the standard
    // realization shape; PROMOTED status is what classifyPure's gate reads).
    await root("vault.append@1", {
      ns: "providers", id: "realization:chat.complete:llm",
      data: {
        archetypeSlug: "chat.complete", providerId: "llm", providerClass: "SIMULATOR", status: "PROMOTED",
        discoverySessionRef: null, opMapRef: null, entityMapRef: null, streamRefs: [], evidenceRefs: [],
        supersedes: null, createdAt: Date.now(),
      },
      meta: { type: "realization", archetype: "chat.complete", provider: "llm", status: "PROMOTED" },
      refs: [],
    });
    const capabilities = capabilityNamesFromRouted(host.router.status().routedOps as string[]);
    const r = await root<{ decisionId: string; branch: string; kind: string; capability: string; source: string; reason: string }>(
      "chat.resolve@1", { conversationId: convId, utterance: "hey omega, say something true", capabilities },
    );
    expect(r.branch).toBe("realization");
    expect(r.capability).toBe("chat.complete@1");
    expect(r.source).toBe("resolve-classify");
    // D-323's class mapping decides the kind (SIMULATOR → DETERMINISTIC);
    // the chat side never overrides the shared classifier.
    expect(r.kind).toBe("DETERMINISTIC");
    expect(r.reason).toContain("PROMOTED");
  });

  test("resolution ≠ execution + the full pilot loop: resolve → execute → report → both sides stored, history ordered", async () => {
    const capabilities = capabilityNamesFromRouted(host.router.status().routedOps as string[]);
    // the user's turn, stored first
    const userMsg = await root<{ messageId: string; seq: number }>(
      "chat.append@1", { conversationId: convId, role: "user", content: "hey omega, say something true" },
    );
    expect(userMsg.seq).toBe(1);
    // resolve the ambiguous utterance (realization branch — the prior test seeded it)
    const verdict = await root<{ decisionId: string; capability: string; branch: string }>(
      "chat.resolve@1", { conversationId: convId, utterance: "hey omega, say something true", capabilities },
    );
    expect(verdict.capability).toBe("chat.complete@1");
    // execute through the router (the caller's job — resolution ≠ execution)
    const t0 = Date.now();
    const completion = await root<{ completion: { content: string }; sim: boolean; seed: string }>(
      "chat.complete@1", { messages: [{ role: "user", content: "hey omega, say something true" }], temperature: 0.7, maxTokens: 64 },
    );
    const execMs = Date.now() - t0;
    expect(completion.sim).toBe(true);
    // report the outcome (rev 2 of the decision object — the director discipline)
    const report = await root<{ rev: number }>(
      "resolve.report@1", { decisionId: verdict.decisionId, status: "ok", execMs },
    );
    expect(report.rev).toBe(2);
    // the assistant's turn, stored with full provenance
    const assistantMsg = await root<{ messageId: string; seq: number }>(
      "chat.append@1",
      {
        conversationId: convId, role: "assistant", content: completion.completion.content,
        providerId: "provider.llm",
        realizationRef: { ns: "providers", id: "realization:chat.complete:llm", rev: 1 },
      },
    );
    expect(assistantMsg.seq).toBe(2);
    // history: seq-ascending, both sides, provenance intact
    const h = await root<{ conversation: { principal: string }; messages: Array<{ role: string; seq: number; content: string; providerId?: string; realizationRef?: { id: string } }>; total: number }>(
      "chat.history@1", { conversationId: convId },
    );
    expect(h.conversation.principal).toBe("user:ada");
    expect(h.total).toBe(2);
    expect(h.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h.messages[1]!.content).toBe(completion.completion.content);
    expect(h.messages[1]!.providerId).toBe("provider.llm");
    expect(h.messages[1]!.realizationRef?.id).toBe("realization:chat.complete:llm");
  });

  test("the M1→M2 persistence hook: streamed chat.complete@1 assembles to exactly the stored content", async () => {
    const chunks: StreamChunk[] = [];
    const routed = await host.router.callAsRootStream(
      "chat.complete@1",
      // maxTokens above the full completion size — truncation flattens
      // newlines (words joined by spaces), which would legitimately emit one
      // chunk; this proof wants the multi-line shape.
      { messages: [{ role: "user", content: "streamed arrival proof" }], temperature: 0.7, maxTokens: 4096 },
      (c: StreamChunk) => chunks.push(c),
    );
    expect(routed.result.ok).toBe(true);
    const completion = routed.result.value as { completion: { content: string } };
    // ordered chunks: seq 1..N, exactly one final, the last one
    expect(chunks.length).toBeGreaterThanOrEqual(2); // the sim emits ≥ 2 lines
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i + 1));
    expect(chunks.filter((c) => c.final)).toHaveLength(1);
    expect(chunks.at(-1)?.final).toBe(true);
    // assembled === the completion's content, byte for byte
    const assembled = chunks.map((c) => c.data as string).join("\n");
    expect(assembled).toBe(completion.completion.content);
    // the stream id is the call's causation id
    expect(routed.streamId).toBe(chunks[0]!.streamId);
    // the streamed message lands with the stream provenance (D-358's streamRef)
    const stored = await root<{ messageId: string; seq: number }>(
      "chat.append@1",
      {
        conversationId: convId, role: "assistant", content: assembled,
        providerId: "provider.llm",
        streamRef: { streamId: routed.streamId, chunks: chunks.length, finalSeq: chunks.at(-1)!.seq },
      },
    );
    expect(stored.seq).toBe(3);
    const h = await root<{ messages: Array<{ streamRef?: { streamId: string; chunks: number; finalSeq: number } }> }>(
      "chat.history@1", { conversationId: convId },
    );
    expect(h.messages[2]!.streamRef?.streamId).toBe(routed.streamId);
    expect(h.messages[2]!.streamRef?.chunks).toBe(chunks.length);
    expect(h.messages[2]!.streamRef?.finalSeq).toBe(chunks.length);
  });

  test("single-shot callers observe nothing (sink-or-drop cold fallback, D-322/D-352)", async () => {
    const r = await root<{ completion: { content: string }; sim: boolean }>(
      "chat.complete@1", { messages: [{ role: "user", content: "plain call" }] },
    );
    expect(r.sim).toBe(true);
    expect(r.completion.content.length).toBeGreaterThan(0); // unchanged return shape
  });

  test("sibling isolation + limit: history of A never leaks B; limit truncates honestly", async () => {
    const b = await root<{ conversationId: string }>("chat.open@1", { principal: "user:grace" });
    await root("chat.append@1", { conversationId: b.conversationId, role: "user", content: "grace's private note" });
    const hA = await root<{ messages: Array<{ content: string }>; total: number }>("chat.history@1", { conversationId: convId });
    expect(hA.messages.some((m) => m.content.includes("grace's private note"))).toBe(false);
    const hB = await root<{ total: number }>("chat.history@1", { conversationId: b.conversationId });
    expect(hB.total).toBe(1);
    const hLimited = await root<{ messages: unknown[] }>("chat.history@1", { conversationId: convId, limit: 1 });
    expect(hLimited.messages).toHaveLength(1); // the FIRST seq — bounded reads, honest totals
  });

  test("concurrent appends serialize: N parallel appends mint distinct contiguous seqs (C-1)", async () => {
    const c = await root<{ conversationId: string }>("chat.open@1", { principal: "user:race" });
    const N = 8;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        root<{ messageId: string; seq: number }>("chat.append@1", {
          conversationId: c.conversationId, role: "user", content: `race ${i}`,
        }),
      ),
    );
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const h = await root<{ messages: Array<{ seq: number }>; total: number }>("chat.history@1", { conversationId: c.conversationId });
    expect(h.total).toBe(N);
  });

  test("the refusal table: attributable conversation misses, malformed payloads, malformed capability sets", async () => {
    const missing = await raw("chat.append@1", { conversationId: "conv_0000000000000000", role: "user", content: "x" });
    expect(missing.ok).toBe(false);
    expect(missing.detail ?? missing.error).toContain("does not exist");
    const missingHist = await raw("chat.history@1", { conversationId: "conv_0000000000000000" });
    expect(missingHist.ok).toBe(false);
    expect(missingHist.detail ?? missingHist.error).toContain("does not exist");
    const badPrincipal = await raw("chat.open@1", { principal: "" });
    expect(badPrincipal.ok).toBe(false);
    expect(badPrincipal.detail ?? badPrincipal.error).toContain("non-empty");
    const badRole = await raw("chat.append@1", { conversationId: convId, role: "wizard", content: "x" });
    expect(badRole.ok).toBe(false);
    const dupCaps = await raw("chat.resolve@1", { conversationId: convId, utterance: "x", capabilities: ["a@1", "a@1"] });
    expect(dupCaps.ok).toBe(false);
    expect(dupCaps.detail ?? dupCaps.error).toContain("duplicate");
    const badConv = await raw("chat.resolve@1", { conversationId: "msg_nope", utterance: "x", capabilities: [] });
    expect(badConv.ok).toBe(false);
  });

  test("W0-3/D-378: appends maintain the writer-maintained index; history reads the indexed path", async () => {
    // convId carries the pilot conversation — every append since the index
    // landed writes idx_<hex> (same critical section as the message append).
    const idx = await root<{ rev: number; data: { conversationId: string; count: number; entries: Array<{ id: string; seq: number }> } }>(
      "vault.get@1", { ns: "chat", id: `idx_${convId.slice("conv_".length)}` },
    );
    expect(idx.data.conversationId).toBe(convId);
    expect(idx.data.count).toBe(idx.data.entries.length); // count === entries, the D-378 invariant
    expect(idx.data.count).toBeGreaterThanOrEqual(3);
    // indexed history and the index agree on order + size (bounded: ≤ CAP gets)
    const h = await root<{ messages: Array<{ seq: number }>; total: number }>("chat.history@1", { conversationId: convId });
    expect(h.total).toBe(idx.data.count);
    expect(h.messages.map((m) => m.seq)).toEqual(idx.data.entries.map((e) => e.seq));
  });

  test("W0-3/D-378: the indexed cap refusal stays fail-closed (200 appends, the 201st refuses)", async () => {
    const cap = await root<{ conversationId: string }>("chat.open@1", { principal: "user:cap" });
    for (let i = 1; i <= 200; i++) {
      await root<{ seq: number }>("chat.append@1", { conversationId: cap.conversationId, role: "user", content: `cap ${i}` });
    }
    const over = await raw("chat.append@1", { conversationId: cap.conversationId, role: "user", content: "one too many" });
    expect(over.ok).toBe(false);
    expect(over.detail ?? over.error).toContain("indexed");
    expect(over.detail ?? over.error).toContain("refusing fail-closed");
    const h = await root<{ total: number }>("chat.history@1", { conversationId: cap.conversationId });
    expect(h.total).toBe(200);
  }, 120_000);

  test("W0-4/D-379: the cross-principal read REFUSES as a verdict and LEDGERS the attempt", async () => {
    // the pilot conversation belongs to user:ada — a read presented under
    // user:mallory refuses (REFUSED envelope) and writes the refusal ledger row
    const r = await raw("chat.history@1", { conversationId: convId, principal: "user:mallory" });
    expect(r.ok).toBe(true); // a policy VERDICT, not a port failure
    const refusal = (r as { value?: { refused?: boolean; error?: string; op?: string; detail?: string; ledgered?: boolean; ledgerRef?: { ns: string; id: string; rev: number } } }).value ?? {};
    expect(refusal.refused).toBe(true);
    expect(refusal.error).toBe("REFUSED");
    expect(refusal.op).toBe("chat.history@1");
    expect(refusal.ledgered).toBe(true);
    expect(refusal.ledgerRef?.ns).toBe("chat");
    // the ledger row is real, inspectable, and names both principals
    const led = await root<{ data: { conversationId: string; owner: string; caller: string; op: string }; meta: { type: string } }>(
      "vault.get@1", { ns: "chat", id: refusal.ledgerRef!.id },
    );
    expect(led.meta.type).toBe("principal-refusal");
    expect(led.data.owner).toBe("user:ada");
    expect(led.data.caller).toBe("user:mallory");
    expect(led.data.conversationId).toBe(convId);
    // the owner passes the fence; the absent-principal Phase-1 path is unchanged
    const own = await root<{ total: number }>("chat.history@1", { conversationId: convId, principal: "user:ada" });
    expect(own.total).toBeGreaterThan(0);
    const anon = await root<{ total: number }>("chat.history@1", { conversationId: convId });
    expect(anon.total).toBe(own.total);
  });

  test("the vault's Merkle integrity holds over the whole pilot (ns chat included)", async () => {
    const v = await root<{ ok: boolean }>("vault.verify@1", {});
    expect(v.ok).toBe(true);
  });
});
