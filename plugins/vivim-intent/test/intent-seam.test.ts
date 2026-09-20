// vivim-intent — S1 canonical-intent seam falsifiers (D-411)
// F-1 defect regression · F-2 hash reality · F-4 four-state rows (plugin half).
// The live-path halves (F-3 citation, F-4 web, F-5 parity) live in
// plugins/vivim-law/test/ and surfaces/web/test/.
//
// Harness: FakeHost (the in-process router mirroring the µhost's B1–B4
// semantics) + a minimal in-memory vault def, so the intent plugin's ops run
// for real through the port discipline — no shared heap with internals.
import { describe, it } from "node:test";
import { FakeHost } from "@vivim/omega-testkit";
import { definePlugin, type PluginDef } from "@vivim/omega-shim";
import { def as intentDef } from "../src/index.ts";

// A minimal in-memory vault: append@1 + get@1 + query@1 — enough surface for
// the intent plugin's port discipline; NOT the real vivim.vault (that one is
// exercised by the web test's real boot).
interface MemRow { rev: number; cid: string; data: unknown }
function makeVaultDef(): PluginDef {
  const rows = new Map<string, Map<string, MemRow>>();
  return definePlugin({
    ops: {
      "vault.append@1": async (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const ns = String(p["ns"] ?? ""); const id = String(p["id"] ?? "");
        if (!ns || !id) return { status: "FAILED", value: { error: "vault.append: ns and id required" } };
        const bucket = rows.get(ns) ?? new Map<string, MemRow>();
        rows.set(ns, bucket);
        const rev = (bucket.get(id)?.rev ?? 0) + 1;
        const cid = `cid_${ns}_${id}_${rev}`;
        bucket.set(id, { rev, cid, data: p["data"] });
        return { status: "OK", value: { rev, cid } };
      },
      "vault.get@1": async (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const bucket = rows.get(String(p["ns"] ?? ""));
        const row = bucket?.get(String(p["id"] ?? ""));
        if (!row) throw new Error("vault.get: not found"); // mirrors the real vault: throw -> DEGRADED -> !r.ok
        return row;
      },
      "vault.query@1": async (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const ns = String(p["ns"] ?? "");
        const prefix = ((p["filter"] as Record<string, unknown>)?.["idPrefix"] ?? "") as string;
        const out: Array<{ id: string; rev: number; cid: string }> = [];
        for (const [id, row] of rows.get(ns) ?? []) {
          if (!prefix || id.startsWith(prefix)) out.push({ id, rev: row.rev, cid: row.cid });
        }
        return { status: "OK", value: out };
      },
    },
  });
}

