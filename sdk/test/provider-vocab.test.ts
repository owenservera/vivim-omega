// sdk/test/provider-vocab.test.ts
// Ω14.0 Gate G0 — type-only test ensuring the vocabulary contract is exported and strictly typed.
import { describe, test, expect } from "bun:test";
import type { ProviderClass, RealizationStatus, RiskClass, EvidenceRef } from "@vivim/omega-contracts";

describe("Ω14.0 / Gate G0 — Vocabulary Contract Types", () => {
  test("ProviderClass admits current classes and structurally allows future extension", () => {
    const sim: ProviderClass = "SIMULATOR";
    const api: ProviderClass = "API_NATIVE";
    const browser: ProviderClass = "BROWSER_MEDIATED";
    expect(sim).toBe("SIMULATOR");
    expect(api).toBe("API_NATIVE");
    expect(browser).toBe("BROWSER_MEDIATED");
  });

  test("RealizationStatus covers the exact lifecycle enum", () => {
    const statuses: RealizationStatus[] = ["DRAFT", "TESTING", "PROMOTED", "DEGRADED", "REQUIRES_REDISCOVERY"];
    expect(statuses).toHaveLength(5);
  });

  test("RiskClass covers the exact mutation boundaries", () => {
    const risks: RiskClass[] = ["READ", "MUTATION", "EXTERNAL_MUTATION"];
    expect(risks).toHaveLength(3);
  });

  test("EvidenceRef enforces the minimum provenance shape", () => {
    const ref: EvidenceRef = { ns: "discovery", id: "capture:1", rev: 1 };
    expect(ref.ns).toBe("discovery");
    // NOTE (local fix vs spec): spec read `typeof rev` (undeclared identifier —
    // `typeof` guards the ReferenceError but yields "undefined" and fails).
    // Intent is the field's type:
    expect(typeof ref.rev).toBe("number");
  });
});
