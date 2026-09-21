// tooling/gates/test/f-standing.test.ts — the F-STANDING falsifier.
// Generated from D-443 by `omega:loop --stub D-443` (D-426, Ω-DEV.2).
// Implemented (D-443): every clause runs a real verdict against
// tooling/gates/standing.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  armByRealization,
  cascadePause,
  expireProposal,
  proposeWatch,
  ratifyProposal,
  renderProposal,
} from "../standing.ts";

describe("F-STANDING (D-443)", () => {
  test("F-STANDING.1 (direct-arm-refused) — model watch.arm refuses, nothing created", () => {
    const r = armByRealization();
    expect(r.code).toBe("WATCH_ARM_BY_REALIZATION");
    expect(r.sentence).toContain("watch.propose");
    const thin = proposeWatch({ definition: "", retention: "", proposedBy: "llm-x", proposerBadge: "speculative", at: 1 });
    expect(thin.ok).toBe(false);
  });

  test("F-STANDING.2 (proposal-flow) — valid propose mints ephemeral, renders badge, arms nothing", () => {
    const p = proposeWatch({
      definition: "ns.inbox new mail from @client.com",
      retention: "watch-90d",
      proposedBy: "llm-frontier-v4",
      proposerBadge: "third-party · speculative",
      at: 1000,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) throw new Error("unreachable");
    expect(p.value.state).toBe("ephemeral");
    expect(renderProposal(p.value, "Frontier LLM v4")).toContain("speculative");
  });

  test("F-STANDING.3 (ratification) — approve stamps custody, tombstones, creates the row", () => {
    const p = proposeWatch({
      definition: "ns.inbox @client.com",
      retention: "watch-90d",
      proposedBy: "llm-x",
      proposerBadge: "speculative",
      at: 1000,
    });
    if (!p.ok) throw new Error("unreachable");
    const r = ratifyProposal(p.value, "alice", "sig-1");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.watch.ratifiedBy).toContain("alice");
    expect(r.value.watch.proposedBy).toBe("llm-x");
    expect(r.value.watch.proposalRef).toBe(p.value.hash);
    const dead = expireProposal(p.value, 1000 + 25 * 3600 * 1000, 24 * 3600 * 1000);
    expect(dead.state).toBe("expired");
    const late = ratifyProposal(dead, "alice", "sig-1");
    expect(late.ok).toBe(false);
  });

  test("F-STANDING.4 (cascade-pause) — grant revoke pauses proposed watches with review", () => {
    const p = proposeWatch({ definition: "d", retention: "r", proposedBy: "llm-x", proposerBadge: "s", at: 1 });
    if (!p.ok) throw new Error("unreachable");
    const r = ratifyProposal(p.value, "alice", "sig-1");
    if (!r.ok) throw new Error("unreachable");
    const { paused, notice } = cascadePause([r.value.watch], "llm-x");
    expect(paused[0].state).toBe("paused_pending_review");
    expect(notice).toContain("paused pending your review");
  });
});
