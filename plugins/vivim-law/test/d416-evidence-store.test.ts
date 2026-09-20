// D-416 (S3) falsifiers — the evidence-store fold, live through the µhost.
// Rigs boot the REAL law plugin with three grant postures:
//   · the fold rig — vault caps granted (the agent posture): F-1 (law rows ride
//     vault ns law; the sidecar keeps ONLY host transport rows), F-7 (the
//     registry absorbs vault journal rows into events + states)
//   · the drain rig — + host.kernel.lens: F-4 (law.audit.drain@1 persists the
//     kernel's signed chain into ns audit, one whole row per drain)
//   · the no-lens rig — drain caps minus the lens: F-5 (the named refusal)
//   · the dangling rig — port:vault.append@1 granted, NO vivim.vault shipped:
//     F-2 (every fold append fails loudly, decisions STILL stand, the sidecar
//     stays free of law rows)
// F-3 (the transition fallback: no vault caps → the sidecar path, byte for
// byte) is pinned by the existing GATE-Ω1 integration suite — green before
// and after this record.
// Patterns copied from integration.test.ts (compileComposition → bootComposition).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const COMPS = join(import.meta.dir, "../../../compositions");

interface SpecEntry { id: string; source: string; bootPhase: number; grant: { capabilities: string[]; contracts: string[] }; config?: Record<string, unknown> }
interface Spec { name: string; entries: SpecEntry[] }

const LAW_BASE_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.forbidden.set@1", "law.describe@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.getmany@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const FOLD_CAPS = ["host.journal.append", "host.tokens.revoke", "port:vault.append@1", "port:vault.query@1", "port:vault.getmany@1", "port:vault.get@1"];

