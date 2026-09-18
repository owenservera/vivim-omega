// vivim.vault — integration tests (Ω2, GATE-Ω2 evidence): boots real compositions through
// the µhost (law-stub in phase 0, vivim.vault in phase 1) and drives every op through the
// router with real capability tokens. Each case gets its own temp vault + data dir.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { openDatabase } from "../src/db.ts"; // D-361: tests ride the adapter too
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec } from "@vivim/omega-contracts";

import { cidOf } from "../src/canon.ts";
import { dbPath, openVault, readObject, searchObjects } from "../src/db.ts";
import { verify } from "../src/verify.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // vivim-omega/ (test/ → vivim-vault/ → plugins/ → root)
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

/** Shutdown + deregister (double-terminate of an exited worker parks 2.5s in the host fallback). */
async function shutdownCase(c: { host: BootedHost }): Promise<void> {
  const i = hosts.indexOf(c.host);
  if (i >= 0) hosts.splice(i, 1);
  await c.host.shutdown().catch(() => {});
}

const VAULT_CONTRACTS = [
  "vault.append@1", "vault.get@1", "vault.getmany@1", "vault.query@1", "vault.search@1", // D-387: getmany routed
  "vault.verify@1", "vault.compact@1", "vault.roundtrip@1",
];

function makeSpec(name: string, dataDir: string): CompositionSpec {
  return {
    name,
    entries: [
      {
        id: "vivim.law",
        source: "plugins/law-stub",
        bootPhase: 0,
        grant: { capabilities: ["host.journal.append"], contracts: ["law.check@1", "law.registry@1", "law.consent.grant@1"] },
      },
      {
        id: "vivim.vault",
        source: "plugins/vivim-vault",
        bootPhase: 1,
        grant: { capabilities: [], contracts: VAULT_CONTRACTS },
        config: { dataDir },
      },
    ],
  };
}

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

