// plugins/vivim-chat — test/resolve.test.ts (D-359 unit tables)
// The deterministic half + input validation. The ambiguous half's branches
// (realization/human) are resolve.classify@1's — proven on a real boot in
// pilot.test.ts; here only the chat-side contract is pinned.
import { describe, test, expect } from "bun:test";
import {
  parseResolveInput, deterministicMatch, deterministicVerdict, CHAT_CONSULT_OP, CHAT_CAPABILITY_CAP,
} from "../src/resolve.ts";
import { capabilityNamesFromRouted, surfaceOpMeta } from "@vivim/omega-contracts";
import type { PluginManifest } from "@vivim/omega-contracts";

const CAPS = ["chat.complete@1", "chat.open@1", "vault.append@1", "message.send@1"];

describe("D-359 — chat resolution core (pure)", () => {
  test("parseResolveInput: the capability set is validated as a derivation output (dup-checked, grammar-checked)", () => {
    const ok = parseResolveInput({ conversationId: "conv_abc", utterance: "chat.complete@1", capabilities: CAPS });
    expect(ok.capabilities).toHaveLength(4);
    expect(() => parseResolveInput({ conversationId: "msg_abc", utterance: "x", capabilities: CAPS })).toThrow(/conv_/);
    expect(() => parseResolveInput({ conversationId: "conv_abc", utterance: "   ", capabilities: CAPS })).toThrow(/utterance/);
    expect(() => parseResolveInput({ conversationId: "conv_abc", utterance: "x", capabilities: "chat.complete@1" })).toThrow(/array/);
    expect(() => parseResolveInput({ conversationId: "conv_abc", utterance: "x", capabilities: ["chat.complete"] })).toThrow(/<id>@<version>/);
    expect(() => parseResolveInput({ conversationId: "conv_abc", utterance: "x", capabilities: ["a@1", "a@1"] })).toThrow(/duplicate/);
    expect(() => parseResolveInput({ conversationId: "conv_abc", utterance: "x", capabilities: Array.from({ length: CHAT_CAPABILITY_CAP + 1 }, (_, i) => `op${i}@1`) })).toThrow(/500/);
  });

  test("deterministic half: exact command / known op name — trim-only, case-sensitive, nothing fuzzy", () => {
    expect(deterministicMatch("chat.complete@1", CAPS)).toBe("chat.complete@1");
    expect(deterministicMatch("  chat.complete@1  ", CAPS)).toBe("chat.complete@1"); // trim
    expect(deterministicMatch("Chat.Complete@1", CAPS)).toBeNull(); // no case-fuzzy
    expect(deterministicMatch("chat.complete", CAPS)).toBeNull(); // version matters — no guessing
    expect(deterministicMatch("what's the weather on mars?", CAPS)).toBeNull(); // ambiguous → the shared classifier
  });

  test("the deterministic verdict maps onto D-337's rule branch, DETERMINISTIC kind", () => {
    const v = deterministicVerdict("vault.append@1");
    expect(v.branch).toBe("rule");
    expect(v.kind).toBe("DETERMINISTIC");
    expect(v.capability).toBe("vault.append@1");
    expect(v.source).toBe("chat-deterministic");
    expect(v.reason).toContain("routed capability vault.append@1");
  });

  test("CHAT_CONSULT_OP: the ambiguous half consults the chat archetype through the shared classifier", () => {
    expect(CHAT_CONSULT_OP).toBe("chat.complete@1");
  });

  test("the shared derivation (A2): one source for the capability names — sorted, deduped", () => {
    expect(capabilityNamesFromRouted(["b@1", "a@1", "b@1"])).toEqual(["a@1", "b@1"]);
  });

  test("surfaceOpMeta: owner + declared risk per routed op (the MCP rule, now shared)", () => {
    const manifests = new Map<string, PluginManifest>([
      ["provider.llm", {
        manifestVersion: "1", id: "provider.llm", version: "0.1.0", entry: "src/index.ts",
        publisher: { keyId: "", signature: "" },
        contributions: { contract: [{ kind: "contract", id: "chat.complete", version: "1", risk: "READ" }] },
        dependencies: [], contentHash: "",
      }] as unknown as [string, PluginManifest],
    ]);
    const meta = surfaceOpMeta(manifests);
    expect(meta.get("chat.complete@1")).toEqual({ pluginId: "provider.llm", risk: "READ" });
  });
});
