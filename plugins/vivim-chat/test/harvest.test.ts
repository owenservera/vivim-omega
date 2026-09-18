// W1 FALSIFIER (T-04 + T-05, D-355 governance) — the wave's whole proof.
//
// "One legacy SSE stream + one import fixture parsed through governed pins on
// a real boot; realizationRef/parserPins/provenance surviving the vault round
// trip; mind-queryable." (20-WAVES/WAVE1-HARVEST-INFRA.md)
//
// Real boot: compositions/discovery-mind.json — REAL vivim.law (phase 0) +
// vivim.vault + the discovery engines + vivim.providers (the realization
// registry). The falsifier, step by step:
//   1. the recorded SSE stream + the chatgpt import fixture land in the
//      USER'S VAULT as evidence rows (ns probe, the recorded-bytes ground);
//   2. the STANDARD discovery lifecycle verifies each parser boundary —
//      discovery.verify@1 with provider.parserPins (D-355 §4) PROMOTEs
//      realization:chat.complete:llm and realization:history.import:chatgpt
//      carrying the pins, each citing the promotion event (provenance chain);
//   3. the fixtures are parsed through the GOVERNED pins (resolveParser /
//      resolveImportParser — fail-closed resolution, never a raw transform)
//      and assembled through buildChunkEnvelope (the exactly-one-final law);
//   4. the W1 harvest-evidence row (parsed shape + pins + provenance, with
//      refs to the recorded evidence rows) is appended and must SURVIVE
//      vault.roundtrip@1 (swap-safety: the proof chain is vault-durable);
//   5. "mind-queryable" = D-382's spine query set item 2 (per-realization
//      status): providers.realization.get@1 returns the pin-carrying rows
//      from the running registry.
//
// (Host is imported by relative path: plugins never take a host dependency —
// only tests borrow the compile/boot ceremony. Same pattern as llm.test.ts.)
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, contentHashDir } from "../../../host/src/index.ts";
import type { BootedHost } from "../../../host/src/index.ts";
import { omegaTmp } from "@vivim/omega-platform";
import { buildChunkEnvelope, parserContributionId, pinMatches } from "@vivim/omega-contracts";
import { resolveParser, PARSERS as LLM_PARSERS, LLM_PARSER_VERSION } from "../../provider-llm/src/parsers.ts";
import { resolveImportParser, IMPORT_PARSER_VERSION } from "../src/parsers.ts";

void IMPORT_PARSER_VERSION; // version is exercised through resolveImportParser below

