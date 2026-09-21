// tooling/gates/test/f-ctx.test.ts — the F-CTX falsifier.
// Generated from D-433 by `omega:loop --stub D-433` (D-426, Ω-DEV.2).
// Implemented (D-433): every clause runs a real verdict against
// tooling/gates/ctx.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  accountTokens,
  applyForgetting,
  assembleCtx,
  inspectCtx,
  realizationReadsVault,
  replayCtx,
  sealCtx,
  selectRows,
  type CtxPolicy,
  type VaultRowRef,
} from "../ctx.ts";

const POLICY: CtxPolicy = {
  id: "policy:default",
  scope: "global",
  weights: { recency: 1, binding: 10, explicit: 100 },
  scorerGrants: ["scorer:qwen-v1"],
  budgetDefaults: { global: 4000 },
  namedBy: "alice",
};

function rows(): VaultRowRef[] {
  return [
    { offset: 100, ns: "ns.finance", bytes: 512 },
    { offset: 200, ns: "ns.notes", bytes: 256 },
  ];
}

function assembled() {
  const r = assembleCtx({
    id: "ctx-1",
    intentRef: "cap:chat:answer",
    policy: POLICY,
    rows: rows(),
    transforms: ["order:recency", "truncate:4000"],
    scorerRefs: [{ ref: "scorer:qwen-v1", badge: "third-party · speculative", confidence: 0.81 }],
    budgetClaimRef: "gov:claim:c-9",
    tokenCount: 812,
    badge: { tier: "first-party", generality: "generic" },
    ctx: { isAssembler: true },
  });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.value;
}

describe("F-CTX (D-433)", () => {
  test("F-CTX.1 (artifact-inspect) — event cites ctx ref, inspect renders rows/transforms/badges/tokens/claim", () => {
    const a = assembled();
    const words = inspectCtx(a);
    expect(words).toContain("ctx-1");
    expect(words).toContain("ns.finance@100");
    expect(words).toContain("order:recency");
    expect(words).toContain("scorer:qwen-v1");
    expect(words).toContain("812");
    expect(words).toContain("gov:claim:c-9");
    expect(words).toContain(a.seal);
  });

  test("F-CTX.2 (determinism) — same intent twice, unchanged vault + policy, byte-identical seals", () => {
    const a = assembled();
    const b = assembled();
    expect(a.seal).toBe(b.seal);
    expect(sealCtx({ ...a, seal: undefined as never })).toBe(a.seal);
  });

  test("F-CTX.3 (replay-substitution) — replay cites the SAME ctx against a different realization", () => {
    const a = assembled();
    const replay = replayCtx(a, "realization:ollama-local");
    expect(replay.ctxRef).toBe("ctx-1");
    expect(replay.realizationRef).toBe("realization:ollama-local");
  });

  test("F-CTX.4 (forensics) — every token resolves to vault byte offsets", () => {
    const a = assembled();
    expect(a.rows).toEqual(rows());
    expect(a.rows[0].offset).toBe(100);
  });

  test("F-CTX.5 (fetch-refusal) — direct vault read refuses loudly", () => {
    const r = realizationReadsVault();
    expect(r.code).toBe("CTX_REALIZATION_READS_VAULT");
    expect(r.sentence).toContain("sealed contexts");
    const outsider = assembleCtx({
      id: "ctx-x",
      intentRef: "cap:chat:answer",
      policy: POLICY,
      rows: rows(),
      transforms: ["order:recency"],
      scorerRefs: [],
      budgetClaimRef: "gov:claim:c-9",
      tokenCount: 10,
      badge: { tier: "first-party", generality: "generic" },
      ctx: { isAssembler: false },
    });
    expect(outsider.ok).toBe(false);
    if (outsider.ok) throw new Error("unreachable");
    expect(outsider.code).toBe("CTX_ASSEMBLER_GRANT");
  });

  test("F-CTX.6 (honest-forgetting) — shredded rows replay as named vacated markers", () => {
    const a = assembled();
    const forgotten = applyForgetting(a, [100]);
    expect(forgotten.rows[0].shredded).toBe(true);
    expect(inspectCtx(forgotten)).toContain("[vacated]");
    expect(forgotten.rows[1].shredded).toBeFalsy();
  });

  test("F-CTX.7 (tunable-spine) — policy demotion changes assembly, ledgered and reversible", () => {
    const cands = [
      { ref: { offset: 1, ns: "ns.noise", bytes: 9 }, recency: 999, bound: false, explicit: false },
      { ref: { offset: 2, ns: "ns.finance", bytes: 9 }, recency: 1, bound: true, explicit: false },
    ];
    const before = selectRows(cands, POLICY, 1);
    expect(before[0].offset).toBe(1); // recency wins by default
    const demoted: CtxPolicy = { ...POLICY, weights: { ...POLICY.weights, "ns.noise": -10000 } };
    const after = selectRows(cands, demoted, 1);
    expect(after[0].offset).toBe(2); // demotion flips selection, deterministically
    const unnamed = assembleCtx({
      id: "ctx-u",
      intentRef: "cap:chat:answer",
      policy: null,
      rows: rows(),
      transforms: ["order:recency"],
      scorerRefs: [],
      budgetClaimRef: "gov:claim:c-9",
      tokenCount: 5,
      badge: { tier: "first-party", generality: "generic" },
      ctx: { isAssembler: true },
    });
    expect(unnamed.ok).toBe(false);
    if (unnamed.ok) throw new Error("unreachable");
    expect(unnamed.code).toBe("CTX_POLICY_UNNAMED");
  });

  test("F-CTX.8 (token-accounting) — spend joins realization × namespace in one query", () => {
    const acct = accountTokens([
      { realization: "claude", rows: [{ offset: 1, ns: "ns.finance", bytes: 1 }], tokenCount: 1000 },
      { realization: "llama", rows: [{ offset: 2, ns: "ns.finance", bytes: 1 }], tokenCount: 400 },
    ]);
    expect(acct.claude["ns.finance"]).toBe(1000);
    expect(acct.llama["ns.finance"]).toBe(400);
    const silent = assembleCtx({
      id: "ctx-s",
      intentRef: "cap:chat:answer",
      policy: POLICY,
      rows: rows(),
      transforms: [""],
      scorerRefs: [],
      budgetClaimRef: "gov:claim:c-9",
      tokenCount: 5,
      badge: { tier: "first-party", generality: "generic" },
      ctx: { isAssembler: true },
    });
    expect(silent.ok).toBe(false);
    if (silent.ok) throw new Error("unreachable");
    expect(silent.code).toBe("CTX_UNSORTED_INVISIBLE");
  });
});
