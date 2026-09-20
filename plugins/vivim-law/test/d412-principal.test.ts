// D-412 (S2) — the principal-identity seam falsifiers.
// F-1 non-reuse · F-2 idempotent-active · F-3 persistence · F-4 consent
// resolution · F-5 grandfathered (memory-only posture).
// Harness: FakeHost + a minimal in-memory vault + the REAL law def — the
// agent-composition posture (law holds vault caps) vs the console posture
// (no caps), both exercised.
import { describe, it } from "node:test";
import { FakeHost } from "@vivim/omega-testkit";
import { def as lawDef } from "../src/index.ts";
import { consentIdFor } from "@vivim/omega-contracts";
import type { PluginDef } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";

interface MemRow { rev: number; cid: string; data: unknown }
function makeVaultDef(): PluginDef {
  const rows = new Map<string, Map<string, MemRow>>();
  return {
    ops: {
      "vault.append@1": async (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const ns = String(p["ns"] ?? ""); const id = String(p["id"] ?? "");
        if (!ns || !id) throw new Error("vault.append: ns and id required");
        const bucket = rows.get(ns) ?? new Map<string, MemRow>();
        rows.set(ns, bucket);
        const rev = (bucket.get(id)?.rev ?? 0) + 1;
        const cid = `cid_${ns}_${id}_${rev}`;
        bucket.set(id, { rev, cid, data: p["data"] });
        return { rev, cid };
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
        return out;
      },
    },
  } as PluginDef;
}

const LAW_MANIFEST = (withVault: boolean) => ({ id: "vivim.law", contributions: { contract: [
  { kind: "contract", id: "law.check", version: "1", risk: "READ" },
  { kind: "contract", id: "law.consent.grant", version: "1", risk: "READ" },
  { kind: "contract", id: "law.principal.register", version: "1", risk: "MUTATION" },
  { kind: "contract", id: "law.principal.retire", version: "1", risk: "MUTATION" },
  { kind: "contract", id: "law.principal.get", version: "1", risk: "READ" },
] } });

/** The agent posture: law holds vault caps (append + query + get). */
async function bootWithVault() {
  const host = new FakeHost();
  await host.install(makeVaultDef(), { id: "vivim.vault", contributions: { contract: [
    { kind: "contract", id: "vault.append", version: "1", risk: "MUTATION" },
    { kind: "contract", id: "vault.get", version: "1", risk: "READ" },
    { kind: "contract", id: "vault.query", version: "1", risk: "READ" },
  ] } }, { capabilities: [] });
  // FakeHost mints tokens only via grant() (post-install), but law's onInit
  // retries the forbidden-overlay reload for ~5s — the setTimeout between
  // attempts yields the event loop, so minting mid-boot lets attempt #2 pass.
  const caps = ["host.journal.append", "port:vault.append@1", "port:vault.get@1", "port:vault.query@1"];
  const installing = host.install(lawDef as unknown as PluginDef, LAW_MANIFEST(true), { capabilities: caps });
  await new Promise((r) => setTimeout(r, 60));
  host.grant("vivim.law", caps);
  await installing;
  return host;
}

/** The console posture: law holds NO vault caps (memory-only). */
async function bootWithoutVault() {
  const host = new FakeHost();
  await host.install(lawDef as unknown as PluginDef, LAW_MANIFEST(false), { capabilities: ["host.journal.append"] });
  host.grant("vivim.law", ["host.journal.append"]);
  return host;
}

async function call(host: FakeHost, op: string, payload: unknown): Promise<PortResult> {
  return host.callAsRoot(op, payload);
}

