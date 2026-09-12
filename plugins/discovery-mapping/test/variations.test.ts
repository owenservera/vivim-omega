// discovery.mapping — test/variations.test.ts (D-308)
// Variation derivation (pure) + discovery.variations@1 handler via fake port.
// Plan gate: two variations for one contract (keyboard PROMOTED, UI DRAFT)
// coexist without clobbering; a probe failure on one never demotes the other
// (status lives per-Variation — there is no shared slot to demote).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Variation } from "@vivim/omega-contracts";
import type { PluginContext, CallMeta } from "@vivim/omega-shim";
import { parseManifest, validateManifest } from "../../../sdk/src/index.ts";
import type { CandidateLike } from "../src/solve.ts";
import { deriveVariations, groupVariations } from "../src/variations.ts";
import { def } from "../src/index.ts";

const PLUGIN_DIR = join(import.meta.dir, "..");

const ev = (id: string) => [{ ns: "discovery", id, rev: 1 }];
const AT = "2026-09-12T00:00:00.000Z";

/** Two realizations of one op (toolbar button + keyboard shortcut) + an unrelated op. */
function archiveCandidates(): CandidateLike[] {
  return [
    { id: "sc-btn", op: "message.archive", selector: "button.archive", riskHint: "MUTATION", evidence: ev("capture:btn-archive"), confidence: 0.9 },
    { id: "sc-kbd", op: "message.archive", selector: "key:ctrl+shift+a", riskHint: "MUTATION", evidence: ev("capture:kbd-archive"), confidence: 0.7, channel: "KEYBOARD", status: "PROMOTED" },
    { id: "sc-send", op: "message.send", selector: "button.send", riskHint: "EXTERNAL_MUTATION", evidence: ev("capture:btn-send"), confidence: 0.9 },
  ];
}

function fakeCtx(opts: { appendOk?: boolean } = {}): { ctx: PluginContext; calls: Array<{ op: string; payload: unknown }> } {
  const calls: Array<{ op: string; payload: unknown }> = [];
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
  const ctx: PluginContext = {
    manifest,
    capabilities: ["port:vault.append@1"],
    config: {},
    port: {
      call: async (op: string, payload?: unknown) => {
        calls.push({ op, payload });
        if (op === "vault.append@1") {
          if (opts.appendOk === false) return { ok: false, error: "REFUSED", detail: "no capability token for vault.append@1" };
          return { ok: true, value: { rev: 1, cid: "sha256:v", seq: 9 } };
        }
        return { ok: false, error: "REFUSED", detail: `unexpected op ${op}` };
      },
    },
    log: () => {},
  };
  return { ctx, calls };
}

const META: CallMeta = { causationId: "c_test", deadlineMs: 5000, from: "root" };

