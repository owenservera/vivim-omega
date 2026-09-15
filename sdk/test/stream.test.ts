// D-352 unit evidence — the pure half of the streaming primitive: the
// contracts' sequence rule and the sdk generator's discipline (ordered,
// final-ends, drain-then-stop on failing settlement). No boot here — the
// REAL-boot falsifier lives in stream-boot.test.ts; this file pins the laws
// the boot test exercises, in table form, cheaply.
import { describe, test, expect } from "bun:test";
import { checkStreamSeq, STREAM_SEQ_START, type StreamChunk } from "@vivim/omega-contracts";
import { streamRootCall, type StreamRouter } from "../src/stream.ts";

const chunk = (seq: number, data: unknown, final = false): StreamChunk => ({ streamId: "s", seq, data, final });

describe("D-352 contracts — checkStreamSeq (vault-rev discipline for streams)", () => {
  test("legal progress: starts at STREAM_SEQ_START, contiguous", () => {
    expect(STREAM_SEQ_START).toBe(1);
    expect(checkStreamSeq(0, chunk(1, "a"))).toBeNull();
    expect(checkStreamSeq(1, chunk(2, "b"))).toBeNull();
    expect(checkStreamSeq(41, chunk(42, "x", true))).toBeNull();
  });

  test("violations: gaps, duplicates, zero-start, negatives, non-integers — each named", () => {
    expect(checkStreamSeq(1, chunk(3, "skip"))).toMatch(/breaks contiguous order \(expected 2\)/);
    expect(checkStreamSeq(1, chunk(1, "dup"))).toMatch(/breaks contiguous order \(expected 2\)/);
    expect(checkStreamSeq(0, chunk(0, "zero"))).toMatch(/precedes the stream start/);
    expect(checkStreamSeq(0, chunk(-1, "neg"))).toMatch(/precedes the stream start/);
    expect(checkStreamSeq(0, chunk(1.5, "frac"))).toMatch(/not an integer/);
    expect(checkStreamSeq(0, chunk(NaN, "nan"))).toMatch(/not an integer/);
  });
});

// A scripted router: pushes pre-set chunks through the sink, then settles.
function scriptedRouter(chunks: StreamChunk[], result: { ok: true; value: unknown } | { ok: false; error: string; detail?: string }, settleAfterMs = 0): StreamRouter & { pushed: StreamChunk[] } {
  return {
    pushed: [],
    async callAsRootStream(_op, _payload, onChunk) {
      for (const c of chunks) { onChunk(c); this.pushed.push(c); }
      if (settleAfterMs > 0) await new Promise((r) => setTimeout(r, settleAfterMs));
      return { streamId: "s", result } as never;
    },
  };
}

describe("D-352 sdk — streamRootCall generator discipline", () => {
  test("ordered delivery, final ends the stream, tap receives the same chunks", async () => {
    const router = scriptedRouter([chunk(1, "a"), chunk(2, "b", true)], { ok: true, value: { streamed: 2 } });
    const tapped: string[] = [];
    const call = streamRootCall(router, "fx.stream@1", {}, { onChunk: (c) => tapped.push(String(c.data)) });
    const got: StreamChunk[] = [];
    for await (const c of call.chunks) got.push(c);
    expect(got.map((c) => c.data)).toEqual(["a", "b"]);
    expect(got.map((c) => c.seq)).toEqual([1, 2]);
    expect(got[got.length - 1]!.final).toBe(true);
    expect(tapped).toEqual(["a", "b"]); // the tap saw exactly what the generator yielded
    expect(await call.streamId).toBe("s");
    const r = await call.result;
    expect(r.ok).toBe(true);
  });

  test("drain-then-stop: a failing settlement yields the ordered prefix, then ends", async () => {
    const router = scriptedRouter([chunk(1, "p1"), chunk(2, "p2")], { ok: false, error: "BUDGET", detail: "deadline exceeded" });
    const call = streamRootCall(router, "fx.stream@1", {});
    const got: StreamChunk[] = [];
    for await (const c of call.chunks) got.push(c);
    expect(got.map((c) => c.data)).toEqual(["p1", "p2"]); // the prefix, in order
    const r = await call.result;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("BUDGET"); // the terminating result stays authoritative
  });

  test("settlement before any chunk: generator ends empty (no hang)", async () => {
    const router = scriptedRouter([], { ok: true, value: null });
    const call = streamRootCall(router, "fx.stream@1", {});
    const got: StreamChunk[] = [];
    for await (const c of call.chunks) got.push(c);
    expect(got).toEqual([]);
    expect((await call.result).ok).toBe(true);
  });

  test("a gap in the delivered chunks throws mid-iteration — never silent reordering", async () => {
    const router = scriptedRouter([chunk(1, "a"), chunk(3, "gap")], { ok: true, value: null });
    const call = streamRootCall(router, "fx.stream@1", {});
    const got: StreamChunk[] = [];
    await expect(async () => { for await (const c of call.chunks) got.push(c); }).toThrow(/breaks contiguous order/);
    expect(got.map((c) => c.seq)).toEqual([1]); // the legal prefix was yielded before the violation
  });

  test("chunks arriving AFTER settlement are still drained, in order (async settle)", async () => {
    // The real host relays chunks before the return resolves; a scripted router
    // that settles first and pushes later still drains — same observable law.
    let sink: ((c: StreamChunk) => void) | null = null;
    const router: StreamRouter = {
      async callAsRootStream(_op, _payload, onChunk) {
        sink = onChunk;
        await new Promise((r) => setTimeout(r, 20));
        onChunk(chunk(1, "late-1"));
        onChunk(chunk(2, "late-2", true));
        return { streamId: "s", result: { ok: true, value: null } } as never;
      },
    };
    const call = streamRootCall(router, "fx.stream@1", {});
    const got: string[] = [];
    for await (const c of call.chunks) got.push(String(c.data));
    expect(got).toEqual(["late-1", "late-2"]);
    expect(sink).not.toBeNull();
  });
});