describe("D-412 (S2) — principal identity rows", () => {
  it("F-1: non-reuse — register → retire → re-register REFUSES with PRINCIPAL_REUSED", async () => {
    const host = await bootWithVault();
    const r1 = await call(host, "law.principal.register@1", { principal: "user:alice" });
    if (!r1.ok) throw new Error(`register failed: ${r1.detail}`);
    const v1 = r1.value as { state?: string; alreadyRegistered?: boolean };
    if (v1.state !== "active" || v1.alreadyRegistered !== false) throw new Error("register shape wrong");
    const r2 = await call(host, "law.principal.retire@1", { principal: "user:alice" });
    if (!r2.ok) throw new Error(`retire failed: ${r2.detail}`);
    const v2 = r2.value as { state?: string; retiredAt?: number };
    if (v2.state !== "retired" || typeof v2.retiredAt !== "number") throw new Error("retire shape wrong");
    const r3 = await call(host, "law.principal.register@1", { principal: "user:alice" });
    if (r3.ok) throw new Error("re-registering a retired id MUST refuse (non-reuse invariant)");
    if (!String(r3.detail).includes("PRINCIPAL_REUSED")) throw new Error(`refusal does not name the rule: ${String(r3.detail)}`);
    // retire of a retired id also refuses (retired is forever)
    const r4 = await call(host, "law.principal.retire@1", { principal: "user:alice" });
    if (r4.ok || !String(r4.detail).includes("PRINCIPAL_RETIRED")) throw new Error("re-retire must refuse with PRINCIPAL_RETIRED");
    // unknown ids refuse with PRINCIPAL_UNKNOWN
    const r5 = await call(host, "law.principal.retire@1", { principal: "user:ghost" });
    if (r5.ok || !String(r5.detail).includes("PRINCIPAL_UNKNOWN")) throw new Error("retire of unknown must refuse with PRINCIPAL_UNKNOWN");
  });

  it("F-2: idempotent-while-active — re-register returns the SAME record, no duplicate rows", async () => {
    const host = await bootWithVault();
    const r1 = await call(host, "law.principal.register@1", { principal: "user:bob" });
    if (!r1.ok) throw new Error(`register 1 failed: ${r1.detail}`);
    const r2 = await call(host, "law.principal.register@1", { principal: "user:bob" });
    if (!r2.ok) throw new Error(`register 2 failed: ${r2.detail}`);
    const v1 = r1.value as { generation?: number; registeredAt?: number; alreadyRegistered?: boolean };
    const v2 = r2.value as { generation?: number; registeredAt?: number; alreadyRegistered?: boolean };
    if (v2.alreadyRegistered !== true) throw new Error("second register should report alreadyRegistered");
    if (v1.generation !== v2.generation || v1.registeredAt !== v2.registeredAt) throw new Error("idempotent register returned a DIFFERENT record");
    // one row, rev unchanged (no append fired)
    const g = await call(host, "vault.get@1", { ns: "principal", id: "user:bob" });
    if (!g.ok) throw new Error("principal row missing");
    const row = g.value as { rev?: number };
    if (row.rev !== 1) throw new Error(`idempotent register appended a new rev: ${String(row.rev)}`);
  });

  it("F-3: persistence — law.principal.get@1 and a direct vault read agree", async () => {
    const host = await bootWithVault();
    await call(host, "law.principal.register@1", { principal: "agent:worker-7" });
    const viaLaw = await call(host, "law.principal.get@1", { principal: "agent:worker-7" });
    if (!viaLaw.ok) throw new Error(`get failed: ${viaLaw.detail}`);
    const v = viaLaw.value as { found?: boolean; kind?: string; principal?: string; state?: string };
    if (v.found !== true || v.principal !== "agent:worker-7" || v.kind !== "agent" || v.state !== "active") {
      throw new Error(`record shape wrong: ${JSON.stringify(v)}`);
    }
    const viaVault = await call(host, "vault.get@1", { ns: "principal", id: "agent:worker-7" });
    if (!viaVault.ok) throw new Error("direct vault read failed");
    const row = (viaVault.value as { data?: Record<string, unknown> }).data!;
    if (row["principal"] !== "agent:worker-7" || row["state"] !== "active") throw new Error("vault row and law record disagree");
    // absence is data, never a throw
    const miss = await call(host, "law.principal.get@1", { principal: "user:nobody" });
    if (!miss.ok) throw new Error("get of an absent principal must not throw");
    const mv = miss.value as { found?: boolean };
    if (mv.found !== false) throw new Error(`absence should be {found:false}, got ${JSON.stringify(mv)}`);
  });
});

describe("D-412 (S2) — the consent ceremony resolves through the record", () => {
  it("F-4: a named grant ensures the principal record exists (fail-closed posture reported)", async () => {
    const host = await bootWithVault();
    const id = consentIdFor("user:bob", "message.send@1");
    const r = await call(host, "law.consent.grant@1", { consentId: id, principal: "user:bob" });
    if (!r.ok) throw new Error(`grant failed: ${r.detail}`);
    const v = r.value as { principalRecord?: { principal?: string; state?: string } | null };
    if (v.principalRecord?.principal !== "user:bob" || v.principalRecord?.state !== "active") {
      throw new Error(`grant did not report the resolved record: ${JSON.stringify(v.principalRecord)}`);
    }
    // the record actually exists
    const g = await call(host, "law.principal.get@1", { principal: "user:bob" });
    if (!(g.value as { found?: boolean }).found) throw new Error("principal record missing after the named grant");
    // re-grant: the record already exists — resolved, not re-registered
    const r2 = await call(host, "law.consent.grant@1", { consentId: id, principal: "user:bob" });
    if (!r2.ok) throw new Error(`re-grant failed: ${r2.detail}`);
    const v2 = r2.value as { principalRecord?: { generation?: number } };
    if (v2.principalRecord?.generation !== 1) throw new Error("re-grant re-registered (generation should stay 1)");
  });

  it("F-5: grandfathered — the same named grant WITHOUT vault caps succeeds, posture honestly null", async () => {
    const host = await bootWithoutVault();
    const id = consentIdFor("user:carol", "message.send@1");
    const r = await call(host, "law.consent.grant@1", { consentId: id, principal: "user:carol" });
    if (!r.ok) throw new Error(`grant failed without vault caps (pre-D-412 behavior must hold): ${r1detail(r)}`);
    const v = r.value as { principalRecord?: unknown };
    if (v.principalRecord !== null && v.principalRecord !== undefined && v.principalRecord !== false) {
      throw new Error(`memory-only posture must report null, got ${JSON.stringify(v.principalRecord)}`);
    }
    // and the principal ops themselves refuse honestly without caps (the seam
    // IS the row — memory-only is not a posture here)
    const reg = await call(host, "law.principal.register@1", { principal: "user:carol" });
    if (reg.ok || !String(reg.detail).includes("port:vault")) throw new Error("register without caps must refuse naming the port");
  });
});

function r1detail(r: PortResult): string {
  return `${r.error}: ${r.detail ?? ""}`;
}