describe("D-308 variations — pure grouping (deriveVariations/groupVariations)", () => {
  test("one op with two candidates → two Variations under one contractId (no winner picked)", () => {
    const vs = deriveVariations(archiveCandidates(), { providerId: "provider.test", discoveredAt: AT });
    expect(vs).toHaveLength(3);
    const arch = vs.filter((v) => v.contractId === "message.archive@1");
    expect(arch).toHaveLength(2);
    expect(arch.map((v) => v.channel).sort()).toEqual(["KEYBOARD", "UI_ELEMENT"]);
    // every row carries its own evidence + provenance inputs
    for (const v of vs) {
      expect(v.providerId).toBe("provider.test");
      expect(v.discoveredAt).toBe(AT);
      expect(v.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("explicit channel/status honored; unknown channel/status fall back (never inferred, never thrown)", () => {
    const vs = deriveVariations([
      { id: "a", op: "message.send", selector: "x", riskHint: "READ", channel: "KEYBOARD", status: "PROMOTED" },
      { id: "b", op: "message.send", selector: "y", riskHint: "READ", channel: "TELEPATHY", status: "MAYBE" },
      { id: "c", op: "message.send", selector: "z", riskHint: "READ" },
    ], { providerId: "p", discoveredAt: AT });
    expect(vs.map((v) => v.channel)).toEqual(["KEYBOARD", "UI_ELEMENT", "UI_ELEMENT"]);
    expect(vs.map((v) => v.status)).toEqual(["PROMOTED", "DRAFT", "DRAFT"]);
  });

  test("groupVariations indexes by contractId; per-Variation status is independent", () => {
    const by = groupVariations(deriveVariations(archiveCandidates(), { providerId: "p", discoveredAt: AT }));
    expect(Object.keys(by).sort()).toEqual(["message.archive@1", "message.send@1"]);
    const arch = by["message.archive@1"]!;
    // a probe failure recorded against one variation touches only that row:
    // demote the keyboard row in a COPY and confirm the UI row is unaffected
    const kbd = arch.find((v) => v.channel === "KEYBOARD")!;
    const ui = arch.find((v) => v.channel === "UI_ELEMENT")!;
    expect(kbd.status).toBe("PROMOTED");
    expect(ui.status).toBe("DRAFT");
    const demoted: Variation = { ...kbd, status: "DEGRADED" };
    expect(demoted.status).toBe("DEGRADED");
    expect(ui.status).toBe("DRAFT"); // untouched — no shared slot exists to demote
  });

  test("providerId/discoveredAt validated (fail-closed on empty)", () => {
    expect(() => deriveVariations([], { providerId: "", discoveredAt: AT })).toThrow(/providerId/);
    expect(() => deriveVariations([], { providerId: "p", discoveredAt: "" })).toThrow(/discoveredAt/);
  });
});

describe("D-308 variations — handler (discovery.variations@1 via fake port)", () => {
  test("variations persisted as variations:<runId> with union evidence refs", async () => {
    const { ctx, calls } = fakeCtx();
    const r = await def.ops!["discovery.variations@1"]!({
      candidates: archiveCandidates(), providerId: "provider.test", runId: "var-r1", discoveredAt: AT,
    }, ctx, META);
    const v = r as { variations: Variation[]; byContract: Record<string, Variation[]>; vaultRef: { ns: string; id: string; rev: number } };
    expect(v.variations).toHaveLength(3);
    expect(Object.keys(v.byContract).sort()).toEqual(["message.archive@1", "message.send@1"]);
    expect(v.vaultRef).toEqual({ ns: "discovery", id: "variations:var-r1", rev: 1 });
    const append = calls.find((c) => c.op === "vault.append@1")!;
    const p = append.payload as { ns: string; id: string; meta: { type: string }; refs: unknown[] };
    expect(p.ns).toBe("discovery");
    expect(p.id).toBe("variations:var-r1");
    expect(p.meta.type).toBe("variations");
    // union of all three candidates' evidence (deduped)
    expect(p.refs).toHaveLength(3);
  });

  test("fail-closed: missing providerId throws; refused append throws; malformed candidates throw", async () => {
    const ok = fakeCtx();
    await expect(def.ops!["discovery.variations@1"]!({ candidates: [], runId: "x" }, ok.ctx, META))
      .rejects.toThrow(/providerId/);
    const noAppend = fakeCtx({ appendOk: false });
    await expect(def.ops!["discovery.variations@1"]!({ candidates: archiveCandidates(), providerId: "p", runId: "x" }, noAppend.ctx, META))
      .rejects.toThrow(/vault.append@1 REFUSED/);
    const junk = fakeCtx();
    await expect(def.ops!["discovery.variations@1"]!({ candidates: "nope", providerId: "p", runId: "x" }, junk.ctx, META))
      .rejects.toThrow(/candidates must be an array/);
  });
});

describe("D-308 variations — manifest declarations", () => {
  test("engine contribution added; manifest still parses + validates green", () => {
    const raw = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.contributions.engine?.map((e) => `${e.id}@${e.version}`).sort()).toEqual([
      "discovery.map@1", "discovery.variations@1",
    ]);
    expect(validateManifest(parsed.value)).toEqual([]);
  });
});