async function bootCase(caseName: string, opts: { dataDir?: string; spec?: CompositionSpec; specDir?: string } = {}): Promise<Case> {
  // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
  const root = omegaTmp("omega-vault-test", `${caseName}-${Date.now()}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = opts.dataDir ?? join(root, "data");
  const spec = opts.spec ?? makeSpec(caseName, dataDir);
  const specDir = opts.specDir ?? OMEGA_ROOT;
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(spec, specDir, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

describe("Ω2 integration — boot + full round-trip through the router", () => {
  test("append×3 across 2 ns → get latest+rev → query → search → verify (appends pass the law gate)", async () => {
    const { host, vaultDir } = await bootCase("full");
    const data1 = { title: "Quantum", body: "the quick brown fox" };
    const r1 = await host.router.callAsRoot("vault.append@1", { ns: "notes", id: "n1", data: data1, meta: { author: "z" } });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toEqual({ rev: 1, cid: cidOf(data1), seq: 1 });

    const r2 = await host.router.callAsRoot("vault.append@1", { ns: "notes", id: "n1", data: { title: "Quantum v2" } });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { rev: number }).rev).toBe(2);
    const r3 = await host.router.callAsRoot("vault.append@1", { ns: "tasks", id: "t1", data: "buy milk, quantum-free" });
    expect(r3.ok).toBe(true);

    const latest = await host.router.callAsRoot("vault.get@1", { ns: "notes", id: "n1" });
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      const v = latest.value as { rev: number; cid: string; data: unknown; meta: unknown; refs: unknown[] };
      expect(v.rev).toBe(2);
      expect(v.data).toEqual({ title: "Quantum v2" });
      expect(v.meta).toBeNull();
      expect(v.cid).toBe(cidOf({ title: "Quantum v2" }));
    }
    const rev1 = await host.router.callAsRoot("vault.get@1", { ns: "notes", id: "n1", rev: 1 });
    expect(rev1.ok).toBe(true);
    if (rev1.ok) {
      const v = rev1.value as { rev: number; data: unknown; meta: unknown };
      expect(v.rev).toBe(1);
      expect(v.data).toEqual(data1);
      expect(v.meta).toEqual({ author: "z" });
    }

    const query = await host.router.callAsRoot("vault.query@1", { ns: "notes" });
    expect(query.ok).toBe(true);
    if (query.ok) expect(query.value).toEqual([{ id: "n1", rev: 2, cid: cidOf({ title: "Quantum v2" }) }]);

    const search = await host.router.callAsRoot("vault.search@1", { ns: "notes", q: "fox" });
    expect(search.ok).toBe(true);
    if (search.ok) {
      const rows = search.value as { id: string; rev: number; rank: number }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("n1");
      expect(rows[0].rev).toBe(1);
      expect(typeof rows[0].rank).toBe("number");
    }

    const verdict = await host.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      const v = verdict.value as { ok: boolean; entries: number; headHash: string };
      expect(v.ok).toBe(true);
      expect(v.entries).toBe(3);
      expect(v.headHash).toMatch(/^[0-9a-f]{64}$/);
    }

    // the MUTATION-risk appends really passed the law gate (stub: allow-all) — journaled
    const journal = readFileSync(join(vaultDir, "law-journal.jsonl"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { op: string; decision: string });
    const gated = journal.filter((e) => e.op === "vault.append@1" && e.decision === "allow");
    expect(gated.length).toBe(3);
  });

  test("bad payloads throw inside the compartment → router returns DEGRADED with detail", async () => {
    const { host } = await bootCase("bad-payload");
    const bad = await host.router.callAsRoot("vault.append@1", { id: "no-ns", data: {} });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe("DEGRADED");
      expect(bad.detail).toContain("vault.append@1");
      expect(bad.detail).toContain("ns");
    }
    const badPipe = await host.router.callAsRoot("vault.append@1", { ns: "a|b", id: "x", data: {} });
    expect(badPipe.ok).toBe(false);
    if (!badPipe.ok) expect(badPipe.error).toBe("DEGRADED");
    const miss = await host.router.callAsRoot("vault.get@1", { ns: "notes", id: "ghost" });
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.error).toBe("DEGRADED");
  });
});

describe("Ω2 integration — Merkle tamper (second Database on the same file)", () => {
  test("UPDATE changelog SET cid='tampered' WHERE seq=2 → vault.verify@1 reports corruptAt=2", async () => {
    const { host, dataDir } = await bootCase("tamper");
    for (let i = 1; i <= 4; i++) {
      const r = await host.router.callAsRoot("vault.append@1", { ns: "t", id: `o${i}`, data: { i } });
      expect(r.ok).toBe(true);
    }
    // worker compartment holds its own connection on this file; the tamper happens
    // through a second Database connection in the test process (cross-process WAL)
    const attacker = openDatabase(dbPath(dataDir));
    attacker.exec("UPDATE changelog SET cid = 'tampered' WHERE seq = 2");
    attacker.close();

    const verdict = await host.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      const v = verdict.value as { ok: boolean; corruptAt?: number; detail?: string };
      expect(v.ok).toBe(false);
      expect(v.corruptAt).toBe(2);
      expect(v.detail).toContain("seq 2");
    }
  });
});

describe("Ω2 integration — crash-sim (WAL recovery across compartment restarts)", () => {
  test("append → shutdown (worker exits) → fresh open on the same file: WAL recovers, verify passes", async () => {
    const { host, dataDir, root } = await bootCase("crash");
    for (let i = 1; i <= 3; i++) {
      const r = await host.router.callAsRoot("vault.append@1", { ns: "crash", id: "x", data: { v: i } });
      expect(r.ok).toBe(true);
    }
    await shutdownCase({ host }); // worker compartment exits; its connection drops without an explicit checkpoint

    const reopened = openVault(dataDir);
    const verdict = verify(reopened);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(3);
    expect(readObject(reopened, "crash", "x", null).rev).toBe(3);
    expect(readObject(reopened, "crash", "x", 1).data).toEqual({ v: 1 });
    reopened.close();
    expect(existsSync(join(root, "vault", "build", "crash"))).toBe(true);
  });
});

describe("Ω2 integration — CAS atomicity through the worker", () => {
  test("no .tmp files after appends; a manually-planted leftover .tmp is inert", async () => {
    const { host, dataDir } = await bootCase("cas");
    for (let i = 1; i <= 3; i++) {
      const r = await host.router.callAsRoot("vault.append@1", { ns: "cas", id: `o${i}`, data: { i, note: "blob" } });
      expect(r.ok).toBe(true);
    }
    const casFiles = walkFiles(join(dataDir, "cas"));
    expect(casFiles.length).toBe(3); // three distinct payloads → three sharded blobs
    expect(casFiles.filter((p) => p.includes(".tmp"))).toEqual([]);

    // simulate an interrupted write: leftover tmp next to real blobs
    const someCid = basename(casFiles[0]); // basename, not split("/") — separators are platform-specific
    writeFileSync(join(dataDir, "cas", someCid.slice(0, 2), `.${someCid}.tmp-9999-crash`), "partial garbage");

    const got = await host.router.callAsRoot("vault.get@1", { ns: "cas", id: "o2" });
    expect(got.ok).toBe(true);
    if (got.ok) expect((got.value as { data: unknown }).data).toEqual({ i: 2, note: "blob" });
    const verdict = await host.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect((verdict.value as { ok: boolean }).ok).toBe(true);
  });
});

describe("Ω2 integration — compaction provenance + live reads never blocked", () => {
  test("X revs 1..5, Y refs X@2, compact keep=1 → 1,3,4 cold; X@2 survives; query returns X@5; reads stay live", async () => {
    const { host } = await bootCase("compact");
    const NS = "docs";
    for (let r = 1; r <= 5; r++) {
      const res = await host.router.callAsRoot("vault.append@1", { ns: NS, id: "X", data: `alpha ${r}` });
      expect(res.ok).toBe(true);
    }
    const y = await host.router.callAsRoot("vault.append@1", { ns: NS, id: "Y", data: "bravo zulu", refs: [{ ns: NS, id: "X", rev: 2 }] });
    expect(y.ok).toBe(true);

    // fire the compaction and a live read CONCURRENTLY — the read must resolve while the
    // MUTATION is in flight (single-writer queue serializes writes, never reads)
    const [compactRes, liveRead] = await Promise.all([
      host.router.callAsRoot("vault.compact@1", { ns: NS, keep: 1 }),
      host.router.callAsRoot("vault.get@1", { ns: NS, id: "X" }),
    ]);
    expect(compactRes.ok).toBe(true);
    if (compactRes.ok) expect(compactRes.value).toEqual({ moved: 3, kept: 3, protected: 1 });
    expect(liveRead.ok).toBe(true);
    if (liveRead.ok) expect((liveRead.value as { data: unknown }).data).toBe("alpha 5");

    const query = await host.router.callAsRoot("vault.query@1", { ns: NS });
    expect(query.ok).toBe(true);
    if (query.ok) expect((query.value as { id: string; rev: number }[]).map((q) => [q.id, q.rev])).toEqual([["X", 5], ["Y", 1]]);

    // referenced revision survived (hot); compacted revisions still readable (cold fallback)
    const refRev = await host.router.callAsRoot("vault.get@1", { ns: NS, id: "X", rev: 2 });
    expect(refRev.ok).toBe(true);
    if (refRev.ok) expect((refRev.value as { data: unknown }).data).toBe("alpha 2");
    const coldRev = await host.router.callAsRoot("vault.get@1", { ns: NS, id: "X", rev: 3 });
    expect(coldRev.ok).toBe(true);
    if (coldRev.ok) expect((coldRev.value as { data: unknown }).data).toBe("alpha 3");

    // history is immutable — the changelog still verifies end-to-end
    const verdict = await host.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      const v = verdict.value as { ok: boolean; entries: number };
      expect(v.ok).toBe(true);
      expect(v.entries).toBe(6);
    }
  });
});

describe("Ω2 integration — roundtrip swap harness through the router", () => {
  test("vault.roundtrip@1 → ok, equal head hash; target opens as a fresh db and verifies", async () => {
    // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
    const target = omegaTmp("omega-vault-test", `roundtrip-target-${Date.now()}-${process.pid}`);
    rmSync(target, { recursive: true, force: true });
    const { host } = await bootCase("roundtrip");
    await host.router.callAsRoot("vault.append@1", { ns: "a", id: "one", data: { w: "hello world" } });
    await host.router.callAsRoot("vault.append@1", { ns: "a", id: "one", data: { w: "hello again" } });
    await host.router.callAsRoot("vault.append@1", { ns: "b", id: "two", data: "plain body" });

    const before = await host.router.callAsRoot("vault.verify@1", {});
    expect(before.ok).toBe(true);
    const beforeHead = before.ok ? (before.value as { headHash: string }).headHash : "";

    const copy = await host.router.callAsRoot("vault.roundtrip@1", { targetDir: target });
    expect(copy.ok).toBe(true);
    if (copy.ok) {
      const v = copy.value as { ok: boolean; entries: number; headHash: string };
      expect(v.ok).toBe(true);
      expect(v.entries).toBe(3);
      expect(v.headHash).toBe(beforeHead);
    }

    // the copy stands alone: open it with the vault's own modules and verify there
    const reopened = openVault(target);
    const verdict = verify(reopened);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(3);
    expect(verdict.headHash).toBe(beforeHead);
    expect(readObject(reopened, "a", "one", 1).data).toEqual({ w: "hello world" });
    expect(searchObjects(reopened, "a", "world").map((h) => h.id)).toEqual(["one"]);
    reopened.close();
  });
});

describe("Ω2 integration — data sovereignty (plugin replaced/restarted, data persists)", () => {
  test("boot with dataDir A → append → shutdown → boot AGAIN with same dataDir → data still there", async () => {
    // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
    const root = omegaTmp("omega-vault-test", `sovereignty-${Date.now()}-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const dataDir = join(root, "user-vault-data");
    const spec = makeSpec("sovereignty", dataDir);
    const { rootKey } = ensureVault(vaultDir);

    const first = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const host1 = await bootComposition(first.recipe, first.buildDir, vaultDir);
    const r = await host1.router.callAsRoot("vault.append@1", { ns: "keep", id: "k1", data: { persistent: true }, meta: { boot: 1 } });
    expect(r.ok).toBe(true);
    await shutdownCase({ host: host1 });

    // a full second boot (fresh compartments, re-compiled recipe) on the same dataDir
    const second = compileComposition(spec, OMEGA_ROOT, vaultDir, rootKey);
    const host2 = await bootComposition(second.recipe, second.buildDir, vaultDir);
    hosts.push(host2);
    const got = await host2.router.callAsRoot("vault.get@1", { ns: "keep", id: "k1" });
    expect(got.ok).toBe(true);
    if (got.ok) {
      const v = got.value as { rev: number; data: unknown; meta: unknown };
      expect(v.rev).toBe(1);
      expect(v.data).toEqual({ persistent: true });
      expect(v.meta).toEqual({ boot: 1 });
    }
    const verdict = await host2.router.callAsRoot("vault.verify@1", {});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect((verdict.value as { ok: boolean; entries: number }).ok).toBe(true);
  });
});

