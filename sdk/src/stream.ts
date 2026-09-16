// @vivim/omega-sdk — stream.ts (D-339 / D-352)
// The consumer half of the additive streaming primitive: an ordered,
// sequence-checked AsyncGenerator in front of the host's callAsRootStream.
// Lives here (not in the host) because it is end-user machinery — the host's
// only surface is the call shape itself (D-329 placement law).
//
// Discipline (the terminating PortResult is ALWAYS authoritative):
//  - chunks are checked with the contracts' pure sequence rule (1-based,
//    contiguous — vault-rev discipline); a violation throws mid-iteration
//    (fail-closed, never a silently reordered consumer view);
//  - the generator ends after the `final` chunk, or — when the call settles
//    first (BUDGET / REFUSED / DEGRADED / a handler that never closed) —
//    after draining whatever ordered prefix arrived (drain-then-stop).
import type { PortResult, StreamChunk } from "@vivim/omega-contracts";
import { checkStreamSeq } from "@vivim/omega-contracts";

/** The minimal router surface streaming needs — satisfied by the real µhost
 *  router and by the testkit's FakeHost (differential mirror). */
export interface StreamRouter {
  callAsRootStream(
    op: string,
    payload: unknown,
    onChunk: (c: StreamChunk) => void,
    deadlineMs?: number,
  ): Promise<{ streamId: string; result: PortResult }>;
}

export interface StreamCallOptions {
  deadlineMs?: number;
  /** Synchronous tap for UI consumers; receives every chunk the generator will. */
  onChunk?: (c: StreamChunk) => void;
  /** D-369: fail-closed bound on buffered chunks (producer flood guard). */
  maxBufferedChunks?: number;
}

export interface StreamCall {
  /** Resolves to the delivering call's causation id (one stream per call). */
  streamId: Promise<string>;
  /** The terminating outcome — authoritative over the chunks, always. */
  result: Promise<PortResult>;
  /** Ordered, sequence-checked partials (drain-then-stop at settlement). */
  chunks: AsyncGenerator<StreamChunk, void, unknown>;
}

export function streamRootCall(router: StreamRouter, op: string, payload: unknown, opts: StreamCallOptions = {}): StreamCall {
  const queue: StreamChunk[] = [];
  const maxBuffered = opts.maxBufferedChunks ?? 1000;
  let settled: PortResult | null = null;
  let wakeup: (() => void) | null = null;
  const wake = () => { const w = wakeup; wakeup = null; w?.(); };
  const push = (c: StreamChunk) => {
    opts.onChunk?.(c);
    queue.push(c);
    if (queue.length > maxBuffered) throw new Error(`stream buffer overflow (${queue.length} > ${maxBuffered}) — producer flood, fail-closed`);
    wake();
  };

  const routed = router.callAsRootStream(op, payload, push, opts.deadlineMs);
  const streamId = routed.then((r) => r.streamId);
  const result = routed.then((r) => { settled = r.result; wake(); return r.result; });
  void result.catch(() => {}); // a consumer that ignores the result must not crash the process

  async function* chunks(): AsyncGenerator<StreamChunk, void, unknown> {
    let prev = 0;
    for (;;) {
      if (queue.length > 0) {
        const c = queue.shift()!;
        const violation = checkStreamSeq(prev, c);
        if (violation) throw new Error(`stream ${c.streamId}: ${violation}`);
        prev = c.seq;
        yield c;
        if (c.final) return;
        continue;
      }
      if (settled !== null) return; // settled ⇒ nothing more can arrive — the drain above was the tail
      await new Promise<void>((r) => { wakeup = r; });
    }
  }

  return { streamId, result, chunks: chunks() };
}
