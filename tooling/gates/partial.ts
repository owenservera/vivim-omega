// tooling/gates/partial.ts — D-440 (Ω-10 port of paper D-442): the Partial-Turn Ledger.
//
// Every initiated turn is a span: turn.init before the first provider token,
// turn.finalize at death for any reason. Five terminal states, orphan reclaim
// on boot, tagged fragments, sealed resumption anchors, mid-stream law kills
// with zeroed payloads. Pure library (no Bun/OS/DOM imports — headless).
// Falsifier: F-PARTIAL (`tooling/gates/test/f-partial.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export type Terminal = "COMPLETED" | "ABORTED_USER" | "ABORTED_GOV" | "FAILED_PROVIDER" | "REFUSED_MID";
export interface TurnInit { hash: string; ctxSeal: string; budget: number; realization: string; principal: string; at: number; }
export interface TurnFinalize {
  initHash: string;
  tokens: number;
  state: Terminal;
  textHash: string;
  payload: string;
  resumptionAnchor: string | null;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type PartialResult<T> = { ok: true; value: T } | Refusal;

/** turn.init — vault row before the first token; vault failure refuses the turn. */
export function initTurn(input: {
  ctxSeal: string;
  budget: number;
  realization: string;
  principal: string;
  at: number;
  vaultWritable: boolean;
}): PartialResult<TurnInit> {
  if (!input.vaultWritable) {
    return { ok: false, code: "PARTIAL_NO_INIT", sentence: "The vault would not take the turn's first row, so the turn is refused before it begins." };
  }
  const hash = hash53(`init|${input.ctxSeal}|${input.at}|${input.principal}`);
  return { ok: true, value: { hash, ctxSeal: input.ctxSeal, budget: input.budget, realization: input.realization, principal: input.principal, at: input.at } };
}

const TAG: Record<Terminal, string> = {
  COMPLETED: "clean",
  ABORTED_USER: "USER_ABORTED",
  ABORTED_GOV: "BUDGET_EXHAUSTED",
  FAILED_PROVIDER: "PROVIDER_FAILED",
  REFUSED_MID: "LAW_REFUSED_MID",
};

/** turn.finalize — seals the span; REFUSED_MID zeroes the payload. */
export function finalizeTurn(init: TurnInit, input: {
  tokens: number;
  state: Terminal;
  text: string;
}): TurnFinalize {
  const payload = input.state === "REFUSED_MID" ? "" : input.text;
  return {
    initHash: init.hash,
    tokens: input.tokens,
    state: input.state,
    textHash: hash53(payload),
    payload,
    resumptionAnchor:
      input.state === "ABORTED_GOV" || input.state === "FAILED_PROVIDER"
        ? hash53(`anchor|${init.hash}|${input.tokens}`)
        : null,
  };
}

/** Budget settlement per terminal state. */
export function settleBudget(init: TurnInit, fin: TurnFinalize, perToken: number): { spent: number; reclaimed: number } {
  const spent = fin.tokens * perToken;
  if (fin.state === "ABORTED_GOV") return { spent: init.budget, reclaimed: 0 };
  return { spent, reclaimed: Math.max(0, init.budget - spent) };
}

/** Context tag for the next turn's assembly: fragments never present as clean. */
export function tagFragment(fin: TurnFinalize): string {
  if (fin.state === "COMPLETED") return fin.payload;
  return `<partial_turn status="${fin.state}" tokens="${fin.tokens}">[${TAG[fin.state]}]${fin.payload}</partial_turn>`;
}

/** Boot scan: inits without finalizes become ORPHANED with full reclaim. */
export function reclaimOrphans(inits: TurnInit[], finals: TurnFinalize[]): { orphaned: string[]; reclaimed: number } {
  const closed = new Set(finals.map((f) => f.initHash));
  const orphans = inits.filter((i) => !closed.has(i.hash));
  return { orphaned: orphans.map((o) => o.hash), reclaimed: orphans.reduce((n, o) => n + o.budget, 0) };
}

/** turn.resume — explicit re-invocation against the exact anchor. */
export function resumeTurn(fin: TurnFinalize, anchor: string): PartialResult<{ initRef: string }> {
  if (!fin.resumptionAnchor || fin.resumptionAnchor !== anchor) {
    return { ok: false, code: "PARTIAL_BAD_ANCHOR", sentence: "That resumption anchor does not match the death it claims. Re-seal from the ledger, don't guess." };
  }
  return { ok: true, value: { initRef: `resume:${fin.initHash}` } };
}
