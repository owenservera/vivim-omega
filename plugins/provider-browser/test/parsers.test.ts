// plugins/provider-browser — test/parsers.test.ts (D-355/D-357 unit evidence)
// Pure parser tables: envelope discipline, determinism, fail-closed
// derivations, session record validators. The boot-level falsifier lives in
// browser-falsifier.test.ts; the M13 containment suite in
// m13-containment.test.ts.
import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildChunkEnvelope, pinMatches, asParserPin, parserContributionId,
  STREAM_SEQ_START, checkStreamSeq, type ParsedChunk,
} from "@vivim/omega-contracts";
import {
  PARSERS, PARSER_VERSION, parseCapture, deriveSendWindowFromText, resolveParser,
} from "../src/parsers.ts";
import {
  asCaptureRecord, asSessionRecord, buildCaptureRecord, buildSessionRecord, sessionId, captureId,
} from "../src/session.ts";

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const FIXTURE = readFileSync(join(OMEGA_ROOT, "fixtures/browser/session-fixture.json"), "utf-8");

// NOTE: the fixture carries DELIBERATE fake secrets (sk-fixture-…, a cookie
// sid, a URL token) — the falsifier proves they never reach the vault. This
// unit file never asserts on their values, only on redaction counts.

describe("D-355 parser registry — governed data, fail-closed resolution", () => {
  test("the manifest's parser version is the registry's version (one truth)", () => {
    const manifest = JSON.parse(readFileSync(join(OMEGA_ROOT, "plugins/provider-browser/plugin.json"), "utf-8"));
    const declared = manifest.contributions.parser?.[0]?.version;
    expect(declared).toBe(PARSER_VERSION);
    expect(Object.keys(PARSERS)).toContain(PARSER_VERSION);
  });

  test("resolveParser refuses unknown pins (a version mismatch is the point)", () => {
    expect(() => resolveParser("999")).toThrow(/no parser pinned/);
    expect(resolveParser(PARSER_VERSION).archetypeSlug).toBe("message.send");
  });

  test("parserContributionId + asParserPin + pinMatches round-trip the pin grammar", () => {
    expect(parserContributionId("browser", "message.send")).toBe("parser:message.send:browser");
    const pin = asParserPin({ providerId: "browser", archetypeSlug: "message.send", version: "1" });
    expect(pinMatches(pin, "browser", "message.send", "1")).toBe(true);
    expect(pinMatches(pin, "browser", "message.search", "1")).toBe(false);
    expect(pinMatches(pin, "browser", "message.send", "2")).toBe(false);
    expect(() => asParserPin({ providerId: "a:b", archetypeSlug: "c", version: "1" })).toThrow(/':'/);
    expect(() => asParserPin({ providerId: "a", archetypeSlug: "message.send@1", version: "1" })).toThrow(/':'|archetype/);
  });
});

describe("D-357 parser v1 — pure, deterministic, exactly-one-final", () => {
  test("the fixture parse yields ordered rows with exactly one final row at the tail", () => {
    const rows: ParsedChunk[] = resolveParser(PARSER_VERSION).transform(FIXTURE);
    expect(rows.length).toBe(3 + 4); // start + message + 4 events + done? (start, message, e1..e4, done = 7)
    expect(rows.filter((r) => r.final)).toHaveLength(1);
    expect(rows[rows.length - 1]!.final).toBe(true);
    expect(rows[0]!.data).toMatchObject({ kind: "replay.start" });
    expect(rows[1]!.data).toMatchObject({ kind: "replay.message", to: "peter@fixture.test" });
  });

  test("deterministic: same capture text ⇒ byte-identical rows", () => {
    const a = resolveParser(PARSER_VERSION).transform(FIXTURE);
    const b = resolveParser(PARSER_VERSION).transform(FIXTURE);
    expect(a).toEqual(b);
  });

  test("buildChunkEnvelope assembles M1 StreamChunks with strict seq + single final", () => {
    const rows: ParsedChunk[] = resolveParser(PARSER_VERSION).transform(FIXTURE);
    const chunks = buildChunkEnvelope("causation-1", rows);
    expect(chunks[0]!.seq).toBe(STREAM_SEQ_START);
    let prev = 0;
    for (const c of chunks) {
      expect(checkStreamSeq(prev, c)).toBeNull(); // the producer obeys the same law the shim enforces
      prev = c.seq;
    }
    expect(chunks.every((c) => c.streamId === "causation-1")).toBe(true);
  });

  test("buildChunkEnvelope throws on empty parse, non-final tail, mid-final", () => {
    expect(() => buildChunkEnvelope("s", [])).toThrow(/at least one chunk/);
    expect(() => buildChunkEnvelope("s", [{ data: 1, final: false }])).toThrow(/must be final/);
    expect(() => buildChunkEnvelope("s", [{ data: 1, final: true }, { data: 2, final: false }])).toThrow(/final but not last/);
  });

  test("parseCapture fails closed on junk captures", () => {
    expect(() => parseCapture("not json")).toThrow(/not valid JSON/);
    expect(() => parseCapture("{}")).toThrow(/capture.url/);
    expect(() => parseCapture(JSON.stringify({ url: "x", request: { method: "POST" } }))).toThrow(/capture\.request/);
    expect(() => parseCapture(JSON.stringify({ url: "x", request: { method: "POST", url: "u", body: "{}" }, response: { status: 200 } }))).toThrow(/capture\.events/);
  });

  test("deriveSendWindowFromText grounds the replay window from the recorded body; junk refuses", () => {
    const w = deriveSendWindowFromText(FIXTURE);
    expect(w).toMatchObject({ method: "POST", to: "peter@fixture.test", subject: "Quarterly report" });
    expect(() => deriveSendWindowFromText(JSON.stringify({ url: "u", request: { method: "POST", url: "u", body: "{}" }, response: { status: 200 }, events: [] }))).toThrow(/\{to, subject\}/);
  });
});

describe("D-357 session records — by reference only, fail-closed validation", () => {
  test("capture + session build and round-trip through the as* validators", () => {
    const redacted = '{"url":"x","request":{"headers":{"content-type":"application/json"}}}';
    const integrity = createHash("sha256").update(redacted, "utf-8").digest("hex");
    const cap = buildCaptureRecord({ archetypeSlug: "message.send", parserVersion: "1", redactedText: redacted, redactions: 2, integrity });
    expect(cap.integrity).toBe(integrity);
    expect(asCaptureRecord(structuredClone(cap))).toEqual(cap);

    const sess = buildSessionRecord({
      sessionId: sessionId("sess_abc"), archetypeSlug: "message.send", parserVersion: "1",
      captureRef: { ns: "providers", id: captureId("cap_abc"), rev: 1 },
    });
    expect(sess.status).toBe("ATTACHED");
    expect(sess.sim).toBe(true);
    expect(asSessionRecord(structuredClone(sess))).toEqual(sess);
  });

  test("malformed rows are null (readers skip, never throw); grammar violations throw at build", () => {
    expect(asSessionRecord({ junk: true })).toBeNull();
    expect(asSessionRecord({ sessionId: "session:s", providerId: "other" })).toBeNull();
    expect(asCaptureRecord({ junk: true })).toBeNull();
    expect(() => buildSessionRecord({
      sessionId: "no-prefix", archetypeSlug: "x", parserVersion: "1",
      captureRef: { ns: "providers", id: "capture:c", rev: 1 },
    })).toThrow(/session: prefix/);
    expect(() => buildCaptureRecord({
      archetypeSlug: "x", parserVersion: "1", redactedText: "t", redactions: 0, integrity: "nothex",
    })).toThrow(/sha256 hex/);
  });
});