describe("Ω2 integration — the committed compositions/vault.json spec boots", () => {
  test("read compositions/vault.json, point dataDir at a temp dir, compile + boot + append + get", async () => {
    const specPath = join(OMEGA_ROOT, "compositions", "vault.json");
    const spec = JSON.parse(readFileSync(specPath, "utf-8")) as CompositionSpec;
    expect(spec.entries).toHaveLength(2);
    expect(spec.entries[0].id).toBe("vivim.law");
    expect(spec.entries[0].bootPhase).toBe(0);
    expect(spec.entries[1].id).toBe("vivim.vault");
    expect(spec.entries[1].bootPhase).toBe(1);
    expect((spec.entries[1].grant.contracts as string[]).sort()).toEqual([...VAULT_CONTRACTS].sort());

    // E-9: run-unique dir — fixed names collide across concurrent gates on one box.
    const dataDir = omegaTmp("omega-vault-test", `spec-pattern-data-${Date.now()}-${process.pid}`);
    spec.entries[1].config = { dataDir };

    const { host } = await bootCase("spec-pattern", { spec, specDir: join(OMEGA_ROOT, "compositions") });
    const r = await host.router.callAsRoot("vault.append@1", { ns: "spec", id: "s1", data: { from: "compositions/vault.json" } });
    expect(r.ok).toBe(true);
    const got = await host.router.callAsRoot("vault.get@1", { ns: "spec", id: "s1" });
    expect(got.ok).toBe(true);
    if (got.ok) expect((got.value as { data: unknown }).data).toEqual({ from: "compositions/vault.json" });
  });
});
