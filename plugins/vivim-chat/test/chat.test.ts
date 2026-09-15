// plugins/vivim-chat — test/chat.test.ts (D-358 unit tables)
// The pure storage core: validation tables, seq discipline, narrowing, bounds.
// No boot — the integration falsifier lives in pilot.test.ts.
import { describe, test, expect } from "bun:test";
import {
  checkPrincipal, checkRole, checkContent, checkStreamRef, checkRealizationRef,
  parseAppendInput, nextMessageSeq, parseHistoryInput, orderMessages,
} from "../src/chat.ts";
import { asChatConversation, asChatMessage, chatConversationId, chatMessageId } from "@vivim/omega-contracts";

describe("D-358 — chat storage core (pure)", () => {
  test("principal: any principal string is legal (D-353) — only structural junk is refused", () => {
    expect(checkPrincipal("chat.open@1", "user:ada")).toBe("user:ada");
    expect(checkPrincipal("chat.open@1", "agent:pilot")).toBe("agent:pilot");
    expect(checkPrincipal("chat.open@1", "some-composition-principal")).toBe("some-composition-principal");
    expect(() => checkPrincipal("chat.open@1", "")).toThrow(/non-empty/);
    expect(() => checkPrincipal("chat.open@1", "   ")).toThrow(/non-empty/);
    expect(() => checkPrincipal("chat.open@1", "a\u0000b")).toThrow(/NUL/);
    expect(() => checkPrincipal("chat.open@1", 42)).toThrow(/non-empty/);
  });

  test("roles and content: the honest refusal table", () => {
    expect(checkRole("chat.append@1", "user")).toBe("user");
    expect(checkRole("chat.append@1", "assistant")).toBe("assistant");
    expect(checkRole("chat.append@1", "system")).toBe("system");
    expect(() => checkRole("chat.append@1", "admin")).toThrow(/role/);
    expect(checkContent("chat.append@1", "hello world")).toBe("hello world");
    expect(() => checkContent("chat.append@1", "")).toThrow(/non-empty/);
    expect(() => checkContent("chat.append@1", "x".repeat(100_001))).toThrow(/100k/);
  });

  test("streamRef + realizationRef: the M1/D-352 provenance shapes are validated, not trusted", () => {
    expect(checkStreamRef("chat.append@1", { streamId: "caus_1", chunks: 3, finalSeq: 3 }))
      .toEqual({ streamId: "caus_1", chunks: 3, finalSeq: 3 });
    expect(() => checkStreamRef("chat.append@1", { streamId: "", chunks: 1, finalSeq: 1 })).toThrow(/streamId/);
    expect(() => checkStreamRef("chat.append@1", { streamId: "s", chunks: 0, finalSeq: 1 })).toThrow(/chunks/);
    expect(() => checkStreamRef("chat.append@1", { streamId: "s", chunks: 2, finalSeq: 0 })).toThrow(/finalSeq/);
    expect(checkRealizationRef("chat.append@1", { ns: "providers", id: "realization:chat.complete:llm", rev: 2 }))
      .toEqual({ ns: "providers", id: "realization:chat.complete:llm", rev: 2 });
    expect(() => checkRealizationRef("chat.append@1", { ns: "providers", id: "r", rev: 0 })).toThrow(/rev/);
  });

  test("parseAppendInput: optionals round-trip; junk throws", () => {
    const full = parseAppendInput({
      conversationId: "conv_abc", role: "assistant", content: "hi",
      providerId: "provider.llm",
      realizationRef: { ns: "providers", id: "realization:chat.complete:llm", rev: 1 },
      streamRef: { streamId: "caus_1", chunks: 2, finalSeq: 2 },
    });
    expect(full.providerId).toBe("provider.llm");
    expect(full.streamRef?.chunks).toBe(2);
    expect(parseAppendInput({ conversationId: "conv_abc", role: "user", content: "hi" }).providerId).toBeUndefined();
    expect(() => parseAppendInput(null)).toThrow(/payload/);
    expect(() => parseAppendInput({ conversationId: "msg_abc", role: "user", content: "hi" })).toThrow(/conv/);
    expect(() => parseAppendInput({ conversationId: "conv_abc", role: "wizard", content: "hi" })).toThrow(/role/);
  });

  test("seq discipline: writer-assigned, 1-based, contiguous (the vault-rev family)", () => {
    expect(nextMessageSeq(0)).toBe(1);
    expect(nextMessageSeq(1)).toBe(2);
    expect(nextMessageSeq(199)).toBe(200);
    expect(() => nextMessageSeq(-1)).toThrow(/non-negative/);
    expect(() => nextMessageSeq(1.5)).toThrow(/integer/);
  });

  test("history input: bounded (CHAT_HISTORY_CAP), conv_-prefixed", () => {
    expect(parseHistoryInput({ conversationId: "conv_abc" }).limit).toBeUndefined();
    expect(parseHistoryInput({ conversationId: "conv_abc", limit: 5 }).limit).toBe(5);
    expect(() => parseHistoryInput({ conversationId: "conv_abc", limit: 0 })).toThrow(/limit/);
    expect(() => parseHistoryInput({ conversationId: "conv_abc", limit: 10_000 })).toThrow(/limit/);
  });

  test("orderMessages: seq-ascending with a stable id tie-break", () => {
    const m = (id: string, seq: number) => ({ id, conversationId: "conv_x", role: "user" as const, seq, content: id, createdAt: 0 });
    const sorted = orderMessages([m("b", 2), m("a", 1), m("d", 2), m("c", 1)]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "c", "b", "d"]);
  });

  test("contracts narrowers: malformed rows read as null, never throw", () => {
    const conv = asChatConversation({ id: "conv_a", principal: "user:ada", createdAt: 1 });
    expect(conv?.principal).toBe("user:ada");
    expect(asChatConversation({ id: "conv_a" })).toBeNull(); // no principal
    expect(asChatConversation(null)).toBeNull();
    const msg = asChatMessage({ id: "msg_a", conversationId: "conv_a", role: "user", seq: 1, content: "x", createdAt: 1 });
    expect(msg?.seq).toBe(1);
    expect(asChatMessage({ id: "msg_a", conversationId: "conv_a", role: "root", seq: 1, content: "x", createdAt: 1 })).toBeNull();
    expect(asChatMessage({ id: "msg_a", conversationId: "conv_a", role: "user", seq: 0, content: "x", createdAt: 1 })).toBeNull();
    expect(asChatMessage({ id: "msg_a", conversationId: "conv_a", role: "user", seq: 1, content: "x", createdAt: 1, streamRef: 5 })).toBeNull();
  });

  test("id grammar: prefix-enforced, pure TOTAL", () => {
    expect(chatConversationId("conv_abc123")).toBe("conv_abc123");
    expect(chatMessageId("msg_abc123")).toBe("msg_abc123");
    expect(() => chatConversationId("msg_abc123")).toThrow(/conv/);
    expect(() => chatMessageId("conv_abc123")).toThrow(/msg/);
    expect(() => chatConversationId("conv:abc")).toThrow(/grammar/);
  });
});
