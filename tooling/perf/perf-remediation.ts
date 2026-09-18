// tooling/perf/perf-remediation.ts — the D-387 measurement harness.
// Runs the five hot-path primitives the 2026-09-18 external performance review flagged,
// so the before/after numbers in docs/migration/40-EVIDENCE/OWNER/ are REPRODUCIBLE:
//   A · namespace read window  — 200 × readObject (the old per-row mind pattern) vs
//                                readObjects (the batched vault.getMany@1 core)
//   B · compaction             — 2,000 superseded revisions moved (the FTS delete path)
//   C · verify                 — a 4,000-entry changelog walked end to end
//   D · liveRefs               — the protected-refs scan over 5,000 hot objects
//   E · journalHistory         — last-60-lines out of a ~5 MB append-only journal
//   F · tick read phase (D-388)— the director's per-tick read: the OLD per-row
//                                get + ledger-get loop (reproduced inline) vs the
//                                batched runTick — hops and wall ms at 200 candidates
// Run: bun tooling/perf/perf-remediation.ts   (writes one JSON line per case to stdout)
import { mkdirSync, rmSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp } from "@vivim/omega-platform";
import type { PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";
import "../../plugins/vivim-vault/src/db.ts"; // bind the Bun lane (D-373)
import { openVault, readObject, liveRefs, type VaultDB } from "../../plugins/vivim-vault/src/sql.ts";
import { appendObject } from "../../plugins/vivim-vault/src/changelog.ts";
import { compact } from "../../plugins/vivim-vault/src/compaction.ts";
import { verify } from "../../plugins/vivim-vault/src/verify.ts";
import { journalHistory } from "../../surfaces/web/src/events.ts";
import { runTick } from "../../plugins/vivim-director/src/tick.ts";

interface Case { case: string; ms: number; extra?: Record<string, unknown> }

function scratch(name: string): string {
  const dir = join(omegaTmp(), `perf-remediation-${name}-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function bench(): Promise<Case[]> {
  const out: Case[] = [];

  // ---- A · the namespace read window (200 ids) ----
  {
    const dirA = scratch("read");
    const vA = openVault(dirA);
    vA.enqueueWrite(() => {
      for (let i = 0; i < 200; i++) {
        appendObject(vA, { ns: "email", id: `msg${i}`, data: { k: i, body: "b".repeat(200) }, meta: { type: "message" }, refs: [], causationId: `perf_a_${i}` });
      }
    });
    await vA.enqueueWrite(() => undefined);
    const ids = Array.from({ length: 200 }, (_, i) => `msg${i}`);
    let t0 = performance.now();
    for (const id of ids) readObject(vA, "email", id, null);
    const perRowMs = performance.now() - t0;
    let batchMs: number | null = null;
    try {
      const mod = (await import("../../plugins/vivim-vault/src/sql.ts")) as { readObjects?: (vv: VaultDB, ns: string, ids: string[]) => unknown };
      if (typeof mod.readObjects === "function") {
        t0 = performance.now();
        mod.readObjects(vA, "email", ids);
        batchMs = performance.now() - t0;
      }
    } catch { /* pre-D-387 tree: readObjects does not exist yet */ }
    out.push({ case: "A-read-200-ids", ms: round(perRowMs), extra: { batchedMs: batchMs === null ? null : round(batchMs), portHopsOldPerNs: 201, portHopsNewPerNs: 2 } });
    vA.close();
  }

  // ---- B · compaction: 200 ids × 11 revs, keep=1 → 2,000 candidates ----
  {
    const dirB = scratch("compact");
    const vB = openVault(dirB);
    vB.enqueueWrite(() => {
      for (let r = 1; r <= 11; r++) {
        for (let i = 0; i < 200; i++) {
          appendObject(vB, { ns: "email", id: `msg${i}`, data: { r, body: `rev ${r} — ${"y".repeat(120)}` }, meta: { type: "message", r }, refs: [], causationId: `perf_b_${i}_${r}` });
        }
      }
    });
    await vB.enqueueWrite(() => undefined);
    const ms = await vB.enqueueWrite(() => {
      const t = performance.now();
      const res = compact(vB, "email", 1);
      return { res, ms: performance.now() - t };
    });
    const orphans = (vB.db.query(
      "SELECT count(*) AS n FROM fts_index f WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.ns = f.ns AND o.id = f.id AND o.rev = CAST(f.rev AS INTEGER))",
    ).get() as { n: number }).n;
    out.push({ case: "B-compact-2000-candidates", ms: round(ms.ms), extra: { moved: ms.res.moved, kept: ms.res.kept, protected: ms.res.protected, ftsOrphans: orphans } });
    vB.close();
  }

  // ---- C · verify: 4,000-entry changelog ----
  {
    const dirC = scratch("verify");
    const vC = openVault(dirC);
    vC.enqueueWrite(() => {
      for (let i = 0; i < 4000; i++) {
        appendObject(vC, { ns: "chat", id: `c${i % 400}`, data: { i, body: "v".repeat(100) }, meta: null, refs: [], causationId: `perf_c_${i}` });
      }
    });
    await vC.enqueueWrite(() => undefined);
    const t = performance.now();
    const res = verify(vC);
    out.push({ case: "C-verify-4000-entries", ms: round(performance.now() - t), extra: { ok: res.ok, entries: res.entries } });
    vC.close();
  }

  // ---- D2 · liveRefs: 5,000 hot objects, NONE with refs (the common chat/email row) ----
  {
    const dirD2 = scratch("refs0");
    const vD2 = openVault(dirD2);
    vD2.enqueueWrite(() => {
      for (let i = 0; i < 5000; i++) {
        appendObject(vD2, { ns: "email", id: `m${i}`, data: { i }, meta: { i }, refs: [], causationId: `perf_d2_${i}` });
      }
    });
    await vD2.enqueueWrite(() => undefined);
    const t = performance.now();
    const refs = liveRefs(vD2.db);
    const dMs = performance.now() - t;
    const tOld = performance.now();
    let oldCount = 0;
    for (const row of vD2.db.query("SELECT meta FROM objects").all() as { meta: string }[]) {
      for (const r of (JSON.parse(row.meta) as { refs: unknown[] }).refs) { void r; oldCount++; }
    }
    out.push({ case: "D2-liverefs-5000-objects-0pct-refs", ms: round(dMs), extra: { refs: refs.size, oldAlgoMs: round(performance.now() - tOld), oldAlgoEdges: oldCount } });
    vD2.close();
  }

  // ---- D · liveRefs: 5,000 hot objects, half with refs ----
  {
    const dirD = scratch("refs");
    const vD = openVault(dirD);
    vD.enqueueWrite(() => {
      for (let i = 0; i < 5000; i++) {
        appendObject(vD, {
          ns: "email", id: `m${i}`, data: { i }, meta: { i },
          refs: i % 2 === 0 ? [{ ns: "email", id: `m${(i + 1) % 5000}`, rev: 1 }] : [],
          causationId: `perf_d_${i}`,
        });
      }
    });
    await vD.enqueueWrite(() => undefined);
    const t = performance.now();
    const refs = liveRefs(vD.db);
    const dMs = performance.now() - t;
    // the OLD algorithm, reproduced inline: parse EVERY meta envelope in JS
    const tOld = performance.now();
    const oldRefs = new Set<string>();
    for (const row of vD.db.query("SELECT meta FROM objects").all() as { meta: string }[]) {
      for (const r of (JSON.parse(row.meta) as { refs: { ns: string; id: string; rev: number }[] }).refs) oldRefs.add(`${r.ns}|${r.id}|${r.rev}`);
    }
    out.push({ case: "D-liverefs-5000-objects-50pct-refs", ms: round(dMs), extra: { refs: refs.size, oldAlgoMs: round(tOld === 0 ? 0 : performance.now() - tOld), oldRefs: oldRefs.size } });
    vD.close();
  }

  // ---- E · journalHistory: last 60 of ~20,000 lines (~5 MB) ----
  {
    const dirE = scratch("journal");
    const line = JSON.stringify({ ts: 1, source: "vivim.law", op: "vault.append", action: "allow", principal: "root", causationId: "perf", detail: "p".repeat(180) });
    const jp = join(dirE, "law-journal.jsonl");
    for (let i = 0; i < 20000; i++) appendFileSync(jp, line + "\n");
    const mb = round2(statSync(jp).size / 1048576);
    const t = performance.now();
    const h = journalHistory(dirE, 60);
    out.push({ case: "E-journal-history-last60", ms: round(performance.now() - t), extra: { journalMb: mb, lines: h.length } });
  }

  // ---- F · tick read phase (D-388): the OLD per-row get + ledger-get loop vs the batched runTick ----
  {
    const N = 200; // the TICK_SCAN_CAP — the worst case the old loop paid 2×N sequential hops for
    const msgs = Array.from({ length: N }, (_, i) => ({ id: `m${i}`, from: `sender${i}@example.com` }));
    const RULE = { id: "rule:any-forward", when: { event: "message.received", from: null }, then: { op: "message.send@1", payload: { to: "friend@omega.local" } }, enabled: true, summary: "s", createdAt: 0 };
    const READ_OPS = new Set(["vault.query@1", "vault.get@1", "vault.getmany@1"]);
    let readHops = 0;
    let writeHops = 0;
    const fakePort = {
      async call(op: string, payload: Record<string, unknown>): Promise<PortResult> {
        if (READ_OPS.has(op)) readHops++; else writeHops++;
        if (op === "vault.query@1") {
          if (payload.ns === "automation") return { ok: true, value: [{ id: RULE.id, rev: 1, cid: "cas_rule" }] };
          return { ok: true, value: msgs.map((m) => ({ id: m.id, rev: 1, cid: `cas_${m.id}` })) };
        }
        if (op === "vault.get@1") {
          const id = payload.id as string;
          if (payload.ns === "automation") return { ok: true, value: { rev: 1, cid: "cas_rule", data: RULE, meta: { type: "rule" }, refs: [] } };
          return { ok: true, value: { rev: 1, cid: `cas_${id}`, data: { id, folder: "inbox", from: msgs.find((m) => m.id === id)!.from, subject: "s", body: "b".repeat(200), flags: { seen: false } }, meta: { type: "message" }, refs: [] } };
        }
        if (op === "vault.getmany@1") {
          const ids = payload.ids as string[];
          if (payload.ns === "automation") return { ok: true, value: ids.map((id) => ({ id, found: false })) }; // ledger empty
          return { ok: true, value: ids.map((id) => ({ id, found: true, rev: 1, cid: `cas_${id}`, data: { id, folder: "inbox", from: msgs.find((m) => m.id === id)!.from, subject: "s", body: "b".repeat(200), flags: { seen: false } }, meta: { type: "message" } })) };
        }
        if (op === "vault.append@1") return { ok: true, value: { rev: 1 } };
        if (op === "message.send@1") return { ok: true, value: { id: "sent" } };
        return { ok: false, error: "REFUSED", detail: `perf port: ${op}` };
      },
    };
    const ctx = { port: fakePort, log: () => {} } as unknown as PluginContext;
    const cfg = { selfAddresses: ["me@omega.local"] };

    // OLD pattern, reproduced inline at full read shape: scan + per-row
    // (get + ledger-get) + lazy rule load — the D-388 "before", read phase only
    readHops = 0;
    let t0 = performance.now();
    await fakePort.call("vault.query@1", { ns: "email", filter: {} });
    for (const m of msgs) {
      await fakePort.call("vault.get@1", { ns: "email", id: m.id }); // body (the old per-row get)
      await fakePort.call("vault.get@1", { ns: "automation", id: `fired:${m.id}` }); // the old per-row ledger check
    }
    const ruleQr = await fakePort.call("vault.query@1", { ns: "automation", filter: { idPrefix: "rule:" } });
    for (const row of (ruleQr.value as { id: string }[]) ?? []) {
      await fakePort.call("vault.get@1", { ns: "automation", id: row.id });
    }
    const oldReadMs = performance.now() - t0;
    const oldReadHops = readHops;

    // NEW: the batched runTick, whole pass (reads + 200 fires + 200 ledger appends)
    readHops = 0; writeHops = 0;
    t0 = performance.now();
    const report = await runTick(ctx, cfg, { prevRevs: new Map() });
    const newWholeTickMs = performance.now() - t0;
    out.push({
      case: "F-tick-read-200-candidates",
      ms: round(oldReadMs),
      extra: {
        oldReadHops, oldReadMs: round(oldReadMs),
        newReadHops: readHops, newWriteHops: writeHops, newWholeTickMs: round(newWholeTickMs),
        processed: report.processed, fired: report.fired.length,
        note: "hops are the win under network/IPC latency (D-387 case A discipline); rules loading stays lazy per-row by design (skip-not-fatal)",
      },
    });
  }

  return out;
}

function round(ms: number): number { return Math.round(ms * 100) / 100; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

for (const r of await bench()) console.log(JSON.stringify(r));
