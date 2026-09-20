// D-411 (S1) — F-3 citation falsifier: law.check@1 with {intentRef, payloadHash}
// journals the citation; without it, journal rows are byte-shape identical to
// the pre-D-411 spelling (grandfathered callers). Harness: FakeHost (the
// in-process router mirroring the µhost's B1–B4 semantics) with the REAL law
// def installed — the journal is FakeHost's queryable copy.
import { describe, it } from "node:test";
import { FakeHost } from "@vivim/omega-testkit";
import { def as lawDef } from "../src/index.ts";
import type { PluginDef } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";

const LAW_MANIFEST = { id: "vivim.law", contributions: { contract: [
  { kind: "contract", id: "law.check", version: "1", risk: "READ" },
  { kind: "contract", id: "law.registry", version: "1", risk: "READ" },
  { kind: "contract", id: "law.consent.grant", version: "1", risk: "READ" },
  { kind: "contract", id: "law.describe", version: "1", risk: "READ" },
] } };

async function boot() {
  const host = new FakeHost();
  await host.install(lawDef as unknown as PluginDef, LAW_MANIFEST, { capabilities: ["host.journal.append"] });
  host.grant("vivim.law", ["host.journal.append"]);
  const check = async (payload: Record<string, unknown>): Promise<PortResult> => host.callAsRoot("law.check@1", payload);
  const lawJournalRows = () => host.journal.filter((e) => e["op"] === "law.check");
  return { host, check, lawJournalRows };
}

describe("D-411 (S1) — F-3: the law gate cites the canonical intent", () => {
  it("a journaling law decision with {intentRef, payloadHash} carries both in the journal row", async () => {
    const { check, lawJournalRows } = await boot();
    // MUTATION-class op → allow + journal (LAW_POLICY_V1 1.6.0 exact row)
    const r = await check({
      principal: "root",
      op: "intent.submit@1",
      payload: { type: "message.send@1", payload: { to: "peter" } },
      intentRef: "intent:" + "a".repeat(32),
      payloadHash: "sha256:" + "b".repeat(64),
    });
    if (!r.ok) throw new Error(`law.check failed: ${r.detail}`);
    const d = r.value as { decision?: string };
    if (d.decision !== "allow") throw new Error(`expected allow, got ${String(d.decision)}`);
    const rows = lawJournalRows();
    if (rows.length !== 1) throw new Error(`expected exactly 1 law.check journal row, got ${rows.length}`);
    const row = rows[0]!;
    if (row["intentRef"] !== "intent:" + "a".repeat(32)) throw new Error(`journal row missing intentRef: ${JSON.stringify(row)}`);
    if (row["payloadHash"] !== "sha256:" + "b".repeat(64)) throw new Error(`journal row missing payloadHash: ${JSON.stringify(row)}`);
    if (row["targetOp"] !== "intent.submit@1" || row["decision"] !== "allow") throw new Error(`journal row lost its pre-D-411 shape: ${JSON.stringify(row)}`);
  });

  it("without the citation, the journal row carries NO new fields (grandfathered shape)", async () => {
    const { check, lawJournalRows } = await boot();
    await check({ principal: "root", op: "intent.submit@1", payload: { type: "x@1" } });
    const rows = lawJournalRows();
    if (rows.length !== 1) throw new Error(`expected exactly 1 law.check journal row, got ${rows.length}`);
    const row = rows[0]!;
    if ("intentRef" in row || "payloadHash" in row) {
      throw new Error(`grandfathered row gained new fields: ${JSON.stringify(row)}`);
    }
    // the pre-D-411 field set is intact
    for (const k of ["source", "op", "principal", "targetOp", "decision", "reason", "causationId"]) {
      if (!(k in row)) throw new Error(`journal row lost field ${k}: ${JSON.stringify(row)}`);
    }
  });

  it("a require-consent decision with the citation journals it too (the REFUSED evidence path)", async () => {
    const { check, lawJournalRows } = await boot();
    // EXTERNAL_MUTATION-class op → require-consent + journal
    const r = await check({
      principal: "root",
      op: "message.send@1",
      payload: { to: "peter", body: "hi" },
      intentRef: "intent:" + "c".repeat(32),
      payloadHash: "sha256:" + "d".repeat(64),
    });
    if (!r.ok) throw new Error(`law.check failed: ${r.detail}`);
    const d = r.value as { decision?: string; consentId?: string };
    if (d.decision !== "require-consent") throw new Error(`expected require-consent, got ${String(d.decision)}`);
    const rows = lawJournalRows();
    const row = rows[0]!;
    if (row["intentRef"] !== "intent:" + "c".repeat(32) || row["payloadHash"] !== "sha256:" + "d".repeat(64)) {
      throw new Error(`refusal journal row missing the citation: ${JSON.stringify(row)}`);
    }
    if (typeof row["consentId"] !== "string") throw new Error("refusal journal row missing consentId");
  });
});