const SPEC = join(import.meta.dir, "../../../compositions/discovery-mind.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const SSE_FIXTURE = join(import.meta.dir, "../../../fixtures/sse/legacy-chat-complete.sse.txt");
const IMPORT_FIXTURE = join(import.meta.dir, "../../../fixtures/import/chatgpt-conversations.json");
const HARVEST_MANIFEST = JSON.parse(readFileSync(join(import.meta.dir, "../../../fixtures/harvest/MANIFEST.json"), "utf-8")) as {
  fixtures: Array<{ fixture: string; sha256: string; rows: number; provenance: { mine: string; originPath: string } }>;
};

const MINES_PIN = "vivim-final-program@4a5eb84; vivim-final-enhanced@afebe00 (W0-9a pins)";

let vault: string;
let host: BootedHost;

async function root<T>(op: string, payload: unknown): Promise<T> {
  const r = await host.router.callAsRoot(op, payload);
  if (!r.ok) throw new Error(`${op} failed: ${r.error}: ${("detail" in r && r.detail) || ""}`);
  return r.value as T;
}

beforeAll(async () => {
  vault = omegaTmp("omega-w1-harvest-test", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("W1 falsifier — the recorded fixtures land as vault evidence (the ground)", () => {
  test("the compile ceremony signed the manifests; the parser contributions are manifest-declared data", () => {
    const m = host.manifests.get("provider.llm")!;
    expect(m).toBeTruthy();
    expect(m.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentHashDir(join(import.meta.dir, "../..", "provider-llm"))).toBe(m.contentHash);
    // D-355: the parser contribution is IN the signed manifest (governance data, not a blob)
    const parserContrib = m.contributions.parser?.find((c) => c.id === "chat.complete");
    expect(parserContrib).toBeDefined();
    expect(parserContrib!.version).toBe("1");
  });

  test("step 1 — the SSE stream and the import fixture append as evidence rows (recorded bytes, ns probe)", async () => {
    const sseText = readFileSync(SSE_FIXTURE, "utf-8");
    const importText = readFileSync(IMPORT_FIXTURE, "utf-8");
    const sseRow = await root<{ rev: number; id: string }>("vault.append@1", {
      ns: "probe", id: "w1-sse-fixture",
      data: { kind: "w1.recorded-stream", transport: "sse", text: sseText, recordedOnly: true },
      meta: { type: "w1-evidence" },
    });
    const importRow = await root<{ rev: number; id: string }>("vault.append@1", {
      ns: "probe", id: "w1-import-fixture",
      data: { kind: "w1.recorded-export", source: "chatgpt", text: importText, recordedOnly: true },
      meta: { type: "w1-evidence" },
    });
    expect(sseRow.rev).toBeGreaterThan(0);
    expect(importRow.rev).toBeGreaterThan(0);
    // recorded bytes survive one get already (the vault is the ground, not the test's memory)
    const back = await root<{ data: { text: string } }>("vault.get@1", { ns: "probe", id: "w1-sse-fixture" });
    expect(back.data.text).toBe(sseText);
  });
});

describe("W1 falsifier — governed pins through the STANDARD discovery lifecycle", () => {
  const sseText = readFileSync(SSE_FIXTURE, "utf-8");
  const importText = readFileSync(IMPORT_FIXTURE, "utf-8");
  let sseRev = 0;
  let importRev = 0;

  test("step 2a — discovery.verify@1 PROMOTEs realization:chat.complete:llm carrying the SSE pin", async () => {
    const evidence = await root<{ rev: number }>("vault.get@1", { ns: "probe", id: "w1-sse-fixture" });
    sseRev = evidence.rev;
    const binding = { blueprintOp: "chat.complete@1", candidateId: "cand-sse-framing-llm", confidence: 1 };
    const probes = [0, 1, 2].map((k) => ({
      candidateId: binding.candidateId,
      passed: true,
      evidence: [{ ns: "probe", id: "w1-sse-fixture", rev: evidence.rev }],
      note: `W1 SSE framing probe ${k} — recorded stream parses under the pinned transform`,
    }));
    const v = await root<{ promoted: string[]; realizations: Array<{ id: string; status: string }> }>("discovery.verify@1", {
      mapping: { bindings: [binding], satisfied: true },
      probes, runId: "w1-sse-framing",
      provider: { id: "llm", class: "SIMULATOR", parserPins: [{ providerId: "llm", archetypeSlug: "chat.complete", version: "1" }] },
    });
    expect(v.promoted).toContain("cand-sse-framing-llm");
    expect(v.realizations.some((x) => x.id === "realization:chat.complete:llm" && x.status === "PROMOTED")).toBe(true);
  });

  test("step 2b — discovery.verify@1 PROMOTEs realization:history.import:chatgpt carrying the import pin", async () => {
    const evidence = await root<{ rev: number }>("vault.get@1", { ns: "probe", id: "w1-import-fixture" });
    importRev = evidence.rev;
    const binding = { blueprintOp: "history.import@1", candidateId: "cand-import-chatgpt", confidence: 1 };
    const probes = [0, 1, 2].map((k) => ({
      candidateId: binding.candidateId,
      passed: true,
      evidence: [{ ns: "probe", id: "w1-import-fixture", rev: evidence.rev }],
      note: `W1 import probe ${k} — recorded export parses under the pinned transform`,
    }));
    const v = await root<{ promoted: string[]; realizations: Array<{ id: string; status: string }> }>("discovery.verify@1", {
      mapping: { bindings: [binding], satisfied: true },
      probes, runId: "w1-import-chatgpt",
      provider: { id: "chatgpt", class: "SIMULATOR", parserPins: [{ providerId: "chatgpt", archetypeSlug: "history.import", version: "1" }] },
    });
    expect(v.promoted).toContain("cand-import-chatgpt");
    expect(v.realizations.some((x) => x.id === "realization:history.import:chatgpt" && x.status === "PROMOTED")).toBe(true);
  });

  test("step 3 — the fixtures parse through the GOVERNED pins and assemble into lawful M1 envelopes", () => {
    // governed resolution (fail-closed) — never a raw transform import
    const sseDef = resolveParser(LLM_PARSER_VERSION);
    expect(sseDef.providerId).toBe("llm");
    expect(parserContributionId(sseDef.providerId, sseDef.archetypeSlug)).toBe("parser:chat.complete:llm");
    expect(pinMatches({ providerId: "llm", archetypeSlug: "chat.complete", version: "1" }, "llm", "chat.complete", "1")).toBe(true);
    const sseRows = sseDef.transform(sseText);
    const sseEnvelope = buildChunkEnvelope("w1-sse-replay", sseRows);
    expect(sseEnvelope.length).toBe(sseRows.length);
    expect(sseEnvelope.filter((c) => c.final).length).toBe(1); // exactly-one-final
    expect(sseEnvelope.map((c) => c.seq)).toEqual(sseEnvelope.map((_, i) => i + 1)); // contiguous

    const importDef = resolveImportParser("chatgpt", "1");
    expect(importDef.providerId).toBe("chatgpt");
    expect(parserContributionId(importDef.providerId, importDef.archetypeSlug)).toBe("parser:history.import:chatgpt");
    const importRows = importDef.transform(importText);
    const importEnvelope = buildChunkEnvelope("w1-import-replay", importRows);
    expect(importEnvelope.filter((c) => c.final).length).toBe(1);
    const kinds = importRows.map((r) => (r.data as Record<string, unknown>).kind);
    expect(kinds[0]).toBe("import.conversation");
    expect(kinds[kinds.length - 1]).toBe("import.done");
    // determinism through the governed pin (substitution-shape law): same bytes → same rows
    expect(JSON.stringify(importDef.transform(importText))).toBe(JSON.stringify(importRows));
    expect(JSON.stringify(sseDef.transform(sseText))).toBe(JSON.stringify(sseRows));
  });

  test("step 4 — the W1 harvest-evidence row lands with realizationRef + parserPins + provenance", async () => {
    const sseFixtureMeta = HARVEST_MANIFEST.fixtures.find((f) => f.fixture.includes("legacy-chat-complete"))!;
    const importFixtureMeta = HARVEST_MANIFEST.fixtures.find((f) => f.fixture.includes("chatgpt-conversations"))!;
    const parsed = {
      sse: {
        rows: resolveParser("1").transform(sseText).length,
        envelopeFinal: 1,
        parserPin: { providerId: "llm", archetypeSlug: "chat.complete", version: "1" },
        realizationRef: "realization:chat.complete:llm",
        fixtureSha256: sseFixtureMeta.sha256,
      },
      import: {
        source: "chatgpt",
        rows: resolveImportParser("chatgpt", "1").transform(importText).length,
        parserPin: { providerId: "chatgpt", archetypeSlug: "history.import", version: "1" },
        realizationRef: "realization:history.import:chatgpt",
        fixtureSha256: importFixtureMeta.sha256,
      },
      provenance: {
        mines: MINES_PIN,
        recordedOnly: true,
        harvestManifestRow: { sse: sseFixtureMeta.provenance, import: importFixtureMeta.provenance },
      },
    };
    const row = await root<{ rev: number; id: string }>("vault.append@1", {
      ns: "probe", id: "w1-harvest-evidence",
      data: parsed,
      meta: { type: "w1-evidence" },
      refs: [
        { ns: "probe", id: "w1-sse-fixture", rev: sseRev },
        { ns: "probe", id: "w1-import-fixture", rev: importRev },
      ],
    });
    expect(row.rev).toBeGreaterThan(0);
    void importRev;
  });

  test("step 4b — provenance SURVIVES the vault round trip (swap-safety harness)", async () => {
    const target = omegaTmp("omega-w1-harvest-test", `roundtrip-target-${Date.now()}-${process.pid}`);
    rmSync(target, { recursive: true, force: true });
    // vault.roundtrip@1 is EXTERNAL_MUTATION — consent-gated (law.check). The
    // refusal names the consent id; the ceremony is extract → grant → retry.
    const attempt = async () =>
      await root<{ ok: boolean; headHash: string; copiedHeadHash: string }>("vault.roundtrip@1", { targetDir: target });
    let copy: { ok: boolean; headHash: string; copiedHeadHash: string };
    try {
      copy = await attempt();
    } catch (e) {
      const m = String(e).match(/consent_[0-9a-f]+/);
      expect(m).toBeTruthy();
      await root("law.consent.grant@1", { consentId: m![0] });
      copy = await attempt();
    }
    expect(copy.ok).toBe(true); // ok = copy verifies green with the SAME head hash (vault.roundtrip@1's swap harness)
    expect(copy.headHash).toMatch(/^[0-9a-f]{64}$/);
    // the evidence chain reads back identical from the SWAPPED store
    const back = await root<{ data: { sse: { realizationRef: string; parserPin: { version: string } }; provenance: { mines: string } } }>(
      "vault.get@1", { ns: "probe", id: "w1-harvest-evidence" },
    );
    expect(back.data.sse.realizationRef).toBe("realization:chat.complete:llm");
    expect(back.data.sse.parserPin.version).toBe("1");
    expect(back.data.provenance.mines).toContain("4a5eb84");
  });

  test("step 5 — MIND-QUERYABLE (D-382 spine query set item 2): the registry serves the pin-carrying realizations", async () => {
    // providers.realization.get@1 → {realization: ProviderRealization | null, rev} (miss reads as null)
    const llmRow = await root<{ realization: { status: string; providerClass: string; parserPins: Array<{ providerId: string; archetypeSlug: string; version: string }> } | null }>(
      "providers.realization.get@1", { archetypeSlug: "chat.complete", providerId: "llm" },
    );
    expect(llmRow.realization).toBeTruthy();
    expect(llmRow.realization!.status).toBe("PROMOTED");
    expect(llmRow.realization!.providerClass).toBe("SIMULATOR");
    expect(llmRow.realization!.parserPins).toEqual([{ providerId: "llm", archetypeSlug: "chat.complete", version: "1" }]);

    const importRow = await root<{ realization: { status: string; parserPins: Array<{ providerId: string }> } | null }>(
      "providers.realization.get@1", { archetypeSlug: "history.import", providerId: "chatgpt" },
    );
    expect(importRow.realization).toBeTruthy();
    expect(importRow.realization!.status).toBe("PROMOTED");
    expect(importRow.realization!.parserPins).toEqual([{ providerId: "chatgpt", archetypeSlug: "history.import", version: "1" }]);
  });

  test("the fence holds: an UNPINNED parser identity refuses discovery-derived re-verification (fail-closed genealogy)", async () => {
    // a pin for a source with no harvested algorithm must refuse at the verify gate
    await expect(root("discovery.verify@1", {
      mapping: { bindings: [{ blueprintOp: "history.import@1", candidateId: "cand-import-generic", confidence: 1 }], satisfied: true },
      probes: [{ candidateId: "cand-import-generic", passed: true, evidence: [{ ns: "probe", id: "w1-import-fixture", rev: sseRev }] }],
      runId: "w1-import-generic",
      provider: { id: "generic", parserPins: [{ providerId: "generic", archetypeSlug: "history.import", version: "1" }] },
    })).rejects.toThrow();
    // and the in-memory parser side refuses the same identity (double fence)
    expect(() => resolveImportParser("generic", "1")).toThrow(/no import parser for source/);
    expect(LLM_PARSERS["1"]!.version).toBe("1");
  });
});