async function boot() {
  const host = new FakeHost();
  await host.install(makeVaultDef(), { id: "vivim.vault", contributions: { contract: [
    { kind: "contract", id: "vault.append", version: "1", risk: "MUTATION" },
    { kind: "contract", id: "vault.get", version: "1", risk: "READ" },
    { kind: "contract", id: "vault.query", version: "1", risk: "READ" },
  ] } }, { capabilities: [] });
  await host.install(intentDef, { id: "vivim.intent", contributions: { contract: [
    { kind: "contract", id: "intent.submit", version: "1", risk: "MUTATION" },
    { kind: "contract", id: "intent.resolution", version: "1", risk: "MUTATION" },
    { kind: "contract", id: "intent.cancel", version: "1", risk: "MUTATION" },
    { kind: "contract", id: "intent.status", version: "1", risk: "READ" },
  ] } }, { capabilities: ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1"] });
  host.grant("vivim.intent", ["port:vault.append@1", "port:vault.get@1", "port:vault.query@1"]); // B3: mint the tokens the plugin's port calls carry
  const readRow = async (ns: string, id: string): Promise<unknown> => {
    const r = await host.callAsRoot("vault.get@1", { ns, id });
    if (!r.ok) return null;
    return (r.value as { data?: unknown }).data ?? null;
  };
  /** callAsRoot an intent op and unwrap its Outcome convention ({status, value}). */
  const callOp = async (op: string, payload: unknown): Promise<Record<string, unknown>> => {
    const r = await host.callAsRoot(op, payload);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error}: ${r.detail ?? ""}`);
    const o = (r.value ?? {}) as { status?: string; value?: Record<string, unknown>; error?: string };
    if (o.status !== "OK") throw new Error(`${op} failed: ${String((o.value as { error?: string })?.error ?? o.error ?? "unknown")}`);
    return (o.value ?? {}) as Record<string, unknown>;
  };
  /** callAsRoot expecting a refusal (Outcome FAILED) — returns the inner value. */
  const callOpFail = async (op: string, payload: unknown): Promise<Record<string, unknown>> => {
    const r = await host.callAsRoot(op, payload);
    if (!r.ok) throw new Error(`${op} transport failed: ${r.error}: ${r.detail ?? ""}`);
    const o = (r.value ?? {}) as { status?: string; value?: Record<string, unknown> };
    if (o.status === "OK") throw new Error(`${op} unexpectedly succeeded`);
    return (o.value ?? {}) as Record<string, unknown>;
  };
  return { host, readRow, callOp, callOpFail };
}

describe("D-411 (S1) — intent.submit canonical writer path", () => {
  it("F-2: payloadHash is a real sha256 — 64 lowercase hex, deterministic, distinguishing", async () => {
    const { host, callOp } = await boot();
    const va = await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter", body: "hi" }, intentId: "a".repeat(32) });
    if (!va.payloadHash || !/^sha256:[0-9a-f]{64}$/.test(va.payloadHash)) {
      throw new Error(`payloadHash is not a real sha256: ${String(va.payloadHash)}`);
    }
    // Identical payload → identical hash (F7 byte-identical, mechanical form)
    const vb = await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter", body: "hi" }, intentId: "b".repeat(32) });
    if (va.payloadHash !== vb.payloadHash) throw new Error("identical payloads hashed differently — determinism broken");
    // Different payload → different hash
    const vc = await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter", body: "hi there" }, intentId: "c".repeat(32) });
    if (va.payloadHash === vc.payloadHash) throw new Error("different payloads hashed identically — hash is not content-derived");
  });

  it("submit persists the interpretation summary (the UNDERSTOOD artifact)", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    await callOp("intent.submit@1", {
      type: "message.send@1",
      payload: { to: "peter", body: "quarterly numbers attached" },
      intentId: "d".repeat(32),
      interpretation: { text: "send 'quarterly numbers attached' to Peter", canonical: "message.send@1 {to:peter}", reading: "send a message", confidence: 0.9, status: "ok" },
    });
    const row = await readRow("intent", "d".repeat(32)) as Record<string, unknown>;
    if (!row) throw new Error("intent row not persisted");
    const interp = row["interpretation"] as Record<string, unknown> | undefined;
    if (!interp || interp["canonical"] !== "message.send@1 {to:peter}" || interp["status"] !== "ok") {
      throw new Error(`interpretation summary not persisted: ${JSON.stringify(row["interpretation"])}`);
    }
    if (row["state"] !== "submitted") throw new Error(`state should be submitted (UNDERSTOOD), got ${String(row["state"])}`);
  });
});

describe("D-411 (S1) — F-1 defect regression: intent.cancel compensation evidence", () => {
  it("cancel writes the compensation row and REPORTS compensationRecorded: true (fails on pre-D-411 silent no-op)", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter" }, intentId: "e".repeat(32) });
    const v = await callOp("intent.cancel@1", { intentId: "intent:" + "e".repeat(32) });
    if (v.compensationRecorded !== true) {
      throw new Error(`compensationRecorded should be true, got ${String(v.compensationRecorded)} — the pre-D-411 silent no-op is back`);
    }
    if (v.stepId !== "all-pending") throw new Error(`stepId default should be all-pending, got ${String(v.stepId)}`);
    // The row itself exists in ns intent-plan
    const row = await readRow("intent-plan", "e".repeat(32) + ":saga") as Record<string, unknown>;
    if (!row || row["kind"] !== "compensation-request") {
      throw new Error(`compensation row missing from ns intent-plan: ${JSON.stringify(row)}`);
    }
  });

  it("cancel honors an explicit stepId in the compensation row", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter" }, intentId: "f".repeat(32) });
    const v = await callOp("intent.cancel@1", { intentId: "intent:" + "f".repeat(32), stepId: "step-2" });
    if (v.stepId !== "step-2") throw new Error(`explicit stepId not honored: ${String(v.stepId)}`);
    const row = await readRow("intent-plan", "f".repeat(32) + ":saga") as Record<string, unknown>;
    if ((row as { parentStepId?: string })?.parentStepId !== "step-2") throw new Error("compensation row does not carry the explicit stepId");
  });
});

describe("D-411 (S1) — F-4 (plugin half): intent.resolution@1 four-state rows", () => {
  it("EXECUTED row cites the intentRef and carries the outcome", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    const sv = await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter" }, intentId: "1".repeat(32) });
    const rv = await callOp("intent.resolution@1", { resolution: "EXECUTED", intentRef: sv["intentId"], payloadHash: sv["payloadHash"], text: "send to peter", outcome: { ok: true } });
    if (rv["id"] !== "1".repeat(32) + ":res") throw new Error(`wrong row id: ${String(rv["id"])}`);
    const row = await readRow("intent", "1".repeat(32) + ":res") as Record<string, unknown>;
    if (row["resolution"] !== "EXECUTED" || row["intentRef"] !== sv["intentId"]) throw new Error("EXECUTED row shape wrong");
    if ((row["outcome"] as Record<string, unknown>)?.["ok"] !== true) throw new Error("outcome not carried");
  });

  it("REFUSED row carries decision + consentId", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    await callOp("intent.submit@1", { type: "message.send@1", payload: { to: "peter" }, intentId: "2".repeat(32) });
    await callOp("intent.resolution@1", { resolution: "REFUSED", intentRef: "intent:" + "2".repeat(32), decision: "require-consent", consentId: "consent_abc123", text: "send to peter" });
    const row = await readRow("intent", "2".repeat(32) + ":res") as Record<string, unknown>;
    if (row["decision"] !== "require-consent" || row["consentId"] !== "consent_abc123") throw new Error("REFUSED row missing decision/consentId");
  });

  it("AMBIGUOUS row with null intentRef (amb: id family); EXECUTED/REFUSED without intentRef REFUSE", async () => {
    const { host, readRow, callOp, callOpFail } = await boot();
    const rv = await callOp("intent.resolution@1", { resolution: "AMBIGUOUS", text: "blorp the frobnicate", interpStatus: "unknown" });
    if (!rv["id"] || !String(rv["id"]).startsWith("amb:") || !String(rv["id"]).endsWith(":res")) throw new Error(`AMBIGUOUS row id family wrong: ${String(rv["id"])}`);
    const row = await readRow("intent", String(rv["id"])) as Record<string, unknown>;
    if (row["intentRef"] !== null) throw new Error("AMBIGUOUS row must carry intentRef: null by design");
    // EXECUTED without intentRef → refused (the artifact is required)
    const bad = await callOpFail("intent.resolution@1", { resolution: "EXECUTED" });
    if (!String(bad["error"]).includes("intentRef")) throw new Error("refusal does not name intentRef");
    // UNDERSTOOD is not a legal resolution op value (it is the submit row itself)
    await callOpFail("intent.resolution@1", { resolution: "UNDERSTOOD", intentRef: "intent:" + "3".repeat(32) });
  });
});
