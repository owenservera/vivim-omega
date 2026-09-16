// D-352 — THE D-339 falsifier: ordered chunk delivery proven end-to-end on a
// REAL boot of the shipped demo composition (worker-thread compartments, the
// real shim emit, the real host relay) before any provider touches the
// primitive. Lives in sdk because the falsifier is end-to-end and the
// dependency direction is sdk → host; it exercises exactly the surfaces the
// D-339 record ratified: additive port.stream with cold fallback, sequence
// discipline, BUDGET mid-stream, fail-closed producer violations.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { StreamChunk } from "@vivim/omega-contracts";
import { streamRootCall } from "../src/stream.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const ROOT = join(import.meta.dir, "../..");
const SPEC = join(ROOT, "compositions/demo.json");
// E-9: run-unique dir — fixed names collide across concurrent gates on one box.
const VAULT = omegaTmp("omega-sdk-stream-falsifier", `run-${Date.now()}-${process.pid}`);

let host: BootedHost;

beforeAll(async () => {
  rmSync(VAULT, { recursive: true, force: true });
  const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
  const { rootKey } = ensureVault(VAULT);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), VAULT, rootKey);
  host = await bootComposition(recipe, buildDir, VAULT);
});

afterAll(async () => {
  await host?.shutdown();
  rmSync(VAULT, { recursive: true, force: true });
});

type StreamCall = ReturnType<typeof streamRootCall>;

async function collect(call: StreamCall): Promise<{ chunks: StreamChunk[]; streamId: string; result: Awaited<StreamCall["result"]> }> {
  const chunks: StreamChunk[] = [];
  for await (const c of call.chunks) chunks.push(c);
  const result = await call.result;
  return { chunks, streamId: await call.streamId, result };
}

describe("D-352 falsifier — echo.stream@1 on a real boot (demo composition)", () => {
  test("ordered chunks end-to-end: seq 1..n contiguous, last final, result authoritative ok", async () => {
    const { chunks, streamId, result } = await collect(streamRootCall(host.router, "echo.stream@1", { chunks: ["alpha", "beta", "gamma"] }));
    expect(chunks.map((c) => c.data)).toEqual(["alpha", "beta", "gamma"]);
    expect(chunks.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(chunks.map((c) => c.final)).toEqual([false, false, true]);
    expect(chunks.every((c) => c.streamId === streamId)).toBe(true); // the stream id IS the delivering call's causation id
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as { streamed: number }).streamed).toBe(3);
  });

  test("cold fallback: plain callAsRoot observes no chunks and still gets the terminating value", async () => {
    const r = await host.router.callAsRoot("echo.stream@1", { chunks: ["c1", "c2", "c3", "c4"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { streamed: number }).streamed).toBe(4); // the handler emitted; nobody was watching — additive law held
  });

  test("empty stream: zero chunks, clean ok", async () => {
    const { chunks, result } = await collect(streamRootCall(host.router, "echo.stream@1", { chunks: [] }));
    expect(chunks).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("BUDGET mid-stream: the ordered prefix survives, the tail is dropped, BUDGET is the outcome", async () => {
    const call = streamRootCall(host.router, "echo.stream@1", { chunks: ["p1", "p2", "p3", "p4"], stallAfter: 2, stallMs: 750 }, { deadlineMs: 120 });
    const chunks: StreamChunk[] = [];
    for await (const c of call.chunks) chunks.push(c);
    expect(chunks.map((c) => c.data)).toEqual(["p1", "p2"]); // drain-then-stop handed over exactly the ordered prefix
    const result = await call.result;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BUDGET");
  }, 10_000);

  test("violateAfterFinal → DEGRADED: a protocol-violating stream never masquerades as ok", async () => {
    const { result } = await collect(streamRootCall(host.router, "echo.stream@1", { chunks: ["x"], violateAfterFinal: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DEGRADED");
  });

  test("interleaved independent streams: each ordered, distinct stream ids, both settle ok", async () => {
    const [a, b] = await Promise.all([
      collect(streamRootCall(host.router, "echo.stream@1", { chunks: ["a1", "a2", "a3"] })),
      collect(streamRootCall(host.router, "echo.stream@1", { chunks: ["b1", "b2"] })),
    ]);
    expect(a.chunks.map((c) => c.data)).toEqual(["a1", "a2", "a3"]);
    expect(b.chunks.map((c) => c.data)).toEqual(["b1", "b2"]);
    expect(a.streamId).not.toBe(b.streamId);
    expect(a.chunks.every((c) => c.streamId === a.streamId)).toBe(true);
    expect(b.chunks.every((c) => c.streamId === b.streamId)).toBe(true);
    expect(a.result.ok && b.result.ok).toBe(true);
  });
});