function rig(name: string, lawCaps: string[], lawContracts: string[], withVault: boolean): { spec: Spec; vaultDir: string } {
  const vaultDir = omegaTmp("omega-d416", `${name}-${Date.now()}-${process.pid}`);
  rmSync(vaultDir, { recursive: true, force: true });
  mkdirSync(vaultDir, { recursive: true });
  const entries: SpecEntry[] = [
    { id: "vivim.law", source: "../plugins/vivim-law", bootPhase: 0, grant: { capabilities: lawCaps, contracts: lawContracts }, config: { journalPath: "" } },
  ];
  if (withVault) {
    entries.push({ id: "vivim.vault", source: "../plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir: join(vaultDir, "vault-data") } });
  }
  entries.push({ id: "omega.risky", source: "../examples/plugin-risky", bootPhase: 1, grant: { capabilities: [], contracts: ["risky.op@1", "risky.read@1"] } });
  return { spec: { name, entries }, vaultDir };
}

async function bootRig(spec: Spec, vaultDir: string): Promise<BootedHost> {
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec as never, COMPS, vaultDir, rootKey);
  return await bootComposition(recipe, buildDir, vaultDir);
}

type Entry = Record<string, unknown>;
function readSidecar(vaultDir: string): Entry[] {
  const p = join(vaultDir, "law-journal.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Entry);
}

// ---- the vault read side, through the router (root): the fold's assertions ----

async function vaultJournalRows(host: BootedHost): Promise<Entry[]> {
  const q = await host.router.callAsRoot("vault.query@1", { ns: "law", filter: { idPrefix: "journal:" } });
  expect(q.ok).toBe(true);
  const ids = ((q.ok ? q.value : []) as Array<{ id?: unknown }>).map((r) => r.id).filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return [];
  const g = await host.router.callAsRoot("vault.getmany@1", { ns: "law", ids });
  expect(g.ok).toBe(true);
  const rows = (g.ok ? g.value : []) as Array<{ id?: unknown; found?: unknown; data?: unknown }>;
  return rows.filter((r) => r.found === true && typeof r.data === "object" && r.data !== null).map((r) => ({ __id: String(r.id), ...(r.data as Entry) }));
}

async function vaultAuditRows(host: BootedHost): Promise<Entry[]> {
  const q = await host.router.callAsRoot("vault.query@1", { ns: "audit", filter: { idPrefix: "audit-chain:" } });
  expect(q.ok).toBe(true);
  const ids = ((q.ok ? q.value : []) as Array<{ id?: unknown }>).map((r) => r.id).filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return [];
  const g = await host.router.callAsRoot("vault.getmany@1", { ns: "audit", ids });
  expect(g.ok).toBe(true);
  const rows = (g.ok ? g.value : []) as Array<{ id?: unknown; found?: unknown; data?: unknown }>;
  return rows.filter((r) => r.found === true && typeof r.data === "object" && r.data !== null).map((r) => ({ __id: String(r.id), ...(r.data as Entry) }));
}

describe("D-416 F-1/F-7 · the fold rig (vault caps granted — the agent posture)", () => {
  let host: BootedHost;
  let vaultDir: string;
  beforeAll(async () => {
    const r = rig("fold", FOLD_CAPS, LAW_BASE_CONTRACTS, true);
    vaultDir = r.vaultDir;
    host = await bootRig(r.spec, vaultDir);
  });
  afterAll(async () => { await host.shutdown(); });

  test("F-1a: a gated risky op leaves its law-check row in vault ns law (journal: family, the fold)", async () => {
    const r = await host.router.callAsRoot("risky.op@1", { value: 42 });
    expect(r.ok).toBe(false); // EXTERNAL_MUTATION from root → consent required, as ever
    expect(r.ok === false && r.error).toBe("REFUSED");

    const rows = await vaultJournalRows(host);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const check = rows.find((e) => e["source"] === "vivim.law" && e["op"] === "law.check" && e["targetOp"] === "risky.op@1");
    expect(check).toBeTruthy(); // OLD CODE FAILS HERE: no vault journal rows at all
    expect(check!["decision"]).toBe("require-consent");
    expect(check!["principal"]).toBe("root");
    expect(String(check!["causationId"])).toMatch(/^c_\d+$/);
    expect(String(check!["consentId"])).toMatch(/^consent_[0-9a-f]+$/);
    expect(String((check as { __id?: string })["__id"])).toMatch(/^journal:[0-9a-z]+-[0-9a-z]+$/); // the id family
  });

  test("F-1b: the sidecar file carries ONLY host transport rows — zero vivim.law rows", () => {
    const sidecar = readSidecar(vaultDir);
    const hostGateRow = sidecar.find((e) => e["op"] === "risky.op@1" && e["decision"] === "require-consent");
    expect(hostGateRow).toBeTruthy(); // the B5-frozen host write path, untouched
    const lawRows = sidecar.filter((e) => e["source"] === "vivim.law");
    expect(lawRows).toHaveLength(0); // OLD CODE FAILS HERE: law rows still landed in the file
  });

  test("F-7: law.registry@1 absorbs the vault journal rows — events counts them, states harvest their principals", async () => {
    // a forbidden.set names a NON-reserved principal — its journal row is the
    // harvestable evidence (registry config journalPath is "" — the file side
    // contributes nothing; every journal-derived count below is vault-derived)
    const f = await host.router.callAsRoot("law.forbidden.set@1", { principal: "omega.risky", ops: ["risky.op@1"] });
    expect(f.ok).toBe(true);

    const rows = await vaultJournalRows(host);
    expect(rows.filter((e) => e["op"] === "law.forbidden.set").length).toBe(1); // the fold row

    const r = await host.router.callAsRoot("law.registry@1", {});
    expect(r.ok).toBe(true);
    const snap = (r.ok ? r.value : {}) as { events?: number; states?: Record<string, unknown>; plugins?: string[] };
    expect(Number(snap.events ?? 0)).toBeGreaterThanOrEqual(rows.length); // vault rows counted — OLD CODE: 0 (file replay only, empty path)
    expect(snap.states?.["omega.risky"]).toBeTruthy(); // harvested from the VAULT row — OLD CODE: absent (no file rows to absorb)
    expect(snap.plugins).toContain("omega.risky");
  });
});

describe("D-416 F-4 · the drain rig (+ host.kernel.lens — the persistence point)", () => {
  let host: BootedHost;
  beforeAll(async () => {
    const r = rig("drain", [...FOLD_CAPS, "host.kernel.lens"], [...LAW_BASE_CONTRACTS, "law.audit.drain@1"], true);
    host = await bootRig(r.spec, r.vaultDir);
  });
  afterAll(async () => { await host.shutdown(); });

  test("drain persists the kernel's signed chain whole into ns audit; a second drain is a second row", async () => {
    const first = await host.router.callAsRoot("law.audit.drain@1", {});
    expect(first.ok).toBe(true); // OLD CODE FAILS HERE: no such op — refused unrouted
    const v1 = (first.ok ? first.value : {}) as { drained?: number; headHash?: string; verified?: boolean; ns?: string; id?: string };
    expect(v1.ns).toBe("audit");
    expect(Number(v1.drained ?? 0)).toBeGreaterThanOrEqual(7); // genesis: 5 nodes + 2 closing grants, at minimum
    expect(String(v1.headHash ?? "")).toMatch(/^[0-9a-f]{64}$/);
    expect(v1.verified).toBe(true);

    let rows = await vaultAuditRows(host);
    expect(rows).toHaveLength(1);
    const row1 = rows[0]!;
    expect(String(row1["__id"])).toMatch(/^audit-chain:[0-9a-z]+-[0-9a-z]+$/);
    expect(row1["verified"]).toBe(true);
    expect(String(row1["signerKeyId"] ?? "")).toBeTruthy();
    expect(String(row1["publicKey"] ?? "")).toMatch(/^[A-Za-z0-9+/]{30,}={0,2}$/); // the raw ed25519 public key, persisted
    expect(String(row1["headHash"] ?? "")).toMatch(/^[0-9a-f]{64}$/);
    const entries1 = row1["entries"] as Array<Record<string, unknown>>;
    expect(Array.isArray(entries1)).toBe(true);
    expect(entries1.length).toBe(v1.drained); // the FULL export — every signed grant
    for (const e of entries1) {
      expect(String(e["signature"] ?? "")).toBeTruthy(); // signed, every one
      expect(typeof (e["payload"] as Record<string, unknown> | undefined)?.["seq"]).toBe("number"); // chained
    }

    const second = await host.router.callAsRoot("law.audit.drain@1", {});
    expect(second.ok).toBe(true);
    rows = await vaultAuditRows(host);
    expect(rows).toHaveLength(2); // one row per drain — never superseding
    expect(rows[0]!["__id"]).not.toBe(rows[1]!["__id"]); // unique ids per drain
  });
});

describe("D-416 F-5 · the no-lens rig (drain caps minus host.kernel.lens)", () => {
  let host: BootedHost;
  beforeAll(async () => {
    const r = rig("nolens", FOLD_CAPS, [...LAW_BASE_CONTRACTS, "law.audit.drain@1"], true);
    host = await bootRig(r.spec, r.vaultDir);
  });
  afterAll(async () => { await host.shutdown(); });

  test("the drain REFUSES with the named capability error — never a silent no-op", async () => {
    const r = await host.router.callAsRoot("law.audit.drain@1", {});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("DEGRADED"); // the handler's throw, converted by the shim
    expect(r.ok === false && r.detail ? r.detail : "").toContain("host.kernel.lens"); // the NAMED cap
    const rows = await vaultAuditRows(host);
    expect(rows).toHaveLength(0); // nothing persisted by a refused drain
  });
});

describe("D-416 F-2 · the dangling rig (port:vault.append@1 granted, NO vivim.vault shipped)", () => {
  let host: BootedHost;
  let vaultDir: string;
  beforeAll(async () => {
    const r = rig("dangling", ["host.journal.append", "port:vault.append@1"], LAW_BASE_CONTRACTS, false);
    vaultDir = r.vaultDir;
    host = await bootRig(r.spec, vaultDir);
  });
  afterAll(async () => { await host.shutdown(); });

  test("every fold append fails loudly (no routed vault) — decisions STILL stand, the sidecar stays free of law rows", async () => {
    // the gated op: the law.check decision returns exactly as before
    const r = await host.router.callAsRoot("risky.op@1", { value: 7 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("REFUSED"); // consent required — the DECISION stands
    expect(r.ok === false && r.detail ? r.detail : "").toContain("consent required: consent_");

    // a consent grant: also completes (its journal fold fails, the grant does not)
    const consentId = (r.ok === false ? (r.detail ?? "") : "").match(/consent_[0-9a-f]+/)?.[0] ?? "";
    expect(consentId).toBeTruthy();
    const g = await host.router.callAsRoot("law.consent.grant@1", { consentId });
    expect(g.ok).toBe(true);

    // the registry stays servable (best-effort absorb degrades to observed-only)
    const reg = await host.router.callAsRoot("law.registry@1", {});
    expect(reg.ok).toBe(true);

    // the sidecar: host transport rows only — the lost law rows were lost LOUDLY
    // (each refused fold append logged "row lost loudly"), never written here
    const sidecar = readSidecar(vaultDir);
    expect(sidecar.filter((e) => e["source"] === "vivim.law")).toHaveLength(0); // OLD CODE FAILS HERE: legacy path wrote them to the file
  });
});
