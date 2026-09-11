// provider.email.file — test/pack-provider.test.ts (Ω5; v0.2.0 receive units — Ω10/Ω11b)
// UNIT tests: the pure email-domain helpers in src/message.ts (no ports, no host).
// The pack's ontology is the contract: the built Message must satisfy email.Message@1,
// summaries must drop the body, and the two pure revisions (seen/move) must be
// structural clones that never mutate the input.
import { describe, test, expect } from "bun:test";
import {
  applyMove, applySeen, asMessage, buildMessage, buildReceivedMessage, DEFAULT_FOLDER,
  RECEIVE_FOLDERS, resolveFrom, summarize, threadIdFor, validateMovePayload,
  validateReceivePayload, validateSendPayload, type Message,
} from "../src/message.ts";

const TO = "river@omega.local";
const SUBJECT = "the merkle chain is intact";

describe("Ω5 message.send@1 payload validation (fail-closed)", () => {
  test("to must contain '@'", () => {
    expect(() => validateSendPayload("message.send@1", { to: "not-an-email", subject: "s", body: "b" }))
      .toThrow(/to must be an email address containing '@'/);
  });
  test("subject must be non-empty", () => {
    expect(() => validateSendPayload("message.send@1", { to: TO, subject: "", body: "b" })).toThrow(/subject must be non-empty/);
    expect(() => validateSendPayload("message.send@1", { to: TO, body: "b" })).toThrow(/subject must be a string/);
  });
  test("body must be a string (may be empty)", () => {
    expect(validateSendPayload("message.send@1", { to: TO, subject: "s", body: "" })).toEqual({ to: TO, subject: "s", body: "" });
    expect(() => validateSendPayload("message.send@1", { to: TO, subject: "s" })).toThrow(/body must be a string/);
  });
  test("payload must be an object; threadId optional but validated when present", () => {
    expect(() => validateSendPayload("message.send@1", null)).toThrow(/payload must be an object/);
    expect(() => validateSendPayload("message.send@1", ["array"])).toThrow(/payload must be an object/);
    expect(validateSendPayload("message.send@1", { to: TO, subject: "s", body: "b", threadId: "thread_abc" }))
      .toEqual({ to: TO, subject: "s", body: "b", threadId: "thread_abc" });
    expect(() => validateSendPayload("message.send@1", { to: TO, subject: "s", body: "b", threadId: "" })).toThrow(/threadId must be non-empty/);
  });
});

describe("Ω5 message construction (email.Message@1 shape)", () => {
  test("buildMessage satisfies the declared schema: 9 fields, folder sent, draft cleared", () => {
    const m = buildMessage({ to: TO, subject: SUBJECT, body: "hello body" }, { from: "demo@omega.local", id: "msg_1", sentAt: 1234 });
    expect(Object.keys(m).sort()).toEqual(["body", "flags", "folder", "from", "id", "sentAt", "subject", "threadId", "to"]);
    expect(m.folder).toBe(DEFAULT_FOLDER);
    expect(m.from).toBe("demo@omega.local");
    expect(m.flags).toEqual({ seen: false, flagged: false, draft: false }); // draft→sent completed inside send
    expect(m.sentAt).toBe(1234);
  });

  test("threadId derivation is deterministic: same (subject, to) → same thread, different to → different thread", () => {
    const a = threadIdFor(SUBJECT, TO);
    expect(a).toMatch(/^thread_[0-9a-f]{12}$/);
    expect(threadIdFor(SUBJECT, TO)).toBe(a);
    expect(threadIdFor(SUBJECT, "other@omega.local")).not.toBe(a);
    expect(threadIdFor("other subject", TO)).not.toBe(a);
  });

  test("caller-supplied threadId wins over derivation", () => {
    const m = buildMessage({ to: TO, subject: SUBJECT, body: "b", threadId: "thread_given" }, { from: "f@x", id: "msg_2", sentAt: 5 });
    expect(m.threadId).toBe("thread_given");
  });

  test("asMessage round-trips a built message and rejects non-message shapes", () => {
    const m = buildMessage({ to: TO, subject: SUBJECT, body: "b" }, { from: "f@x", id: "msg_3", sentAt: 7 });
    expect(asMessage("read", m)).toEqual(m);
    expect(() => asMessage("read", { ...m, flags: { seen: "yes", flagged: false, draft: false } })).toThrow(/flags\.seen/);
    expect(() => asMessage("read", { ...m, sentAt: "now" })).toThrow(/sentAt/);
    expect(() => asMessage("read", null)).toThrow(/not a message/);
    expect(() => asMessage("read", "text")).toThrow(/not a message/);
  });
});

describe("Ω5 summary projection (bodies never leave the vault on list/search)", () => {
  test("summarize drops the body and keeps the envelope", () => {
    const m: Message = buildMessage({ to: TO, subject: SUBJECT, body: "SECRET BODY" }, { from: "demo@omega.local", id: "msg_4", sentAt: 42 });
    const s = summarize(m);
    expect("body" in s).toBe(false);
    expect(s).toEqual({
      id: "msg_4", threadId: m.threadId, folder: "sent", from: "demo@omega.local",
      to: TO, subject: SUBJECT, sentAt: 42, flags: { seen: false, flagged: false, draft: false },
    });
  });
});

