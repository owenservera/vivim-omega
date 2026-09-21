// tooling/gates/test/f-partial.test.ts — the F-PARTIAL falsifier.
// Generated from D-440 by `omega:loop --stub D-440` (D-426, Ω-DEV.2).
// Implemented (D-440): every clause runs a real verdict against
// tooling/gates/partial.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  finalizeTurn,
  initTurn,
  reclaimOrphans,
  resumeTurn,
  settleBudget,
  tagFragment,
} from "../partial.ts";

describe("F-PARTIAL (D-440)", () => {
  test("F-PARTIAL.1 (network-sever) — severed stream ledgers FAILED_PROVIDER, reclaims, tags", () => {
    const init = initTurn({ ctxSeal: "ctx:abc", budget: 2000, realization: "claude", principal: "alice", at: 1, vaultWritable: true });
    expect(init.ok).toBe(true);
    if (!init.ok) throw new Error("unreachable");
    const fin = finalizeTurn(init.value, { tokens: 412, state: "FAILED_PROVIDER", text: "half a thought" });
    expect(fin.state).toBe("FAILED_PROVIDER");
    expect(fin.resumptionAnchor).not.toBeNull();
    const settle = settleBudget(init.value, fin, 1);
    expect(settle.reclaimed).toBe(2000 - 412);
    expect(tagFragment(fin)).toContain("[PROVIDER_FAILED]");
  });

  test("F-PARTIAL.2 (governor-ceiling) — 50-token cap cuts 500-token asks with ABORTED_GOV + resume", () => {
    const init = initTurn({ ctxSeal: "ctx:e", budget: 50, realization: "local", principal: "alice", at: 2, vaultWritable: true });
    if (!init.ok) throw new Error("unreachable");
    const fin = finalizeTurn(init.value, { tokens: 50, state: "ABORTED_GOV", text: "cut short" });
    const settle = settleBudget(init.value, fin, 1);
    expect(settle).toEqual({ spent: 50, reclaimed: 0 });
    const resume = resumeTurn(fin, fin.resumptionAnchor!);
    expect(resume.ok).toBe(true);
    const badAnchor = resumeTurn(fin, "guess");
    expect(badAnchor.ok).toBe(false);
  });

  test("F-PARTIAL.3 (midstream-kill) — banned output dies at match, payload zeroed", () => {
    const init = initTurn({ ctxSeal: "ctx:k", budget: 500, realization: "x", principal: "alice", at: 3, vaultWritable: true });
    if (!init.ok) throw new Error("unreachable");
    const fin = finalizeTurn(init.value, { tokens: 12, state: "REFUSED_MID", text: "sk-SECRET-KEY" });
    expect(fin.payload).toBe(""); // zeroed — never readable in the vault
    expect(tagFragment(fin)).toContain("[LAW_REFUSED_MID]");
    const refused = initTurn({ ctxSeal: "c", budget: 1, realization: "x", principal: "a", at: 4, vaultWritable: false });
    expect(refused.ok).toBe(false); // no init row, no turn
  });

  test("F-PARTIAL.4 (crash-reclaim) — killed kernel reboots to ORPHANED with full reclaim", () => {
    const a = initTurn({ ctxSeal: "c1", budget: 300, realization: "x", principal: "a", at: 5, vaultWritable: true });
    const b = initTurn({ ctxSeal: "c2", budget: 700, realization: "x", principal: "a", at: 6, vaultWritable: true });
    if (!a.ok || !b.ok) throw new Error("unreachable");
    const finB = finalizeTurn(b.value, { tokens: 700, state: "COMPLETED", text: "done" });
    const { orphaned, reclaimed } = reclaimOrphans([a.value, b.value], [finB]);
    expect(orphaned).toEqual([a.value.hash]); // every death has finalize-or-reclaim
    expect(reclaimed).toBe(300);
  });
});
