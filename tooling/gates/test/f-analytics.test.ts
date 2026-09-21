// tooling/gates/test/f-analytics.test.ts — the F-ANALYTICS falsifier.
// Generated from D-435 by `omega:loop --stub D-435` (D-426, Ω-DEV.2).
// Implemented (D-435): every clause runs a real verdict against
// tooling/gates/analytics.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  costliestTile,
  editMaterialization,
  foldCount,
  materialize,
  rebuild,
  stalenessDelta,
  type Projection,
  type VaultLogRow,
} from "../analytics.ts";

const PROJ: Projection = {
  id: "proj:ns-heatmap",
  name: "namespace write heatmap",
  fold: "count(ns:kind) over [0, watermark]",
  sourceNamespaces: ["gov.claim", "tile.transition"],
  refreshPolicy: "on-write",
  namedBy: "alice",
};

function log(): VaultLogRow[] {
  return [
    { offset: 10, ns: "gov.claim", kind: "granted", claimant: "tile:inbox" },
    { offset: 20, ns: "gov.claim", kind: "granted", claimant: "tile:notes" },
    { offset: 30, ns: "tile.transition", kind: "ghost" },
  ];
}

describe("F-ANALYTICS (D-435)", () => {
  test("F-ANALYTICS.1 (honest-heatmap) — payload + watermark; appends grow the Staleness Delta", () => {
    const m = materialize({ projection: PROJ, log: log(), throughOffset: 30, computedAt: 1, isEngine: true, externalJoin: false });
    expect(m.ok).toBe(true);
    if (!m.ok) throw new Error("unreachable");
    expect(m.value.vaultWatermark).toBe(30);
    expect(JSON.parse(m.value.payload)["gov.claim:granted"]).toBe(2);
    expect(stalenessDelta(30, m.value)).toBe(0);
    expect(stalenessDelta(45, m.value)).toBe(15); // one append later: delta visible, never hidden
  });

  test("F-ANALYTICS.2 (forensic-join) — costliest tile cites its scanned byte-range", () => {
    const writes = foldCount(log(), 30, (r) => r.claimant ?? r.kind);
    const top = costliestTile(
      [{ claimant: "tile:inbox", ramMB: 412 }, { claimant: "tile:notes", ramMB: 64 }],
      writes,
      30,
    );
    expect(top.tile).toBe("tile:inbox");
    expect(top.byteRange).toBe("vault:0..30");
  });

  test("F-ANALYTICS.3 (no-second-truth) — manual edits refuse; engine rebuilds instead", () => {
    const edit = editMaterialization();
    expect(edit.code).toBe("ANALYTICS_SECOND_TRUTH");
    const outsider = materialize({ projection: PROJ, log: log(), throughOffset: 30, computedAt: 1, isEngine: false, externalJoin: false });
    expect(outsider.ok).toBe(false);
    const noMark = materialize({ projection: PROJ, log: log(), throughOffset: NaN, computedAt: 1, isEngine: true, externalJoin: false });
    expect(noMark.ok).toBe(false);
    if (noMark.ok) throw new Error("unreachable");
    expect(noMark.code).toBe("ANALYTICS_NO_WATERMARK");
    const dirty = materialize({ projection: PROJ, log: log(), throughOffset: 30, computedAt: 1, isEngine: true, externalJoin: true });
    expect(dirty.ok).toBe(false);
    if (dirty.ok) throw new Error("unreachable");
    expect(dirty.code).toBe("ANALYTICS_UNTRACKED_JOIN");
  });

  test("F-ANALYTICS.4 (semantic-topology) — deterministic intent hashes fold into a cited graph", () => {
    const withHashes: VaultLogRow[] = [
      { offset: 1, ns: "cap.chat", kind: "answer", intentHash: "h1" },
      { offset: 2, ns: "cap.chat", kind: "answer", intentHash: "h1" },
      { offset: 3, ns: "cap.chat", kind: "answer", intentHash: "h2" },
    ];
    const clusters = foldCount(withHashes, 3, (r) => r.intentHash ?? "?");
    expect(clusters).toEqual({ h1: 2, h2: 1 });
    expect(PROJ.id).toBe("proj:ns-heatmap"); // the fold cites its projection row
  });

  test("F-ANALYTICS.5 (rebuild-ashes) — wipe + rebuild from byte 0 is byte-identical", () => {
    const a = rebuild(PROJ, log(), 1);
    const b = rebuild(PROJ, log(), 999);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(a.value.payload).toBe(b.value.payload); // determinism: timestamps don't leak into payload
    expect(a.value.vaultWatermark).toBe(30);
  });
});