describe("Ω5 pure revisions (seen / move)", () => {
  const base: Message = buildMessage({ to: TO, subject: SUBJECT, body: "b" }, { from: "f@x", id: "msg_5", sentAt: 1 });

  test("applySeen flips flags.seen only — input untouched (idempotence decided by the caller)", () => {
    const seen = applySeen(base);
    expect(seen.flags.seen).toBe(true);
    expect(base.flags.seen).toBe(false);            // no mutation of the fetched revision
    expect(seen).toEqual({ ...base, flags: { ...base.flags, seen: true } });
    expect(applySeen(seen)).toEqual(seen);          // idempotent value
  });

  test("applyMove changes the folder only — input untouched", () => {
    const moved = applyMove(base, "archive");
    expect(moved.folder).toBe("archive");
    expect(base.folder).toBe("sent");
    expect(moved).toEqual({ ...base, folder: "archive" });
  });
});

describe("Ω5 move payload validation + sender config resolution", () => {
  test("validateMovePayload: {id, folder} required, folder must be clean", () => {
    expect(validateMovePayload("message.move@1", { id: "msg_x", folder: "archive" })).toEqual({ id: "msg_x", folder: "archive" });
    expect(() => validateMovePayload("message.move@1", { id: "", folder: "a" })).toThrow(/id must be non-empty/);
    expect(() => validateMovePayload("message.move@1", { id: "msg_x" })).toThrow(/folder must be a string/);
    expect(() => validateMovePayload("message.move@1", { id: "msg_x", folder: "bad|folder" })).toThrow(/folder must not contain/);
  });

  test("resolveFrom: config.from passthrough with me@local default, fail-closed on garbage", () => {
    expect(resolveFrom({})).toBe("me@local");
    expect(resolveFrom(undefined)).toBe("me@local");
    expect(resolveFrom({ from: "demo@omega.local" })).toBe("demo@omega.local");
    expect(() => resolveFrom({ from: "not-an-email" })).toThrow(/config\.from/);
    expect(() => resolveFrom({ from: "" })).toThrow(/config\.from/);
    expect(() => resolveFrom({ from: 42 })).toThrow(/config\.from/);
  });
});

describe("Ω10/Ω11b message.receive@1 payload validation (fail-closed)", () => {
  const FROM = "peter.miller@omega.local";

  test("from must contain '@'; subject non-empty; body a string (may be empty)", () => {
    expect(validateReceivePayload("message.receive@1", { from: FROM, subject: "s", body: "b" }))
      .toEqual({ from: FROM, subject: "s", body: "b" });
    expect(validateReceivePayload("message.receive@1", { from: FROM, subject: "s", body: "" }))
      .toEqual({ from: FROM, subject: "s", body: "" });
    expect(() => validateReceivePayload("message.receive@1", { from: "not-an-email", subject: "s", body: "b" }))
      .toThrow(/from must be an email address containing '@'/);
    expect(() => validateReceivePayload("message.receive@1", { from: FROM, subject: "", body: "b" })).toThrow(/subject must be non-empty/);
    expect(() => validateReceivePayload("message.receive@1", { from: FROM, subject: "s" })).toThrow(/body must be a string/);
  });

  test("payload must be an object; folder optional but validated when present (inbox|sent|archive|trash)", () => {
    expect(() => validateReceivePayload("message.receive@1", null)).toThrow(/payload must be an object/);
    expect(() => validateReceivePayload("message.receive@1", ["array"])).toThrow(/payload must be an object/);
    for (const folder of RECEIVE_FOLDERS) {
      expect(validateReceivePayload("message.receive@1", { from: FROM, subject: "s", body: "b", folder }))
        .toEqual({ from: FROM, subject: "s", body: "b", folder });
    }
    expect(() => validateReceivePayload("message.receive@1", { from: FROM, subject: "s", body: "b", folder: "spam" }))
      .toThrow(/folder must be one of inbox\|sent\|archive\|trash/);
    expect(() => validateReceivePayload("message.receive@1", { from: FROM, subject: "s", body: "b", folder: "" }))
      .toThrow(/folder must be non-empty/);
  });
});

describe("Ω10/Ω11b received-message construction (email.Message@1 shape, the inbound leg)", () => {
  const FROM = "peter.miller@omega.local";
  const SELF = "demo@omega.local";

  test("buildReceivedMessage: folder inbox by default, to = the configured self address, flags unseen", () => {
    const m = buildReceivedMessage({ from: FROM, subject: "the report is ready", body: "numbers attached" }, { to: SELF, id: "msg_r1", sentAt: 4242 });
    expect(Object.keys(m).sort()).toEqual(["body", "flags", "folder", "from", "id", "sentAt", "subject", "threadId", "to"]);
    expect(m.folder).toBe("inbox");                        // the default inbound leg
    expect(m.from).toBe(FROM);
    expect(m.to).toBe(SELF);                               // the configured self address
    expect(m.flags).toEqual({ seen: false, flagged: false, draft: false }); // unseen incoming
    expect(m.sentAt).toBe(4242);
  });

  test("caller-supplied folder wins (a pre-filed inbound message); thread keys on the counterpart address", () => {
    const m = buildReceivedMessage({ from: FROM, subject: "the report is ready", body: "b", folder: "archive" }, { to: SELF, id: "msg_r2", sentAt: 5 });
    expect(m.folder).toBe("archive");
    // conversation grouping mirrors the sent side: (subject, counterpart) — a sent
    // message TO peter with the same subject shares the thread with a receive FROM peter
    expect(m.threadId).toBe(threadIdFor("the report is ready", FROM));
    expect(threadIdFor("the report is ready", FROM)).not.toBe(threadIdFor("the report is ready", SELF));
  });

  test("asMessage round-trips a built received message (the vault write is schema-clean)", () => {
    const m = buildReceivedMessage({ from: FROM, subject: "s", body: "b" }, { to: SELF, id: "msg_r3", sentAt: 7 });
    expect(asMessage("read", m)).toEqual(m);
  });
});
